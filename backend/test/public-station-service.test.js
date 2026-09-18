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
