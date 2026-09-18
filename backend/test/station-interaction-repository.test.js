import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_ENABLED = "false";

const { createStationPostInteractionSetter } = await import("../src/station-interaction-repository.js");

const createConnection = ({ failAudit = false, ownerStatus = "active", showPosts = true, visibility = "public", isFriend = false } = {}) => {
  const calls = [];
  return {
    calls,
    connection: {
      query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes("FROM station_posts post")) {
          return [{ id: "post-1", user_id: "owner-1", visibility, owner_status: ownerStatus, show_posts: showPosts }];
        }
        if (sql.includes("FROM social_relationships")) return isFriend ? [{ "?column?": 1 }] : [];
        if (sql.includes("COUNT(*) FILTER")) {
          return [{ like_count: 3, favorite_count: 2 }];
        }
        if (/SELECT\s+interaction_type\s+FROM/.test(sql)) {
          return [{ interaction_type: "like" }];
        }
        if (sql.includes("INSERT INTO usage_events") && failAudit) {
          throw new Error("audit unavailable");
        }
        return [];
      },
    },
  };
};

test("post interaction and audit event use the same transaction", async () => {
  const harness = createConnection();
  let committed = false;
  const setInteraction = createStationPostInteractionSetter({
    transaction: async (work) => {
      const result = await work(harness.connection);
      committed = true;
      return result;
    },
    createId: () => "event-1",
  });

  const result = await setInteraction({
    userId: "viewer-1",
    postId: "post-1",
    interactionType: "like",
    active: true,
    audit: { ipHash: "ip-hash", userAgent: "test-agent" },
  });

  assert.equal(committed, true);
  assert.deepEqual(result, {
    postId: "post-1",
    likeCount: 3,
    favoriteCount: 2,
    likedByMe: true,
    favoritedByMe: false,
  });
  const audit = harness.calls.find((call) => call.sql.includes("INSERT INTO usage_events"));
  assert.deepEqual(audit.params, [
    "event-1",
    "viewer-1",
    "station.post.like",
    "post-1",
    JSON.stringify({ active: true }),
    "ip-hash",
    "test-agent",
  ]);
});

test("interaction authorization checks active owner and the station post switch before mutating", async () => {
  for (const options of [
    { ownerStatus: "disabled" },
    { showPosts: false },
    { visibility: "friends", isFriend: false },
    { visibility: "private" },
  ]) {
    const harness = createConnection(options);
    const setInteraction = createStationPostInteractionSetter({
      transaction: work => work(harness.connection),
      createId: () => "event-1",
    });
    await assert.rejects(
      () => setInteraction({
        userId: "viewer-1", postId: "post-1", interactionType: "like", active: true, audit: {},
      }),
      (error) => error.status === 404,
    );
    assert.equal(harness.calls.some(({ sql }) => sql.includes("INSERT INTO station_post_interactions")), false);
    assert.equal(harness.calls.some(({ sql }) => sql.includes("INSERT INTO usage_events")), false);
    assert.match(harness.calls[0].sql, /JOIN users owner ON owner\.id = post\.user_id/);
    assert.match(harness.calls[0].sql, /JOIN profile_visibility visibility ON visibility\.user_id = post\.user_id/);
    assert.match(harness.calls[0].sql, /FOR UPDATE OF post, owner, visibility/);
  }
});

test("owner can interact with a private post while public and friends viewers need visibility", async () => {
  for (const [options, userId] of [
    [{ ownerStatus: "active", showPosts: false, visibility: "private" }, "owner-1"],
    [{ ownerStatus: "active", showPosts: true, visibility: "friends", isFriend: true }, "viewer-1"],
  ]) {
    const harness = createConnection(options);
    const setInteraction = createStationPostInteractionSetter({
      transaction: work => work(harness.connection),
      createId: () => "event-1",
    });
    const result = await setInteraction({ userId, postId: "post-1", interactionType: "favorite", active: true, audit: {} });
    assert.equal(result.postId, "post-1");
    assert.equal(harness.calls.some(({ sql }) => sql.includes("INSERT INTO station_post_interactions")), true);
  }
});

test("audit failure rejects the interaction transaction", async () => {
  const harness = createConnection({ failAudit: true });
  let rolledBack = false;
  const setInteraction = createStationPostInteractionSetter({
    transaction: async (work) => {
      try {
        return await work(harness.connection);
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    },
    createId: () => "event-1",
  });

  await assert.rejects(
    () => setInteraction({
      userId: "viewer-1",
      postId: "post-1",
      interactionType: "favorite",
      active: true,
      audit: { ipHash: null, userAgent: "" },
    }),
    /audit unavailable/,
  );
  assert.equal(rolledBack, true);
});
