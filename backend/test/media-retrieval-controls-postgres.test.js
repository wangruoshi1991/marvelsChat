import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { closeDatabase, query, withTransaction } from "../src/db.js";
import { createMediaRetrievalRepository } from "../src/media-retrieval-repository.js";

const enabled = process.env.RUN_MEDIA_RETRIEVAL_CONTROLS_POSTGRES === "1";

test("operator control patches merge disjoint fields and replay exactly once", {
  skip: !enabled && "RUN_MEDIA_RETRIEVAL_CONTROLS_POSTGRES=1 requires a loopback *_migration_test database",
}, async t => {
  const database = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
  assert.match(database.pathname, /_migration_test$/);
  const actor = randomUUID();
  const other = randomUUID();
  const ids = [actor, other];
  const [initial] = await query("SELECT * FROM media_retrieval_operator_controls WHERE id = TRUE");
  t.after(async () => {
    await query("DELETE FROM usage_events WHERE user_id = ANY(?::bpchar[])", [ids]);
    await query("DELETE FROM users WHERE id = ANY(?::bpchar[])", [ids]);
    await query(`UPDATE media_retrieval_operator_controls SET user_daily_request_limit = ?,
      user_monthly_budget_fen = ?, provider_calls_enabled = ? WHERE id = TRUE`,
    [initial.user_daily_request_limit, initial.user_monthly_budget_fen, initial.provider_calls_enabled]);
    await closeDatabase();
  });
  for (const [index, id] of ids.entries()) {
    await query(`INSERT INTO users(id, email, password_hash, display_name, ai_id, role)
      VALUES (?, ?, 'fixture', ?, ?, 'admin')`, [id, `${id}@example.invalid`, `Controls operator ${index}`, `93100000000${index}`]);
  }
  const repository = createMediaRetrievalRepository({ query, withTransaction });
  const edit = (userId, idempotencyKey, fields, expectedRevision = Number(initial.revision || 1)) => ({
    ...fields,
    expectedRevision,
    _audit: { userId, idempotencyKey },
  });
  const first = edit(actor, "fixture-control-first", { userDailyRequestLimit: 19 });
  const second = edit(other, "fixture-control-second", { userMonthlyBudgetFen: 2500 });
  const [firstReceipt] = await Promise.all([
    repository.updateMediaRetrievalOperatorControls(first),
    repository.updateMediaRetrievalOperatorControls(second),
  ]);
  assert.equal(Number(firstReceipt.user_daily_request_limit), 19);
  const replay = await repository.updateMediaRetrievalOperatorControls(first);
  assert.equal(replay.revision, firstReceipt.revision);
  assert.equal(replay.user_monthly_budget_fen, firstReceipt.user_monthly_budget_fen);
  await assert.rejects(repository.updateMediaRetrievalOperatorControls({
    ...first, userDailyRequestLimit: 27,
  }), { status: 409 });
  await assert.rejects(repository.updateMediaRetrievalOperatorControls(
    edit(other, "fixture-control-stale", { userDailyRequestLimit: 29 }),
  ), { status: 409 });
  const [current] = await query("SELECT * FROM media_retrieval_operator_controls WHERE id = TRUE");
  assert.deepEqual([Number(current.user_daily_request_limit), Number(current.user_monthly_budget_fen)], [19, 2500]);

  const failAudit = createMediaRetrievalRepository({
    query,
    withTransaction: work => withTransaction(connection => work({
      query: (sql, params) => sql.includes("INSERT INTO usage_events")
        ? connection.query("SELECT 1 / 0") : connection.query(sql, params),
    })),
  });
  await assert.rejects(failAudit.updateMediaRetrievalOperatorControls(
    edit(actor, "fixture-control-rollback", { userDailyRequestLimit: 30 }, Number(current.revision)),
  ), /division by zero/);
  const [afterFailure] = await query("SELECT * FROM media_retrieval_operator_controls WHERE id = TRUE");
  assert.equal(afterFailure.revision, current.revision);
  assert.equal(Number(afterFailure.user_daily_request_limit), 19);
  const [{ count }] = await query("SELECT COUNT(*)::int AS count FROM usage_events WHERE user_id = ANY(?::bpchar[])", [ids]);
  assert.equal(count, 2);
});
