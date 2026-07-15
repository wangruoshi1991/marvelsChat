import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { createHomepageLifecycleService } = await import("../src/homepage-lifecycle-service.js");

const user = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", displayName: "小妙" };
const draftId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const jobId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const mediaAssets = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    status: "uploaded",
    storageKey: "users/u/1.jpg",
    mimeType: "image/jpeg",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    status: "uploaded",
    storageKey: "users/u/2.jpg",
    mimeType: "image/jpeg",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    status: "uploaded",
    storageKey: "users/u/3.jpg",
    mimeType: "image/jpeg",
  },
];
const mediaAssetIds = mediaAssets.map((asset) => asset.id);
const profile = {
  nickname: "小妙",
  avatarText: "妙",
  bio: "记录生活",
  stationConfig: { language: "zh" },
};
const draft = {
  id: draftId,
  userId: user.id,
  prompt: "记录生活",
  revision: 1,
  selectedMediaAssetIds: mediaAssetIds,
  draft: {
    version: 2,
    language: "zh",
    title: "小妙的主页",
    theme: "gallery",
    summary: "记录生活",
    sections: [
      {
        id: "hero",
        type: "hero",
        title: "小妙的主页",
        subtitle: "",
        body: "",
        assetIds: [mediaAssetIds[0]],
        diaryEntryIds: [],
        actions: [],
        hidden: false,
      },
      {
        id: "gallery",
        type: "gallery",
        title: "照片",
        subtitle: "",
        body: "",
        assetIds: mediaAssetIds,
        diaryEntryIds: [],
        actions: [],
        hidden: false,
      },
    ],
  },
};

test("generation jobs validate explicit media before creation and complete through the processor", async () => {
  const calls = [];
  const repository = {
    createGenerationJob: async (input) => {
      calls.push(["create", input]);
      return { created: true, job: { id: jobId, status: "queued", progress: 0 } };
    },
    claimGenerationJob: async () => ({
      id: jobId,
      userId: user.id,
      prompt: "记录生活",
      selectedMediaAssetIds: mediaAssetIds,
      status: "running",
      progress: 10,
    }),
    completeGenerationJob: async (input) => {
      calls.push(["complete", input]);
      return { job: { id: jobId, status: "succeeded", progress: 100 }, siteDraft: draft };
    },
    failGenerationJob: async () => {
      throw new Error("should not fail");
    },
  };
  const service = createHomepageLifecycleService({
    repository,
    getProfile: async () => profile,
    listMedia: async () => mediaAssets,
    runSiteBuilder: async () => ({ source: "model", draft: draft.draft }),
    deadlineMs: 100,
  });

  const created = await service.createGenerationJob({
    user,
    payload: {
      prompt: "记录生活",
      mediaAssetIds,
      idempotencyKey: "attempt-123",
    },
  });
  const completed = await service.processGenerationJob({ user, jobId });

  assert.equal(created.job.id, jobId);
  assert.equal(completed.job.status, "succeeded");
  assert.equal(calls[1][1].source, "model");
  assert.deepEqual(calls[1][1].mediaAssetIds, mediaAssetIds);
});

test("preview URLs contain a raw short-lived token while persistence receives only its hash", async () => {
  const saved = [];
  const token = "a".repeat(43);
  const hash = "f".repeat(64);
  const service = createHomepageLifecycleService({
    repository: {
      getDraft: async () => draft,
      savePreviewToken: async (input) => saved.push(input),
    },
    accessTokenFactory: () => ({ token, hash }),
    now: () => new Date("2026-07-15T02:00:00.000Z"),
    previewTtlMs: 5 * 60 * 1000,
    webBaseUrl: "https://staging.example.com",
  });

  const preview = await service.issuePreviewToken({ userId: user.id, draftId });

  assert.equal(preview.previewUrl, `https://staging.example.com/preview/${token}`);
  assert.equal(saved[0].tokenHash, hash);
  assert.equal(JSON.stringify(saved[0]).includes(token), false);
  assert.equal(preview.expiresAt, "2026-07-15T02:05:00.000Z");
});

test("preview access is bound to the draft revision that issued the token", async () => {
  const service = createHomepageLifecycleService({
    repository: {
      getPreviewRecord: async () => ({
        userId: user.id,
        draftId,
        tokenRevision: 1,
        revision: 2,
        draft: draft.draft,
        selectedMediaAssetIds: mediaAssetIds,
        profile,
      }),
    },
    listMedia: async () => mediaAssets,
  });

  await assert.rejects(
    () => service.getPreviewPage({ token: "a".repeat(43) }),
    (error) => error?.status === 410,
  );
});

test("publishing returns a share URL without exposing the stored token field", async () => {
  const token = "b".repeat(43);
  const publishedInputs = [];
  const service = createHomepageLifecycleService({
    repository: {
      getDraft: async () => draft,
      publishDraft: async (input) => {
        publishedInputs.push(input);
        return {
          site: {
            userId: user.id,
            currentDraftId: draftId,
            publishedReleaseId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            visibility: "link",
            shareToken: token,
            publishedAt: "2026-07-15T03:00:00.000Z",
          },
          release: { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
          siteDraft: draft,
        };
      },
      unpublish: async () => ({
        userId: user.id,
        currentDraftId: draftId,
        publishedReleaseId: null,
        visibility: "private",
        shareToken: null,
      }),
    },
    listMedia: async () => mediaAssets,
    accessTokenFactory: () => ({ token, hash: "e".repeat(64) }),
    webBaseUrl: "https://staging.example.com",
  });

  const published = await service.publish({
    userId: user.id,
    draftId,
    revision: 1,
    visibility: "link",
  });
  const unpublished = await service.unpublish({ userId: user.id });

  assert.equal(published.site.shareUrl, `https://staging.example.com/s/${token}`);
  assert.equal("shareToken" in published.site, false);
  assert.equal(publishedInputs[0].shareToken, token);
  assert.equal(unpublished.site.shareUrl, null);
  assert.equal(unpublished.site.visibility, "private");
});

test("shared page access disappears immediately after token revocation", async () => {
  const service = createHomepageLifecycleService({
    repository: { getShareRecord: async () => null },
  });

  await assert.rejects(
    () => service.getSharedPage({ token: "c".repeat(43) }),
    (error) => error?.status === 404,
  );
});

test("natural-language refinement changes only the requested stable section", async () => {
  const replacements = [];
  const service = createHomepageLifecycleService({
    repository: {
      getDraft: async () => draft,
      replaceDraft: async (input) => {
        replacements.push(input);
        return { ...draft, revision: 2, draft: input.draft };
      },
    },
    getProfile: async () => profile,
    listMedia: async () => mediaAssets,
    runSiteBuilder: async () => ({
      source: "model",
      draft: {
        version: 2,
        language: "zh",
        title: "模型不应修改整页标题",
        theme: "clean",
        summary: "模型不应修改整页摘要",
        sections: [
          {
            id: "hero",
            type: "hero",
            title: "模型不应修改首页",
            assetIds: [mediaAssetIds[2]],
          },
          {
            id: "gallery",
            type: "gallery",
            title: "夏日照片",
            subtitle: "只展示我选择的夏日瞬间",
            assetIds: [...mediaAssetIds, "44444444-4444-4444-8444-444444444444"],
          },
        ],
      },
    }),
  });

  const result = await service.refineSection({
    user,
    draftId,
    revision: 1,
    sectionId: "gallery",
    instruction: "把照片模块改成夏日主题",
  });

  assert.equal(result.siteDraft.revision, 2);
  assert.equal(replacements[0].draft.title, draft.draft.title);
  assert.equal(replacements[0].draft.theme, draft.draft.theme);
  assert.deepEqual(replacements[0].draft.sections[0], draft.draft.sections[0]);
  assert.equal(replacements[0].draft.sections[1].title, "夏日照片");
  assert.deepEqual(replacements[0].draft.sections[1].assetIds, mediaAssetIds);
});
