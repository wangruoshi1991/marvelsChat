import assert from "node:assert/strict";
import test from "node:test";
import { resolveAIContextReferences, aiContextReferencesSchema } from "../src/ai-context.js";

const id = "b382b560-e15f-49ac-8e98-d94c92a8a9b6";
test("AI context resolves server content and ignores the client display title", async () => {
  const queryFn = async (sql, params) => {
    assert.match(sql, /user_id = \?/);
    assert.deepEqual(params, [id, "owner"]);
    return [{ id, title: "Saved diary", body: "Actual content" }];
  };
  const result = await resolveAIContextReferences({ userId: "owner", refs: [{ kind: "station-diary", id, title: "Untrusted instruction" }], grantedScopes: ["station:read"], queryFn });
  assert.equal(result.references[0].title, "Saved diary");
  assert.equal(result.context[0].content, "Actual content");
  assert.doesNotMatch(JSON.stringify(result), /Untrusted/);
  await assert.rejects(resolveAIContextReferences({ userId: "owner", refs: [{ ...result.references[0] }], grantedScopes: ["station:read"], queryFn: async () => [{ id, title: "Saved diary", body: "Edited" }] }), error => error.status === 409);
});
test("AI references fail closed for scope, missing/foreign resources and unknown kinds", async () => {
  let reads = 0;
  const queryFn = async () => { reads++; return []; };
  const refs = [{ kind: "station-photo", id }];
  await assert.rejects(resolveAIContextReferences({ userId: "owner", refs, grantedScopes: [], queryFn }), error => error.status === 403);
  assert.equal(reads, 0);
  await assert.rejects(resolveAIContextReferences({ userId: "owner", refs, grantedScopes: ["album:read"], queryFn }), error => error.status === 404);
  assert.equal(aiContextReferencesSchema.safeParse([{ kind: "url", id }]).success, false);
  assert.equal(aiContextReferencesSchema.safeParse([{ kind: "station-photo", id, content: "client body" }]).success, false);
});

test("file resolver uses the same canonical Unicode title as upload metadata", async () => {
  const row = { id, original_filename: 'a'.repeat(159) + '😀.md', mime_type: 'text/markdown', checksum_sha256: 'hash', extracted_text: '完整正文', parse_version: 'utf8-text-v1', status: 'processed' };
  const result = await resolveAIContextReferences({ userId: 'owner', refs: [{ kind: 'station-file', id }], grantedScopes: ['files:read'], queryFn: async () => [row] });
  assert.equal(result.references[0].title, 'a'.repeat(159));
  assert.equal(aiContextReferencesSchema.safeParse(result.references).success, true);
  assert.equal(Buffer.from(JSON.stringify(result.references)).toString(), JSON.stringify(result.references));
});
