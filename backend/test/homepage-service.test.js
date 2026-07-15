import assert from "node:assert/strict";
import test from "node:test";
import * as homepage from "../src/homepage-service.js";

const mediaAssets = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    status: "uploaded",
    storageKey: "users/u/station-media/1/one.jpg",
    mimeType: "image/jpeg",
    width: 1200,
    height: 900,
    caption: "海边",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    status: "uploaded",
    storageKey: "users/u/station-media/2/two.jpg",
    mimeType: "image/jpeg",
    width: 900,
    height: 1200,
    caption: "晚风",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    status: "uploaded",
    storageKey: "users/u/station-media/3/three.jpg",
    mimeType: "image/jpeg",
    width: 1000,
    height: 1000,
    caption: "朋友",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    status: "uploaded",
    storageKey: "users/u/station-media/4/not-selected.jpg",
    mimeType: "image/jpeg",
  },
];

const selectedIds = [mediaAssets[1].id, mediaAssets[0].id, mediaAssets[2].id];
const profile = {
  nickname: "小妙",
  avatarText: "妙",
  bio: "喜欢旅行和记录生活。",
  email: "must-not-leak@example.com",
  stationConfig: { language: "zh" },
};

test("explicit homepage media preserves user order and rejects unavailable assets", () => {
  const selected = homepage.selectExplicitHomepageMedia({
    mediaAssetIds: selectedIds,
    mediaAssets,
  });

  assert.deepEqual(selected.map((asset) => asset.id), selectedIds);
  assert.throws(() =>
    homepage.selectExplicitHomepageMedia({
      mediaAssetIds: [...selectedIds.slice(0, 2), "55555555-5555-4555-8555-555555555555"],
      mediaAssets,
    }),
  );
  assert.throws(() =>
    homepage.selectExplicitHomepageMedia({
      mediaAssetIds: selectedIds,
      mediaAssets: mediaAssets.map((asset, index) =>
        index === 1 ? { ...asset, status: "pending_upload" } : asset,
      ),
    }),
  );
});

test("fallback homepage is a version 2 draft using only explicit media", () => {
  const draft = homepage.createHomepageFallbackDraft({
    prompt: "做一个轻松的夏日主页",
    profile,
    mediaAssets: homepage.selectExplicitHomepageMedia({
      mediaAssetIds: selectedIds,
      mediaAssets,
    }),
  });

  assert.equal(draft.version, 2);
  assert.equal(draft.theme, "gallery");
  assert.deepEqual(draft.sections.map((section) => section.id), ["hero", "about", "gallery"]);
  assert.deepEqual(draft.sections[0].assetIds, [selectedIds[0]]);
  assert.deepEqual(draft.sections[2].assetIds, selectedIds);
  assert.equal(JSON.stringify(draft).includes(mediaAssets[3].id), false);
});

test("generation falls back within the configured deadline", async () => {
  const generation = await homepage.generateHomepageDraft({
    prompt: "做一个主页",
    profile,
    mediaAssets: mediaAssets.slice(0, 3),
    deadlineMs: 5,
    runModel: () => new Promise((resolve) => setTimeout(() => resolve({}), 50)),
  });

  assert.equal(generation.source, "fallback");
  assert.equal(generation.reason, "deadline");
  assert.equal(generation.draft.version, 2);
});

test("model drafts are normalized and cannot introduce unselected media", async () => {
  const generation = await homepage.generateHomepageDraft({
    prompt: "做一个主页",
    profile,
    mediaAssets: mediaAssets.slice(0, 3),
    deadlineMs: 100,
    runModel: async () => ({
      source: "model",
      draft: {
        version: 1,
        language: "zh",
        title: "模型标题",
        theme: "warm",
        summary: "模型摘要",
        sections: [
          {
            type: "hero",
            title: "模型标题",
            assetIds: [mediaAssets[3].id, mediaAssets[0].id],
          },
          {
            type: "gallery",
            title: "照片",
            assetIds: [mediaAssets[2].id, mediaAssets[3].id],
            hidden: true,
          },
        ],
      },
    }),
  });

  assert.equal(generation.source, "model");
  assert.equal(generation.draft.version, 2);
  assert.equal(generation.draft.theme, "clean");
  assert.deepEqual(generation.draft.sections[0].assetIds, [mediaAssets[0].id]);
  assert.deepEqual(generation.draft.sections[1].assetIds, [mediaAssets[2].id]);
  assert.equal(generation.draft.sections[1].hidden, true);
});

test("page views expose signed media projections without profile or storage secrets", () => {
  const draft = homepage.createHomepageFallbackDraft({
    prompt: "我的主页",
    profile,
    mediaAssets: mediaAssets.slice(0, 3),
  });
  const view = homepage.buildHomepagePageView({
    mode: "share",
    profile,
    draft,
    mediaAssets: mediaAssets.slice(0, 3),
    visibility: "link",
    publishedAt: "2026-07-15T01:00:00.000Z",
    mediaUrl: (asset) => `https://signed.invalid/${asset.id}?signature=temporary`,
  });

  assert.deepEqual(view.owner, {
    nickname: "小妙",
    avatarText: "妙",
    bio: "喜欢旅行和记录生活。",
  });
  assert.equal(view.media.length, 3);
  assert.equal("storageKey" in view.media[0], false);
  assert.equal("email" in view.owner, false);
  assert.equal(JSON.stringify(view).includes("must-not-leak"), false);
});

test("access tokens have sufficient entropy and are stored by hash", () => {
  const first = homepage.createHomepageAccessToken();
  const second = homepage.createHomepageAccessToken();

  assert.match(first.token, /^[a-zA-Z0-9_-]{43}$/);
  assert.match(first.hash, /^[a-f0-9]{64}$/);
  assert.equal(homepage.hashHomepageAccessToken(first.token), first.hash);
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.hash, second.hash);
});

test("revision mismatches fail with a conflict", () => {
  assert.doesNotThrow(() => homepage.assertHomepageRevision(3, 3));
  assert.throws(
    () => homepage.assertHomepageRevision(4, 3),
    (error) => error?.status === 409,
  );
});
