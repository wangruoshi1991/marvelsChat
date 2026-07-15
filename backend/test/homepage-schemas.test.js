import assert from "node:assert/strict";
import test from "node:test";
import * as schemas from "../src/schemas.js";

const mediaIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

test("homepage generation requires an idempotency key and 3-9 explicit media assets", () => {
  const parsed = schemas.homepageGenerateSchema.parse({
    prompt: "记录我的夏天",
    mediaAssetIds: mediaIds,
    idempotencyKey: "build24-attempt-1",
  });

  assert.deepEqual(parsed, {
    prompt: "记录我的夏天",
    mediaAssetIds: mediaIds,
    idempotencyKey: "build24-attempt-1",
  });
  assert.throws(() =>
    schemas.homepageGenerateSchema.parse({
      prompt: "照片太少",
      mediaAssetIds: mediaIds.slice(0, 2),
      idempotencyKey: "build24-attempt-2",
    }),
  );
  assert.throws(() =>
    schemas.homepageGenerateSchema.parse({
      prompt: "重复素材",
      mediaAssetIds: [mediaIds[0], mediaIds[0], mediaIds[1]],
      idempotencyKey: "build24-attempt-3",
    }),
  );
});

test("homepage draft replacement carries a revision and structured sections", () => {
  const parsed = schemas.homepageDraftUpdateSchema.parse({
    revision: 3,
    draft: {
      version: 2,
      language: "zh",
      title: "我的夏天",
      theme: "gallery",
      summary: "海边、朋友和晚风。",
      sections: [
        {
          id: "hero",
          type: "hero",
          title: "我的夏天",
          subtitle: "把喜欢的时刻放在一起",
          body: "",
          assetIds: [mediaIds[0]],
          hidden: false,
        },
        {
          id: "gallery",
          type: "gallery",
          title: "照片",
          subtitle: "",
          body: "",
          assetIds: mediaIds,
          hidden: false,
        },
      ],
    },
  });

  assert.equal(parsed.revision, 3);
  assert.equal(parsed.draft.sections[1].assetIds.length, 3);
  assert.throws(() =>
    schemas.homepageDraftUpdateSchema.parse({
      revision: 0,
      draft: parsed.draft,
    }),
  );
});

test("homepage publishing is limited to private and unlisted link visibility", () => {
  assert.deepEqual(
    schemas.homepagePublishSchema.parse({ revision: 2, visibility: "link" }),
    { revision: 2, visibility: "link" },
  );
  assert.throws(() =>
    schemas.homepagePublishSchema.parse({ revision: 2, visibility: "public" }),
  );
});

test("homepage refinement is scoped to one stable section", () => {
  assert.deepEqual(
    schemas.homepageRefineSchema.parse({
      revision: 4,
      sectionId: "about",
      instruction: "写得轻松一点",
    }),
    {
      revision: 4,
      sectionId: "about",
      instruction: "写得轻松一点",
    },
  );
  assert.throws(() =>
    schemas.homepageRefineSchema.parse({
      revision: 4,
      sectionId: "",
      instruction: "写得轻松一点",
    }),
  );
});

test("preview and share tokens reject short or malformed values", () => {
  const token = "a".repeat(43);
  assert.equal(schemas.homepageAccessTokenSchema.parse({ token }).token, token);
  assert.throws(() => schemas.homepageAccessTokenSchema.parse({ token: "short" }));
  assert.throws(() =>
    schemas.homepageAccessTokenSchema.parse({ token: `${"a".repeat(42)}+` }),
  );
});

test("consent and account deletion require explicit confirmation", () => {
  assert.deepEqual(
    schemas.userConsentSchema.parse({
      privacyPolicyVersion: "2026-07-15",
      termsVersion: "2026-07-15",
      privacyAccepted: true,
      termsAccepted: true,
    }),
    {
      privacyPolicyVersion: "2026-07-15",
      termsVersion: "2026-07-15",
      privacyAccepted: true,
      termsAccepted: true,
    },
  );
  assert.throws(() =>
    schemas.userConsentSchema.parse({
      privacyPolicyVersion: "2026-07-15",
      termsVersion: "2026-07-15",
      privacyAccepted: false,
      termsAccepted: true,
    }),
  );
  assert.deepEqual(
    schemas.accountDeletionSchema.parse({
      password: "test-password-123",
      confirmation: "DELETE",
    }),
    { password: "test-password-123", confirmation: "DELETE" },
  );
  assert.throws(() =>
    schemas.accountDeletionSchema.parse({
      password: "test-password-123",
      confirmation: "delete",
    }),
  );
});

test("registration can carry the same explicit versioned consent", () => {
  const consent = {
    privacyPolicyVersion: "2026-07-15",
    termsVersion: "2026-07-15",
    privacyAccepted: true,
    termsAccepted: true,
  };
  const registration = schemas.registerSchema.parse({
    contactType: "email",
    email: "person@example.com",
    password: "Password1",
    displayName: "测试用户",
    consent,
  });

  assert.deepEqual(registration.consent, consent);
});
