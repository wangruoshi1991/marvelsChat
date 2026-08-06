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
    costVersion: "2026-07-21",
    referenceGenerationEstimatedCostFen: 200,
    qualityCostsFen: { standard: 280, ultra: 420 },
    providerReady: true,
    apiKey: "must-not-escape",
    workspaceId: "must-not-escape",
  });

  assert.deepEqual(projection, {
    enabled: true,
    generationAvailable: true,
    dailyLimit: 3,
    retentionDays: 7,
    costVersion: "2026-07-21",
    referenceGenerationEstimatedCostFen: 200,
    defaultQualityPreset: "ultra",
    qualityPresets: [
      {
        id: "standard",
        label: "标准",
        description: "高清纹理，适合个人主页和日常查看",
        estimatedCostFen: 280,
      },
      {
        id: "ultra",
        label: "超精细",
        description: "适合大屏查看和专业处理",
        estimatedCostFen: 420,
      },
    ],
  });
  assert.equal(JSON.stringify(projection).includes("must-not-escape"), false);
});

test("feature projection cannot publish a stale environment cost version", () => {
  const projection = avatar3dFeatureForUser(user, {
    enabled: true,
    requireAllowlist: false,
    allowlist: [],
    costVersion: "2026-07-17",
    providerReady: true,
  });

  assert.equal(projection.costVersion, "2026-07-21");
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
