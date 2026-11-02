import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after, beforeEach } from "node:test";
import pg from "pg";
import { createConnectionAdapter } from "../src/db.js";
import { loadMigrationFiles } from "../src/migration-files.js";
import { applyPendingMigrations } from "../src/migration-ledger.js";
import { applySiteDocumentMigration, assertSiteDocumentMigrationPlan, convertSiteDocumentV1, planSiteDocumentMigration } from "../src/site-document-migration.js";
import { getStationSiteDocumentForUser, hashSiteDocumentValue } from "../src/site-document-repository.js";
import { assertSiteDocument } from "../../shared/site-document.js";

const owner = crypto.randomUUID();
const other = crypto.randomUUID();
const mediaId = crypto.randomUUID();
const diaryId = crypto.randomUUID();
const draftIds = Array.from({ length: 6 }, () => crypto.randomUUID());
const content = () => ({ version: 1, language: "zh", theme: "clean", title: "Migration test page", summary: "Public test content",
  sections: [{ type: "contact", title: "Contact", subtitle: "", body: "A retained module", assetIds: [mediaId], diaryEntryIds: [diaryId],
    actions: [{ kind: "link", label: "Website", href: "https://example.test/a?b=1" },
      { kind: "message", label: "Message", href: "" }, { kind: "follow", label: "Follow", href: "unresolved destination" }] }] });
const code = expected => error => error.code === expected || error.details?.code === expected;

test("explicit v1 converter preserves ordered text and references, produces deterministic immutable nodes and never infers targets", () => {
  const original = content();
  original.sections[0].actions[1] = { ...original.sections[0].actions[0] };
  const result = convertSiteDocumentV1(original, draftIds[0]);
  assertSiteDocument(result);
  assert.deepEqual(convertSiteDocumentV1(original, draftIds[0]), result);
  assert.notEqual(convertSiteDocumentV1(original, draftIds[1]).sections[0].id, result.sections[0].id);
  const { version: _version, sections: _sections, ...fields } = original;
  for (const [key, value] of Object.entries(fields)) assert.deepEqual(result[key], value);
  const { id: _id, actions: _actions, ...module } = result.sections[0];
  const { actions: _oldActions, ...sourceModule } = original.sections[0];
  assert.deepEqual(module, sourceModule);
  assert.deepEqual(result.sections[0].actions.map(action => [action.label, action.target.text]), original.sections[0].actions.map(action => [action.label, action.href]));
  assert.equal(result.sections[0].actions.every(action => action.target.kind === "unresolved"), true);
  assert.deepEqual(original, { ...content(), sections: [{ ...content().sections[0], actions: [content().sections[0].actions[0], content().sections[0].actions[0], content().sections[0].actions[2]] }] });
});

test("conversion refuses data truncation, extra fields, executable text, unknown actions and runtime v2 input", () => {
  for (const change of [
    value => { value.extra = true; },
    value => { value.sections[0].actions[0].extra = true; },
    value => { value.sections[0].actions[0].kind = "delete"; },
    value => { value.sections[0].actions[0].href = "x".repeat(2049); },
    value => { value.sections[0].actions[0].href = "<script>alert(1)</script>"; },
    value => { value.sections[0].actions.push(value.sections[0].actions[0]); },
  ]) {
    const value = content(); change(value);
    assert.throws(() => convertSiteDocumentV1(value, draftIds[0]));
  }
  assert.throws(() => convertSiteDocumentV1(convertSiteDocumentV1(content(), draftIds[0]), draftIds[0]), code("SITE_MIGRATION_SOURCE_INVALID"));
  assert.throws(() => assertSiteDocumentMigrationPlan({ migrationId: "wrong" }), code("SITE_MIGRATION_PLAN_INVALID"));
});

if (process.env.RUN_SITE_DOCUMENT_MIGRATION_INTEGRATION !== "1") {
  test("document migration requires an empty isolated loopback PostgreSQL database", { skip: "RUN_SITE_DOCUMENT_MIGRATION_INTEGRATION=1 and SITE_DOCUMENT_MIGRATION_DATABASE_URL" }, () => {});
} else {
  let pool;
  const transaction = async work => {
    const client = await pool.connect();
    try { await client.query("BEGIN"); const result = await work(createConnectionAdapter(client)); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  };
  const readState = async () => ({
    drafts: (await pool.query("SELECT to_jsonb(d) AS row FROM station_site_drafts d ORDER BY id")).rows.map(row => row.row),
    profiles: (await pool.query("SELECT to_jsonb(p) AS row FROM user_profiles p ORDER BY user_id")).rows.map(row => row.row),
  });
  const plan = () => transaction(planSiteDocumentMigration);
  const apply = (value, options) => transaction(connection => applySiteDocumentMigration(connection, value, options));
  before(async () => {
    const url = new URL(process.env.SITE_DOCUMENT_MIGRATION_DATABASE_URL);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_migration_test")) {
      throw new Error("A dedicated loopback _migration_test database is required");
    }
    pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
    const client = await pool.connect();
    try {
      assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n, 0);
      await applyPendingMigrations({ client, migrations: await loadMigrationFiles() });
      for (const [id, aiId] of [[owner, "787878787871"], [other, "787878787872"]]) {
        await client.query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES($1,$2,'test-only',$3,$4)", [id, `${id}@example.test`, id, aiId]);
        await client.query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES($1,'Migration fixture','M')", [id]);
      }
      await client.query("INSERT INTO station_media_assets(id,user_id,kind,mime_type,status) VALUES($1,$2,'image','image/jpeg','uploaded')", [mediaId, owner]);
      await client.query("INSERT INTO station_diary_entries(id,user_id,title,body) VALUES($1,$2,'Public fixture','Retain exact text')", [diaryId, owner]);
    } finally { client.release(); }
  });
  beforeEach(async () => {
    await pool.query("DELETE FROM station_site_drafts");
    await pool.query("UPDATE user_profiles SET station_config = '{}'::jsonb");
    await pool.query("UPDATE station_media_assets SET user_id=$1,deleted_at=NULL,status='uploaded' WHERE id=$2", [owner, mediaId]);
    for (let index = 0; index < draftIds.length; index += 1) {
      await pool.query(`INSERT INTO station_site_drafts(id,user_id,prompt,draft,source,status,model_provider,model_missing,model_error,created_at,updated_at)
        VALUES($1,$2,'Public migration fixture',$3::jsonb,'model',$4,'recorded-provider','[]'::jsonb,'',
          '2026-09-01T00:00:00.000001Z','2026-09-02T00:00:00.000002Z')`,
      [draftIds[index], owner, JSON.stringify(content()), index === 0 ? "applied" : "draft"]);
    }
    await pool.query("UPDATE user_profiles SET station_config=$1::jsonb WHERE user_id=$2", [JSON.stringify({ siteDraftId: draftIds[0], siteLayout: content(), untouched: { retain: [1, 2] } }), owner]);
  });
  after(async () => {
    if (pool) { await pool.query("DELETE FROM users WHERE id=ANY($1::text[])", [[owner, other]]); await pool.end(); }
  });

  test("atomic upgrade preserves every action, full row metadata, current copy and microsecond timestamps; repeat is no-op", async () => {
    const before = await readState();
    const prepared = await plan();
    assert.deepEqual(await readState(), before);
    assert.deepEqual(prepared.summary, { drafts: 6, convertedDrafts: 6, profiles: 1, convertedProfiles: 1, preservedActions: 18 });
    assert.equal((await apply(prepared)).changed, true);
    const after = await readState();
    for (let index = 0; index < after.drafts.length; index += 1) {
      const { draft: newDocument, ...newRow } = after.drafts[index];
      const { draft: oldDocument, ...oldRow } = before.drafts[index];
      assert.deepEqual(newRow, oldRow);
      assertSiteDocument(newDocument);
      assert.deepEqual(newDocument.sections[0].actions.map(action => action.target.text), oldDocument.sections[0].actions.map(action => action.href));
    }
    const originalProfile = before.profiles.find(row => row.user_id === owner);
    const profile = after.profiles.find(row => row.user_id === owner);
    assert.deepEqual({ ...profile, station_config: originalProfile.station_config }, originalProfile);
    assert.deepEqual(profile.station_config.untouched, { retain: [1, 2] });
    assert.deepEqual(profile.station_config.siteLayout, after.drafts.find(row => row.id === draftIds[0]).draft);
    const view = await getStationSiteDocumentForUser({ userId: owner, draftId: draftIds[0], transaction });
    assert.deepEqual(view.document, profile.station_config.siteLayout);
    assert.equal((await apply(prepared)).changed, false);
    assert.deepEqual(await readState(), after);
    const next = await plan();
    assert.equal(next.summary.convertedDrafts, 0);
    assert.equal((await apply(next)).changed, false);
  });

  test("rollback after data updates restores rows and timestamp triggers", async () => {
    const before = await readState(); const prepared = await plan();
    await assert.rejects(transaction(async connection => { await applySiteDocumentMigration(connection, prepared); throw new Error("forced failure"); }), /forced failure/);
    assert.deepEqual(await readState(), before);
    const triggerState = await pool.query("SELECT tgenabled FROM pg_trigger WHERE tgname IN ('trg_station_site_drafts_touch_updated_at','trg_user_profiles_touch_updated_at')");
    assert.equal(triggerState.rows.every(row => row.tgenabled === "O"), true);
    await pool.query("UPDATE station_site_drafts SET prompt='Newer content' WHERE id=$1", [draftIds[0]]);
    assert.notEqual((await readState()).drafts.find(row => row.id === draftIds[0]).updated_at, before.drafts.find(row => row.id === draftIds[0]).updated_at);
  });

  test("changed snapshots, copied-page mismatch and changed foreign resource stop without partial changes", async () => {
    const prepared = await plan();
    await pool.query("UPDATE station_site_drafts SET prompt='Changed after plan' WHERE id=$1", [draftIds[1]]);
    const changed = await readState();
    await assert.rejects(apply(prepared), code("SITE_MIGRATION_SNAPSHOT_CHANGED"));
    assert.deepEqual(await readState(), changed);
    await pool.query("UPDATE user_profiles SET station_config=jsonb_set(station_config,'{siteLayout,title}','\"Different copy\"'::jsonb) WHERE user_id=$1", [owner]);
    await assert.rejects(plan(), code("SITE_MIGRATION_PROFILE_MISMATCH"));
  });

  test("resource deletion or ownership change after plan rejects whole migration", async () => {
    const prepared = await plan();
    await pool.query("UPDATE station_media_assets SET user_id=$1 WHERE id=$2", [other, mediaId]);
    const state = await readState();
    await assert.rejects(apply(prepared), code("SITE_TASK_REFERENCES_UNAVAILABLE"));
    assert.deepEqual(await readState(), state);
  });

  test("snapshot restore is exact, repeatable and refuses to overwrite any post-migration edit", async () => {
    const before = await readState(); const prepared = await plan();
    await apply(prepared);
    assert.equal((await apply(prepared, { restore: true })).changed, true);
    assert.deepEqual(await readState(), before);
    assert.equal((await apply(prepared, { restore: true })).changed, false);
    await apply(prepared);
    await pool.query("UPDATE user_profiles SET bio='Edited after migration' WHERE user_id=$1", [owner]);
    const newer = await readState();
    await assert.rejects(apply(prepared, { restore: true }), code("SITE_MIGRATION_SNAPSHOT_CHANGED"));
    assert.deepEqual(await readState(), newer);
  });

  test("altered plan digest and extra persisted fields cannot be silently discarded", async () => {
    const prepared = await plan(); prepared.after.drafts[0].draft.title = "Altered plan";
    await assert.rejects(apply(prepared), code("SITE_MIGRATION_PLAN_INVALID"));
    await pool.query("UPDATE station_site_drafts SET draft=draft || '{\"unexpected\":true}'::jsonb WHERE id=$1", [draftIds[1]]);
    const state = await readState();
    await assert.rejects(plan(), code("SITE_MIGRATION_SOURCE_INVALID"));
    assert.deepEqual(await readState(), state);
  });

  test("restore rejects a rewritten original even when all plan digests are recomputed", async () => {
    const prepared = await plan();
    await apply(prepared);
    const migrated = await readState();
    const changed = structuredClone(prepared);
    // Snapshots sort by random UUID, so an array index can select the applied
    // draft and trigger the independent profile-copy mismatch check first.
    const rewrittenDraft = changed.before.drafts.find(row => row.id === draftIds[1]);
    assert.equal(rewrittenDraft?.status, "draft");
    rewrittenDraft.draft.title = "Malicious substitute";
    changed.beforeHash = hashSiteDocumentValue(changed.before);
    const { planHash: _hash, ...body } = changed;
    changed.planHash = hashSiteDocumentValue(body);
    await assert.rejects(apply(changed, { restore: true }), code("SITE_MIGRATION_PLAN_INVALID"));
    assert.deepEqual(await readState(), migrated);
  });

  test("unexpected timestamp trigger state stops planning without enabling it", async () => {
    await pool.query("ALTER TABLE station_site_drafts DISABLE TRIGGER trg_station_site_drafts_touch_updated_at");
    try {
      await assert.rejects(plan(), code("SITE_MIGRATION_TRIGGER_STATE_INVALID"));
      const result = await pool.query("SELECT tgenabled FROM pg_trigger WHERE tgname='trg_station_site_drafts_touch_updated_at'");
      assert.equal(result.rows[0].tgenabled, "D");
    } finally {
      await pool.query("ALTER TABLE station_site_drafts ENABLE TRIGGER trg_station_site_drafts_touch_updated_at");
    }
  });
}
