import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { homepageFeatureForUser } = await import("../src/homepage-feature.js");
const { assertCurrentPolicyConsent } = await import("../src/legal-policy-service.js");

const user = { id: "user-1", email: "person@example.com" };

test("production homepage access requires both the global switch and allowlist", () => {
  assert.equal(homepageFeatureForUser(user, {
    enabled: true,
    requireAllowlist: true,
    allowlist: [],
  }).enabled, false);
  assert.equal(homepageFeatureForUser(user, {
    enabled: true,
    requireAllowlist: true,
    allowlist: ["person@example.com"],
  }).enabled, true);
  assert.equal(homepageFeatureForUser(user, {
    enabled: false,
    requireAllowlist: true,
    allowlist: ["person@example.com"],
  }).enabled, false);
});

test("consent rejects stale policy versions and reports the current versions", () => {
  assert.throws(
    () => assertCurrentPolicyConsent({
      privacyPolicyVersion: "2026-07-14",
      termsVersion: "2026-07-15",
    }, {
      privacyPolicyVersion: "2026-07-15",
      termsVersion: "2026-07-15",
    }),
    (error) => error?.status === 409
      && error?.details?.privacyPolicyVersion === "2026-07-15",
  );
});
