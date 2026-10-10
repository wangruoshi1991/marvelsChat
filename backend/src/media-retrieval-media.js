import crypto from "crypto";
import { spawn as defaultSpawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { MEDIA_RETRIEVAL_LIMITS } from "./media-retrieval-constants.js";

export class MediaRetrievalMediaError extends Error {
  constructor(code, message = "Media retrieval could not process this asset.", { cleanupObjectKey = null } = {}) {
    super(message);
    this.name = "MediaRetrievalMediaError";
    this.code = code;
    this.cleanupObjectKey = cleanupObjectKey;
  }
}

const asBuffer = (value) => (Buffer.isBuffer(value) ? value : Buffer.from(value));

const sourceLimitFor = (kind) =>
  kind === "video"
    ? MEDIA_RETRIEVAL_LIMITS.sourceVideoMaxBytes
    : MEDIA_RETRIEVAL_LIMITS.sourceImageMaxBytes;

const runProcess = ({ command, args, spawnImpl = defaultSpawn, timeoutMs = MEDIA_RETRIEVAL_LIMITS.mediaToolTimeoutMs }) =>
  new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      reject(new MediaRetrievalMediaError("retrieval_service_unavailable"));
      return;
    }
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new MediaRetrievalMediaError("retrieval_service_unavailable"));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", () => {
      clearTimeout(timer);
      reject(new MediaRetrievalMediaError("retrieval_service_unavailable"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new MediaRetrievalMediaError("asset_not_indexable"));
      }
    });
  });

export async function loadOwnedMediaBytes({ asset, fetchOssObject }) {
  if (
    !asset?.userId ||
    asset.status !== "uploaded" ||
    asset.deletedAt ||
    asset.deleted_at ||
    !asset.storageKey ||
    !["image", "video"].includes(asset.kind) ||
    typeof fetchOssObject !== "function"
  ) {
    throw new MediaRetrievalMediaError("asset_not_indexable");
  }
  try {
    const response = await fetchOssObject({ objectKey: asset.storageKey });
    if (typeof response?.body?.getReader !== "function") throw new MediaRetrievalMediaError("asset_not_indexable");
    const maximum = sourceLimitFor(asset.kind);
    const declaredLength = response.headers?.get?.("content-length");
    if (/^\d+$/u.test(declaredLength || "") && Number(declaredLength) > maximum) {
      await response.body.cancel();
      throw new MediaRetrievalMediaError("asset_not_indexable");
    }
    const reader = response.body.getReader();
    const chunks = [];
    let byteLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        byteLength += value.byteLength;
        if (byteLength > maximum) {
          await reader.cancel();
          throw new MediaRetrievalMediaError("asset_not_indexable");
        }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    if (!byteLength) throw new MediaRetrievalMediaError("asset_not_indexable");
    const bytes = Buffer.concat(chunks, byteLength);
    return {
      bytes,
      mimeType: String(asset.mimeType || "application/octet-stream").split(";", 1)[0].toLowerCase(),
    };
  } catch (error) {
    if (error instanceof MediaRetrievalMediaError) throw error;
    throw new MediaRetrievalMediaError("asset_not_indexable");
  }
}

export async function normalizeImageForProvider({ bytes }) {
  const source = asBuffer(bytes);
  if (!source.length || source.length > MEDIA_RETRIEVAL_LIMITS.sourceImageMaxBytes) {
    throw new MediaRetrievalMediaError("asset_not_indexable");
  }
  try {
    const input = sharp(source, { limitInputPixels: MEDIA_RETRIEVAL_LIMITS.decodedImageMaxPixels }).rotate();
    const metadata = await input.metadata();
    if (!metadata.width || !metadata.height) throw new MediaRetrievalMediaError("asset_not_indexable");
    for (const quality of [88, 78, 68, 58]) {
      const normalized = await input
        .clone()
        .resize({
          width: MEDIA_RETRIEVAL_LIMITS.normalizedImageLongestEdge,
          height: MEDIA_RETRIEVAL_LIMITS.normalizedImageLongestEdge,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality })
        .toBuffer();
      if (normalized.length <= MEDIA_RETRIEVAL_LIMITS.normalizedImageMaxBytes) {
        return { bytes: normalized, mimeType: "image/webp" };
      }
    }
  } catch (error) {
    if (error instanceof MediaRetrievalMediaError) throw error;
    throw new MediaRetrievalMediaError("asset_not_indexable");
  }
  throw new MediaRetrievalMediaError("asset_not_indexable");
}

export const selectRepresentativeFrameTimestamps = ({ durationSeconds, maxFrames = MEDIA_RETRIEVAL_LIMITS.maxVideoFrames }) => {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0 || duration > MEDIA_RETRIEVAL_LIMITS.videoMaxDurationSeconds) {
    throw new MediaRetrievalMediaError("asset_not_indexable");
  }
  const count = Math.min(MEDIA_RETRIEVAL_LIMITS.maxVideoFrames, Math.max(1, Math.trunc(maxFrames)));
  if (count === 1) return [0];
  return Array.from({ length: count }, (_, index) => Number(((duration * index) / count).toFixed(3)));
};

const parseDurationSeconds = (stdout) => {
  const duration = Number(String(stdout || "").trim());
  if (!Number.isFinite(duration) || duration <= 0 || duration > MEDIA_RETRIEVAL_LIMITS.videoMaxDurationSeconds) {
    throw new MediaRetrievalMediaError("asset_not_indexable");
  }
  return duration;
};

async function extractVideoFrames({
  bytes,
  mimeType,
  timestampsForDuration,
  spawnImpl = defaultSpawn,
  fsImpl = fs,
  temporaryDirectory = os.tmpdir(),
}) {
  const source = asBuffer(bytes);
  if (!source.length || source.length > MEDIA_RETRIEVAL_LIMITS.sourceVideoMaxBytes) {
    throw new MediaRetrievalMediaError("asset_not_indexable");
  }
  const directory = await fsImpl.mkdtemp(path.join(temporaryDirectory, "media-retrieval-"));
  const extension = String(mimeType || "").includes("quicktime") ? "mov" : "mp4";
  const sourcePath = path.join(directory, `source.${extension}`);
  try {
    await fsImpl.writeFile(sourcePath, source);
    const probe = await runProcess({
      command: "ffprobe",
      args: ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", sourcePath],
      spawnImpl,
    });
    const timestamps = timestampsForDuration(parseDurationSeconds(probe.stdout));
    const frames = [];
    for (const [index, timestamp] of timestamps.entries()) {
      const framePath = path.join(directory, `frame-${index}.webp`);
      await runProcess({
          command: "ffmpeg",
          args: [
            "-v",
            "error",
            "-ss",
            String(timestamp),
            "-i",
            sourcePath,
            "-frames:v",
            "1",
            "-vf",
            "scale='min(3072,iw)':-2",
            "-y",
            framePath,
          ],
          spawnImpl,
      });
      const frameBytes = await fsImpl.readFile(framePath);
      if (!frameBytes.length) throw new MediaRetrievalMediaError("asset_not_indexable");
      frames.push({ bytes: frameBytes, mimeType: "image/webp", timestampMs: Math.round(timestamp * 1000) });
    }
    if (!frames.length) throw new MediaRetrievalMediaError("asset_not_indexable");
    return frames;
  } finally {
    await fsImpl.rm(directory, { recursive: true, force: true });
  }
}

export const extractRepresentativeFrames = (input) => extractVideoFrames({
  ...input,
  timestampsForDuration: durationSeconds => selectRepresentativeFrameTimestamps({ durationSeconds, maxFrames: input.maxFrames }),
});

export const extractVideoFramesAtTimestamps = (input) => extractVideoFrames({
  ...input,
  timestampsForDuration: duration => {
    const timestamps = input.timestampsMs;
    if (!Array.isArray(timestamps) || !timestamps.length || timestamps.length > MEDIA_RETRIEVAL_LIMITS.maxVideoFrames ||
      new Set(timestamps).size !== timestamps.length || timestamps.some(value => !Number.isSafeInteger(value) || value < 0 || value >= duration * 1000)) {
      throw new MediaRetrievalMediaError("asset_not_indexable");
    }
    return timestamps.map(value => value / 1000);
  },
});

export async function normalizeImageForReranking({ bytes }) {
  const source = asBuffer(bytes);
  if (!source.length || source.length > MEDIA_RETRIEVAL_LIMITS.sourceImageMaxBytes) throw new MediaRetrievalMediaError("asset_not_indexable");
  try {
    const normalized = await sharp(source, { limitInputPixels: MEDIA_RETRIEVAL_LIMITS.decodedImageMaxPixels }).rotate()
      .resize({ width: MEDIA_RETRIEVAL_LIMITS.rerankImageLongestEdge, height: MEDIA_RETRIEVAL_LIMITS.rerankImageLongestEdge, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer();
    if (!normalized.length || normalized.length > MEDIA_RETRIEVAL_LIMITS.rerankImageMaxBytes) throw new MediaRetrievalMediaError("asset_not_indexable");
    return { bytes: normalized, mimeType: "image/webp" };
  } catch (error) {
    if (error instanceof MediaRetrievalMediaError) throw error;
    throw new MediaRetrievalMediaError("asset_not_indexable");
  }
}

export async function createEphemeralProviderUrl({
  userId,
  traceId,
  bytes,
  mimeType,
  ttlSeconds = MEDIA_RETRIEVAL_LIMITS.signedUrlMaxTtlSeconds,
  putPrivateObject,
  createGetSignedUrl,
  deleteObject,
}) {
  if (
    !/^[a-f0-9]{32}$/i.test(String(traceId || "")) ||
    !String(userId || "").trim() ||
    typeof putPrivateObject !== "function" ||
    typeof createGetSignedUrl !== "function" ||
    typeof deleteObject !== "function"
  ) {
    throw new MediaRetrievalMediaError("retrieval_provider_transport_unavailable");
  }
  const safeMimeType = String(mimeType || "").toLowerCase();
  if (!safeMimeType.startsWith("image/")) {
    throw new MediaRetrievalMediaError("retrieval_provider_transport_unavailable");
  }
  const key = `users/${userId}/media-retrieval-tmp/${traceId}/${crypto.randomUUID()}.webp`;
  let uploaded = false;
  try {
    await putPrivateObject({ key, bytes: asBuffer(bytes), contentType: safeMimeType });
    uploaded = true;
    const url = createGetSignedUrl({
      objectKey: key,
      ttlSeconds: Math.min(MEDIA_RETRIEVAL_LIMITS.signedUrlMaxTtlSeconds, Math.max(1, Number(ttlSeconds) || 1)),
    });
    if (!/^https:\/\//i.test(String(url || ""))) {
      throw new MediaRetrievalMediaError("retrieval_provider_transport_unavailable");
    }
    let cleaned = false;
    return {
      url,
      objectKey: key,
      cleanup: async () => {
        if (cleaned) return;
        try {
          await deleteObject({ objectKey: key });
        } catch {
          throw new MediaRetrievalMediaError(
            "retrieval_temporary_cleanup_pending",
            "Temporary media cleanup requires a retry.",
            { cleanupObjectKey: key },
          );
        }
        cleaned = true;
      },
    };
  } catch (error) {
    if (uploaded) {
      try {
        await deleteObject({ objectKey: key });
      } catch {
        throw new MediaRetrievalMediaError(
          "retrieval_temporary_cleanup_pending",
          "Temporary media cleanup requires a retry.",
          { cleanupObjectKey: key },
        );
      }
    }
    if (error instanceof MediaRetrievalMediaError) throw error;
    throw new MediaRetrievalMediaError("retrieval_provider_transport_unavailable");
  }
}
