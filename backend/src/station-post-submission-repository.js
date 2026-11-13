import crypto from "node:crypto";
import { withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { createUsageEvent } from "./repositories.js";
import { mapStationMediaAsset, mapStationPost } from "./repository-mappers.js";
import { createStationPostInTransaction } from "./station-repository.js";
import { stationPostSchema, stationPostSubmissionParamsSchema } from "./schemas.js";

// Fixed object keys and ordered arrays are shared with the durable RN request.
// Reordering comic frames is a different request, even with the same image set.
export function hashStationPostPayload(payload) {
  return crypto.createHash("sha256").update(JSON.stringify({
    body: payload.body,
    locationLabel: payload.locationLabel,
    visibility: payload.visibility,
    agentCapabilities: payload.agentCapabilities,
    mediaAssetIds: payload.mediaAssetIds,
  })).digest("hex");
}

export function createStationPostSubmissionRepository({ transaction = withTransaction } = {}) {
  async function lockIntent(connection, userId, clientRequestId) {
    await connection.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", [
      `station-post:${userId}:${clientRequestId}`,
    ]);
  }
  async function readReceipt(connection, userId, clientRequestId) {
    const rows = await connection.query(
      "SELECT status, request_hash, post_id FROM station_post_submissions WHERE user_id = ? AND client_request_id = ?",
      [userId, clientRequestId],
    );
    return rows[0] || null;
  }
  async function readPost(connection, userId, postId) {
    const rows = await connection.query("SELECT * FROM station_posts WHERE id = ? AND user_id = ? AND deleted_at IS NULL", [postId,userId]);
    if (!rows[0]) throw new HttpError(409, "Submitted post is unavailable", { code: "STATION_POST_RECEIPT_UNAVAILABLE" });
    const media = await connection.query(
      `SELECT m.* FROM station_post_media pm JOIN station_media_assets m ON m.id = pm.media_asset_id
       WHERE pm.post_id = ? AND m.user_id = ? AND m.deleted_at IS NULL AND m.status = 'uploaded'
       ORDER BY pm.sort_order`, [postId,userId],
    );
    return mapStationPost(rows[0], { media: media.map(mapStationMediaAsset) });
  }
  async function submitStationPost({ userId, audit = {}, ...input }) {
    const payload = stationPostSchema.parse(input);
    const { clientRequestId } = payload;
    const requestHash = hashStationPostPayload(payload);
    return transaction(async connection => {
      if (clientRequestId) {
        await lockIntent(connection, userId, clientRequestId);
        const receipt = await readReceipt(connection, userId, clientRequestId);
        if (receipt) {
          if (receipt.status === "closed") throw new HttpError(409, "This publication intent was resolved as not submitted and is closed", { code: "STATION_POST_INTENT_CLOSED" });
          if (receipt.request_hash !== requestHash) throw new HttpError(409, "This publication request already has different content", { code: "STATION_POST_IDEMPOTENCY_CONFLICT" });
          return readPost(connection,userId,receipt.post_id);
        }
      }
      const post = await createStationPostInTransaction(connection, { userId, ...payload });
      if (clientRequestId) await connection.query(
        `INSERT INTO station_post_submissions (user_id,client_request_id,request_hash,post_id,status) VALUES (?,?,?,?,'submitted')`,
        [userId,clientRequestId,requestHash,post.id],
      );
      await createUsageEvent({
        userId, eventType: "station.post.create", targetType: "station_post", targetId: post.id,
        payload: { visibility: post.visibility, mediaCount: post.media.length, agentCapabilityCount: post.agentCapabilities.length },
        ipHash: audit.ipHash || null, userAgent: audit.userAgent || "",
      }, connection.query);
      return post;
    });
  }
  async function getStationPostSubmission({ userId, clientRequestId }) {
    const params = stationPostSubmissionParamsSchema.parse({ clientRequestId });
    return transaction(async connection => {
      await lockIntent(connection,userId,params.clientRequestId);
      const receipt = await readReceipt(connection,userId,params.clientRequestId);
      if (!receipt || receipt.status === "closed") return { status: "not_submitted" };
      return { status: "submitted", post: await readPost(connection,userId,receipt.post_id) };
    });
  }
  // Resolving absence closes the intent before unlocking editing. This prevents
  // a delayed original POST that has not acquired its lock from publishing later.
  async function resolveStationPostSubmission({ userId, clientRequestId }) {
    const params = stationPostSubmissionParamsSchema.parse({ clientRequestId });
    return transaction(async connection => {
      await lockIntent(connection,userId,params.clientRequestId);
      const receipt = await readReceipt(connection,userId,params.clientRequestId);
      if (receipt?.status === "submitted") return { status: "submitted", post: await readPost(connection,userId,receipt.post_id) };
      if (!receipt) await connection.query(
        "INSERT INTO station_post_submissions (user_id,client_request_id,status) VALUES (?,?,'closed')", [userId,params.clientRequestId],
      );
      return { status: "not_submitted" };
    });
  }
  return { submitStationPost, getStationPostSubmission, resolveStationPostSubmission };
}

export const { submitStationPost, getStationPostSubmission, resolveStationPostSubmission } = createStationPostSubmissionRepository();
