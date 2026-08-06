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

const createConnection = ({ users = [], thread = [], message = [] } = {}) => {
  const calls = [];
  return {
    calls,
    connection: {
      execute: async (sql, params = []) => {
        calls.push({ sql, params });
        if (sql.includes("FROM users")) return [users];
        if (sql.includes("nextval")) return [[{ value: "42" }]];
        if (sql.includes("FROM chat_threads")) return [thread];
        if (sql.includes("FROM chat_messages")) return [message];
        return [[]];
      },
    },
  };
};

test("bootstrap creates the admin and all required experience records", async () => {
  const { calls, connection } = createConnection();

  const result = await bootstrapDefaultAdmin(connection, defaultAdmin);

  assert.equal(result.created, true);
  assert.match(result.userId, /^[0-9a-f-]{36}$/);
  const userInsert = calls.find((call) => call.sql.includes("INSERT INTO users"));
  assert.ok(userInsert);
  assert.match(userInsert.params[3], /^pbkdf2\$/);
  assert.match(userInsert.params[5], /^000042\d{6}$/);
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO user_profiles")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO profile_visibility")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO user_agents")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO chat_threads")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO chat_messages")));
});

test("bootstrap updates an existing admin without silently resetting its password", async () => {
  const { calls, connection } = createConnection({
    users: [{ id: "existing-user" }],
    thread: [{ id: "existing-thread" }],
    message: [{ id: "existing-message" }],
  });

  const result = await bootstrapDefaultAdmin(connection, defaultAdmin);

  assert.deepEqual(result, { created: false, userId: "existing-user" });
  const userUpdate = calls.find((call) => call.sql.includes("UPDATE users"));
  assert.ok(userUpdate);
  assert.doesNotMatch(userUpdate.sql, /password_hash/);
  assert.ok(calls.some((call) => call.sql.includes("UPDATE chat_threads")));
  assert.ok(calls.some((call) => call.sql.includes("UPDATE chat_messages")));
});

test("bootstrap refuses to merge accounts that separately match login and email", async () => {
  const { connection } = createConnection({
    users: [{ id: "login-owner" }, { id: "email-owner" }],
  });

  await assert.rejects(
    () => bootstrapDefaultAdmin(connection, defaultAdmin),
    /belong to different accounts/,
  );
});
