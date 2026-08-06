import assert from "node:assert/strict";
import test from "node:test";

import { verifyLoginCredentials } from "../src/routes/auth-routes.js";

const captureError = async (work) => {
  try {
    await work();
    assert.fail("Expected operation to reject");
  } catch (error) {
    return error;
  }
};

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
