import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before } from "node:test";
import express from "express";
import { getAgent } from "../../agents/registry.js";
import { closeDatabase, getPool, query, withTransaction } from "../src/db.js";
import { buildComicDiaryAgentResponse } from "../src/comic-diary-service.js";
import { createStationComicDiary } from "../src/station-agent-repository.js";
import { createAgentRun, createUsageEvent } from "../src/repositories.js";
import { registerStationComicRoutes } from "../src/routes/station-comic-routes.js";
import { createRequestErrorHandler } from "../src/request-observability.js";

const enabled = process.env.RUN_COMIC_DIARY_ACCESS_INTEGRATION === "1";
const integration = (name, work) =>
  test(
    name,
    {
      skip:
        !enabled &&
        "Set RUN_COMIC_DIARY_ACCESS_INTEGRATION=1 with a migrated disposable PostgreSQL database",
    },
    work,
  );
const owners = [];
let agent;

before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
    "Use a loopback test database only",
  );
  const [database] = await query("SELECT current_database() AS name");
  assert.match(
    database.name,
    /_migration_test$/,
    "Never use a product database for this suite",
  );
  agent = await getAgent("comic-diary");
});

after(async () => {
  if (!enabled) return;
  for (const owner of owners) {
    await query("DELETE FROM usage_events WHERE user_id = ?", [owner]);
    await query("DELETE FROM agent_runs WHERE user_id = ?", [owner]);
    await query("DELETE FROM users WHERE id = ?", [owner]);
  }
  const remaining = await query(
    "SELECT id FROM users WHERE id = ANY(?::text[])",
    [owners],
  );
  assert.deepEqual(remaining, [], "All comic fixtures must be removed");
  await closeDatabase();
});

async function fixture(
  t,
  {
    grant = agent.permissions,
    declaration = agent,
    enabledGrant = true,
    beforeProvider = null,
    duringProvider = null,
    beforeSave = null,
    afterSave = null,
    beforeRunAudit = null,
    beforeUsageAudit = null,
    replyMediaIds,
    serializeReply = JSON.stringify,
  } = {},
) {
  const id = crypto.randomUUID();
  owners.push(id);
  const f = {
    id,
    diary: crypto.randomUUID(),
    media: crypto.randomUUID(),
    unselectedMedia: crypto.randomUUID(),
    file: crypto.randomUUID(),
    providerCalls: 0,
    saveCalls: 0,
    statements: [],
    modelInputs: [],
    runs: [],
    declaration,
  };
  await query(
    "INSERT INTO users (id, email, password_hash, display_name, ai_id) VALUES (?, ?, 'fixture-only', ?, ?)",
    [
      id,
      `${id}@example.invalid`,
      `Comic ${id}`,
      String(crypto.randomInt(100000000000, 999999999999)),
    ],
  );
  if (grant !== null)
    await query(
      "INSERT INTO user_agents (user_id, agent_id, granted_scopes, enabled) VALUES (?, 'comic-diary', ?::jsonb, ?)",
      [id, JSON.stringify(grant), enabledGrant],
    );
  await query(
    "INSERT INTO station_diary_entries (id, user_id, title, body, mood) VALUES (?, ?, 'Selected diary', 'Private selected diary body', 'calm')",
    [f.diary, id],
  );
  for (const [media, caption] of [
    [f.media, "Selected image description"],
    [f.unselectedMedia, "Unselected private image"],
  ]) {
    await query(
      `INSERT INTO station_media_assets (id, user_id, kind, status, storage_provider, storage_key, caption, original_filename, tags)
      VALUES (?, ?, 'image', 'uploaded', 'private-test-storage', 'private-test-key', ?, 'private-image.jpg', '["test-tag"]'::jsonb)`,
      [media, id, caption],
    );
  }
  await query(
    "INSERT INTO file_assets (id, user_id, original_filename, preprocessing_result) VALUES (?, ?, 'private-file.txt', '{\"summary\":\"Must not enter model\"}'::jsonb)",
    [f.file, id],
  );
  const app = express();
  app.use(express.json());
  registerStationComicRoutes(app, {
    authenticate(req, _res, next) {
      req.user = { id, displayName: "Fixture owner" };
      next();
    },
    asyncHandler: (handler) => (req, res, next) =>
      Promise.resolve(handler(req, res, next)).catch(next),
    loadAgent: async () => f.declaration,
    transaction: (work) =>
      withTransaction((connection) =>
        work({
          query: (sql, params) => {
            f.statements.push(sql);
            return connection.query(sql, params);
          },
        }),
      ),
    generateComic: (options) =>
      buildComicDiaryAgentResponse({
        ...options,
        modelStatus: { configured: true, model: "isolated-test-model" },
        runAgent: async (input) => {
          await beforeProvider?.(f);
          await input.beforeModelCall();
          f.providerCalls += 1;
          f.modelInputs.push(input);
          await duringProvider?.(f);
          const draft = {
            title: "Text storyboard",
            summary: "Selected content only",
            frames: [
              {
                title: "First frame",
                scene: "First scene",
                caption: "",
                dialogue: "",
                mood: "Calm",
                camera: "Wide shot",
                mediaAssetIds:
                  replyMediaIds === undefined
                    // This fixture models choosing up to four references for
                    // this frame from the user's larger available selection.
                    ? options.mediaAssets.slice(0, 4).map((asset) => asset.id)
                    : replyMediaIds,
              },
              {
                title: "Second frame",
                scene: "Second scene",
                caption: "",
                dialogue: "",
                mood: "Calm",
                camera: "Close shot",
                mediaAssetIds: [],
              },
            ],
          };
          return {
            provider: "isolated-test",
            model: "isolated-test-model",
            latencyMs: 1,
            reply: serializeReply(draft),
          };
        },
      }),
    saveComic: async (input, queryFn) => {
      f.saveCalls += 1;
      await beforeSave?.(f);
      const saved = await createStationComicDiary(input, queryFn);
      await afterSave?.(f);
      return saved;
    },
    recordAgentRun: async (input, queryFn) => {
      await beforeRunAudit?.(input, f);
      f.runs.push(input);
      return createAgentRun(input, queryFn);
    },
    recordUsageEvent: async (input, queryFn) => {
      await beforeUsageAudit?.(input, f);
      return createUsageEvent(input, queryFn);
    },
  });
  app.use(
    createRequestErrorHandler({ production: true, logger: { error() {} } }),
  );
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  f.request = async (body) => {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/station/comic-diaries`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Prepare two text storyboard frames",
          frameCount: 2,
          ...body,
        }),
      },
    );
    return { status: response.status, body: await response.json() };
  };
  f.list = async () => {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/station/comic-diaries`,
    );
    return { status: response.status, body: await response.json() };
  };
  f.saved = () =>
    query("SELECT * FROM station_comic_diaries WHERE user_id = ?", [id]);
  return f;
}

integration(
  "comic HTTP generation requires enabled exact current declaration grants",
  async (t) => {
    const cases = [
      { grant: null },
      { grant: [] },
      { enabledGrant: false },
      { grant: agent.permissions.filter((scope) => scope !== "messages:read") },
      { grant: [...agent.permissions, "files:read"] },
      {
        declaration: {
          ...agent,
          permissions: [...agent.permissions, "profile:read"],
        },
      },
    ];
    for (const options of cases) {
      const f = await fixture(t, options);
      assert.equal(
        (await f.request({ diaryEntryId: f.diary, mediaAssetIds: [f.media] }))
          .status,
        403,
      );
      assert.equal(f.providerCalls, 0);
      assert.equal(f.saveCalls, 0);
      assert.deepEqual(await f.saved(), []);
      assert.equal(
        f.statements.some((sql) =>
          /FROM station_(diary_entries|media_assets)/.test(sql),
        ),
        false,
      );
    }
  },
);

integration(
  "comic invalid model references fail visibly without persisting a sanitized substitute",
  async (t) => {
    for (const replyMediaIds of [[crypto.randomUUID()], [12]]) {
      const f = await fixture(t, { replyMediaIds });
      const response = await f.request({ mediaAssetIds: [f.media] });
      assert.equal(response.status, 502);
      assert.equal(
        response.body.error.details.code,
        "COMIC_DIARY_INVALID_RESPONSE",
      );
      assert.equal(f.providerCalls, 1);
      assert.equal(f.saveCalls, 0);
      assert.deepEqual(await f.saved(), []);
    }
  },
);

integration(
  "comic incomplete or mixed model output fails without a fabricated saved draft",
  async (t) => {
    for (const serializeReply of [
      draft => { delete draft.title; return JSON.stringify(draft); },
      draft => { delete draft.summary; return JSON.stringify(draft); },
      draft => { delete draft.frames[0].title; return JSON.stringify(draft); },
      draft => { delete draft.frames[0].mediaAssetIds; return JSON.stringify(draft); },
      draft => `\`\`\`json\n${JSON.stringify(draft)}\n\`\`\``,
      draft => `这是你的漫画：${JSON.stringify(draft)}`,
    ]) {
      const f = await fixture(t, { serializeReply });
      const response = await f.request({ diaryEntryId: f.diary, mediaAssetIds: [f.media] });
      assert.equal(response.status, 502);
      assert.equal(response.body.error.details.code, "COMIC_DIARY_INVALID_RESPONSE");
      assert.equal(f.providerCalls, 1);
      assert.equal(f.saveCalls, 0);
      assert.deepEqual(await f.saved(), []);
      assert.equal(f.runs.some(run => run.status === "success"), false);
    }
  },
);

integration(
  "comic selected resources enforce owner, deletion and uploaded state before model calls",
  async (t) => {
    const other = await fixture(t);
    const f = await fixture(t);
    for (const selection of [
      { diaryEntryId: other.diary },
      { mediaAssetIds: [other.media] },
    ]) {
      assert.equal((await f.request(selection)).status, 404);
    }
    await query(
      "UPDATE station_diary_entries SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
      [f.diary],
    );
    assert.equal((await f.request({ diaryEntryId: f.diary })).status, 404);
    await query(
      "UPDATE station_media_assets SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
      [f.media],
    );
    assert.equal((await f.request({ mediaAssetIds: [f.media] })).status, 404);
    await query(
      "UPDATE station_media_assets SET status = 'pending_upload' WHERE id = ?",
      [f.unselectedMedia],
    );
    assert.equal(
      (await f.request({ mediaAssetIds: [f.unselectedMedia] })).status,
      404,
    );
    assert.equal(f.providerCalls, 0);
    assert.equal(f.saveCalls, 0);
    assert.deepEqual(await f.saved(), []);
  },
);

integration(
  "comic source permissions cannot be bypassed by reauthorizing a narrower declaration",
  async (t) => {
    const permissions = agent.permissions.filter(
      (scope) => scope !== "album:read",
    );
    const f = await fixture(t, {
      declaration: { ...agent, permissions },
      grant: permissions,
    });
    const response = await f.request({ mediaAssetIds: [f.media] });
    assert.equal(response.status, 403);
    assert.equal(
      response.body.error.details.code,
      "COMIC_DIARY_SCOPE_REQUIRED",
    );
    assert.equal(f.providerCalls, 0);
    assert.equal(f.saveCalls, 0);
    assert.equal(
      f.statements.some((sql) => /FROM station_media_assets/.test(sql)),
      false,
    );
    assert.deepEqual(await f.saved(), []);
  },
);

integration(
  "comic no-selection request sends empty sources and never reads the account library or files",
  async (t) => {
    const f = await fixture(t);
    const response = await f.request({});
    assert.equal(response.status, 201);
    assert.deepEqual(f.modelInputs[0].appContext.stationContent, {
      diaryEntries: [],
      mediaAssets: [],
    });
    assert.equal(
      f.statements.some((sql) =>
        /FROM station_(diary_entries|media_assets)|FROM file_assets/.test(sql),
      ),
      false,
    );
    assert.equal((await f.saved()).length, 1);
  },
);

integration(
  "comic sends only explicitly selected source fields and persists only normalized selected IDs",
  async (t) => {
    const f = await fixture(t);
    const response = await f.request({
      diaryEntryId: f.diary,
      mediaAssetIds: [f.media, f.media],
    });
    assert.equal(response.status, 201);
    const context = f.modelInputs[0].appContext.stationContent;
    assert.deepEqual(
      context.diaryEntries.map((item) => item.id),
      [f.diary],
    );
    assert.deepEqual(
      context.mediaAssets.map((item) => item.id),
      [f.media],
    );
    assert.equal(context.diaryEntries[0].body, "Private selected diary body");
    assert.equal(context.mediaAssets[0].caption, "Selected image description");
    const serialized = JSON.stringify(context);
    for (const excluded of [
      f.unselectedMedia,
      f.file,
      "private-test-key",
      "private-test-storage",
      "user_id",
      "metadata",
    ]) {
      assert.equal(
        serialized.includes(excluded),
        false,
        `${excluded} must not enter the model`,
      );
    }
    const [saved] = await f.saved();
    assert.equal(saved.source_diary_entry_id, f.diary);
    assert.deepEqual(saved.source_media_asset_ids, [f.media]);
    assert.deepEqual(saved.source_file_asset_ids, []);
    assert.equal(saved.metadata.model.provider, "isolated-test");
    assert.equal(saved.metadata.model.model, "isolated-test-model");
    const list = await f.list();
    assert.equal(list.status, 200);
    for (const entry of [response.body.data, list.body.data[0]]) {
      for (const internalField of ["metadata", "provider", "model"]) {
        assert.equal(
          Object.hasOwn(entry, internalField),
          false,
          `${internalField} stays in server audit only`,
        );
      }
    }
  },
);

integration(
  "comic rejects file sources explicitly without file queries, provider calls or draft writes",
  async (t) => {
    const f = await fixture(t);
    const response = await f.request({ fileAssetIds: [f.file] });
    assert.equal(response.status, 403);
    assert.equal(
      response.body.error.details.code,
      "COMIC_DIARY_FILE_SOURCE_UNSUPPORTED",
    );
    assert.deepEqual(f.statements, []);
    assert.equal(f.providerCalls, 0);
    assert.equal(f.saveCalls, 0);
    assert.deepEqual(await f.saved(), []);
  },
);

integration(
  "comic accepts the existing twenty explicit media selection limit without a full-library lookup",
  async (t) => {
    const f = await fixture(t);
    const selectedIds = [f.media];
    for (let index = 1; index < 20; index += 1) {
      const id = crypto.randomUUID();
      selectedIds.push(id);
      await query(
        "INSERT INTO station_media_assets (id, user_id, kind, status, caption) VALUES (?, ?, 'image', 'uploaded', 'Explicit selection')",
        [id, f.id],
      );
    }
    const response = await f.request({ mediaAssetIds: selectedIds });
    assert.equal(response.status, 201);
    assert.deepEqual(
      f.modelInputs[0].appContext.stationContent.mediaAssets.map(
        (item) => item.id,
      ),
      [...selectedIds].sort(),
    );
    const [saved] = await f.saved();
    assert.deepEqual(saved.source_media_asset_ids, [...selectedIds].sort().slice(0, 4));
    assert.equal(saved.frames[0].mediaAssetIds.length, 4);
    assert.equal(
      JSON.stringify(f.modelInputs[0].appContext).includes(f.unselectedMedia),
      false,
    );
  },
);

integration(
  "comic rechecks exact access immediately before the provider call",
  async (t) => {
    const f = await fixture(t, {
      beforeProvider: (state) =>
        query(
          "UPDATE user_agents SET enabled = false WHERE user_id = ? AND agent_id = 'comic-diary'",
          [state.id],
        ),
    });
    const response = await f.request({ diaryEntryId: f.diary });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.details.code, "AI_ACCESS_REVOKED");
    assert.equal(f.providerCalls, 0);
    assert.equal(f.saveCalls, 0);
    assert.deepEqual(await f.saved(), []);
  },
);

integration(
  "comic source changes before provider dispatch stop all model calls",
  async (t) => {
    const f = await fixture(t, {
      beforeProvider: (state) =>
        query(
          "UPDATE station_media_assets SET tags = '[\"changed\"]'::jsonb WHERE id = ?",
          [state.media],
        ),
    });
    const response = await f.request({ mediaAssetIds: [f.media] });
    assert.equal(response.status, 409);
    assert.equal(
      response.body.error.details.code,
      "COMIC_DIARY_SOURCE_CHANGED",
    );
    assert.equal(f.providerCalls, 0);
    assert.equal(f.saveCalls, 0);
    assert.deepEqual(await f.saved(), []);
  },
);

integration(
  "comic revocation during model processing cannot persist the generated draft",
  async (t) => {
    const f = await fixture(t, {
      duringProvider: (state) =>
        query(
          "UPDATE user_agents SET enabled = false WHERE user_id = ? AND agent_id = 'comic-diary'",
          [state.id],
        ),
    });
    assert.equal(
      (await f.request({ diaryEntryId: f.diary, mediaAssetIds: [f.media] }))
        .status,
      403,
    );
    assert.equal(f.providerCalls, 1);
    assert.equal(f.saveCalls, 0);
    assert.deepEqual(await f.saved(), []);
    assert.deepEqual(
      f.runs.map((run) => run.status),
      ["error"],
    );
    assert.equal(
      f.runs[0].provider,
      "isolated-test",
      "Completed model receipt remains accurate when final authorization is revoked",
    );
  },
);

integration(
  "comic edits or deletions during model processing cannot persist a stale draft",
  async (t) => {
    for (const mutation of [
      (state) =>
        query(
          "UPDATE station_diary_entries SET body = 'Changed during generation' WHERE id = ?",
          [state.diary],
        ),
      (state) =>
        query(
          "UPDATE station_media_assets SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
          [state.media],
        ),
    ]) {
      const f = await fixture(t, { duringProvider: mutation });
      const response = await f.request({
        diaryEntryId: f.diary,
        mediaAssetIds: [f.media],
      });
      assert.ok([404, 409].includes(response.status));
      assert.equal(f.providerCalls, 1);
      assert.equal(f.saveCalls, 0);
      assert.deepEqual(await f.saved(), []);
    }
  },
);

integration(
  "comic cannot reuse a newly changed declaration or version with matching new grants during generation",
  async (t) => {
    for (const nextDeclaration of [
      { ...agent, version: "99.0.0" },
      { ...agent, permissions: [...agent.permissions, "profile:read"] },
    ]) {
      const f = await fixture(t, {
        duringProvider: async (state) => {
          state.declaration = nextDeclaration;
          await query(
            "UPDATE user_agents SET granted_scopes = ?::jsonb WHERE user_id = ? AND agent_id = 'comic-diary'",
            [JSON.stringify(nextDeclaration.permissions), state.id],
          );
        },
      });
      assert.equal(
        (await f.request({ diaryEntryId: f.diary, mediaAssetIds: [f.media] }))
          .status,
        409,
      );
      assert.equal(f.providerCalls, 1);
      assert.equal(f.saveCalls, 0);
      assert.deepEqual(await f.saved(), []);
    }
  },
);

integration(
  "comic final save shares the authorization and selected-source locks with its INSERT",
  async (t) => {
    const f = await fixture(t, {
      beforeSave: async (state) => {
        const writer = await (await getPool()).connect();
        try {
          for (const [sql, params] of [
            [
              "UPDATE user_agents SET enabled = false WHERE user_id = $1 AND agent_id = 'comic-diary'",
              [state.id],
            ],
            [
              "UPDATE station_diary_entries SET body = 'Concurrent edit' WHERE id = $1",
              [state.diary],
            ],
            [
              "UPDATE station_media_assets SET caption = 'Concurrent edit' WHERE id = $1",
              [state.media],
            ],
          ]) {
            await writer.query("BEGIN");
            await writer.query("SET LOCAL lock_timeout = '100ms'");
            await assert.rejects(
              writer.query(sql, params),
              (error) => error.code === "55P03",
            );
            await writer.query("ROLLBACK");
          }
        } finally {
          await writer.query("ROLLBACK");
          writer.release();
        }
      },
    });
    assert.equal(
      (await f.request({ diaryEntryId: f.diary, mediaAssetIds: [f.media] }))
        .status,
      201,
    );
    assert.equal(f.saveCalls, 1);
    assert.equal((await f.saved()).length, 1);
    assert.deepEqual(
      f.runs.map((run) => run.status),
      ["success"],
    );
  },
);

integration(
  "comic persistence errors roll back the draft INSERT on the guard transaction connection",
  async (t) => {
    const f = await fixture(t, {
      afterSave: async () => {
        throw new Error("Fixture rollback after INSERT");
      },
    });
    assert.equal(
      (await f.request({ diaryEntryId: f.diary, mediaAssetIds: [f.media] }))
        .status,
      500,
    );
    assert.equal(f.providerCalls, 1);
    assert.equal(f.saveCalls, 1);
    assert.deepEqual(await f.saved(), []);
    assert.deepEqual(
      f.runs.map((run) => run.status),
      ["error"],
    );
  },
);

integration(
  "comic success-audit or usage failures atomically roll back both draft and success receipt",
  async (t) => {
    for (const failingAudit of [
      {
        beforeRunAudit: async (input) => {
          if (input.status === "success")
            throw new Error("Fixture success audit failure");
        },
      },
      {
        beforeUsageAudit: async () => {
          throw new Error("Fixture usage audit failure");
        },
      },
    ]) {
      const f = await fixture(t, failingAudit);
      assert.equal(
        (await f.request({ diaryEntryId: f.diary, mediaAssetIds: [f.media] }))
          .status,
        500,
      );
      assert.equal(f.providerCalls, 1);
      assert.equal(f.saveCalls, 1);
      assert.deepEqual(await f.saved(), []);
      assert.deepEqual(
        await query("SELECT id FROM usage_events WHERE user_id = ?", [f.id]),
        [],
      );
      const receipts = await query(
        "SELECT status, provider FROM agent_runs WHERE user_id = ?",
        [f.id],
      );
      assert.deepEqual(receipts, [
        { status: "error", provider: "isolated-test" },
      ]);
    }
  },
);
