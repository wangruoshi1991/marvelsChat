import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config } from "./config.js";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { isCompleteAgentAvatar } from "../../shared/agent-catalog.js";

export const agentAvatarMaxBytes = 2 * 1024 * 1024;
export function assertAgentImagePublicationReady(identity, enabled = config.agentImagePublicationEnabled) {
  if (identity?.avatarKind === "agent-image" && !enabled) throw new HttpError(409,
    "图片头像尚未开放发布，请先完成配套 App 验收与分发并由服务端明确开启", { code: "AGENT_IMAGE_CLIENT_NOT_READY" });
}
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const qFor = (connection) => connection.query.bind(connection);
const assetDto = (row) => ({
  assetId: String(row.id).trim(),
  url: `/api/agent-avatar-assets/${String(row.id).trim()}/${row.sha256}.webp`,
  sha256: row.sha256, mimeType: row.mime_type, width: row.width, height: row.height,
});

export async function normalizeAgentAvatar(bytes, mimeType) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new HttpError(400, "请选择头像图片", { code: "AGENT_AVATAR_REQUIRED" });
  if (bytes.length > agentAvatarMaxBytes) throw new HttpError(413, "头像不能超过 2 MB", { code: "AGENT_AVATAR_TOO_LARGE" });
  const format = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" }[mimeType];
  if (!format) throw new HttpError(415, "头像仅支持 PNG、JPEG、WebP", { code: "AGENT_AVATAR_TYPE_INVALID" });
  try {
    const image = sharp(bytes, { limitInputPixels: 16777216, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== format || (metadata.pages || 1) !== 1 || !metadata.width || !metadata.height ||
      metadata.width < 64 || metadata.height < 64 || metadata.width > 4096 || metadata.height > 4096) {
      throw new HttpError(422, "头像须为 64–4096 像素的静态图片，文件类型须与声明一致", { code: "AGENT_AVATAR_IMAGE_INVALID" });
    }
    // Decode, orient and re-encode. Original metadata and arbitrary source bytes
    // are never served as an executable or an SVG from the application origin.
    return await image.rotate().resize(512, 512, { fit: "cover" }).webp({ quality: 90 }).toBuffer();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, "头像图片无法解码", { code: "AGENT_AVATAR_IMAGE_INVALID" });
  }
}

export function createAgentAvatarAssetService({
  runQuery = query, transaction = withTransaction, root = config.agentAvatarRoot, randomUUID = crypto.randomUUID,
} = {}) {
  function assetPath(id, sha256) {
    if (!uuidPattern.test(id) || !/^[a-f0-9]{64}$/.test(sha256)) throw new HttpError(400, "头像资源地址无效", { code: "AGENT_AVATAR_ID_INVALID" });
    return path.join(root, `${id}-${sha256}.webp`);
  }

  async function upload({ bytes, mimeType, actorUserId, requestId }) {
    if (!requestId || typeof requestId !== "string" || requestId.length > 160) throw new HttpError(400, "Idempotency-Key is required", { code: "IDEMPOTENCY_KEY_REQUIRED" });
    const normalized = await normalizeAgentAvatar(bytes, mimeType);
    const inputHash = digest(Buffer.concat([Buffer.from(`${mimeType}\n`), bytes]));
    const sha256 = digest(normalized);
    return transaction(async (connection) => {
        const q = qFor(connection);
        await q("SELECT pg_advisory_xact_lock(hashtext(?))", [`agent-avatar:${actorUserId}:${requestId}`]);
        const existing = await q("SELECT * FROM agent_avatar_assets WHERE uploaded_by = ? AND request_id = ?", [actorUserId, requestId]);
        if (existing[0]) {
          if (existing[0].input_sha256 !== inputHash) throw new HttpError(409, "Idempotency-Key was used for another image", { code: "IDEMPOTENCY_CONFLICT" });
          await read(existing[0].id.trim(), existing[0].sha256, { publishedOnly: false, connection });
          return { asset: assetDto(existing[0]), replayed: true };
        }
        const id = randomUUID();
        const createdPath = assetPath(id, sha256);
        await fs.mkdir(root, { recursive: true });
        await fs.writeFile(createdPath, normalized, { flag: "wx", mode: 0o640 });
        await q(`INSERT INTO agent_avatar_assets
          (id, sha256, input_sha256, mime_type, width, height, byte_size, uploaded_by, request_id)
          VALUES (?, ?, ?, 'image/webp', 512, 512, ?, ?, ?)`, [id, sha256, inputHash, normalized.length, actorUserId, requestId]);
        await q(`INSERT INTO usage_events (id, user_id, event_type, target_type, target_id, payload)
          VALUES (?, ?, 'admin.agent.avatar.upload', 'agent_avatar_asset', ?, ?::jsonb)`,
        [randomUUID(), actorUserId, id, JSON.stringify({ requestId, sha256, byteSize: normalized.length })]);
        return { asset: assetDto({ id, sha256, mime_type: "image/webp", width: 512, height: 512 }), replayed: false };
      });
  }

  async function read(id, sha256, { publishedOnly = true, connection = null } = {}) {
    const file = assetPath(id, sha256);
    const q = connection ? qFor(connection) : runQuery;
    const rows = await q(`SELECT a.* FROM agent_avatar_assets a WHERE a.id = ? AND a.sha256 = ?
      ${publishedOnly ? `AND (EXISTS (SELECT 1 FROM agent_releases r WHERE r.catalog_status = 'published'
        AND r.identity_snapshot->'avatar'->>'assetId' = a.id::text)
        OR EXISTS (SELECT 1 FROM product_versions pv WHERE pv.status = 'published'
        AND pv.identity_snapshot->'avatar'->>'assetId' = a.id::text))` : ""}`, [id, sha256]);
    if (!rows[0]) throw new HttpError(404, "头像资源不存在或尚未发布", { code: "AGENT_AVATAR_NOT_FOUND" });
    let bytes;
    try { bytes = await fs.readFile(file); }
    catch (error) {
      if (error.code === "ENOENT") throw new HttpError(503, "头像存储资源缺失", { code: "AGENT_AVATAR_STORAGE_MISSING" });
      throw error;
    }
    if (digest(bytes) !== rows[0].sha256) throw new HttpError(503, "头像存储校验失败", { code: "AGENT_AVATAR_STORAGE_CORRUPT" });
    return { asset: assetDto(rows[0]), bytes };
  }

  async function assertManaged(identity, { connection = null } = {}) {
    if (identity.avatarKind !== "agent-image") return;
    if (!isCompleteAgentAvatar(identity.avatar)) throw new HttpError(422, "头像合同不完整", { code: "AGENT_AVATAR_INVALID" });
    const stored = await read(identity.avatar.assetId, identity.avatar.sha256, { publishedOnly: false, connection });
    if (Object.keys(stored.asset).some((key) => stored.asset[key] !== identity.avatar[key])) throw new HttpError(422, "头像资源与上传记录不一致", { code: "AGENT_AVATAR_MISMATCH" });
  }
  return { upload, read, assertManaged };
}

export const agentAvatarAssetService = createAgentAvatarAssetService();
export const assertManagedAgentAvatar = (...args) => agentAvatarAssetService.assertManaged(...args);
