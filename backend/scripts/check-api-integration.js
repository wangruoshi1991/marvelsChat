import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { once } from "node:events";
import net from "node:net";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "Set DATABASE_URL to the migrated integration test database");
const database = new pg.Client({ connectionString: databaseUrl });
try {
  await database.connect();
  const { rows } = await database.query("SELECT current_database() AS name");
  assert.match(rows[0].name, /_migration_test$/, "Refusing to write outside a migration test database");
} finally {
  await database.end();
}

const portProbe = net.createServer();
portProbe.listen(0, "127.0.0.1");
await once(portProbe, "listening");
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const baseUrl = `http://127.0.0.1:${port}`;
const backend = spawn(process.execPath, ["src/server.js"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: String(port),
    DEFAULT_ADMIN_ENABLED: "false",
    CREATE_FIRST_USER_AS_ADMIN: "false",
    ADMIN_EMAILS: "",
    NEW_API_BASE_URL: "",
    NEW_API_KEY: "",
    NEW_API_MODEL: "",
    AVATAR_3D_ENABLED: "false",
    AVATAR_3D_PROVIDER_CALLS_ENABLED: "false",
    MEDIA_RETRIEVAL_ENABLED: "false",
    MEDIA_RETRIEVAL_PROVIDER_CALLS_ENABLED: "false",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
for (const stream of [backend.stdout, backend.stderr]) {
  stream.on("data", chunk => { serverLog = `${serverLog}${chunk}`.slice(-12000); });
}
const stopped = once(backend, "exit");

async function request(route, { method = "GET", token, body, status = 200 } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, status, `${method} ${route}`);
  if (status === 204) return undefined;
  const payload = await response.json();
  return payload.data ?? payload;
}

const suffix = crypto.randomBytes(6).toString("hex");
const password = `A${crypto.randomBytes(24).toString("hex")}z1`;
const testUserIds = [];
const register = async displayName => {
  const account = await request("/api/auth/register", {
    method: "POST", status: 201,
    body: { contactType: "email", email: `${displayName}@example.invalid`, displayName, password },
  });
  testUserIds.push(account.user.id);
  return account;
};

async function queryTestDatabase(sql, parameters = []) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await client.query(sql, parameters);
  } finally {
    await client.end();
  }
}

const identityFields = ["headline", "publicLocation", "experienceYears", "languages"];
const emptyIdentity = { headline: "", publicLocation: "", experienceYears: null, languages: [] };
const assertIdentity = (profile, expected) => {
  assert.ok(profile, "Profile response is required");
  for (const key of identityFields) assert.deepEqual(profile[key], expected[key], `Profile ${key}`);
};

try {
  let healthy = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (backend.exitCode !== null) throw new Error("Backend exited during integration startup");
    try {
      healthy = (await request("/api/health")).ok;
      if (healthy) break;
    } catch {
      // Startup may not have opened the HTTP listener yet.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(healthy, true, "Backend failed to start");
  assert.equal((await request("/api/ready")).ok, true);
  const owner = await register(`auditOwner${suffix}`);
  const peer = await register(`auditPeer${suffix}`);
  const ownerToken = owner.session.token;
  const peerToken = peer.session.token;
  const asset = await request("/api/station/media-assets", {
    method: "POST", token: ownerToken, status: 201,
    body: { kind: "image", originalFilename: "contract.png", mimeType: "image/png" },
  });
  const assetRoute = `/api/station/media-assets/${asset.id}`;
  await request(assetRoute, { status: 401 });
  await request(assetRoute, { token: peerToken, status: 404 });
  await request(assetRoute, { token: ownerToken, status: 409 });
  await queryTestDatabase("UPDATE station_media_assets SET status = 'uploaded', storage_key = 'integration-only/contract.png' WHERE id = $1 AND user_id = $2", [asset.id, owner.user.id]);
  assert.deepEqual(await request(assetRoute, { token: ownerToken }), { id: asset.id, kind: 'image', status: 'uploaded' });
  await request(assetRoute, { token: peerToken, status: 404 });
  await queryTestDatabase("UPDATE station_media_assets SET deleted_at = NOW(), storage_key = NULL WHERE id = $1 AND user_id = $2", [asset.id, owner.user.id]);
  await request(assetRoute, { token: ownerToken, status: 404 });
  const bootstrap = await request("/api/app/bootstrap", { token: ownerToken });
  assert.equal(bootstrap.user.id, owner.user.id);
  assert.equal(bootstrap.user.role, "user");
  assertIdentity(bootstrap.profile, emptyIdentity);

  const profileInput = {
    nickname: owner.user.displayName,
    avatarText: "自定义",
    avatarConfig: bootstrap.profile.avatarConfig,
    bio: "A voluntary public signature",
    community: "GPS community remains separate",
    activityArea: "GPS neighborhood remains separate",
  };
  const identity = { headline: "产品设计师", publicLocation: "上海", experienceYears: 5, languages: ["zh", "en"] };
  await request("/api/me/profile", { method: "PATCH", body: profileInput, status: 401 });
  const savedProfile = await request("/api/me/profile", {
    method: "PATCH", token: ownerToken, body: { ...profileInput, ...identity },
  });
  assertIdentity(savedProfile, identity);
  assert.equal(savedProfile.community, profileInput.community);
  assert.equal(savedProfile.activityArea, profileInput.activityArea);
  assertIdentity((await request("/api/app/bootstrap", { token: ownerToken })).profile, identity);
  assertIdentity((await request(`/api/profiles/ai/${owner.user.aiId}`, { token: peerToken })).profile, identity);
  assertIdentity((await request(`/api/stations/ai/${owner.user.aiId}`, { token: peerToken })).profile, identity);
  const oldEditorSave = await request("/api/me/profile", { method: "PATCH", token: ownerToken, body: profileInput });
  assertIdentity(oldEditorSave, identity);
  const partialIdentity = await request("/api/me/profile", {
    method: "PATCH", token: ownerToken, body: { ...profileInput, experienceYears: 0 },
  });
  assertIdentity(partialIdentity, { ...identity, experienceYears: 0 });
  const clearedProfile = await request("/api/me/profile", {
    method: "PATCH", token: ownerToken, body: { ...profileInput, ...emptyIdentity },
  });
  assertIdentity(clearedProfile, emptyIdentity);
  for (const invalid of [
    { experienceYears: -1 }, { experienceYears: 81 }, { experienceYears: 1.5 },
    { experienceYears: "5" }, { languages: ["zh", "zh"] }, { languages: ["zh-CN"] },
    { languages: [null] }, { headLine: "unknown field" },
  ]) {
    await request("/api/me/profile", { method: "PATCH", token: ownerToken, body: { ...profileInput, ...invalid }, status: 400 });
  }
  assertIdentity((await request("/api/app/bootstrap", { token: ownerToken })).profile, emptyIdentity);
  for (const [sql, values] of [
    ["UPDATE user_profiles SET experience_years = $1 WHERE user_id = $2", [-1, owner.user.id]],
    ["UPDATE user_profiles SET experience_years = $1 WHERE user_id = $2", [81, owner.user.id]],
    ["UPDATE user_profiles SET languages = $1::text[] WHERE user_id = $2", [["zh", "zh"], owner.user.id]],
    ["UPDATE user_profiles SET languages = $1::text[] WHERE user_id = $2", [["zh-CN"], owner.user.id]],
    ["UPDATE user_profiles SET languages = $1::text[] WHERE user_id = $2", [[null], owner.user.id]],
  ]) {
    await assert.rejects(() => queryTestDatabase(sql, values), error => error.code === "23514");
  }
  await request("/api/me/profile", { method: "PATCH", token: ownerToken, body: { ...profileInput, ...identity } });

  const adminProfileRoute = `/api/admin/users/${owner.user.id}/profile`;
  const adminInput = {
    nickname: profileInput.nickname, bio: profileInput.bio,
    community: profileInput.community, activityArea: profileInput.activityArea,
  };
  await request(adminProfileRoute, { method: "PATCH", body: adminInput, status: 401 });
  await request(adminProfileRoute, { method: "PATCH", token: peerToken, body: adminInput, status: 403 });
  await queryTestDatabase("UPDATE users SET role = 'admin', admin_permissions = $1::jsonb WHERE id = $2", [JSON.stringify(["users:read"]), peer.user.id]);
  assertIdentity((await request(`/api/admin/users/${owner.user.id}`, { token: peerToken })).profile, identity);
  await request(adminProfileRoute, { method: "PATCH", token: peerToken, body: adminInput, status: 403 });
  await queryTestDatabase("UPDATE users SET admin_permissions = $1::jsonb WHERE id = $2", [JSON.stringify(["users:read", "users:write"]), peer.user.id]);
  const adminIdentity = { ...identity, headline: "独立产品设计师", experienceYears: 8, languages: ["zh", "ja"] };
  const adminSaved = await request(adminProfileRoute, { method: "PATCH", token: peerToken, body: { ...adminInput, ...adminIdentity } });
  assertIdentity(adminSaved.profile, adminIdentity);
  assert.equal(adminSaved.profile.avatarText, profileInput.avatarText);
  assertIdentity((await request("/api/app/bootstrap", { token: ownerToken })).profile, adminIdentity);
  const adminOmitted = await request(adminProfileRoute, { method: "PATCH", token: peerToken, body: adminInput });
  assertIdentity(adminOmitted.profile, adminIdentity);
  const adminCleared = await request(adminProfileRoute, { method: "PATCH", token: peerToken, body: { ...adminInput, ...emptyIdentity } });
  assertIdentity(adminCleared.profile, emptyIdentity);
  await request(adminProfileRoute, { method: "PATCH", token: peerToken, body: { ...adminInput, headLine: "unknown" }, status: 400 });
  await request(adminProfileRoute, { method: "PATCH", token: peerToken, body: { ...adminInput, ...identity } });

  const diary = await request("/api/station/diary", {
    method: "POST", status: 201, token: ownerToken,
    body: { title: "Integration diary", body: "Private test content", visibility: "private" },
  });
  await request(`/api/station/diary/${diary.id}`, {
    method: "PATCH", status: 404, token: peerToken, body: { title: "Forbidden edit" },
  });
  const updatedDiary = await request(`/api/station/diary/${diary.id}`, {
    method: "PATCH", token: ownerToken, body: { title: "Updated diary" },
  });
  assert.equal(updatedDiary.title, "Updated diary");
  const post = await request("/api/station/posts", {
    method: "POST", status: 201, token: ownerToken,
    body: { body: "Integration post", visibility: "private" },
  });
  const station = await request("/api/station/content", { token: ownerToken });
  assert.ok(station.posts.some(item => item.id === post.id));
  assert.ok(station.diaryEntries.some(item => item.id === diary.id));

  const friendRequest = await request(`/api/social/friend-requests/${peer.user.id}`, {
    method: "POST", token: ownerToken, status: 201, body: { message: "Integration friendship" },
  });
  await request(`/api/social/friend-requests/${friendRequest.id}/accept`, {
    method: "POST", token: peerToken,
  });
  await request(`/api/social/follows/${owner.user.id}`, { method: "POST", token: peerToken, status: 201 });
  await request(`/api/social/follows/${peer.user.id}`, { method: "POST", token: ownerToken, status: 201 });
  await request("/api/me/profile-visibility", {
    method: "PATCH", token: ownerToken,
    body: { showBio: false, showCommunity: false, showActivityArea: false },
  });
  const hiddenProfile = await request(`/api/profiles/ai/${owner.user.aiId}`, { token: peerToken });
  assertIdentity(hiddenProfile.profile, emptyIdentity);
  assert.equal(hiddenProfile.profile.bio, "");
  assert.equal(hiddenProfile.profile.community, "");
  assert.equal(hiddenProfile.profile.activityArea, "");
  assert.equal(hiddenProfile.profile.followersCount, 1);
  assertIdentity((await request(`/api/stations/ai/${owner.user.aiId}`, { token: peerToken })).profile, emptyIdentity);
  assertIdentity((await request(`/api/profiles/ai/${owner.user.aiId}`, { token: ownerToken })).profile, identity);
  for (const relationshipType of ["friends", "following", "followers"]) {
    const relationships = await request(`/api/social/relationships/${relationshipType}`, { token: peerToken });
    const hiddenRelationship = relationships.find(item => item.user.id === owner.user.id);
    assertIdentity(hiddenRelationship.profile, emptyIdentity);
    assert.equal(hiddenRelationship.profile.bio, "");
    assert.equal(hiddenRelationship.profile.community, "");
    assert.equal(hiddenRelationship.profile.activityArea, "");
  }
  const peerBootstrap = await request("/api/app/bootstrap", { token: peerToken });
  assertIdentity(peerBootstrap.relationships.friends.find(item => item.user.id === owner.user.id).profile, emptyIdentity);
  for (const relationshipType of ["friends", "following", "followers"]) {
    const hiddenRelationship = peerBootstrap.relationships[relationshipType].find(item => item.user.id === owner.user.id);
    assert.equal(hiddenRelationship.profile.community, "");
    assert.equal(hiddenRelationship.profile.activityArea, "");
  }
  const ownHiddenProfile = (await request("/api/app/bootstrap", { token: ownerToken })).profile;
  assert.equal(ownHiddenProfile.community, profileInput.community);
  assert.equal(ownHiddenProfile.activityArea, profileInput.activityArea);
  await request("/api/me/profile-visibility", { method: "PATCH", token: ownerToken, body: { showCommunity: true } });
  const separateLocationVisibility = (await request("/api/social/relationships/friends", { token: peerToken })).find(item => item.user.id === owner.user.id);
  assert.equal(separateLocationVisibility.profile.community, profileInput.community);
  assert.equal(separateLocationVisibility.profile.activityArea, "");
  await request("/api/me/profile-visibility", { method: "PATCH", token: ownerToken, body: { showBio: true, showCounts: false } });
  const hiddenCountsProfile = await request(`/api/profiles/ai/${owner.user.aiId}`, { token: peerToken });
  assertIdentity(hiddenCountsProfile.profile, identity);
  assert.equal(hiddenCountsProfile.profile.followersCount, 0);
  const ownerThread = await request(`/api/social/friends/${peer.user.id}/thread`, {
    method: "POST", token: ownerToken,
  });
  await request(`/api/threads/${ownerThread.thread.id}/messages`, {
    token: peerToken, status: 404,
  });
  await request(`/api/threads/${ownerThread.thread.id}/messages`, {
    method: "POST", token: ownerToken, status: 201, body: { content: "Integration direct message" },
  });
  const peerSync = await request("/api/app/sync", { token: peerToken });
  assert.ok(Object.values(peerSync.messagesByThread).flat().some(message => message.content === "Integration direct message"));
  await request(`/api/threads/${ownerThread.thread.id}/preferences`, {
    method: "PATCH", token: ownerToken, body: { muted: true },
  });
  await request(`/api/station/posts/${post.id}`, { method: "DELETE", status: 204, token: ownerToken });
  await request(`/api/station/diary/${diary.id}`, { method: "DELETE", status: 204, token: ownerToken });

  await request("/api/auth/logout", { method: "POST", token: ownerToken });
  await request("/api/me", { token: ownerToken, status: 401 });
  const login = await request("/api/auth/login", {
    method: "POST", body: { identifier: owner.user.displayName, password },
  });
  assert.equal(login.user.id, owner.user.id);
  for (const token of [login.session.token, peerToken]) {
    await request("/api/account", {
      method: "DELETE", token, body: { password, confirmation: "DELETE" },
    });
  }
  const deletedProfiles = await queryTestDatabase("SELECT user_id FROM user_profiles WHERE user_id = ANY($1::text[])", [[owner.user.id, peer.user.id]]);
  assert.equal(deletedProfiles.rowCount, 0, "Account deletion must remove profile identity data");
  console.log("API integration passed: readiness, registration/login, profile identity persistence and clearing, database constraints, public and relationship privacy, admin authorization and editing, private content CRUD, ownership, friendship, direct messages, sync, mute, logout, and account deletion.");
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  if (backend.exitCode === null) backend.kill("SIGTERM");
  const timeout = setTimeout(() => backend.kill("SIGKILL"), 5000);
  await stopped;
  clearTimeout(timeout);
  if (testUserIds.length) {
    await queryTestDatabase("DELETE FROM users WHERE id = ANY($1::text[])", [testUserIds]);
  }
}
