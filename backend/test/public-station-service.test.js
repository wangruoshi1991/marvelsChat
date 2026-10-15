import assert from "node:assert/strict";
import test from "node:test";

import { buildPublicStationView } from "../src/public-station-service.js";

const sensitiveMedia = {
  id: "asset-1",
  userId: "owner-1",
  albumId: "album-1",
  kind: "image",
  storageProvider: "oss",
  storageKey: "private/storage-key",
  originalFilename: "private-original.jpg",
  mimeType: "image/jpeg",
  byteSize: 1200,
  width: 640,
  height: 480,
  caption: "公开说明",
  tags: ["private-tag"],
  metadata: { visibility: "public", internal: "private-metadata" },
  status: "uploaded",
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
};

const publicProfile = {
  user: { id: "owner-1", displayName: "站主", aiId: "10000001" },
  profile: { userId: "owner-1", nickname: "站主" },
  relation: { isSelf: false, isFriend: false, isFollowing: false },
  visibility: {
    showPosts: true,
    showAlbum: true,
    showDiary: true,
    showFiles: false,
  },
};

test("public station media DTOs expose display fields without storage internals", () => {
  const view = buildPublicStationView({
    publicProfile,
    stationContent: {
      posts: [
        {
          id: "post-1",
          userId: "owner-1",
          body: "公开动态",
          visibility: "public",
          agentCapabilities: [],
          likeCount: 4,
          commentCount: 1,
          favoriteCount: 2,
          likedByMe: true,
          favoritedByMe: false,
          media: [sensitiveMedia],
        },
      ],
      albums: [{ id: "album-1", userId: "owner-1", title: "公开相册", visibility: "public" }],
      mediaAssets: [sensitiveMedia],
    },
  });

  assert.equal(view.stationContent.posts[0].likedByMe, true);
  assert.equal(view.stationContent.posts[0].favoritedByMe, false);
  assert.deepEqual(view.stationContent.posts[0].media[0], {
    id: "asset-1",
    albumId: "album-1",
    kind: "image",
    mimeType: "image/jpeg",
    width: 640,
    height: 480,
    caption: "公开说明",
    status: "uploaded",
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-18T00:00:00.000Z",
  });
  assert.deepEqual(view.stationContent.mediaAssets[0], view.stationContent.posts[0].media[0]);
  const serialized = JSON.stringify(view.stationContent);
  for (const privateValue of [
    "storageProvider",
    "storageKey",
    "originalFilename",
    "byteSize",
    "private-tag",
    "private-metadata",
  ]) {
    assert.equal(serialized.includes(privateValue), false, `${privateValue} leaked`);
  }
});

test("public station visibility still excludes private content and disabled lists", () => {
  const hidden = buildPublicStationView({
    publicProfile: {
      ...publicProfile,
      visibility: { ...publicProfile.visibility, showPosts: false, showAlbum: false },
    },
    stationContent: {
      posts: [{ id: "post-1", visibility: "public", media: [] }],
      albums: [{ id: "album-1", visibility: "public" }],
      mediaAssets: [sensitiveMedia],
    },
  });
  assert.deepEqual(hidden.stationContent.posts, []);
  assert.deepEqual(hidden.stationContent.albums, []);
  assert.deepEqual(hidden.stationContent.mediaAssets, []);

  const stranger = buildPublicStationView({
    publicProfile,
    stationContent: {
      posts: [{ id: "private", visibility: "private", media: [] }],
      albums: [{ id: "friends", visibility: "friends" }],
      mediaAssets: [sensitiveMedia],
    },
  });
  assert.deepEqual(stranger.stationContent.posts, []);
  assert.deepEqual(stranger.stationContent.albums, []);
  assert.deepEqual(stranger.stationContent.mediaAssets, []);
});

test("public file metadata excludes retired heuristic fields and never expands access to literal previews", () => {
  const file = {
    id: "file-1", originalFilename: "notes.txt", mimeType: "text/plain", status: "processed",
    metadata: { visibility: "public" },
    preprocessingResult: {
      kind: "text", title: "Old guessed title", summary: "Old heuristic summary", tags: ["Old guessed tag"],
      textPreview: "Private literal preview", checksumSha256: "Private checksum",
      stats: { charCount: 20, lineCount: 2, wordCount: 12, internal: "Private stats" },
    },
  };
  const stationContent = { fileAssets: [file, { ...file, id: "private-file", metadata: { visibility: "private" } }] };
  const view = buildPublicStationView({
    publicProfile: { ...publicProfile, visibility: { ...publicProfile.visibility, showFiles: true } },
    stationContent,
  });
  assert.deepEqual(view.stationContent.fileAssets, [{
    id: "file-1", originalFilename: "notes.txt", mimeType: "text/plain", status: "processed",
    preprocessingResult: { kind: "text", stats: { charCount: 20, lineCount: 2 } },
  }]);
  assert.deepEqual(buildPublicStationView({ publicProfile, stationContent }).stationContent.fileAssets, []);
});

const documentId = "296ab198-9866-4e6d-b100-d3f389d4fd60";
const sectionId = "56aef63f-7f24-4484-a67a-1f8390efde0d";
const publicMediaId = "82b5c86f-c116-434e-aa2c-193b0124cdd4";
const privateMediaId = "595912cf-ce1a-4699-970d-87691fcdf1d2";
const missingMediaId = "ab27d178-f3cd-43a9-9dfd-5bff35b263dd";
const privateDiaryId = "a021aeb9-908b-4847-8b65-51fc97d46a24";
const missingDiaryId = "373566b9-5f20-449a-ab14-56ba409ad3c5";
const derivedPrivateText = {
  title: "模型从私密资料改写的页面标题",
  summary: "模型从私密日记改写的摘要",
  sectionTitle: "模型从私密资料改写的模块标题",
  subtitle: "模型从私密资料改写的副标题",
  body: "模型从私密日记改写的正文",
  action: "查看包含私密行程的内容",
};
const generatedLayout = (schemaVersion) => ({
  ...(schemaVersion === 2
    ? { schemaVersion: 2, documentId, revision: 1, visibility: "private" }
    : { version: 1 }),
  language: "zh",
  theme: "gallery",
  title: derivedPrivateText.title,
  summary: derivedPrivateText.summary,
  sections: [{
    ...(schemaVersion === 2 ? { id: sectionId } : {}),
    type: "gallery",
    title: derivedPrivateText.sectionTitle,
    subtitle: derivedPrivateText.subtitle,
    body: derivedPrivateText.body,
    assetIds: [publicMediaId, privateMediaId, missingMediaId],
    diaryEntryIds: [privateDiaryId, missingDiaryId],
    actions: schemaVersion === 2 ? [
      { kind: "view-media", label: derivedPrivateText.action, targetId: publicMediaId },
      { kind: "view-media", label: "缺失素材", targetId: missingMediaId },
      { kind: "view-diary", label: "私密日记", targetId: privateDiaryId },
    ] : [{ kind: "message", label: derivedPrivateText.action, href: "" }],
  }],
});
const layoutResources = () => ({
  albums: [
    { id: "public-album", title: "公开相册", visibility: "public" },
    { id: "private-album", title: "私密相册", visibility: "private" },
  ],
  mediaAssets: [
    { ...sensitiveMedia, id: publicMediaId, albumId: "public-album" },
    { ...sensitiveMedia, id: privateMediaId, albumId: "private-album" },
  ],
  diaryEntries: [{ id: privateDiaryId, title: "私密日记", visibility: "private" }],
});

for (const schemaVersion of [1, 2]) {
  for (const [viewer, relation] of [
    ["stranger", { isSelf: false, isFriend: false, isFollowing: false }],
    ["friend", { isSelf: false, isFriend: true, isFollowing: true }],
    ["missing relationship", undefined],
    ["non-boolean self flag", { isSelf: "true" }],
  ]) {
    test(`schema ${schemaVersion} generated private text never appears to ${viewer}`, () => {
      const view = buildPublicStationView({
        publicProfile: { ...publicProfile, relation },
        ownerProfile: { stationConfig: { siteLayout: generatedLayout(schemaVersion) } },
        stationContent: layoutResources(),
      });

      assert.equal(view.siteLayout, null);
      const serialized = JSON.stringify(view);
      for (const privateText of Object.values(derivedPrivateText)) {
        assert.equal(serialized.includes(privateText), false, `${privateText} leaked`);
      }
      assert.equal(view.stationContent.mediaAssets.some(asset => asset.id === publicMediaId), true);
    });
  }

  test(`schema ${schemaVersion} applied layout is owner-only and keeps resource filtering`, () => {
    const layout = generatedLayout(schemaVersion);
    const original = structuredClone(layout);
    const view = buildPublicStationView({
      publicProfile: {
        ...publicProfile,
        relation: { isSelf: true },
        visibility: { showAlbum: false, showDiary: false },
      },
      ownerProfile: { stationConfig: { siteLayout: layout } },
      stationContent: layoutResources(),
    });

    assert.equal(view.siteLayout.title, derivedPrivateText.title);
    assert.equal(view.siteLayout.sections[0].body, derivedPrivateText.body);
    assert.deepEqual(view.siteLayout.sections[0].assetIds, [publicMediaId, privateMediaId]);
    assert.deepEqual(view.siteLayout.sections[0].diaryEntryIds, [privateDiaryId]);
    assert.deepEqual(view.siteLayout.sections[0].actions, schemaVersion === 2
      ? [layout.sections[0].actions[0], layout.sections[0].actions[2]]
      : layout.sections[0].actions);
    assert.deepEqual(layout, original, "view projection must not modify the saved layout");
  });
}

test("unapplied drafts stay isolated from public station views including the owner's view", () => {
  for (const isSelf of [false, true]) {
    const view = buildPublicStationView({
      publicProfile: { ...publicProfile, relation: { isSelf } },
      stationContent: { siteDrafts: [{ id: documentId, status: "draft", draft: generatedLayout(2) }] },
    });

    assert.equal(view.siteLayout, null);
    assert.equal(Object.hasOwn(view.stationContent, "siteDrafts"), false);
    assert.equal(JSON.stringify(view).includes(derivedPrivateText.title), false);
  }
});

test("unresolved interactions keep exact targets and repetitions in owner views without exposing them to others", () => {
  const layout = generatedLayout(2);
  const action = { kind: "interaction-intent", intent: "open-link", label: "链接意图",
    target: { kind: "unresolved", text: " 用户提供的目标\n " } };
  layout.sections[0].actions = [action, { ...action }, layout.sections[0].actions[1]];
  const original = JSON.stringify(layout);
  for (const isSelf of [true, false]) {
    const view = buildPublicStationView({
      publicProfile: { ...publicProfile, relation: { isSelf } },
      ownerProfile: { stationConfig: { siteLayout: layout } }, stationContent: layoutResources(),
    });
    if (isSelf) assert.deepEqual(view.siteLayout.sections[0].actions, [action, action]);
    else {
      assert.equal(view.siteLayout, null);
      assert.equal(JSON.stringify(view).includes(action.target.text), false);
    }
  }
  assert.equal(JSON.stringify(layout), original);
});
