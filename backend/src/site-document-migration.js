import crypto from "node:crypto";
import { assertSiteDocument } from "../../shared/site-document.js";
import { hashSiteDocumentValue, readSiteDocumentResources } from "./site-document-repository.js";

export const siteDocumentMigrationId = "site-document-v2-20261012";
const problem = code => { const error = new Error(code); error.code = code; throw error; };
const keys = (value, expected) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const sectionId = (draftId, index) => {
  const bytes = crypto.createHash("sha256").update(`${siteDocumentMigrationId}:${draftId}:${index}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

// This converter is used only by the explicit operator migration, never by API reads.
export function convertSiteDocumentV1(draft, draftId) {
  if (!keys(draft, ["version", "language", "theme", "title", "summary", "sections"]) || draft.version !== 1
    || !Array.isArray(draft.sections)) problem("SITE_MIGRATION_SOURCE_INVALID");
  const intents = { link: "open-link", message: "compose-message", follow: "follow-user" };
  const { version: _version, ...content } = draft;
  const document = {
    schemaVersion: 2, documentId: draftId, revision: 1, visibility: "private", ...content,
    sections: draft.sections.map((section, index) => {
      if (!keys(section, ["type", "title", "subtitle", "body", "assetIds", "diaryEntryIds", "actions"])
        || !Array.isArray(section.actions)) problem("SITE_MIGRATION_SOURCE_INVALID");
      return { id: sectionId(draftId, index), ...section, actions: section.actions.map(action => {
        if (!keys(action, ["kind", "label", "href"]) || !Object.hasOwn(intents, action.kind)) {
          problem("SITE_MIGRATION_ACTION_INVALID");
        }
        return { kind: "interaction-intent", intent: intents[action.kind], label: action.label,
          target: { kind: "unresolved", text: action.href } };
      }) };
    }),
  };
  assertSiteDocument(document);
  return document;
}

async function snapshot(connection) {
  const identity = (await connection.query(`SELECT current_database() AS database,
    COALESCE(inet_server_addr()::text, 'local-socket') AS address, inet_server_port() AS port`))[0];
  const drafts = (await connection.query(`SELECT to_jsonb(d) AS row FROM station_site_drafts d
    WHERE source = 'model' ORDER BY id`)).map(item => item.row);
  const profiles = (await connection.query(`SELECT to_jsonb(p) AS row FROM user_profiles p
    WHERE jsonb_extract_path(station_config, 'siteLayout') IS NOT NULL
      AND jsonb_extract_path(station_config, 'siteLayout') <> 'null'::jsonb ORDER BY user_id`)).map(item => item.row);
  const triggers = await connection.query(`SELECT c.relname AS table_name, t.tgname AS name,
    t.tgenabled AS enabled, p.proname AS function_name, n.nspname AS function_schema
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE t.tgrelid IN ('station_site_drafts'::regclass, 'user_profiles'::regclass)
      AND t.tgname IN ('trg_station_site_drafts_touch_updated_at', 'trg_user_profiles_touch_updated_at')
    ORDER BY c.relname, t.tgname`);
  if (triggers.length !== 2 || triggers.some(row => row.enabled !== "O"
    || row.function_name !== "touch_updated_at" || row.function_schema !== "public")) {
    problem("SITE_MIGRATION_TRIGGER_STATE_INVALID");
  }
  return { identity, drafts, profiles, triggers };
}
const digest = state => hashSiteDocumentValue(state);

function convertedState(before) {
  if (!keys(before, ["identity", "drafts", "profiles", "triggers"])
    || !keys(before.identity, ["database", "address", "port"])
    || !Array.isArray(before.drafts) || !Array.isArray(before.profiles) || !Array.isArray(before.triggers)
    || new Set(before.drafts.map(row => row.id)).size !== before.drafts.length
    || new Set(before.profiles.map(row => row.user_id)).size !== before.profiles.length) problem("SITE_MIGRATION_PLAN_INVALID");
  const documents = new Map();
  let convertedDrafts = 0;
  const afterDrafts = before.drafts.map(row => {
    if (!row || row.source !== "model" || typeof row.user_id !== "string") problem("SITE_MIGRATION_SOURCE_INVALID");
    let document;
    if (row.draft?.version === 1) { document = convertSiteDocumentV1(row.draft, row.id); convertedDrafts += 1; }
    else { assertSiteDocument(row.draft); document = row.draft; }
    if (document.documentId !== row.id) problem("SITE_MIGRATION_IDENTITY_MISMATCH");
    documents.set(row.id, { owner: row.user_id, document, original: row.draft, deleted: row.deleted_at, status: row.status });
    return { ...row, draft: document };
  });
  let convertedProfiles = 0;
  const afterProfiles = before.profiles.map(row => {
    const current = documents.get(row.station_config?.siteDraftId);
    if (!current || current.owner !== row.user_id || current.deleted || current.status !== "applied"
      || digest(current.original) !== digest(row.station_config.siteLayout)) problem("SITE_MIGRATION_PROFILE_MISMATCH");
    if (digest(current.document) !== digest(current.original)) convertedProfiles += 1;
    return { ...row, station_config: { ...row.station_config, siteLayout: current.document } };
  });
  return { after: { ...before, drafts: afterDrafts, profiles: afterProfiles },
    summary: { drafts: before.drafts.length, convertedDrafts, profiles: before.profiles.length, convertedProfiles,
      preservedActions: before.drafts.reduce((count, row) => count + row.draft.sections.reduce((sum, section) => sum + section.actions.length, 0), 0) } };
}

export async function planSiteDocumentMigration(connection) {
  const before = await snapshot(connection);
  const { after, summary } = convertedState(before);
  for (const row of after.drafts) {
    if (!row.deleted_at) await readSiteDocumentResources(connection, row.user_id, row.draft);
  }
  const plan = { migrationId: siteDocumentMigrationId, before, after, beforeHash: digest(before), afterHash: digest(after), summary };
  return { ...plan, planHash: digest(plan) };
}

export function assertSiteDocumentMigrationPlan(plan) {
  if (!keys(plan, ["migrationId", "before", "after", "beforeHash", "afterHash", "summary", "planHash"])
    || plan.migrationId !== siteDocumentMigrationId) problem("SITE_MIGRATION_PLAN_INVALID");
  const { planHash, ...value } = plan;
  if (digest(value) !== planHash || digest(plan.before) !== plan.beforeHash || digest(plan.after) !== plan.afterHash
    || digest(plan.before.identity) !== digest(plan.after.identity)) problem("SITE_MIGRATION_PLAN_INVALID");
  // A self-computed digest alone is insufficient: prove the exact authorized
  // transformation for restore as well, with no changes to other row fields.
  const expected = convertedState(plan.before);
  if (digest(expected.after) !== plan.afterHash || digest(expected.summary) !== digest(plan.summary)) problem("SITE_MIGRATION_PLAN_INVALID");
}

// Call inside one dedicated transaction while API/Workers are stopped. Table locks
// bound the small reviewed snapshot and avoid concurrent inserts/copies during apply.
export async function applySiteDocumentMigration(connection, plan, { restore = false } = {}) {
  assertSiteDocumentMigrationPlan(plan);
  await connection.query("SET LOCAL lock_timeout = '5s'");
  await connection.query("SET LOCAL statement_timeout = '60s'");
  await connection.query("LOCK TABLE station_site_drafts, user_profiles IN ACCESS EXCLUSIVE MODE");
  const current = await snapshot(connection);
  const from = restore ? plan.after : plan.before;
  const to = restore ? plan.before : plan.after;
  if (digest(current) === digest(to)) return { changed: false, restored: restore, ...plan.summary };
  if (digest(current) !== digest(from)) problem("SITE_MIGRATION_SNAPSHOT_CHANGED");
  if (!restore) {
    const checked = await planSiteDocumentMigration(connection);
    if (checked.planHash !== plan.planHash) problem("SITE_MIGRATION_PLAN_CHANGED");
  }
  // Disable only timestamp triggers under the table locks, preserving historical
  // timestamps. DDL is transactional: rollback restores both triggers and content.
  await connection.query("ALTER TABLE station_site_drafts DISABLE TRIGGER trg_station_site_drafts_touch_updated_at");
  await connection.query("ALTER TABLE user_profiles DISABLE TRIGGER trg_user_profiles_touch_updated_at");
  for (const row of to.drafts) {
    const original = from.drafts.find(item => item.id === row.id);
    if (digest(original.draft) === digest(row.draft)) continue;
    await connection.query("UPDATE station_site_drafts SET draft = ?::jsonb WHERE id = ? AND user_id = ?",
      [JSON.stringify(row.draft), row.id, row.user_id]);
  }
  for (const row of to.profiles) {
    const original = from.profiles.find(item => item.user_id === row.user_id);
    if (digest(original.station_config) === digest(row.station_config)) continue;
    await connection.query("UPDATE user_profiles SET station_config = ?::jsonb WHERE user_id = ?",
      [JSON.stringify(row.station_config), row.user_id]);
  }
  await connection.query("ALTER TABLE station_site_drafts ENABLE TRIGGER trg_station_site_drafts_touch_updated_at");
  await connection.query("ALTER TABLE user_profiles ENABLE TRIGGER trg_user_profiles_touch_updated_at");
  if (digest(await snapshot(connection)) !== digest(to)) problem("SITE_MIGRATION_VERIFICATION_FAILED");
  return { changed: true, restored: restore, ...plan.summary };
}
