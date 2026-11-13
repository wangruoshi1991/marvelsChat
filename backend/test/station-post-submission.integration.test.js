import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after } from "node:test";
import { query, withTransaction, closeDatabase } from "../src/db.js";

const enabled = process.env.RUN_STATION_POST_SUBMISSION_INTEGRATION === "1";
const integration = (name, work) => test(name, { skip: !enabled && "Set RUN_STATION_POST_SUBMISSION_INTEGRATION=1 with migrated disposable loopback PostgreSQL" }, work);
const owners = [];
let repository;
before(async () => {
  if (!enabled) return;
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname));
  assert.match((await query("SELECT current_database() AS name"))[0].name, /_migration_test$/);
  repository = await import("../src/station-post-submission-repository.js");
});
after(async () => {
  if (!enabled) return;
  for (const owner of owners) {
    await query("DELETE FROM station_posts WHERE user_id = ?", [owner]);
    await query("DELETE FROM users WHERE id = ?", [owner]);
  }
  await closeDatabase();
});
async function fixture() {
  const userId = crypto.randomUUID();
  owners.push(userId);
  await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES(?,?,'fixture-only',?,?)", [userId, `${userId}@example.invalid`, `Post ${userId}`, String(crypto.randomInt(100000000000,999999999999))]);
  const mediaAssetIds = [crypto.randomUUID(), crypto.randomUUID()];
  for (const id of mediaAssetIds) await query("INSERT INTO station_media_assets(id,user_id,kind,status) VALUES(?,?,'image','uploaded')", [id,userId]);
  return { userId, clientRequestId: crypto.randomUUID(), body: "My comic", visibility: "private", locationLabel: "", agentCapabilities: [], mediaAssetIds: mediaAssetIds.reverse(), audit: { userAgent: "fixture" } };
}
integration("concurrent same intent creates one ordered post, receipt and audit; conflicting payload is rejected", async () => {
  const f = await fixture();
  const [first, replay] = await Promise.all([repository.submitStationPost(f), repository.submitStationPost(f)]);
  assert.equal(first.id, replay.id);
  assert.deepEqual(first.media.map(media => media.id), f.mediaAssetIds);
  assert.equal((await query("SELECT id FROM station_posts WHERE user_id=?", [f.userId])).length, 1);
  assert.equal((await query("SELECT id FROM usage_events WHERE user_id=? AND event_type='station.post.create'", [f.userId])).length, 1);
  assert.deepEqual(await repository.getStationPostSubmission(f), { status: "submitted", post: first });
  await assert.rejects(repository.submitStationPost({ ...f, mediaAssetIds: [...f.mediaAssetIds].reverse() }), error => error.status === 409 && error.details.code === "STATION_POST_IDEMPOTENCY_CONFLICT");
});
integration("receipts are scoped to owner, legacy calls remain explicit independent intents, foreign media denied", async () => {
  const f = await fixture(), other = await fixture();
  const first = await repository.submitStationPost(f);
  assert.deepEqual(await repository.getStationPostSubmission({ ...f, userId: other.userId }), { status: "not_submitted" });
  const { clientRequestId: _key, ...legacy } = f;
  const legacyPost = await repository.submitStationPost(legacy);
  assert.notEqual(first.id, legacyPost.id);
  await assert.rejects(repository.submitStationPost({ ...other, mediaAssetIds: f.mediaAssetIds }), error => error.status === 404);
  assert.equal((await query("SELECT post_id FROM station_post_submissions WHERE user_id=?", [f.userId])).length, 1);
});
integration("audit failure rolls back post, media binding and receipt, so lookup proves not submitted", async () => {
  const f = await fixture();
  const failing = repository.createStationPostSubmissionRepository({ transaction: work => withTransaction(connection => work({ query: async (sql, params) => {
    if (sql.includes("INSERT INTO usage_events")) throw new Error("fixture audit unavailable");
    return connection.query(sql, params);
  } })) });
  await assert.rejects(failing.submitStationPost(f), /fixture audit unavailable/);
  assert.deepEqual(await repository.getStationPostSubmission(f), { status: "not_submitted" });
  assert.equal((await query("SELECT id FROM station_posts WHERE user_id=?", [f.userId])).length, 0);
  assert.equal((await query("SELECT post_id FROM station_post_submissions WHERE user_id=?", [f.userId])).length, 0);
});
integration("receipt lookup waits for a same-ID submission to commit before declaring absence", async () => {
  const f = await fixture();
  let entered;
  const barrier = new Promise(resolve => { entered = resolve; });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const slow = repository.createStationPostSubmissionRepository({ transaction: work => withTransaction(connection => work({ query: async (sql, params) => {
    const rows = await connection.query(sql, params);
    if (sql.includes("INSERT INTO station_post_submissions")) { entered(); await held; }
    return rows;
  } })) });
  const publishing = slow.submitStationPost(f);
  await barrier;
  let resolved = false;
  const reading = repository.getStationPostSubmission(f).then(value => { resolved = true; return value; });
  await new Promise(resolve => setTimeout(resolve, 75));
  assert.equal(resolved, false);
  release();
  const post = await publishing;
  assert.deepEqual(await reading, { status: "submitted", post });
});
integration("resolving absent intent closes it, so a delayed original POST cannot publish after editing unlocks", async () => {
  const f=await fixture();
  assert.deepEqual(await repository.getStationPostSubmission(f), {status:"not_submitted"});
  assert.equal((await query("SELECT * FROM station_post_submissions WHERE user_id=?",[f.userId])).length,0);
  let enter;
  const entered=new Promise(resolve => {enter=resolve;});
  let release;
  const held=new Promise(resolve => {release=resolve;});
  const delayed=repository.createStationPostSubmissionRepository({transaction:async work=>{enter();await held;return withTransaction(work);}});
  const original=delayed.submitStationPost(f);
  await entered;
  assert.deepEqual(await repository.resolveStationPostSubmission(f),{status:"not_submitted"});
  release();
  await assert.rejects(original,error=>error.status===409&&error.details.code==="STATION_POST_INTENT_CLOSED");
  assert.equal((await query("SELECT id FROM station_posts WHERE user_id=?",[f.userId])).length,0);
  assert.deepEqual(await repository.resolveStationPostSubmission(f),{status:"not_submitted"});
  const post=await repository.submitStationPost({...f,clientRequestId:crypto.randomUUID()});
  assert.ok(post.id);
});
integration("a deleted submitted post stays a durable receipt and cannot be resurrected by replay or resolution", async () => {
  const f=await fixture();
  const post=await repository.submitStationPost(f);
  await query("UPDATE station_posts SET deleted_at=clock_timestamp() WHERE id=?",[post.id]);
  for (const read of [repository.submitStationPost,repository.getStationPostSubmission,repository.resolveStationPostSubmission]) {
    await assert.rejects(read(f),error=>error.status===409&&error.details.code==="STATION_POST_RECEIPT_UNAVAILABLE");
  }
  assert.equal((await query("SELECT id FROM station_posts WHERE user_id=?",[f.userId])).length,1);
  assert.equal((await query("SELECT post_id FROM station_post_submissions WHERE user_id=? AND status='submitted'",[f.userId])).length,1);
});
