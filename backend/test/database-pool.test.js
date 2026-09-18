import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../src/config.js";
import { closeDatabase, getPool } from "../src/db.js";

test("idle database disconnections are reported without crashing or leaking credentials", async (t) => {
  const previousConfig = config.db;
  config.db = { configured: true, databaseUrl: "postgresql://localhost/pool_test", connectionLimit: 1 };
  t.after(async () => {
    await closeDatabase();
    config.db = previousConfig;
  });
  const logs = [];
  t.mock.method(console, "error", (entry) => logs.push(entry));
  const pool = await getPool();
  const error = Object.assign(new Error("connection lost: private-connection-details"), { code: "57P01" });

  assert.doesNotThrow(() => pool.emit("error", error));
  assert.equal(logs.length, 1);
  assert.match(JSON.stringify(logs), /database_pool_error/);
  assert.match(JSON.stringify(logs), /57P01/);
  assert.doesNotMatch(JSON.stringify(logs), /private-connection-details/);
});
