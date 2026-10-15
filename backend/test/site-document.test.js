import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { assertSiteDocument, assertSiteDocumentContent, collectSiteDocumentReferences } from "../../shared/site-document.js";
import { createStationSiteDraft } from "../src/station-agent-repository.js";
import { getStationSiteDocumentForUser, hashSiteDocumentValue, readSiteDocumentResources } from "../src/site-document-repository.js";

const owner = crypto.randomUUID();
const draftId = crypto.randomUUID();
const mediaId = crypto.randomUUID();
const diaryId = crypto.randomUUID();
const content = () => ({ language: "zh", theme: "gallery", title: "Owned page", summary: "Review",
  sections: [{ type: "gallery", title: "Photos", subtitle: "", body: "", assetIds: [mediaId], diaryEntryIds: [diaryId],
    actions: [{ kind: "view-media", label: "View", targetId: mediaId }, { kind: "view-diary", label: "Read", targetId: diaryId }] }] });
const document = () => ({ schemaVersion: 2, documentId: draftId, revision: 1, visibility: "private", ...content(),
  sections: content().sections.map(section => ({ id: crypto.randomUUID(), ...section })) });
const asset = { id: mediaId, user_id: owner, kind: "image", status: "uploaded", original_filename: "photo.jpg",
  document_version: "2026-10-12 01:02:03.000001+00", document_modified: "2026-10-12 01:02:03.000002+00" };
const diary = { id: diaryId, user_id: owner, title: "Entry", body: "Owned text", visibility: "private",
  document_version: "2026-10-12 01:02:03.000001+00", document_modified: "2026-10-12 01:02:03.000001+00" };
const code = expected => error => error.code === expected || error.details?.code === expected;

test("strict document content requires every field and refuses server-owned identities from the model", () => {
  assertSiteDocumentContent(content());
  for (const mutate of [
    value => { value.schemaVersion = 2; },
    value => { value.documentId = draftId; },
    value => { value.sections[0].id = draftId; },
    value => { value.sections[0].hidden = true; },
    value => { value.sections[0].actions[0].href = "https://example.test"; },
    value => { delete value.summary; },
    value => { delete value.sections[0].body; },
    value => { value.sections[0].assetIds.push(mediaId); },
    value => { value.sections[0].actions.push({ ...value.sections[0].actions[0] }); },
    value => { value.sections[0].actions[0].targetId = crypto.randomUUID(); },
    value => { value.sections[0].actions[0].kind = "send-message"; },
  ]) {
    const value = content(); mutate(value);
    assert.throws(() => assertSiteDocumentContent(value), code("SITE_DOCUMENT_INVALID"));
  }
});

test("persistent documents reject unsupported versions, mutable revisions, public visibility and duplicate nodes", () => {
  const valid = document();
  assertSiteDocument(valid);
  const second = { ...valid.sections[0], id: crypto.randomUUID() };
  valid.sections.push(second);
  assertSiteDocument(valid);
  assert.deepEqual(collectSiteDocumentReferences(valid), { assetIds: [mediaId], diaryEntryIds: [diaryId] });
  for (const mutate of [
    value => { value.revision = 2; },
    value => { value.visibility = "public"; },
    value => { value.sections.push({ ...value.sections[0] }); },
    value => { value.sections[0].id = value.documentId; },
    value => { value.sections[0].actions[0].targetId = diaryId; },
  ]) {
    const value = document(); mutate(value);
    assert.throws(() => assertSiteDocument(value), code("SITE_DOCUMENT_INVALID"));
  }
  assert.throws(() => assertSiteDocument({ version: 1, ...content() }), code("SITE_DOCUMENT_UNSUPPORTED"));
  assert.throws(() => assertSiteDocument({ ...valid, schemaVersion: 3 }), code("SITE_DOCUMENT_UNSUPPORTED"));
});

const interaction = (intent = "open-link", targetText = " https://example.test/path?q=1\n ") => ({
  kind: "interaction-intent", intent, label: "Contact", target: { kind: "unresolved", text: targetText },
});

test("unresolved typed interactions preserve exact target text, authored order and repetitions without resource grants", () => {
  const value = document();
  value.sections[0].actions = [interaction(), interaction("compose-message", ""), interaction("follow-user", " 用户提供的目标 ")];
  const original = JSON.stringify(value);
  assertSiteDocument(value);
  assert.equal(JSON.stringify(value), original);
  assert.deepEqual(collectSiteDocumentReferences(value), { assetIds: [mediaId], diaryEntryIds: [diaryId] });

  value.sections[0].actions = [content().sections[0].actions[0], interaction(), interaction()];
  assertSiteDocument(value);
  assert.deepEqual(value.sections[0].actions[1], value.sections[0].actions[2]);
  value.sections[0].actions = [interaction("open-link", "x".repeat(2048))];
  assertSiteDocument(value);
});

test("interaction targets cannot smuggle executable fields, IDs, unsupported intents or unbounded text", () => {
  for (const mutate of [
    action => { action.href = "https://example.test"; },
    action => { action.targetId = mediaId; },
    action => { action.intent = "send-message"; },
    action => { delete action.label; },
    action => { action.label = " "; },
    action => { action.label = "x".repeat(41); },
    action => { delete action.target; },
    action => { delete action.target.text; },
    action => { action.target.kind = "resolved"; },
    action => { action.target.href = "https://example.test"; },
    action => { action.target.userId = mediaId; },
    action => { action.target.text = "x".repeat(2049); },
    action => { action.target.text = "<script>run()</script>"; },
    action => { action.target.text = "control\u0000text"; },
    action => { action.target.text = ["string"]; },
    action => { action.target = null; },
    action => { action.target = []; },
  ]) {
    const value = content();
    const action = interaction(); mutate(action);
    value.sections[0].actions = [action];
    assert.throws(() => assertSiteDocumentContent(value), code("SITE_DOCUMENT_INVALID"));
  }
});

test("saving allocates page and section identities once, then repeated reads preserve the same document and hashes", async () => {
  let stored;
  const queries = [];
  const connection = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("station_media_assets")) return [asset];
    if (sql.includes("station_diary_entries")) return [diary];
    if (sql.includes("INSERT INTO station_site_drafts")) {
      stored = { id: params[0], user_id: params[1], prompt: params[2], draft: JSON.parse(params[3]), source: "model", status: "draft", workspace_node_id: null };
      return [stored];
    }
    if (sql.includes("station_site_drafts")) return params[1] === owner ? [stored] : [];
    throw new Error("Unexpected query");
  } };
  const authored = content();
  const unresolved = interaction("follow-user", "  用户提供的目标\n ");
  authored.sections[0].actions.push(unresolved);
  const authoredBefore = JSON.stringify(authored);
  const saved = await createStationSiteDraft({ userId: owner, prompt: "Create page", draft: authored, connection });
  assertSiteDocument(saved.draft);
  assert.equal(saved.draft.documentId, saved.id);
  assert.notEqual(saved.draft.sections[0].id, saved.id);
  assert.equal(JSON.stringify(authored), authoredBefore);
  assert.deepEqual(saved.draft.sections[0].actions[2], unresolved);
  const args = { userId: owner, draftId: saved.id, transaction: work => work(connection) };
  const first = await getStationSiteDocumentForUser(args);
  const second = await getStationSiteDocumentForUser(args);
  assert.deepEqual(first, second);
  assert.equal(first.documentHash, hashSiteDocumentValue(saved.draft));
  assert.equal(first.mediaAssets[0].id, mediaId);
  assert.equal(first.diaryEntries[0].body, "Owned text");
  assert.deepEqual(first.document.sections[0].actions[2], unresolved);
  for (const call of queries.filter(item => /station_media_assets|station_diary_entries/.test(item.sql))) {
    assert.match(call.sql, /user_id = \?[\s\S]*id = ANY\(\?::text\[\]\)[\s\S]*deleted_at IS NULL/);
    assert.doesNotMatch(call.sql, /LIMIT/);
    assert.equal(call.params[0], owner);
    assert.deepEqual(call.params[1], call.sql.includes("station_media_assets") ? [mediaId] : [diaryId]);
  }
  await assert.rejects(getStationSiteDocumentForUser({ ...args, userId: crypto.randomUUID() }), error => error.status === 404);
});

test("exact resource reads fail the complete view for unavailable references and preserve timestamp precision in the digest", async () => {
  const value = document();
  const connection = { query: async sql => sql.includes("station_media_assets") ? [asset] : [diary] };
  const first = await readSiteDocumentResources(connection, owner, value);
  const changed = await readSiteDocumentResources({ query: async sql => sql.includes("station_media_assets")
    ? [{ ...asset, document_version: "2026-10-12 01:02:03.000002+00" }] : [diary] }, owner, value);
  assert.notEqual(changed.resourcesHash, first.resourcesHash);
  await assert.rejects(readSiteDocumentResources({ query: async () => [] }, owner, value), error =>
    error.status === 409 && code("SITE_TASK_REFERENCES_UNAVAILABLE")(error));
});

test("unsupported, malformed or deleted stored documents stop before loading any resources", async () => {
  for (const row of [
    { id: draftId, draft: { version: 1, ...content() } },
    { id: draftId, draft: { ...document(), visibility: "public" } },
    { id: crypto.randomUUID(), draft: document() },
    { id: draftId, draft: document(), deleted_at: "2026-10-12" },
  ]) {
    let queries = 0;
    await assert.rejects(getStationSiteDocumentForUser({ userId: owner, draftId,
      transaction: work => work({ query: async () => { queries += 1; return [row]; } }),
    }), error => error.status === 409);
    assert.equal(queries, 2);
  }
});
