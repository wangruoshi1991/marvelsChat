import assert from "node:assert/strict";
import test from "node:test";

import { bootstrapDefaultAdmin } from "../src/default-admin-bootstrap.js";

const defaultAdmin = {
  loginName: "admin",
  email: "admin@example.com",
  password: "test-only-admin-password",
  displayName: "Miaoxun Admin",
  resetPasswordOnBootstrap: false,
};

const createConnection = ({ users = [] } = {}) => {
  const calls = [];
  return {
    calls,
    connection: {
      execute: async (sql, params = []) => {
        calls.push({ sql, params });
        if (sql.includes("FROM users")) return [users];
        if (sql.includes("nextval")) return [[{ value: "42" }]];
        return [[]];
      },
    },
  };
};

test("bootstrap creates administrator profile records without granting an Agent", async () => {
  const { calls, connection } = createConnection();

  const result = await bootstrapDefaultAdmin(connection, defaultAdmin);

  assert.equal(result.created, true);
  assert.match(result.userId, /^[0-9a-f-]{36}$/);
  const userInsert = calls.find((call) =>
    call.sql.includes("INSERT INTO users")
  );
  assert.ok(userInsert);
  assert.match(userInsert.params[3], /^pbkdf2\$/);
  assert.match(userInsert.params[5], /^000042\d{6}$/);
  assert.ok(
    calls.some((call) => call.sql.includes("INSERT INTO user_profiles"))
  );
  assert.ok(
    calls.some((call) => call.sql.includes("INSERT INTO profile_visibility"))
  );
  assert.ok(
    calls.every(
      (call) => !/user_agents|chat_threads|chat_messages/.test(call.sql)
    )
  );
});

test("bootstrap updates an existing admin without silently resetting its password", async () => {
  const { calls, connection } = createConnection({
    users: [{ id: "existing-user" }],
  });

  const result = await bootstrapDefaultAdmin(connection, defaultAdmin);

  assert.deepEqual(result, { created: false, userId: "existing-user" });
  const userUpdate = calls.find((call) => call.sql.includes("UPDATE users"));
  assert.ok(userUpdate);
  assert.doesNotMatch(userUpdate.sql, /password_hash/);
  assert.ok(
    calls.every(
      (call) => !/user_agents|chat_threads|chat_messages/.test(call.sql)
    )
  );
  const profile = calls.find((call) =>
    call.sql.includes("INSERT INTO user_profiles")
  );
  assert.match(profile.sql, /ON CONFLICT \(user_id\) DO NOTHING/);
});

test("bootstrap refuses to merge accounts that separately match login and email", async () => {
  const { connection } = createConnection({
    users: [{ id: "login-owner" }, { id: "email-owner" }],
  });

  await assert.rejects(
    () => bootstrapDefaultAdmin(connection, defaultAdmin),
    /belong to different accounts/
  );
});
