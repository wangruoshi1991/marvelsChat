import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_ENABLED = "false";

const { createStationPostViewerLister } = await import("../src/station-repository.js");

test("public station post state belongs to the viewer instead of the owner", async () => {
  const queryCalls = [];
  let interactionInput;
  const listPosts = createStationPostViewerLister({
    runQuery: async (sql, params) => {
      queryCalls.push({ sql, params });
      if (sql.includes("FROM station_posts")) {
        return [{
          id: "post-1",
          user_id: "owner-1",
          body: "公开动态",
          visibility: "public",
          agent_capabilities: [],
          like_count: 3,
          comment_count: 0,
          favorite_count: 1,
        }];
      }
      return [];
    },
    listInteractions: async (input) => {
      interactionInput = input;
      return new Map([["post-1", new Set(["like"])]]);
    },
  });

  const [post] = await listPosts({
    ownerUserId: "owner-1",
    viewerUserId: "viewer-1",
  });

  assert.deepEqual(queryCalls[0].params, ["owner-1"]);
  assert.deepEqual(interactionInput, {
    userId: "viewer-1",
    postIds: ["post-1"],
  });
  assert.equal(post.userId, "owner-1");
  assert.equal(post.likedByMe, true);
  assert.equal(post.favoritedByMe, false);
});
