import assert from "node:assert/strict";
import test from "node:test";
import { createUIPreferenceService } from "../src/ui-preference-service.js";
import { HttpError } from "../src/http-error.js";
import { defaultUIPreferences } from "../../shared/ui-preferences.js";

const user = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const previewId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const nowMs = Date.parse("2026-11-03T04:00:00.000Z");
const authorization = {
  agent: { key: "ui-agent" },
  access: { grantedScopes: [] },
  context: {
    profile: null,
    modules: {},
    ownedAgents: [],
    stationContent: null,
  },
};

const replyFor = (patch, affectedSurfaces = ["miao"]) => JSON.stringify({
  schemaVersion: 1,
  intent: "调整界面",
  patch,
  affectedSurfaces,
  rationale: "按你的描述调整妙页布局。",
});

function createService(overrides = {}) {
  const calls = { authorize: 0, revalidate: 0, read: 0, run: 0, db: [], events: [], writes: [] };
  const service = createUIPreferenceService({
    authorize: async () => {
      calls.authorize += 1;
      return authorization;
    },
    revalidate: async () => { calls.revalidate += 1; },
    lockAuthorization: async () => {},
    read: async () => {
      calls.read += 1;
      return defaultUIPreferences();
    },
    run: async () => {
      calls.run += 1;
      return { reply: replyFor({ surfaces: { miao: { cardRadius: 20 } } }) };
    },
    dbQuery: async (sql, params) => {
      calls.db.push({ sql, params });
      return [];
    },
    recordEvent: async event => {
      calls.events.push(event);
    },
    persist: async ({ expectedRevision, preferences }) => {
      calls.writes.push({ expectedRevision, preferences });
      return { ...preferences, revision: expectedRevision + 1 };
    },
    now: () => nowMs,
    idFactory: () => previewId,
    transaction: async work => work({
      query: async (sql, params = []) => {
        calls.db.push({ sql, params });
        return [];
      },
    }),
    ...overrides,
  });
  return { service, calls };
}

test("preview authorizes before reading and persists a bounded proposal", async () => {
  const { service, calls } = createService();
  const result = await service.preview({ user, instruction: "把妙页卡片圆角变大", surface: "miao" });

  assert.equal(result.id, previewId);
  assert.equal(result.status, "pending");
  assert.equal(result.baseRevision, 0);
  assert.equal(result.preferences.surfaces.miao.cardRadius, 20);
  assert.equal(result.beforePreferences.surfaces.miao.cardRadius, 16);
  assert.equal(calls.authorize, 1);
  assert.equal(calls.read, 2);
  assert.equal(calls.run, 1);
  assert.ok(calls.db.some(call => /INSERT INTO ui_preference_previews/.test(call.sql)));
  assert.equal(calls.events[0].eventType, "ui.preferences.preview");
});

test("UI preview revalidates access and the originating message at the actual model dispatch boundary", async () => {
  const checkpoints = [];
  const receipt = { provider: "fixture-provider", latencyMs: 4, tokenUsage: { prompt: 3, completion: 2, total: 5 } };
  const { service } = createService({
    revalidate: async () => { checkpoints.push("authorization"); },
    run: async options => {
      await options.beforeModelCall();
      checkpoints.push("model");
      return { reply: replyFor({ surfaces: { miao: { cardRadius: 20 } } }), ...receipt };
    },
  });
  const prepared = await service.prepare({ user, instruction: "调整圆角",
    beforeModelCall: async () => { checkpoints.push("message"); } });
  assert.deepEqual(checkpoints, ["authorization", "message", "model"]);
  assert.deepEqual(prepared.receipt, receipt);
});

test("authorization withdrawal before UI model dispatch prevents the request and preview", async () => {
  let dispatched = false;
  const { service, calls } = createService({
    revalidate: async () => { throw new HttpError(403, "revoked"); },
    run: async options => {
      await options.beforeModelCall();
      dispatched = true;
      return { reply: replyFor({ surfaces: { miao: { cardRadius: 20 } } }) };
    },
  });
  await assert.rejects(service.preview({ user, instruction: "调整圆角" }), error => error.status === 403);
  assert.equal(dispatched, false);
  assert.equal(calls.db.length, 0);
});

test("UI prepare reports only the known receipt before rejecting a malformed model suggestion", async () => {
  const receipt = { provider: "fixture-provider", latencyMs: 4, tokenUsage: { prompt: 3, completion: 2, total: 5 } };
  const receipts = [];
  const { service, calls } = createService({ run: async () => ({ reply: "INVALID_MODEL_BODY", ...receipt }) });
  await assert.rejects(service.prepare({ user, instruction: "调整妙页", onModelReceipt: value => { receipts.push(value); } }),
    error => error.details.code === "UI_AGENT_INVALID_RESPONSE");
  assert.deepEqual(receipts, [receipt]);
  assert.equal(calls.db.length, 0);
  assert.equal(calls.events.length, 0);
});

test("chat preview persists once per user message and requires current authorization", async () => {
  const stored = [];
  const { service, calls } = createService();
  const prepared = await service.prepare({ user, instruction: "调整妙页", surface: "miao" });
  const connection = { query: async (sql, params = []) => {
    if (sql.includes("FROM chat_messages")) return [{ id: params[0] }];
    if (sql.startsWith("SELECT * FROM ui_preference_previews")) return stored;
    if (sql.startsWith("INSERT INTO ui_preference_previews")) {
      const row = { id: params[0], user_id: params[1], base_revision: params[3], patch: JSON.parse(params[4]),
        preview: JSON.parse(params[5]), expires_at: params[6], status: "pending" };
      stored.push(row);
      return [row];
    }
    return [];
  } };
  const input = { user, inputMessageId: "input", threadId: "thread", prepared, connection };
  const first = await service.persistPrepared(input);
  const second = await service.persistPrepared(input);
  assert.deepEqual(second, first);
  assert.equal(stored.length, 1);
  assert.equal(calls.revalidate, 2);
  assert.equal(calls.events.length, 1);
});

test("preview lookup is scoped to the user and requires authorization", async () => {
  const { service } = createService({ dbQuery: async (_sql, params) => {
    assert.deepEqual(params, [previewId, user.id]);
    return [];
  } });
  await assert.rejects(service.getPreview({ user, previewId }), error => error.status === 404);
  const denied = createService({ authorize: async () => { throw new HttpError(403, "revoked"); } }).service;
  await assert.rejects(denied.getPreview({ user, previewId }), error => error.status === 403);
});

test("preview lookup reports an undone confirmation accurately", async () => {
  const { service } = createService({ dbQuery: async () => [{
    id: previewId, status: "confirmed", undone_at: "2026-11-03T04:01:00.000Z",
    expires_at: "2026-11-03T05:00:00.000Z", base_revision: 0, preview: {}, patch: {},
  }] });
  assert.equal((await service.getPreview({ user, previewId })).status, "undone");
});

test("undo restores the last confirmed preference snapshot with a new revision", async () => {
  const row = {
    status: "confirmed",
    base_revision: "0",
    confirmed_revision: "1",
    undone_at: null,
    preview: JSON.stringify({ beforePreferences: defaultUIPreferences(), confirmedRevision: 1 }),
  };
  const { service, calls } = createService({
    read: async () => ({ ...defaultUIPreferences(), revision: 1, surfaces: { ...defaultUIPreferences().surfaces, miao: { ...defaultUIPreferences().surfaces.miao, cardRadius: 20 } } }),
    transaction: async work => work({
      query: async (sql, params = []) => {
        calls.db.push({ sql, params });
        if (sql.startsWith("SELECT station_config")) return [{ station_config: JSON.stringify({ uiPreferences: { ...defaultUIPreferences(), revision: 1, surfaces: { ...defaultUIPreferences().surfaces, miao: { ...defaultUIPreferences().surfaces.miao, cardRadius: 20 } } } }) }];
        if (sql.includes("FROM ui_preference_previews")) return [row];
        if (sql.includes("UPDATE user_profiles")) return [{ user_id: user.id }];
        return [];
      },
    }),
  });
  const result = await service.undo({ user, baseRevision: 1 });
  assert.equal(result.status, "undone");
  assert.equal(result.preferences.revision, 2);
  assert.equal(result.preferences.surfaces.miao.cardRadius, 16);
  assert.ok(calls.db.some(call => /undone_at/.test(call.sql)));
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.db.some(call => /UPDATE user_profiles/.test(call.sql)), false);
  assert.equal(calls.events[0].eventType, "ui.preferences.undo");
});

test("preview accepts Miao card gesture patches when affected surface is declared", async () => {
  const { service } = createService({
    run: async () => ({
      reply: replyFor({
        gestures: {
          "miao.taskCard.participantsSwipe": { direction: "right", distance: 96 },
        },
      }),
    }),
  });
  const result = await service.preview({ user, instruction: "妙页右滑显示参与 Agent", surface: "miao" });
  assert.equal(result.preferences.gestures["miao.taskCard.participantsSwipe"].distance, 96);
});

test("preview rejects malformed model JSON without writing a proposal", async () => {
  const { service, calls } = createService({ run: async () => ({ reply: "not-json" }) });

  await assert.rejects(
    service.preview({ user, instruction: "改一下界面" }),
    error => error instanceof HttpError && error.status === 502 && error.details.code === "UI_AGENT_INVALID_RESPONSE",
  );
  assert.equal(calls.db.length, 0);
  assert.equal(calls.events.length, 0);
});

test("settings and chat reject empty or semantically unchanged proposals before persistence", async () => {
  const patches = [
    {},
    { surfaces: { miao: { cardRadius: 16 } } },
    { components: { miao: { "miao.taskCard.participants": { visible: true, sizeScale: 1 } } } },
  ];
  for (const patch of patches) {
    const { service, calls } = createService({ run: async () => ({ reply: replyFor(patch) }) });
    for (const method of ["preview", "prepare"]) {
      await assert.rejects(service[method]({ user, instruction: "调整妙页" }),
        error => error instanceof HttpError && error.details.code === "UI_PREFERENCE_NO_CHANGE");
    }
    assert.equal(calls.db.length, 0);
    assert.equal(calls.events.length, 0);
  }
});

test("invalid model patches and conflicting merged gestures produce a safe retryable error", async () => {
  for (const patch of [
    { executable: "MODEL_SECRET" },
    { gestures: { "miao.taskCard.participantsSwipe": { direction: "left" } } },
  ]) {
    const { service, calls } = createService({ run: async () => ({ reply: replyFor(patch) }) });
    for (const method of ["preview", "prepare"]) {
      await assert.rejects(service[method]({ user, instruction: "调整妙页" }), error =>
        error instanceof HttpError && error.status === 502 &&
        error.details.code === "UI_AGENT_INVALID_RESPONSE" &&
        !JSON.stringify({ message: error.message, details: error.details }).includes("MODEL_SECRET"));
    }
    assert.equal(calls.db.length, 0);
  }
});

test("hidden module order is semantically irrelevant, while a visibility change remains applicable", async () => {
  const current = defaultUIPreferences();
  current.hiddenModules.secondFloor = ["files", "albums"];
  const unchanged = createService({
    read: async () => current,
    run: async () => ({ reply: replyFor({ hiddenModules: { secondFloor: ["albums", "files"] } }, ["secondFloor"]) }),
  });
  await assert.rejects(unchanged.service.prepare({ user, instruction: "调整界面" }),
    error => error.details.code === "UI_PREFERENCE_NO_CHANGE");
  const changed = createService({
    read: async () => current,
    run: async () => ({ reply: replyFor({ hiddenModules: { secondFloor: ["albums"] } }, ["secondFloor"]) }),
  });
  assert.deepEqual((await changed.service.prepare({ user, instruction: "显示文件" })).next.hiddenModules.secondFloor, ["albums"]);
});

test("partial second-floor orders that only move virtual or hidden modules are not applicable changes", async () => {
  const cases = [
    { current: defaultUIPreferences(), order: ["albums", "files"] },
    { current: { ...defaultUIPreferences(), hiddenModules: { ...defaultUIPreferences().hiddenModules, secondFloor: ["albums"] } },
      order: ["files", "albums", "relationships", "assets", "information", "permissions"] },
    { current: { ...defaultUIPreferences(), hiddenModules: { ...defaultUIPreferences().hiddenModules, secondFloor: ["files"] } },
      order: ["files", "albums"] },
  ];
  for (const { current, order } of cases) {
    const { service, calls } = createService({
      read: async () => current,
      run: async () => ({ reply: replyFor({ layout: { secondFloor: { moduleOrder: order } } }, ["secondFloor"]) }),
    });
    for (const method of ["preview", "prepare"]) {
      await assert.rejects(service[method]({ user, instruction: "调整工具顺序", surface: "secondFloor" }),
        error => error instanceof HttpError && error.status === 422 && error.details.code === "UI_PREFERENCE_NO_CHANGE");
    }
    assert.equal(calls.db.length, 0);
    assert.equal(calls.events.length, 0);
  }
});

test("reordering visible second-floor tools remains an applicable change", async () => {
  const current = defaultUIPreferences();
  current.hiddenModules.secondFloor = ["files"];
  const { service } = createService({
    read: async () => current,
    run: async () => ({ reply: replyFor({ layout: { secondFloor: { moduleOrder: ["assets", "albums"] } } }, ["secondFloor"]) }),
  });
  const prepared = await service.prepare({ user, instruction: "把资产放在相册之前", surface: "secondFloor" });
  assert.deepEqual(prepared.next.layout.secondFloor.moduleOrder, ["assets", "albums"]);
});

test("action order only changes a preview when visible Miao controls share a slot and change order", async () => {
  const cases = [
    { current: defaultUIPreferences(), order: 0 },
    { current: defaultUIPreferences(), order: 12 },
    { current: { ...defaultUIPreferences(), components: { ...defaultUIPreferences().components,
      miao: { "miao.taskCard.details": { visible: true }, "miao.taskCard.participants": { order: 0 } } } }, order: 1 },
    { current: { ...defaultUIPreferences(), components: { ...defaultUIPreferences().components,
      miao: { "miao.taskCard.details": { visible: true }, "miao.taskCard.participants": { slot: "topRight" } } } }, order: 12 },
  ];
  for (const { current, order } of cases) {
    const { service, calls } = createService({ read: async () => current,
      run: async () => ({ reply: replyFor({ components: { miao: { "miao.taskCard.participants": { order } } } }) }) });
    await assert.rejects(service.prepare({ user, instruction: "调整按钮顺序" }),
      error => error instanceof HttpError && error.details.code === "UI_PREFERENCE_NO_CHANGE");
    assert.equal(calls.db.length, 0);
  }
  const current = defaultUIPreferences();
  current.components.miao["miao.taskCard.details"] = { visible: true };
  const { service } = createService({ read: async () => current,
    run: async () => ({ reply: replyFor({ components: { miao: { "miao.taskCard.participants": { order: 2 } } } }) }) });
  assert.equal((await service.prepare({ user, instruction: "将参与者按钮放到详情之后" }))
    .next.components.miao["miao.taskCard.participants"].order, 2);
});

test("an explicit details control is a visible change even with default scale", async () => {
  const { service } = createService({ run: async () => ({ reply: replyFor({ components: { miao: { "miao.taskCard.details": { visible: true, sizeScale: 1 } } } }) }) });
  const result = await service.prepare({ user, instruction: "显示详情按钮" });
  assert.equal(result.next.components.miao["miao.taskCard.details"].visible, true);
});

test("undo refuses a historical baseline whose controls are no longer supported", async () => {
  const before = defaultUIPreferences();
  before.components.miao["miao.taskCard.participants"] = { slot: "floating" };
  const { service, calls } = createService({
    read: async () => ({ ...defaultUIPreferences(), revision: 1 }),
    transaction: async work => work({ query: async sql => sql.includes("FROM ui_preference_previews")
      ? [{ confirmed_revision: 1, preview: { beforePreferences: before } }] : [] }),
  });
  await assert.rejects(service.undo({ user, baseRevision: 1 }),
    error => error.status === 409 && error.details.code === "UI_PREFERENCE_UNDO_UNSUPPORTED");
  assert.equal(calls.writes.length, 0);
});

test("new proposals reject component and action slots absent from the RN renderer", async () => {
  const invalid = [
    { components: { miao: { "miao.taskCard.participants": { slot: "floating" } } } },
    { components: { secondFloor: { "secondFloor.album.upload": { slot: "topRight" } } } },
    { layout: { messages: { buttonSlots: { composerAction: "inline" } } } },
  ];
  for (const patch of invalid) {
    const { service, calls } = createService({ run: async () => ({ reply: replyFor(patch) }) });
    await assert.rejects(service.prepare({ user, instruction: "调整位置" }),
      error => error.status === 502 && error.details.code === "UI_AGENT_INVALID_RESPONSE");
    assert.equal(calls.db.length, 0);
  }
});

test("supported slot proposals remain available when another historical preference uses an old slot", async () => {
  const current = defaultUIPreferences();
  current.components.miao["miao.taskCard.participants"] = { slot: "floating" };
  const { service } = createService({ read: async () => current,
    run: async () => ({ reply: replyFor({ components: { miao: { "miao.taskCard.participants": { slot: "cardFooter" } } } }) }) });
  const result = await service.prepare({ user, instruction: "按钮移到卡片底部" });
  assert.equal(result.current.components.miao["miao.taskCard.participants"].slot, "floating");
  assert.equal(result.next.components.miao["miao.taskCard.participants"].slot, "cardFooter");
});

test("confirm rejects historical pending previews containing unsupported slots", async () => {
  const row = { status: "pending", base_revision: "0", expires_at: "2099-01-01T00:00:00.000Z",
    patch: JSON.stringify({ components: { miao: { "miao.taskCard.participants": { slot: "floating" } } } }) };
  const { service, calls } = createService({ transaction: async work => work({
    query: async sql => sql.startsWith("SELECT * FROM ui_preference_previews") ? [row] : [],
  }) });
  await assert.rejects(service.confirm({ user, previewId, baseRevision: 0 }),
    error => error.status === 409 && error.details.code === "UI_PREFERENCE_PREVIEW_UNSUPPORTED");
  assert.equal(calls.writes.length, 0);
});

test("preview rejects unknown top-level model response fields without writing", async () => {
  const response = JSON.parse(replyFor({ surfaces: { miao: { cardRadius: 20 } } }));
  response.executable = "unexpected";
  const { service, calls } = createService({
    run: async () => ({ reply: JSON.stringify(response) }),
  });

  await assert.rejects(
    service.preview({ user, instruction: "改妙页" }),
    error => error instanceof HttpError && error.status === 502 && error.details.code === "UI_AGENT_INVALID_RESPONSE",
  );
  assert.equal(calls.db.length, 0);
  assert.equal(calls.events.length, 0);
});

test("preview rejects a model response that omits affected surfaces", async () => {
  const { service, calls } = createService({
    run: async () => ({
      reply: JSON.stringify({
        schemaVersion: 1,
        intent: "调整界面",
        patch: { surfaces: { miao: { cardRadius: 20 } } },
        affectedSurfaces: [],
        rationale: "测试",
      }),
    }),
  });

  await assert.rejects(
    service.preview({ user, instruction: "改妙页" }),
    error => error instanceof HttpError && error.status === 502 && error.details.code === "UI_AGENT_INVALID_RESPONSE",
  );
  assert.equal(calls.db.length, 0);
});

test("global typography and density proposals must disclose every affected surface", async () => {
  const patches = [
    { fontScale: 1.2 },
    { density: "compact" },
    // Even a redundant global field must not conceal its global scope behind
    // an otherwise applicable local change.
    { fontScale: 1, surfaces: { miao: { cardRadius: 20 } } },
    { density: "comfortable", surfaces: { miao: { cardRadius: 20 } } },
  ];
  for (const patch of patches) {
    for (const affected of [[], ["miao"], ["messages", "miao"]]) {
      const { service, calls } = createService({ run: async () => ({ reply: replyFor(patch, affected) }) });
      for (const method of ["prepare", "preview"]) {
        await assert.rejects(service[method]({ user, instruction: "调整字号或密度" }),
          error => error instanceof HttpError && error.status === 502 && error.details.code === "UI_AGENT_INVALID_RESPONSE");
      }
      assert.equal(calls.db.length, 0);
      assert.equal(calls.events.length, 0);
    }
    const affectedSurfaces = ["messages", "miao", "secondFloor"];
    const { service } = createService({ run: async () => ({ reply: replyFor(patch, affectedSurfaces) }) });
    assert.deepEqual((await service.prepare({ user, instruction: "调整字号或密度" })).generated.affectedSurfaces, affectedSurfaces);
  }
});

test("preview refuses an unpublished or unauthorized UI Agent before profile access", async () => {
  let reads = 0;
  const { service } = createService({
    authorize: async () => {
      throw new HttpError(409, "Agent release is unavailable", { code: "AGENT_RELEASE_UNAVAILABLE" });
    },
    read: async () => {
      reads += 1;
      return defaultUIPreferences();
    },
  });

  await assert.rejects(
    service.preview({ user, instruction: "把按钮变圆" }),
    error => error instanceof HttpError && error.status === 409 && error.details.code === "AGENT_RELEASE_UNAVAILABLE",
  );
  assert.equal(reads, 0);
});

test("confirm applies a preview once and advances the revision", async () => {
  const row = {
    status: "pending",
    base_revision: "0",
    patch: JSON.stringify({ surfaces: { miao: { cardRadius: 20 } } }),
    expires_at: new Date(nowMs + 60_000).toISOString(),
  };
  const { service, calls } = createService({
    transaction: async work => work({
      query: async (sql, params = []) => {
        calls.db.push({ sql, params });
        if (sql.startsWith("SELECT * FROM ui_preference_previews")) return [row];
        if (sql.includes("UPDATE user_profiles")) return [{ user_id: user.id }];
        return [];
      },
    }),
  });

  const result = await service.confirm({ user, previewId, baseRevision: 0 });
  assert.equal(result.status, "confirmed");
  assert.equal(result.preferences.revision, 1);
  assert.equal(result.preferences.surfaces.miao.cardRadius, 20);
  assert.equal(calls.authorize, 1);
  assert.equal(calls.events[0].eventType, "ui.preferences.confirm");
  assert.equal(calls.revalidate, 1);
  assert.ok(calls.db.findIndex(call => /SELECT id FROM users/.test(call.sql)) <
    calls.db.findIndex(call => /SELECT \* FROM ui_preference_previews/.test(call.sql)));
  assert.ok(calls.db.some(call => /status = 'confirmed'/.test(call.sql)));
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.writes[0].expectedRevision, 0);
  assert.equal(calls.db.some(call => /UPDATE user_profiles/.test(call.sql)), false);
});

test("confirm rejects a previously saved no-op preview without advancing revision", async () => {
  const row = { status: "pending", base_revision: "0", expires_at: "2099-01-01T00:00:00.000Z", patch: "{}" };
  const { service, calls } = createService({
    transaction: async work => work({ query: async sql => sql.startsWith("SELECT * FROM ui_preference_previews") ? [row] : [] }),
  });
  await assert.rejects(service.confirm({ user, previewId, baseRevision: 0 }),
    error => error instanceof HttpError && error.details.code === "UI_PREFERENCE_NO_CHANGE");
  assert.equal(calls.writes.length, 0);
});

test("confirm rechecks global scope on historical pending previews before writing", async () => {
  for (const patch of [{ fontScale: 1.2 }, { density: "compact" }]) {
    for (const affectedSurfaces of [undefined, [], ["miao"], ["messages", "miao"]]) {
      const row = { status: "pending", base_revision: "0", expires_at: "2099-01-01T00:00:00.000Z",
        patch: JSON.stringify(patch), preview: JSON.stringify({ affectedSurfaces }) };
      const { service, calls } = createService({ transaction: async work => work({
        query: async (sql, params = []) => {
          calls.db.push({ sql, params });
          return sql.startsWith("SELECT * FROM ui_preference_previews") ? [row] : [];
        },
      }) });
      await assert.rejects(service.confirm({ user, previewId, baseRevision: 0 }),
        error => error instanceof HttpError && error.status === 409 && error.details.code === "UI_PREFERENCE_PREVIEW_UNSUPPORTED");
      assert.equal(calls.writes.length, 0);
      assert.equal(calls.events.length, 0);
      assert.equal(calls.db.some(call => /^\s*(UPDATE|INSERT)\b/.test(call.sql)), false);
    }
    const row = { status: "pending", base_revision: "0", expires_at: "2099-01-01T00:00:00.000Z",
      patch, preview: { affectedSurfaces: ["messages", "miao", "secondFloor"] } };
    const { service, calls } = createService({ transaction: async work => work({
      query: async sql => sql.startsWith("SELECT * FROM ui_preference_previews") ? [row] : [],
    }) });
    assert.equal((await service.confirm({ user, previewId, baseRevision: 0 })).status, "confirmed");
    assert.equal(calls.writes.length, 1);
  }
});

test("confirm rejects expired previews and marks them expired", async () => {
  let committed = false;
  const { service, calls } = createService({
    transaction: async work => {
      const result = await work({
      query: async (sql, params = []) => {
        calls.db.push({ sql, params });
        if (sql.startsWith("SELECT * FROM ui_preference_previews")) {
          return [{ status: "pending", base_revision: "0", expires_at: new Date(nowMs - 1).toISOString() }];
        }
        return [];
      },
      });
      committed = true;
      return result;
    },
  });

  await assert.rejects(
    service.confirm({ user, previewId, baseRevision: 0 }),
    error => error instanceof HttpError && error.status === 409 && error.details.code === "UI_PREFERENCE_PREVIEW_EXPIRED",
  );
  assert.ok(calls.db.some(call => /status = 'expired'/.test(call.sql)));
  assert.equal(committed, true);
});

test("confirm rejects an authorization revoked after the initial check", async () => {
  const { service, calls } = createService({
    revalidate: async () => { throw new HttpError(403, "revoked", { code: "AI_ACCESS_REVOKED" }); },
  });
  await assert.rejects(service.confirm({ user, previewId, baseRevision: 0 }),
    error => error.details.code === "AI_ACCESS_REVOKED");
  assert.equal(calls.writes.length, 0);
});

test("confirm rejects a stale base revision", async () => {
  const { service, calls } = createService({
    transaction: async work => work({
      query: async (sql, params = []) => {
        calls.db.push({ sql, params });
        return sql.startsWith("SELECT * FROM ui_preference_previews")
          ? [{ status: "pending", base_revision: "2", expires_at: new Date(nowMs + 60_000).toISOString() }]
          : [];
      },
    }),
  });

  await assert.rejects(
    service.confirm({ user, previewId, baseRevision: 0 }),
    error => error instanceof HttpError && error.status === 409 && error.details.code === "UI_PREFERENCE_REVISION_CONFLICT",
  );
  assert.equal(calls.read, 1);
  assert.equal(calls.writes.length, 0);
});

test("reset requires UI Agent authorization and invalidates pending previews", async () => {
  const { service, calls } = createService({
    read: async () => {
      calls.read += 1;
      return { ...defaultUIPreferences(), revision: 3 };
    },
  });

  const result = await service.reset({ user, baseRevision: 3 });
  assert.equal(result.status, "reset");
  assert.equal(result.preferences.revision, 4);
  assert.equal(calls.authorize, 1);
  assert.ok(calls.db.some(call => /status = 'reset'/.test(call.sql)));
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.db.some(call => /UPDATE user_profiles/.test(call.sql)), false);
  assert.equal(calls.events[0].eventType, "ui.preferences.reset");
});
