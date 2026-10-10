import crypto from "node:crypto";
import { MediaRetrievalMediaError } from "./media-retrieval-media.js";

const reject = () => { throw new MediaRetrievalMediaError("retrieval_policy_unverifiable"); };
const frameKey = (candidate) => JSON.stringify([candidate.mediaAssetId, candidate.matchedFrameTimestampMs]);

// Read current owned originals once per asset. Images and frames exist only
// for this request; no persistent copy or signed public URL is created.
export function createMediaRetrievalVisualResolver({ repository, media }) {
  if (typeof repository?.getMediaRetrievalVisualSources !== "function" ||
    ["loadOwnedMediaBytes", "normalizeImageForReranking", "extractVideoFramesAtTimestamps"]
      .some(name => typeof media?.[name] !== "function")) {
    throw new TypeError("Retrieval visual resolver dependencies are incomplete.");
  }
  return async ({ userId, indexEpoch, candidates, assertAuthorized }) => {
    if (typeof assertAuthorized !== "function" || !Array.isArray(candidates) ||
      !candidates.length || candidates.length > 20) reject();
    const groups = new Map();
    const seen = new Set();
    for (const candidate of candidates) {
      if (!candidate || !["image", "video"].includes(candidate.kind) ||
        typeof candidate.contentRevisionAt !== "string" ||
        (candidate.kind === "image" ? candidate.matchedFrameTimestampMs !== null :
          !Number.isSafeInteger(candidate.matchedFrameTimestampMs) || candidate.matchedFrameTimestampMs < 0) ||
        seen.has(frameKey(candidate))) reject();
      seen.add(frameKey(candidate));
      if (!groups.has(candidate.mediaAssetId)) groups.set(candidate.mediaAssetId, []);
      groups.get(candidate.mediaAssetId).push(candidate);
    }
    const mediaAssetIds = [...groups.keys()];
    const getSources = async () => {
      await assertAuthorized();
      const sources = await repository.getMediaRetrievalVisualSources({ userId, mediaAssetIds, indexEpoch });
      if (!Array.isArray(sources) || sources.length !== groups.size) reject();
      const byId = new Map();
      for (const asset of sources) {
        if (!groups.has(asset.id) || byId.has(asset.id) || asset.userId !== userId ||
          asset.status !== "uploaded" || !asset.storageKey ||
          !Number.isSafeInteger(asset.byteSize) || asset.byteSize < 1 ||
          groups.get(asset.id).some(candidate => candidate.kind !== asset.kind ||
            candidate.contentRevisionAt !== asset.contentRevisionAt)) reject();
        byId.set(asset.id, asset);
      }
      return byId;
    };
    const snapshot = await getSources();
    const assertCurrent = async () => {
      const current = await getSources();
      for (const [id, asset] of snapshot) {
        if (current.get(id)?.storageKey !== asset.storageKey ||
          current.get(id)?.byteSize !== asset.byteSize ||
          current.get(id)?.mimeType !== asset.mimeType) reject();
      }
    };
    const visuals = new Map();
    for (const [id, asset] of snapshot) {
      await assertCurrent();
      const source = await media.loadOwnedMediaBytes({ asset });
      if (!Buffer.isBuffer(source?.bytes) || source.bytes.length !== asset.byteSize) reject();
      const selected = groups.get(id);
      const frames = asset.kind === "image"
        ? [{ ...source, timestampMs: null }]
        : await media.extractVideoFramesAtTimestamps({
          ...source, timestampsMs: selected.map(candidate => candidate.matchedFrameTimestampMs),
        });
      if (!Array.isArray(frames) || frames.length !== selected.length) reject();
      const timestamps = new Set();
      for (const frame of frames) {
        if (timestamps.has(frame.timestampMs) ||
          !selected.some(candidate => candidate.matchedFrameTimestampMs === frame.timestampMs)) reject();
        timestamps.add(frame.timestampMs);
        const normalized = await media.normalizeImageForReranking(frame);
        if (!Buffer.isBuffer(normalized?.bytes) || !normalized.bytes.length || normalized.mimeType !== "image/webp") reject();
        visuals.set(JSON.stringify([id, frame.timestampMs]), {
          imageUrl: "data:image/webp;base64," + normalized.bytes.toString("base64"),
          imageSha256: crypto.createHash("sha256").update(normalized.bytes).digest("hex"),
        });
      }
    }
    await assertCurrent();
    return {
      candidates: candidates.map(candidate => ({ ...candidate, ...visuals.get(frameKey(candidate)) })),
      assertCurrent,
    };
  };
}
