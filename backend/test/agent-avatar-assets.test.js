import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createAgentAvatarAssetService, normalizeAgentAvatar, assertAgentImagePublicationReady } from "../src/agent-avatar-assets.js";
import { isCompleteAgentIdentity, computeAgentReleaseContractHash } from "../../shared/agent-catalog.js";
import { agentIdentitySchema } from "../src/schemas.js";

const assetId = "a0000000-0000-4000-8000-000000000001";
const identity = { key: "demo", avatarKind: "agent-mark", displayName: "Demo", description: "", mark: "D", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#abcdef" }, published: false, source: "admin", updatedAt: "2026-11-02T00:00:00.000Z" };
const png = () => sharp({ create: { width: 100, height: 80, channels: 3, background: "#123456" } }).png().toBuffer();

test("image publication requires the explicit server rollout gate after compatible App delivery", () => {
  assert.doesNotThrow(() => assertAgentImagePublicationReady(identity, false));
  assert.throws(() => assertAgentImagePublicationReady({ avatarKind: "agent-image" }, false), (e) => e.status === 409 && e.details.code === "AGENT_IMAGE_CLIENT_NOT_READY");
  assert.doesNotThrow(() => assertAgentImagePublicationReady({ avatarKind: "agent-image" }, true));
});

test("brand images are decoded, stripped of metadata and normalized into square WebP", async () => {
  const source = await png();
  const output = await normalizeAgentAvatar(source, "image/png");
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 512);
  assert.equal(metadata.exif, undefined);
  await assert.rejects(normalizeAgentAvatar(source, "image/jpeg"), (e) => e.details.code === "AGENT_AVATAR_IMAGE_INVALID");
  await assert.rejects(normalizeAgentAvatar(Buffer.from("<svg/>"), "image/svg+xml"), (e) => e.status === 415);
  await assert.rejects(normalizeAgentAvatar(Buffer.alloc(2097153), "image/png"), (e) => e.status === 413);
  await assert.rejects(normalizeAgentAvatar(Buffer.from("invalid"), "image/png"), (e) => e.status === 422);
});

test("uploaded asset contract rejects remote URLs and includes the image in release hashes", () => {
  const avatar = { assetId, sha256: "a".repeat(64), url: `/api/agent-avatar-assets/${assetId}/${"a".repeat(64)}.webp`, mimeType: "image/webp", width: 512, height: 512 };
  const image = { ...identity, avatarKind: "agent-image", avatar };
  assert.equal(isCompleteAgentIdentity(image), true);
  assert.deepEqual(agentIdentitySchema.parse(image), image);
  for (const bad of [{ ...image, avatar: { ...avatar, url: "https://other.invalid/avatar.webp" } }, { ...image, avatar: { ...avatar, sha256: "b".repeat(64) } }, { ...identity, avatar }, { ...image, avatar: undefined }]) {
    assert.equal(isCompleteAgentIdentity(bad), false);
    assert.equal(agentIdentitySchema.safeParse(bad).success, false);
  }
  const releaseHash = (value) => computeAgentReleaseContractHash({ key: "demo", version: "1.0.0", permissions: ["messages:read"], identity: value });
  assert.notEqual(releaseHash(identity), releaseHash(image));
  assert.equal(releaseHash(image), releaseHash({ ...image, updatedAt: "2026-11-03T00:00:00.000Z", published: true }));
});

test("asset read verifies exact persisted content and fails explicitly for draft/public or missing/corrupt storage", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "miaoxun-avatar-unit-"));
  try {
    const bytes = await normalizeAgentAvatar(await png(), "image/png");
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const row = { id: assetId, sha256, mime_type: "image/webp", width: 512, height: 512 };
    const file = path.join(root, `${assetId}-${sha256}.webp`);
    await fs.writeFile(file, bytes);
    let published = false;
    const service = createAgentAvatarAssetService({ root, runQuery: async (sql, params) => {
      assert.deepEqual(params, [assetId, sha256]);
      return sql.includes("EXISTS") && !published ? [] : [row];
    } });
    await assert.rejects(service.read(assetId, sha256), (e) => e.status === 404);
    const draft = await service.read(assetId, sha256, { publishedOnly: false });
    assert.deepEqual(draft.bytes, bytes);
    published = true;
    assert.deepEqual((await service.read(assetId, sha256)).bytes, bytes);
    await service.assertManaged({ ...identity, avatarKind: "agent-image", avatar: draft.asset });
    await fs.writeFile(file, "corrupt");
    await assert.rejects(service.read(assetId, sha256), (e) => e.details.code === "AGENT_AVATAR_STORAGE_CORRUPT");
    await fs.rm(file);
    await assert.rejects(service.read(assetId, sha256), (e) => e.details.code === "AGENT_AVATAR_STORAGE_MISSING");
    await assert.rejects(service.read("../../etc/passwd", sha256), (e) => e.status === 400);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
