import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const homepageRepositoryModule = await import("../src/homepage-repository.js");

const ids = {
  user: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  job: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  draft: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  release: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};

const mediaAssetIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

const draftContent = {
  version: 2,
  language: "zh",
  title: "我的主页",
  theme: "gallery",
  summary: "记录生活",
  sections: [],
};

const jobRow = {
  id: ids.job,
  user_id: ids.user,
  idempotency_key: "attempt-123",
  prompt: "记录生活",
  selected_media_asset_ids: mediaAssetIds,
  status: "queued",
  progress: 0,
  site_draft_id: null,
  source: null,
  created_at: "2026-07-15T00:00:00.000Z",
  updated_at: "2026-07-15T00:00:00.000Z",
};

const draftRow = {
  id: ids.draft,
  user_id: ids.user,
  prompt: "记录生活",
  draft: draftContent,
  revision: 3,
  selected_media_asset_ids: mediaAssetIds,
  source: "fallback",
  status: "draft",
  model_provider: "",
  model_missing: [],
  model_error: "",
  created_at: "2026-07-15T00:00:00.000Z",
  updated_at: "2026-07-15T00:00:00.000Z",
};

test("generation job creation is idempotent per user and key", async () => {
  const calls = [];
  const rows = [[jobRow], []];
  const repository = homepageRepositoryModule.createHomepageRepository({
    queryFn: async (sql, params) => {
      calls.push({ sql, params });
      return rows.shift();
    },
    randomUUID: () => ids.job,
  });

  const first = await repository.createGenerationJob({
    userId: ids.user,
    prompt: "记录生活",
    mediaAssetIds,
    idempotencyKey: "attempt-123",
  });

  assert.equal(first.created, true);
  assert.equal(first.job.id, ids.job);
  assert.equal("prompt" in first.job, false);
  assert.match(calls[0].sql, /ON CONFLICT \(user_id, idempotency_key\) DO NOTHING/);

  const existingRows = [[], [jobRow]];
  const existingRepository = homepageRepositoryModule.createHomepageRepository({
    queryFn: async () => existingRows.shift(),
    randomUUID: () => "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  });
  const second = await existingRepository.createGenerationJob({
    userId: ids.user,
    prompt: "不同的重试正文不能覆盖第一次请求",
    mediaAssetIds,
    idempotencyKey: "attempt-123",
  });

  assert.equal(second.created, false);
  assert.equal(second.job.id, ids.job);
});

test("draft replacement checks the expected revision and increments atomically", async () => {
  const calls = [];
  const responses = [
    [draftRow],
    [{ ...draftRow, revision: 4, draft: { ...draftContent, title: "更新标题" } }],
    [],
  ];
  const repository = homepageRepositoryModule.createHomepageRepository({
    transactionFn: async (work) =>
      work({
        execute: async (sql, params) => {
          calls.push({ sql, params });
          return [responses.shift()];
        },
      }),
  });

  const updated = await repository.replaceDraft({
    userId: ids.user,
    draftId: ids.draft,
    expectedRevision: 3,
    draft: { ...draftContent, title: "更新标题" },
  });

  assert.equal(updated.revision, 4);
  assert.match(calls[0].sql, /FOR UPDATE/);
  assert.match(calls[1].sql, /revision = revision \+ 1/);

  const conflictRepository = homepageRepositoryModule.createHomepageRepository({
    transactionFn: async (work) =>
      work({ execute: async () => [[{ ...draftRow, revision: 4 }]] }),
  });
  await assert.rejects(
    () =>
      conflictRepository.replaceDraft({
        userId: ids.user,
        draftId: ids.draft,
        expectedRevision: 3,
        draft: draftContent,
      }),
    (error) => error?.status === 409,
  );
});

test("publishing creates an immutable release and unpublishing revokes the share token", async () => {
  const shareToken = "share-token-that-is-long-and-random-enough-123456";
  const releaseRow = {
    id: ids.release,
    user_id: ids.user,
    draft_id: ids.draft,
    revision: 3,
    snapshot: draftContent,
    selected_media_asset_ids: mediaAssetIds,
    visibility: "link",
    created_at: "2026-07-15T00:00:00.000Z",
  };
  const siteRow = {
    user_id: ids.user,
    current_draft_id: ids.draft,
    published_release_id: ids.release,
    visibility: "link",
    share_token: shareToken,
    published_at: "2026-07-15T00:00:00.000Z",
    unpublished_at: null,
    created_at: "2026-07-15T00:00:00.000Z",
    updated_at: "2026-07-15T00:00:00.000Z",
  };
  const responses = [
    [draftRow],
    [releaseRow],
    [],
    [],
    [],
    [siteRow],
  ];
  const repository = homepageRepositoryModule.createHomepageRepository({
    transactionFn: async (work) =>
      work({ execute: async () => [responses.shift()] }),
    randomUUID: () => ids.release,
  });

  const published = await repository.publishDraft({
    userId: ids.user,
    draftId: ids.draft,
    expectedRevision: 3,
    visibility: "link",
    shareToken,
  });

  assert.equal(published.site.shareToken, shareToken);
  assert.equal(published.release.id, ids.release);
  assert.deepEqual(published.release.snapshot, draftContent);

  const unpublishRepository = homepageRepositoryModule.createHomepageRepository({
    queryFn: async () => [{ ...siteRow, visibility: "private", share_token: null }],
  });
  const unpublished = await unpublishRepository.unpublish({ userId: ids.user });

  assert.equal(unpublished.visibility, "private");
  assert.equal(unpublished.shareToken, null);
});
