import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createAdminOperationsRepository } from "../src/admin-operations-repository.js";
import { closeDatabase, withTransaction } from "../src/db.js";

const enabled = process.env.RUN_ADMIN_MONITORING_POSTGRES === "1";

test("monitoring counts 201 unique users in the window and returns a Top 200 ranking", {
  skip: !enabled && "RUN_ADMIN_MONITORING_POSTGRES=1 requires a fresh loopback *_migration_test database",
}, async (t) => {
  const database = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
  assert.match(database.pathname, /_migration_test$/);
  t.after(closeDatabase);
  const userIds = Array.from({ length: 202 }, () => randomUUID());
  const rollback = new Error("Rollback monitoring fixture");
  await assert.rejects(withTransaction(async ({ query }) => {
    const repository = createAdminOperationsRepository({ runQuery: query });
    await query(`INSERT INTO users (id,email,password_hash,display_name,ai_id)
      SELECT id, id || '@example.invalid', 'fixture', 'Fixture user ' || position, '98000000' || lpad(position::text, 4, '0')
      FROM unnest(?::text[]) WITH ORDINALITY AS accounts(id, position)`, [userIds]);
    await query(`INSERT INTO agent_runs (id,user_id,agent_id,status,created_at)
      SELECT gen_random_uuid(), id, 'monitoring-fixture', 'success',
        CURRENT_TIMESTAMP - CASE WHEN position = 202 THEN INTERVAL '31 days' ELSE INTERVAL '8 days' END
      FROM unnest(?::text[]) WITH ORDINALITY AS accounts(id, position)`, [userIds]);
    await query(`INSERT INTO agent_runs (id,user_id,agent_id,status,created_at) VALUES
      (?, ?, 'monitoring-fixture', 'success', CURRENT_TIMESTAMP - INTERVAL '8 days'),
      (?, NULL, 'monitoring-fixture', 'success', CURRENT_TIMESTAMP - INTERVAL '8 days')`,
    [randomUUID(), userIds[0], randomUUID()]);
    const monthly = await repository.adminMonitoring({ days: 30 });
    assert.equal(monthly.userCount, 201);
    assert.equal(monthly.users.length, 200);
    assert.equal(monthly.users[0].userId, userIds[0]);
    assert.equal(monthly.users[0].runs, 2);
    assert.equal(monthly.agents[0].runs, 203);
    assert.ok(monthly.users.every(({ userId }) => userId !== userIds.at(-1) && userId !== null));
    const weekly = await repository.adminMonitoring({ days: 7 });
    assert.equal(weekly.userCount, 0);
    assert.deepEqual(weekly.users, []);
    assert.equal(weekly.empty.users, true);
    throw rollback;
  }), error => error === rollback);
});
