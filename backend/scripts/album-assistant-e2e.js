import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  base: { type: "string" }, bicycle: { type: "string" }, car: { type: "string" }, "allow-paid": { type: "boolean" }, cleanup: { type: "string" },
} });
assert.ok(values["allow-paid"], "--allow-paid is required");
const base = String(values.base || "");
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/, "Only an isolated loopback QA API is supported");
const fixtureDir = await mkdtemp("/tmp/miaoxun-album-fixture-");
const password = "Album-QA-only-2026!";
const ownerName = `相册对话验收${crypto.randomBytes(3).toString("hex")}`;
const accounts = [];
const report = { type: "isolated-database-real-model-public-media-e2e", passed: [] };
async function api(route, { token, method = "GET", body, expected = 200, key } = {}) {
  const response = await fetch(base + route, { method, headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...(key ? { "Idempotency-Key": key } : {}), "X-Miaoxun-Retrieval-Contract": "2",
  }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(300000) });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${route.replace(/[a-f0-9-]{36}/g, "<id>")} status ${response.status} code ${data.error?.code || "none"}`);
  return data.data ?? data;
}
async function register(name) {
  const account = await api("/api/auth/register", { method: "POST", expected: 201,
    body: { contactType: "email", email: `${crypto.randomUUID()}@example.invalid`, displayName: name, password } });
  accounts.push(account);
  return account;
}
async function upload(account, bytes, kind, mimeType) {
  const token = account.session.token;
  const asset = await api("/api/station/media-assets", { token, method: "POST", expected: 201,
    body: { kind, originalFilename: kind === "video" ? "公开素材短片.mp4" : "公开素材.jpg", mimeType, byteSize: bytes.length } });
  const { upload: ticket } = await api(`/api/station/media-assets/${asset.id}/upload-url`, { token, method: "POST", body: { mimeType, byteSize: bytes.length } });
  const response = await fetch(ticket.url, { method: ticket.method, headers: ticket.headers, body: bytes });
  assert.ok(response.ok);
  await api(`/api/station/media-assets/${asset.id}/upload-complete`, { token, method: "POST", body: { storageKey: ticket.objectKey } });
  return { ...asset, storageKey: ticket.objectKey };
}
async function chat(account, threadId, content, clientMessageId = crypto.randomUUID()) {
  return api(`/api/threads/${threadId}/messages`, { token: account.session.token, method: "POST", expected: 201, body: { content, clientMessageId } });
}

async function cleanup(account) {
  await api("/api/me/agents/album-manager", { token: account.session.token, method: "PATCH", body: { enabled: false }, key: crypto.randomUUID() });
  // Revocation blocks new model dispatch; allow current worker transactions to release their locks.
  await new Promise(resolve => setTimeout(resolve, 3000));
  await api("/api/account", { token: account.session.token, method: "DELETE", body: { password, confirmation: "DELETE" } });
}

if (values.cleanup) {
  const saved = JSON.parse(await readFile(values.cleanup, "utf8"));
  assert.equal(saved.base, base);
  for (const account of saved.accounts) await cleanup(account);
  console.log(JSON.stringify({ cleanedAccounts: saved.accounts.length }));
  process.exit(0);
}

try {
  const owner = await register(ownerName);
  const outsider = await register(`相册隔离验收${crypto.randomBytes(3).toString("hex")}`);
  await writeFile(path.join(fixtureDir, "session.json"), JSON.stringify({ base, accounts, ownerName, password }), { mode: 0o600 });
  const token = owner.session.token;
  await api("/api/me/agents/album-manager", { token, method: "PATCH", expected: 409, body: { enabled: true } });
  const bicycleBytes = await readFile(values.bicycle);
  const carBytes = await readFile(values.car);
  const bikePath = path.join(fixtureDir, "bicycle.jpg");
  const carPath = path.join(fixtureDir, "car.jpg");
  const videoPath = path.join(fixtureDir, "public-slides.mp4");
  await writeFile(bikePath, bicycleBytes); await writeFile(carPath, carBytes);
  const generated = spawnSync("ffmpeg", ["-v", "error", "-loop", "1", "-t", "3", "-i", carPath, "-loop", "1", "-t", "3", "-i", bikePath,
    "-filter_complex", "[0:v]scale=768:512:force_original_aspect_ratio=decrease,pad=768:512:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=12[v0];[1:v]scale=768:512:force_original_aspect_ratio=decrease,pad=768:512:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=12[v1];[v0][v1]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", videoPath], { timeout: 60000, stdio: "ignore" });
  assert.equal(generated.status, 0);
  const bicycle = await upload(owner, bicycleBytes, "image", "image/jpeg");
  const car = await upload(owner, carBytes, "image", "image/jpeg");
  const video = await upload(owner, await readFile(videoPath), "video", "video/mp4");
  await api("/api/me/agents/album-manager", { token, method: "PATCH", body: { enabled: true, albumAIConsentVersion: "media-retrieval-consent-v1" }, key: crypto.randomUUID() });
  report.passed.push("single-album-ai-consent-enables-agent-and-index");
  let indexed = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await api("/api/station/media-retrieval/status", { token });
    assert.equal(status.availability.canStartRun, true);
    assert.equal(status.backfill.skippedAssets, 0, "Every fixture must index successfully; no partial success accepted for this E2E");
    if (status.backfill.indexedAssets === 3) { indexed = true; break; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  assert.ok(indexed, "public photos/video must become ready");
  const album = await api("/api/station/albums", { token, method: "POST", expected: 201, body: { title: "公开测试相册" } });
  await api(`/api/station/media-assets/${bicycle.id}`, { token, method: "PATCH", body: { albumId: album.id, caption: "公开自行车素材" } });
  await api(`/api/station/media-assets/${bicycle.id}/upload-complete`, { token, method: "POST", body: { storageKey: bicycle.storageKey } });
  const bootstrap = await api("/api/app/bootstrap", { token });
  const threadId = bootstrap.threads.find(thread => thread.agentId === "album-manager").id;
  const clientMessageId = crypto.randomUUID();
  const content = "在公开测试相册帮我找自行车的照片";
  const found = await chat(owner, threadId, content, clientMessageId);
  const reply = found.messages.at(-1);
  assert.equal(reply.metadata.albumAssistant.outcome, "found");
  assert.equal(reply.metadata.albumAssistant.retrievalRunIds.length, 1);
  const resultsRoute = `/api/threads/${threadId}/messages/${reply.id}/media-results`;
  const results = await api(resultsRoute, { token });
  assert.ok(results.some(result => result.mediaAssetId === bicycle.id));
  const replay = await api(`/api/threads/${threadId}/messages`, { token, method: "POST", expected: 200, body: { content, clientMessageId } });
  assert.equal(replay.messages.at(-1).id, reply.id);
  await api(resultsRoute, { token: outsider.session.token, expected: 404 });
  report.passed.push("conversation-tool-real-search-album-scope-replay-owner-isolation");
  const followup = await chat(owner, threadId, "继续找自行车，但这次在所有已上传素材里找视频，不限相册");
  const followupResults = await api(`/api/threads/${threadId}/messages/${followup.messages.at(-1).id}/media-results`, { token });
  const hit = followupResults.find(result => result.mediaAssetId === video.id);
  assert.ok(hit && hit.matchedFrameTimestampMs >= 3000 && hit.matchedFrameTimestampMs < 6000);
  report.passed.push("multi-turn-video-result-with-match-time");
  const preview = await fetch(`${base}/api/station/media-assets/${bicycle.id}/file`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(preview.status, 200); assert.ok((await preview.arrayBuffer()).byteLength);
  await api(`/api/station/media-assets/${bicycle.id}/file`, { token: outsider.session.token, expected: 404 });
  const negative = await chat(owner, threadId, "在全部相册里找雨伞的照片");
  assert.equal(negative.messages.at(-1).metadata.albumAssistant.outcome, "empty");
  report.passed.push("authenticated-image-preview-and-real-empty-result");
  await api("/api/me/agents/album-manager", { token, method: "PATCH", body: { enabled: true }, key: crypto.randomUUID() });
  const finalStatus = await api("/api/station/media-retrieval/status", { token });
  assert.equal(finalStatus.enabled, true);
  assert.equal(finalStatus.quota.dailyRemaining, null);
  report.passed.push("existing-consent-reused-with-no-daily-or-money-ceiling");
  await writeFile(path.join(fixtureDir, "session.json"), JSON.stringify({ base, accounts, ownerName, password, threadId, bicycle, car, video }), { mode: 0o600 });
  console.log(JSON.stringify({ ...report, fixtureDir, qaLoginName: ownerName }, null, 2));
} catch (error) {
  for (const account of accounts) {
    try { await cleanup(account); }
    catch { console.error("Isolated QA account cleanup failed; retain the disposable database for cleanup."); }
  }
  console.error(JSON.stringify({ ...report, fixtureDir, error: error.name, diagnostic: error.message }, null, 2));
  process.exitCode = 1;
}
