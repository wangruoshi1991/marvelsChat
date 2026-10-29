import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { verifyPassword } from "../src/auth.js";
import { verifyLoginCredentials } from "../src/routes/auth-routes.js";

const captureError = async (work) => {
  try {
    await work();
    assert.fail("Expected operation to reject");
  } catch (error) {
    return error;
  }
};

test("password verification accepts valid hashes and rejects unsafe iteration counts", async () => {
  const password = "Password1";
  const salt = "test-salt";
  const key = crypto.pbkdf2Sync(password, salt, 1, 32, "sha256").toString("base64url");
  const validHash = `pbkdf2$1$${salt}$${key}`;

  assert.equal(await verifyPassword(password, validHash), true);
  assert.equal(await verifyPassword("wrong", validHash), false);
  assert.equal(await verifyPassword(password, `pbkdf2$1$${salt}$!!!!`), false);
  for (const iterations of ["0", "-1", "1.5", "1e3", "1000001", "9007199254740992"]) {
    await assert.doesNotReject(async () => {
      assert.equal(
        await verifyPassword(password, `pbkdf2$${iterations}$${salt}$${key}`),
        false,
      );
    });
  }
});

test("unknown accounts and invalid passwords return the same login error", async () => {
  const verificationHashes = [];
  const verify = async (_password, passwordHash) => {
    verificationHashes.push(passwordHash);
    return false;
  };

  const missingError = await captureError(() =>
    verifyLoginCredentials(
      { identifier: "missing", password: "Password1" },
      { findUser: async () => null, verify },
    ),
  );
  const invalidError = await captureError(() =>
    verifyLoginCredentials(
      { identifier: "person", password: "Password1" },
      {
        findUser: async () => ({
          id: "user-1",
          password_hash: "stored-hash",
          status: "active",
        }),
        verify,
      },
    ),
  );

  assert.equal(missingError.status, 401);
  assert.equal(invalidError.status, 401);
  assert.equal(missingError.message, invalidError.message);
  assert.equal(verificationHashes.length, 2);
  assert.notEqual(verificationHashes[0], "");
  assert.equal(verificationHashes[1], "stored-hash");
});

test("disabled status is disclosed only after valid credentials", async () => {
  const user = {
    id: "user-1",
    password_hash: "stored-hash",
    status: "disabled",
  };

  await assert.rejects(
    () => verifyLoginCredentials(
      { identifier: "person", password: "Password1" },
      { findUser: async () => user, verify: async () => true },
    ),
    (error) => error?.status === 403 && error?.message === "User is disabled",
  );
});
