import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import crypto from "node:crypto";
import { query, closeDatabase, withTransaction } from "../src/db.js";
import { applyPendingMigrations } from "../src/migration-ledger.js";
import { loadMigrationFiles } from "../src/migration-files.js";
import { mapAppUIPreferences } from "../src/ui-preferences-app-store.js";
import { createUIPreferenceService } from "../src/ui-preference-service.js";

const enabled = process.env.RUN_UI_PREFERENCE_MIGRATION_INTEGRATION === "1";
const integration = (name, work) => test(name, {
  skip: !enabled && "Requires an explicitly configured disposable loopback *_migration_test database",
}, work);
const owner = crypto.randomUUID();

before(async () => {
  if (!enabled) return;
  const database = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(database.hostname));
  assert.match(database.pathname, /_migration_test$/);
  const [identity] = await query("SELECT current_database() AS name");
  assert.equal(identity.name, database.pathname.slice(1));
});

after(async () => {
  if (enabled) await closeDatabase();
});

integration("055 upgrades the published 054 schema and preserves both preference contracts", async () => {
  const migrations = await loadMigrationFiles();
  const through054 = migrations.filter(({ filename }) => filename <= "054_chat_attachment_lifecycle.sql");
  const client = await (await (await import("../src/db.js")).getPool()).connect();
  try {
  const complete = await applyPendingMigrations({
    client,
    migrations: through054,
  });
  assert.deepEqual(complete.applied.filter(name => Number.parseInt(name, 10) >= 51), [
    "051_user_ui_preferences.sql",
    "052_group_chat.sql",
    "053_chat_attachments.sql",
    "054_chat_attachment_lifecycle.sql",
  ]);

  await query("INSERT INTO users (id,email,password_hash,display_name,ai_id) VALUES (?,?,'migration-test',?,?)", [
    owner, `${owner}@example.invalid`, `Migration ${owner.slice(0, 8)}`, "987654321000",
  ]);
  await query(`INSERT INTO user_profiles(user_id,nickname,avatar_text,station_config)
    VALUES (?, 'Migration test', 'M', ?::jsonb)`, [owner, JSON.stringify({
      uiPreferences: { schemaVersion: 1, revision: 3, density: "compact" },
      retained: "profile data",
    })]);

  const migrated = await applyPendingMigrations({
    client,
    migrations,
  });
  assert.deepEqual(migrated.applied, migrations
    .filter(({ filename }) => filename > "054_chat_attachment_lifecycle.sql")
    .map(({ filename }) => filename));
  const legacy = await query("SELECT * FROM user_ui_preferences WHERE user_id = ?", [owner]);
  assert.deepEqual(legacy, []);
  const [stored] = await query("SELECT station_config FROM user_profiles WHERE user_id = ?", [owner]);
  assert.equal(mapAppUIPreferences(stored).revision, 3);
  assert.equal(mapAppUIPreferences(stored).density, "compact");
  assert.equal(stored.station_config.retained, "profile data");
  assert.equal((await query("SELECT count(*)::int AS count FROM ui_preference_previews"))[0].count >= 0, true);

  const previewId = crypto.randomUUID();
  await query(`INSERT INTO ui_preference_previews (id,user_id,base_revision,patch,preview,expires_at)
    VALUES (?,?,3,?::jsonb,'{}'::jsonb,CURRENT_TIMESTAMP + interval '1 hour')`,
  [previewId, owner, JSON.stringify({ surfaces: { miao: { cardRadius: 20 } } })]);
  let releaseConfirm;
  let reachedPreview;
  const previewLocked = new Promise(resolve => { reachedPreview = resolve; });
  const release = new Promise(resolve => { releaseConfirm = resolve; });
  const service = createUIPreferenceService({
    authorize: async () => ({}),
    lockAuthorization: async () => {},
    revalidate: async () => {},
    recordEvent: async () => {},
    transaction: work => withTransaction(connection => work({
      query: async (sql, params) => {
        const rows = await connection.query(sql, params);
        if (sql.startsWith("SELECT * FROM ui_preference_previews WHERE id")) {
          reachedPreview();
          await release;
        }
        return rows;
      },
    })),
  });
  const confirming = service.confirm({ user: { id: owner }, previewId, baseRevision: 3 });
  await previewLocked;
  const resetting = service.reset({ user: { id: owner }, baseRevision: 3 });
  releaseConfirm();
  const [confirmed, reset] = await Promise.allSettled([confirming, resetting]);
  assert.equal(confirmed.status, "fulfilled");
  assert.equal(reset.status, "rejected");
  assert.equal(reset.reason.details.code, "UI_PREFERENCE_REVISION_CONFLICT");

  const expiredId = crypto.randomUUID();
  await query(`INSERT INTO ui_preference_previews (id,user_id,base_revision,patch,preview,expires_at)
    VALUES (?,?,4,'{}'::jsonb,'{}'::jsonb,CURRENT_TIMESTAMP - interval '1 second')`, [expiredId, owner]);
  await assert.rejects(service.confirm({ user: { id: owner }, previewId: expiredId, baseRevision: 4 }),
    error => error.details.code === "UI_PREFERENCE_PREVIEW_EXPIRED");
  const [expired] = await query("SELECT status FROM ui_preference_previews WHERE id = ?", [expiredId]);
  assert.equal(expired.status, "expired");

  const threadId = crypto.randomUUID();
  const inputMessageId = crypto.randomUUID();
  await query("INSERT INTO chat_threads (id,user_id,title) VALUES (?,?,?)", [threadId, owner, "preview"]);
  await query(`INSERT INTO chat_messages (id,thread_id,user_id,sender_type,sender_name,content)
    VALUES (?,?,?,'user','test','adjust')`, [inputMessageId, threadId, owner]);
  const ui = createUIPreferenceService({
    authorize: async () => ({ agent: { key: "ui-agent" }, access: { grantedScopes: [] }, context: {} }),
    lockAuthorization: async () => {},
    revalidate: async () => {},
    run: async () => ({ reply: JSON.stringify({ schemaVersion: 1, intent: "adjust", rationale: "test",
      affectedSurfaces: ["miao"], patch: { surfaces: { miao: { cardRadius: 18 } } } }) }),
    recordEvent: async () => {},
  });
  const prepared = await ui.prepare({ user: { id: owner }, instruction: "adjust", surface: "miao" });
  const save = () => withTransaction(connection => ui.persistPrepared({
    user: { id: owner }, inputMessageId, threadId, prepared, connection,
  }));
  const [first, second] = await Promise.all([save(), save()]);
  assert.equal(first.id, second.id);
  assert.equal((await query("SELECT count(*)::int AS count FROM ui_preference_previews WHERE input_message_id = ?", [inputMessageId]))[0].count, 1);
  assert.equal((await ui.getPreview({ user: { id: owner }, previewId: first.id })).id, first.id);
  await assert.rejects(ui.getPreview({ user: { id: crypto.randomUUID() }, previewId: first.id }),
    error => error.details.code === "UI_PREFERENCE_PREVIEW_NOT_FOUND");
  await query("UPDATE chat_messages SET recalled_at = CURRENT_TIMESTAMP WHERE id = ?", [inputMessageId]);
  await assert.rejects(ui.getPreview({ user: { id: owner }, previewId: first.id }),
    error => error.details.code === "UI_PREFERENCE_INPUT_NOT_FOUND");
  await assert.rejects(ui.confirm({ user: { id: owner }, previewId: first.id, baseRevision: first.baseRevision }),
    error => error.details.code === "UI_PREFERENCE_INPUT_NOT_FOUND");
  await query("UPDATE chat_messages SET recalled_at = NULL, deleted_at = CURRENT_TIMESTAMP WHERE id = ?", [inputMessageId]);
  await assert.rejects(ui.getPreview({ user: { id: owner }, previewId: first.id }),
    error => error.details.code === "UI_PREFERENCE_INPUT_NOT_FOUND");
  await assert.rejects(ui.confirm({ user: { id: owner }, previewId: first.id, baseRevision: first.baseRevision }),
    error => error.details.code === "UI_PREFERENCE_INPUT_NOT_FOUND");
  await query("UPDATE chat_messages SET deleted_at = NULL WHERE id = ?", [inputMessageId]);
  const revoked = createUIPreferenceService({ authorize: async () => ({}), lockAuthorization: async () => {}, revalidate: async () => {
    throw Object.assign(new Error("revoked"), { code: "AI_ACCESS_REVOKED" });
  } });
  await assert.rejects(withTransaction(connection => revoked.persistPrepared({
    user: { id: owner }, inputMessageId, threadId, prepared, connection,
  })), error => error.code === "AI_ACCESS_REVOKED");

  await query("DELETE FROM users WHERE id = ?", [owner]);
  const replay = await applyPendingMigrations({
    client,
    migrations,
  });
  assert.deepEqual(replay.applied, []);
  } finally {
    client.release();
  }
});
