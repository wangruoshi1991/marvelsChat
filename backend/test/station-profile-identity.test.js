import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_ENABLED = "false";

const { profileSelfSchema, profileAdminSchema } = await import("../src/schemas.js");
const { createUserProfileUpdater } = await import("../src/station-profile-repository.js");
const { createAdminUserProfileUpdater } = await import("../src/admin-repository.js");
const { mapProfile, mapPublicProfile, mapRelationshipProfile } = await import("../src/repository-mappers.js");

const identity = {
  headline: "产品设计师",
  publicLocation: "上海",
  experienceYears: 5,
  languages: ["zh", "en"],
};

for (const [name, schema] of [["self", profileSelfSchema], ["admin", profileAdminSchema]]) {
  test(`${name} profile identity validates structured years and language codes`, () => {
    const parsed = schema.parse({ nickname: "林未", ...identity, headline: " 产品设计师 ", publicLocation: " 上海 " });
    for (const [key, value] of Object.entries(identity)) assert.deepEqual(parsed[key], value);
    for (const invalid of [
      { experienceYears: -1 },
      { experienceYears: 81 },
      { experienceYears: 2.5 },
      { experienceYears: "5" },
      { languages: ["zh", "zh"] },
      { languages: ["zh-CN"] },
      { languages: [null] },
      { headline: "x".repeat(81) },
      { publicLocation: "x".repeat(121) },
      { headLine: "misspelled" },
    ]) {
      assert.throws(() => schema.parse({ nickname: "林未", ...invalid }));
    }
  });

  test(`${name} profile identity preserves omission and accepts explicit clear values`, () => {
    const omitted = schema.parse({ nickname: "林未" });
    for (const key of Object.keys(identity)) assert.equal(Object.hasOwn(omitted, key), false);
    const cleared = schema.parse({
      nickname: "林未", headline: "", publicLocation: "", experienceYears: null, languages: [],
    });
    assert.equal(cleared.headline, "");
    assert.equal(cleared.publicLocation, "");
    assert.equal(cleared.experienceYears, null);
    assert.deepEqual(cleared.languages, []);
    assert.equal(schema.parse({ nickname: "林未", experienceYears: 0 }).experienceYears, 0);
  });
}

function updateHarness(createUpdater) {
  const calls = [];
  const persistedProfile = { userId: "user-1", nickname: "林未", ...identity };
  const update = createUpdater({
    findByDisplayName: async () => null,
    transaction: async (work) => work({ execute: async (sql, params) => calls.push({ sql, params }) }),
    getProfile: async (userId) => {
      assert.equal(userId, "user-1");
      return persistedProfile;
    },
  });
  return { update, calls, persistedProfile };
}

for (const [name, createUpdater] of [["self", createUserProfileUpdater], ["admin", createAdminUserProfileUpdater]]) {
  test(`${name} profile update distinguishes omitted identity fields from clearing them`, async () => {
    const harness = updateHarness(createUpdater);
    const saved = await harness.update({ userId: "user-1", nickname: "林未" });
    assert.deepEqual(saved, harness.persistedProfile);
    const omitted = harness.calls.find((call) => call.sql.includes("UPDATE user_profiles"));
    assert.deepEqual(omitted.params.slice(-6), [null, null, false, null, null, "user-1"]);
    assert.match(omitted.sql, /experience_years = CASE WHEN \?::boolean THEN \?::smallint ELSE experience_years END/);
    assert.match(omitted.sql, /headline = COALESCE\(\?::text, headline\)/);
    assert.match(omitted.sql, /languages = COALESCE\(\?::text\[\], languages\)/);

    const cleared = updateHarness(createUpdater);
    await cleared.update({
      userId: "user-1", nickname: "林未", headline: "", publicLocation: "", experienceYears: null, languages: [],
    });
    const clearingQuery = cleared.calls.find((call) => call.sql.includes("UPDATE user_profiles"));
    assert.deepEqual(clearingQuery.params.slice(-6), ["", "", true, null, [], "user-1"]);

    const zero = updateHarness(createUpdater);
    await zero.update({ userId: "user-1", nickname: "林未", ...identity, experienceYears: 0 });
    const setQuery = zero.calls.find((call) => call.sql.includes("UPDATE user_profiles"));
    assert.deepEqual(setQuery.params.slice(-6), ["产品设计师", "上海", true, 0, ["zh", "en"], "user-1"]);
  });

  test(`${name} profile update rejects another user's nickname before mutation`, async () => {
    let mutated = false;
    const update = createUpdater({
      findByDisplayName: async () => ({ id: "user-2" }),
      transaction: async () => { mutated = true; },
    });
    await assert.rejects(() => update({ userId: "user-1", nickname: "Other" }), /already registered/);
    assert.equal(mutated, false);
  });
}

test("admin profile editing preserves the owner's chosen avatar text", async () => {
  const harness = updateHarness(createAdminUserProfileUpdater);
  await harness.update({ userId: "user-1", nickname: "林未", ...identity });
  const profileQuery = harness.calls.find((call) => call.sql.includes("UPDATE user_profiles"));
  assert.doesNotMatch(profileQuery.sql, /avatar_text\s*=/);
});

const profileRow = {
  ai_id: "10000042",
  user_id: "user-1", nickname: "林未", avatar_text: "林", bio: "独立设计师",
  headline: identity.headline, public_location: identity.publicLocation,
  experience_years: identity.experienceYears, languages: identity.languages,
  community: "GPS parent community", activity_area: "GPS neighborhood",
  following_count: 8, followers_count: 6, likes_count: 4, collections_count: 2,
};

test("profile mapping exposes voluntary identity without deriving it from GPS", () => {
  const mapped = mapProfile(profileRow);
  for (const [key, value] of Object.entries(identity)) assert.deepEqual(mapped[key], value);
  const empty = mapProfile({ ...profileRow, headline: "", public_location: "", experience_years: null, languages: [] });
  assert.equal(empty.publicLocation, "");
  assert.equal(empty.headline, "");
  assert.equal(empty.experienceYears, null);
  assert.deepEqual(empty.languages, []);
});

test("public biography visibility covers identity while count visibility stays independent", () => {
  const hidden = mapPublicProfile({ ...profileRow, show_bio: false }, { isSelf: false });
  assert.equal(hidden.profile.headline, "");
  assert.equal(hidden.profile.publicLocation, "");
  assert.equal(hidden.profile.experienceYears, null);
  assert.deepEqual(hidden.profile.languages, []);
  assert.equal(hidden.profile.followersCount, 6);
  const self = mapPublicProfile({ ...profileRow, show_bio: false }, { isSelf: true });
  for (const [key, value] of Object.entries(identity)) assert.deepEqual(self.profile[key], value);
  const countsHidden = mapPublicProfile({ ...profileRow, show_counts: false });
  assert.equal(countsHidden.profile.followersCount, 0);
  assert.equal(countsHidden.profile.headline, identity.headline);
});

test("relationship lists redact identity fields when biography is hidden", () => {
  const mapped = mapRelationshipProfile({ ...profileRow, show_bio: false });
  assert.equal(mapped.profile.bio, "");
  assert.equal(mapped.profile.headline, "");
  assert.equal(mapped.profile.publicLocation, "");
  assert.equal(mapped.profile.experienceYears, null);
  assert.deepEqual(mapped.profile.languages, []);
});

test("relationship lists enforce AI ID and count privacy independently", () => {
  const hidden = mapRelationshipProfile({
    ...profileRow,
    show_ai_id: false,
    show_counts: false,
    show_collections: true,
  });
  assert.equal(hidden.user.aiId, "");
  assert.equal(hidden.profile.followingCount, 0);
  assert.equal(hidden.profile.followersCount, 0);
  assert.equal(hidden.profile.likesCount, 0);
  assert.equal(hidden.profile.collectionsCount, 0);

  const collectionsHidden = mapRelationshipProfile({
    ...profileRow,
    show_ai_id: true,
    show_counts: true,
    show_collections: false,
  });
  assert.equal(collectionsHidden.user.aiId, profileRow.ai_id);
  assert.equal(collectionsHidden.profile.followersCount, profileRow.followers_count);
  assert.equal(collectionsHidden.profile.likesCount, profileRow.likes_count);
  assert.equal(collectionsHidden.profile.collectionsCount, 0);
});

test("relationship lists cannot reveal hidden locations after a user enables those privacy controls", () => {
  const hidden = {
    ...profileRow,
    show_bio: true,
    show_community: false,
    show_activity_area: false,
  };
  const relationship = mapRelationshipProfile(hidden);
  const publicProfile = mapPublicProfile(hidden, { isSelf: false });
  assert.equal(relationship.profile.community, "");
  assert.equal(relationship.profile.activityArea, "");
  assert.equal(relationship.profile.community, publicProfile.profile.community);
  assert.equal(relationship.profile.activityArea, publicProfile.profile.activityArea);
  for (const [key, value] of Object.entries(identity)) assert.deepEqual(relationship.profile[key], value);
});

test("community, activity area and public identity visibility remain independent in relationship lists", () => {
  const hiddenCommunity = mapRelationshipProfile({ ...profileRow, show_community: false });
  assert.equal(hiddenCommunity.profile.community, "");
  assert.equal(hiddenCommunity.profile.activityArea, profileRow.activity_area);
  const hiddenArea = mapRelationshipProfile({ ...profileRow, show_activity_area: false });
  assert.equal(hiddenArea.profile.community, profileRow.community);
  assert.equal(hiddenArea.profile.activityArea, "");
  assert.equal(hiddenArea.profile.publicLocation, identity.publicLocation);
  const hiddenBio = mapRelationshipProfile({ ...profileRow, show_bio: false });
  assert.equal(hiddenBio.profile.community, profileRow.community);
  assert.equal(hiddenBio.profile.activityArea, profileRow.activity_area);
  assert.equal(hiddenBio.profile.publicLocation, "");
  const visible = mapRelationshipProfile({ ...profileRow, show_community: true, show_activity_area: true });
  assert.equal(visible.profile.community, profileRow.community);
  assert.equal(visible.profile.activityArea, profileRow.activity_area);
});
