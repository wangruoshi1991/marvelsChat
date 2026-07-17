import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  assertAvatar3dQuota,
  avatar3dFeatureForUser,
} = await import("../src/avatar-3d-feature.js");

const user = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "person@example.com",
};

test("production avatar access requires the global switch and allowlist", () => {
  assert.equal(avatar3dFeatureForUser(user, {
    enabled: true,
    requireAllowlist: true,
    allowlist: [],
  }).enabled, false);
  assert.equal(avatar3dFeatureForUser(user, {
    enabled: true,
    requireAllowlist: true,
    allowlist: ["person@example.com"],
  }).enabled, true);
  assert.equal(avatar3dFeatureForUser(user, {
    enabled: false,
    requireAllowlist: true,
    allowlist: ["person@example.com"],
  }).enabled, false);
});

test("feature projection contains prices and no secret configuration", () => {
  const projection = avatar3dFeatureForUser(user, {
    enabled: true,
    requireAllowlist: false,
    allowlist: [],
    dailyLimit: 3,
    retentionDays: 7,
    costVersion: "2026-07-17",
    realisticEstimatedCostFen: 210,
    cartoonEstimatedCostFen: 224,
    providerReady: true,
    apiKey: "must-not-escape",
    workspaceId: "must-not-escape",
  });

  assert.deepEqual(projection, {
    enabled: true,
    generationAvailable: true,
    dailyLimit: 3,
    retentionDays: 7,
    costVersion: "2026-07-17",
    estimatedCostsFen: { realistic: 210, cartoon: 224 },
  });
  assert.equal(JSON.stringify(projection).includes("must-not-escape"), false);
});

test("quota blocks the fourth daily job and a second active job", () => {
  assert.throws(
    () => assertAvatar3dQuota({ dailyUsed: 3, dailyLimit: 3, hasActiveJob: false }),
    (error) => error?.status === 429 && error?.details?.code === "DAILY_LIMIT_REACHED",
  );
  assert.throws(
    () => assertAvatar3dQuota({ dailyUsed: 0, dailyLimit: 3, hasActiveJob: true }),
    (error) => error?.status === 409 && error?.details?.code === "ACTIVE_JOB_EXISTS",
  );
  assert.doesNotThrow(() =>
    assertAvatar3dQuota({ dailyUsed: 2, dailyLimit: 3, hasActiveJob: false }),
  );
});
