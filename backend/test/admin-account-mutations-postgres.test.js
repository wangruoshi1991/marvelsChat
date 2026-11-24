import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createAdminAccountMutator, mutateAdminAccount } from "../src/admin-repository.js";
import { getActiveRealtimeSessionIds, verifyPassword } from "../src/auth.js";
import { closeDatabase, query, withTransaction } from "../src/db.js";
import { getAgent } from "../../agents/registry.js";
import { computeAgentReleaseContractHash } from "../../shared/agent-catalog.js";
import { createManagedUserWithAudit, createSessionForUser, createUsageEvent, revokeSession } from "../src/repositories.js";

const enabled = process.env.RUN_ADMIN_ACCOUNT_POSTGRES === "1";

test("admin account mutations roll back, serialize and return credential-free receipts", {
  skip: !enabled && "RUN_ADMIN_ACCOUNT_POSTGRES=1 requires a loopback *_migration_test database",
}, async t => {
  const database = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
  assert.match(database.pathname, /_migration_test$/);
  const actor = { id: randomUUID(), role: "admin", adminPermissions: ["*"] };
  const targetId = randomUUID();
  const otherId = randomUUID();
  const ids = [actor.id, targetId, otherId];
  t.after(async () => {
    await query("DELETE FROM users WHERE id = ANY(?::bpchar[])", [ids]);
    await closeDatabase();
  });
  for (const [index, id] of ids.entries()) {
    await query(`INSERT INTO users(id,email,password_hash,display_name,ai_id,role)
      VALUES (?, ?, 'previous-fixture', ?, ?, ?)`, [id, `${id}@example.invalid`, id, `92000000000${index}`, id === actor.id ? "admin" : "user"]);
  }
  const butler = await getAgent("miaoxun-butler");
  const butlerIdentity = {
    key: butler.key,
    avatarKind: "agent-mark",
    displayName: butler.name,
    description: butler.description,
    mark: butler.identity.mark,
    shape: butler.identity.shape,
    colors: butler.identity.colors,
    published: true,
    source: "registry",
    updatedAt: "2026-11-24T00:00:00.000Z",
  };
  await query(`UPDATE agent_catalog
    SET display_name = ?, description = ?, identity_mark = ?, identity_shape = ?,
        identity_colors = ?::jsonb, status = 'published', release_version = ?,
        contract_hash = ?, source = 'registry'
    WHERE agent_id = ?`, [
    butlerIdentity.displayName,
    butlerIdentity.description,
    butlerIdentity.mark,
    butlerIdentity.shape,
    JSON.stringify(butlerIdentity.colors),
    butler.version,
    computeAgentReleaseContractHash({ key: butler.key, version: butler.version, permissions: butler.permissions, identity: butlerIdentity }),
    butler.key,
  ]);
  await t.test("account creation rolls back default data when audit fails", async () => {
    let createdUserId;
    await assert.rejects(
      () => createManagedUserWithAudit({
        email: `${randomUUID()}@example.invalid`,
        displayName: `Audit rollback ${randomUUID()}`,
        passwordHash: "test-only-password",
        actorUserId: actor.id,
        recordAudit: async event => {
          createdUserId = event.targetId;
          throw new Error("create audit fixture failed");
        },
      }),
      /create audit fixture failed/,
    );
    assert.ok(createdUserId);
    const [counts] = await query(`SELECT
      (SELECT COUNT(*) FROM users WHERE id = ?) AS users,
      (SELECT COUNT(*) FROM user_profiles WHERE user_id = ?) AS profiles,
      (SELECT COUNT(*) FROM user_agents WHERE user_id = ?) AS agents,
      (SELECT COUNT(*) FROM chat_threads WHERE user_id = ?) AS threads,
      (SELECT COUNT(*) FROM chat_messages WHERE user_id = ?) AS messages`,
    [createdUserId, createdUserId, createdUserId, createdUserId, createdUserId]);
    assert.deepEqual(counts, { users: "0", profiles: "0", agents: "0", threads: "0", messages: "0" });
  });
  const insertSession = async (userId, { expired = false } = {}) => {
    const id = randomUUID();
    await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES (?, ?, ?, ?)", [
      id, userId, randomUUID(), new Date(Date.now() + (expired ? -60 : 60) * 1000),
    ]);
    return id;
  };
  const phone = await insertSession(targetId);
  const tablet = await insertSession(targetId);
  const other = await insertSession(otherId);
  const expired = await insertSession(targetId, { expired: true });
  const scope = [phone, tablet, other, expired];
  const disable = { actor, targetId, operation: "status", requestValue: "disabled", idempotencyKey: "fixture-disable" };
  let auditCalls = 0;
  const badAudit = createAdminAccountMutator({
    recordAudit: async (event, runQuery) => {
      auditCalls += 1;
      await createUsageEvent(event, runQuery);
      throw new Error("audit fixture failed");
    },
  });
  const badRevoke = createAdminAccountMutator({
    transaction: work => withTransaction(connection => work({
      query: (sql, params) => sql.startsWith("UPDATE auth_sessions")
        ? connection.query("SELECT 1 / 0") : connection.query(sql, params),
    })),
  });
  const counts = async () => {
    const [events] = await query("SELECT COUNT(*)::int AS count FROM usage_events WHERE target_id = ? AND user_id = ?", [targetId, actor.id]);
    const [receipts] = await query("SELECT COUNT(*)::int AS count FROM admin_account_mutations WHERE target_user_id = ?", [targetId]);
    return [events.count, receipts.count];
  };
  for (const [run, pattern] of [[badAudit, /audit fixture failed/], [badRevoke, /division by zero/]]) {
    await assert.rejects(run(disable), pattern);
    assert.equal((await query("SELECT status FROM users WHERE id = ?", [targetId]))[0].status, "active");
    assert.deepEqual(await getActiveRealtimeSessionIds(scope), new Set([phone, tablet, other]));
    assert.deepEqual(await counts(), [0, 0]);
  }
  assert.equal(auditCalls, 1);
  await revokeSession(phone);
  assert.deepEqual(await getActiveRealtimeSessionIds(scope), new Set([tablet, other]));
  const [result, replay] = await Promise.all([mutateAdminAccount(disable), mutateAdminAccount(disable)]);
  assert.deepEqual(replay, result);
  assert.deepEqual(await mutateAdminAccount(disable), result);
  assert.equal(result.user.status, "disabled");
  assert.deepEqual(await counts(), [1, 1]);
  assert.deepEqual(await getActiveRealtimeSessionIds(scope), new Set([other]));
  await assert.rejects(mutateAdminAccount({ ...disable, requestValue: "active" }), { status: 409 });

  await mutateAdminAccount({ ...disable, requestValue: "active", idempotencyKey: "fixture-enable" });
  const reset = { actor, targetId, operation: "password_reset", password: "test-only-new-password", idempotencyKey: "fixture-reset" };
  await mutateAdminAccount(reset);
  const passwordReceipt = await mutateAdminAccount(reset);
  assert.equal(passwordReceipt.user.id, targetId);
  const [credential] = await query("SELECT password_hash FROM users WHERE id = ?", [targetId]);
  assert.equal(await verifyPassword(reset.password, credential.password_hash), true);
  await assert.rejects(mutateAdminAccount({ ...reset, password: "different-test-password" }), { status: 409 });
  await assert.rejects(createSessionForUser(targetId, { verifiedPasswordHash: "previous-fixture" }), {
    details: { code: "LOGIN_CREDENTIALS_CHANGED" },
  });
  await createSessionForUser(targetId, { verifiedPasswordHash: credential.password_hash });
  const [receipt] = await query("SELECT * FROM admin_account_mutations WHERE target_user_id = ? AND operation = 'password_reset'", [targetId]);
  const [audit] = await query("SELECT payload FROM usage_events WHERE target_id = ? AND event_type = 'admin.user.password_reset'", [targetId]);
  assert.doesNotMatch(JSON.stringify([receipt, audit]), /pbkdf2|test-only-new-password/);
  assert.deepEqual(await counts(), [3, 3]);

  const nextSession = await insertSession(targetId);
  await mutateAdminAccount({ actor, targetId, operation: "role", requestValue: "admin", idempotencyKey: "fixture-promote" });
  assert.deepEqual(await getActiveRealtimeSessionIds([nextSession, other]), new Set([other]));
  const promotedSession = await insertSession(targetId);
  const revoke = { actor, targetId, operation: "revoke_sessions", idempotencyKey: "fixture-revoke" };
  assert.deepEqual(await mutateAdminAccount(revoke), { ok: true });
  const laterSession = await insertSession(targetId);
  assert.deepEqual(await mutateAdminAccount(revoke), { ok: true });
  assert.deepEqual(await getActiveRealtimeSessionIds([promotedSession, laterSession, other]), new Set([laterSession, other]));
  assert.deepEqual(await counts(), [5, 5]);
});
