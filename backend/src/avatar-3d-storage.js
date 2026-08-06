import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";
import path from "node:path";
import sharp from "sharp";
import { optimizeAvatarGlbForMobile } from "./avatar-3d-mobile-optimizer.js";
import {
  assessAvatarPhotoQuality,
  avatarPhotoMinimumSide,
} from "./avatar-3d-photo-quality.js";
import { HttpError } from "./http-error.js";
import {
  createOssPutSignedUrl,
  createOssGetSignedUrl,
  deleteOssObject,
  fetchOssObject,
  inspectOssObject,
  putOssObject,
} from "./oss-service.js";

const photoUploadLimit = 10 * 1024 * 1024;
const providerImageLimit = 10 * 1024 * 1024;
const providerGlbLimit = 150 * 1024 * 1024;
const maximumImageSide = 4096;

const imageExtension = (mimeType) => mimeType === "image/png" ? "png" : "jpg";

const assertAvatarObjectKey = (objectKey) => {
  if (!/^users\/[a-zA-Z0-9-]+\/avatar-3d\//.test(String(objectKey || ""))) {
    throw new HttpError(400, "Invalid avatar storage key.");
  }
};

export const buildAvatarPhotoObjectKey = ({ userId, photoId, mimeType }) =>
  `users/${userId}/avatar-3d/photos/${photoId}/source.${imageExtension(mimeType)}`;

export const buildAvatarNormalizedPhotoObjectKey = ({ userId, photoId }) =>
  `users/${userId}/avatar-3d/photos/${photoId}/normalized.jpg`;

const buildAvatarModelObjectKey = ({ userId, jobId }) =>
  `users/${userId}/avatar-3d/jobs/${jobId}/model.glb`;

const buildAvatarMobileModelObjectKey = ({ userId, jobId }) =>
  `users/${userId}/avatar-3d/jobs/${jobId}/model-mobile.glb`;

const buildAvatarThumbnailObjectKey = ({ userId, jobId, contentType }) =>
  `users/${userId}/avatar-3d/jobs/${jobId}/thumbnail.${imageExtension(contentType)}`;

const buildAvatarReferenceImageObjectKey = ({ userId, jobId, view }) =>
  `users/${userId}/avatar-3d/jobs/${jobId}/references/${view}.jpg`;

const isJpeg = (buffer) =>
  buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

const isPng = (buffer) =>
  buffer.length >= 8
  && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

export const validateSelfContainedGlb = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) return false;
  if (buffer.subarray(0, 4).toString("ascii") !== "glTF") return false;
  if (buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) return false;

  let offset = 12;
  let document;
  let chunkIndex = 0;
  try {
    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) return false;
      const chunkLength = buffer.readUInt32LE(offset);
      const chunkType = buffer.readUInt32LE(offset + 4);
      const chunkStart = offset + 8;
      const chunkEnd = chunkStart + chunkLength;
      if (chunkLength === 0 || chunkLength % 4 !== 0 || chunkEnd > buffer.length) return false;
      if (chunkIndex === 0) {
        if (chunkType !== 0x4e4f534a) return false;
        const json = buffer.subarray(chunkStart, chunkEnd).toString("utf8").trim();
        document = JSON.parse(json);
      }
      offset = chunkEnd;
      chunkIndex += 1;
    }
  } catch {
    return false;
  }

  if (offset !== buffer.length || document?.asset?.version !== "2.0") return false;
  const pending = [document];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    for (const [key, child] of Object.entries(value)) {
      if (key === "uri") {
        if (typeof child !== "string" || !/^data:/i.test(child)) return false;
      } else if (child && typeof child === "object") {
        pending.push(child);
      }
    }
  }
  return true;
};

const detectedImageType = (buffer) => {
  if (isJpeg(buffer)) return "image/jpeg";
  if (isPng(buffer)) return "image/png";
  return "";
};

const normalizeProviderImage = async (buffer, errorCode) => {
  try {
    const body = await sharp(buffer, { failOn: "warning", limitInputPixels: 80_000_000 })
      .rotate()
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
      .toBuffer();
    const metadata = await sharp(body).metadata();
    return {
      body,
      contentType: "image/jpeg",
      width: Number(metadata.width || 0),
      height: Number(metadata.height || 0),
    };
  } catch {
    throw new HttpError(502, "Generation result could not be stored.", { code: errorCode });
  }
};

const isPrivateIpv4 = (address) => {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return true;
  const [first, second] = octets;
  return first === 0
    || first === 10
    || first === 127
    || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && [0, 168].includes(second))
    || (first === 198 && [18, 19].includes(second));
};

const isPrivateIp = (value) => {
  const address = String(value || "").toLowerCase();
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family !== 6) return true;
  if (address.startsWith("::ffff:")) return isPrivateIpv4(address.slice(7));
  return address === "::" || address === "::1"
    || address.startsWith("fc") || address.startsWith("fd")
    || /^fe[89ab]/.test(address) || address.startsWith("ff");
};

const safeHttpsUrl = async (value, lookupHost) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname) throw new Error("HTTPS required");
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
      throw new Error("Local hostname rejected");
    }
    const resolved = await lookupHost(hostname, { all: true, verbatim: true });
    const addresses = Array.isArray(resolved) ? resolved : [resolved];
    if (!addresses.length || addresses.some((entry) => isPrivateIp(entry?.address))) {
      throw new Error("Private network rejected");
    }
    return url.toString();
  } catch {
    throw new HttpError(502, "Generation result could not be stored.", {
      code: "INVALID_PROVIDER_RESULT_URL",
    });
  }
};

const readBoundedResponse = async (response, limit) => {
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limit) {
    throw new HttpError(502, "Generation result could not be stored.", {
      code: "PROVIDER_RESULT_TOO_LARGE",
    });
  }

  if (response.body && Symbol.asyncIterator in response.body) {
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk);
      total += buffer.length;
      if (total > limit) {
        throw new HttpError(502, "Generation result could not be stored.", {
          code: "PROVIDER_RESULT_TOO_LARGE",
        });
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks, total);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > limit) {
    throw new HttpError(502, "Generation result could not be stored.", {
      code: "PROVIDER_RESULT_TOO_LARGE",
    });
  }
  return buffer;
};

export const isValidSingleRange = (value) => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(value || "").trim());
  if (!match || (!match[1] && !match[2])) return false;
  if (match[1] && match[2] && Number(match[1]) > Number(match[2])) return false;
  return true;
};

export function createAvatar3dStorage({
  inspectObject = inspectOssObject,
  fetchObject = fetchOssObject,
  putObject = putOssObject,
  deleteObject = deleteOssObject,
  createUploadUrl = createOssPutSignedUrl,
  optimizeMobileModel = optimizeAvatarGlbForMobile,
  fetchImpl = fetch,
  lookupHost = dnsLookup,
} = {}) {
  const prepareAvatarPhotoUpload = ({ userId, photoId, originalFilename, mimeType, byteSize }) => {
    const objectKey = buildAvatarPhotoObjectKey({ userId, photoId, originalFilename, mimeType });
    const signed = createUploadUrl({ objectKey, contentType: mimeType });
    return {
      photoId,
      objectKey,
      originalFilename: path.basename(String(originalFilename || "upload")),
      mimeType,
      byteSize,
      upload: {
        method: signed.method,
        url: signed.url,
        headers: signed.headers,
        expiresAt: signed.expiresAt,
      },
    };
  };

  const createProviderReadUrl = ({ objectKey }) => {
    assertAvatarObjectKey(objectKey);
    return createOssGetSignedUrl({ objectKey });
  };

  const verifyAndNormalizeAvatarPhoto = async ({
    sourceStorageKey,
    normalizedStorageKey,
    expectedMimeType,
    expectedByteSize,
  }) => {
    assertAvatarObjectKey(sourceStorageKey);
    assertAvatarObjectKey(normalizedStorageKey);
    const inspected = await inspectObject({ objectKey: sourceStorageKey });
    if (
      inspected.contentType !== expectedMimeType
      || inspected.contentLength !== expectedByteSize
      || expectedByteSize > photoUploadLimit
    ) {
      throw new HttpError(409, "Uploaded photo did not match the request.", {
        code: "PHOTO_UPLOAD_MISMATCH",
      });
    }

    const response = await fetchObject({ objectKey: sourceStorageKey });
    const source = await readBoundedResponse(response, photoUploadLimit);
    if (source.length !== expectedByteSize || detectedImageType(source) !== expectedMimeType) {
      throw new HttpError(422, "Uploaded photo is not a supported image.", {
        code: "INVALID_IMAGE_CONTENT",
      });
    }

    let metadata;
    try {
      metadata = await sharp(source, { failOn: "warning", limitInputPixels: 80_000_000 }).metadata();
    } catch {
      throw new HttpError(422, "Uploaded photo could not be decoded.", {
        code: "INVALID_IMAGE_CONTENT",
      });
    }
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    if (width < avatarPhotoMinimumSide || height < avatarPhotoMinimumSide) {
      throw new HttpError(422, "Uploaded photo resolution is too small.", {
        code: "PHOTO_RESOLUTION_TOO_SMALL",
      });
    }

    const pipeline = sharp(source, { failOn: "warning", limitInputPixels: 80_000_000 })
      .rotate()
      .resize({
        width: maximumImageSide,
        height: maximumImageSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" });
    const normalized = await pipeline.toBuffer();
    const normalizedMetadata = await sharp(normalized).metadata();
    const quality = await assessAvatarPhotoQuality(normalized);
    await putObject({
      objectKey: normalizedStorageKey,
      body: normalized,
      contentType: "image/jpeg",
    });
    return {
      storageKey: normalizedStorageKey,
      contentType: "image/jpeg",
      byteSize: normalized.length,
      width: Number(normalizedMetadata.width || 0),
      height: Number(normalizedMetadata.height || 0),
      quality,
    };
  };

  const downloadProviderResult = async ({ url, limit }) => {
    let response;
    try {
      response = await fetchImpl(await safeHttpsUrl(url, lookupHost), {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(60000),
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, "Generation result could not be stored.", {
        code: "PROVIDER_RESULT_DOWNLOAD_FAILED",
      });
    }
    if (!response.ok) {
      throw new HttpError(502, "Generation result could not be stored.", {
        code: "PROVIDER_RESULT_DOWNLOAD_FAILED",
      });
    }
    return {
      body: await readBoundedResponse(response, limit),
      contentType: (response.headers?.get?.("content-type") || "application/octet-stream")
        .split(";", 1)[0]
        .trim()
        .toLowerCase(),
    };
  };

  const persistAvatarMobileModel = async ({ userId, jobId, source }) => {
    if (!validateSelfContainedGlb(source)) {
      throw new HttpError(502, "Generation result could not be stored.", {
        code: "INVALID_GLB_RESULT",
      });
    }
    const optimized = await optimizeMobileModel(source);
    const body = Buffer.isBuffer(optimized) ? optimized : optimized?.body;
    if (!validateSelfContainedGlb(body)) {
      throw new HttpError(502, "Avatar model could not be prepared for the App.", {
        code: "MOBILE_MODEL_OPTIMIZATION_FAILED",
      });
    }
    const storageKey = buildAvatarMobileModelObjectKey({ userId, jobId });
    await putObject({
      objectKey: storageKey,
      body,
      contentType: "model/gltf-binary",
    });
    return {
      storageKey,
      contentType: "model/gltf-binary",
      byteSize: body.length,
      metrics: optimized?.metrics || {},
    };
  };

  const persistAvatarProviderModel = async ({ userId, jobId, modelUrl }) => {
    const modelResult = await downloadProviderResult({ url: modelUrl, limit: providerGlbLimit });
    if (!validateSelfContainedGlb(modelResult.body)) {
      throw new HttpError(502, "Generation result could not be stored.", {
        code: "INVALID_GLB_RESULT",
      });
    }
    const glbStorageKey = buildAvatarModelObjectKey({ userId, jobId });
    await putObject({
      objectKey: glbStorageKey,
      body: modelResult.body,
      contentType: "model/gltf-binary",
    });
    const mobile = await persistAvatarMobileModel({
      userId,
      jobId,
      source: modelResult.body,
    });
    return {
      storageKey: glbStorageKey,
      contentType: "model/gltf-binary",
      byteSize: modelResult.body.length,
      mobile,
    };
  };

  const persistAvatarProviderThumbnail = async ({ userId, jobId, thumbnailUrl }) => {
    if (!thumbnailUrl) return null;
    const thumbnailResult = await downloadProviderResult({
      url: thumbnailUrl,
      limit: providerImageLimit,
    });
    const normalizedThumbnail = await normalizeProviderImage(
      thumbnailResult.body,
      "INVALID_THUMBNAIL_RESULT",
    );
    const storageKey = buildAvatarThumbnailObjectKey({
      userId,
      jobId,
      contentType: normalizedThumbnail.contentType,
    });
    await putObject({
      objectKey: storageKey,
      body: normalizedThumbnail.body,
      contentType: normalizedThumbnail.contentType,
    });
    return {
      storageKey,
      contentType: normalizedThumbnail.contentType,
      byteSize: normalizedThumbnail.body.length,
      width: normalizedThumbnail.width,
      height: normalizedThumbnail.height,
    };
  };

  const persistAvatarReferenceImages = async ({
    userId,
    jobId,
    referenceSetId,
    imageUrls,
  }) => {
    const views = ["front", "left", "back", "right"];
    if (!Array.isArray(imageUrls) || imageUrls.length !== views.length || !referenceSetId) {
      throw new HttpError(409, "Avatar reference set is incomplete.", {
        code: "REFERENCE_SET_INCOMPLETE",
      });
    }

    const stored = [];
    try {
      for (let sequenceIndex = 0; sequenceIndex < views.length; sequenceIndex += 1) {
        const view = views[sequenceIndex];
        const result = await downloadProviderResult({
          url: imageUrls[sequenceIndex],
          limit: providerImageLimit,
        });
        const normalized = await normalizeProviderImage(result.body, "INVALID_REFERENCE_IMAGE");
        const storageKey = buildAvatarReferenceImageObjectKey({ userId, jobId, view });
        assertAvatarObjectKey(storageKey);
        await putObject({
          objectKey: storageKey,
          body: normalized.body,
          contentType: normalized.contentType,
        });
        stored.push({
          view,
          sequenceIndex,
          storageKey,
          contentType: normalized.contentType,
          byteSize: normalized.body.length,
          width: normalized.width,
          height: normalized.height,
        });
      }
      return stored;
    } catch (error) {
      for (const image of stored) {
        try {
          await deleteObject({ objectKey: image.storageKey });
        } catch {
          // Cleanup is retried by the job runner using deterministic object keys.
        }
      }
      throw error;
    }
  };

  const streamAvatarObject = async ({ objectKey, range = "" }) => {
    assertAvatarObjectKey(objectKey);
    if (range && !isValidSingleRange(range)) {
      throw new HttpError(416, "Requested byte range is invalid.");
    }
    return fetchObject({ objectKey, range });
  };

  const deleteAvatarObjects = async (objectKeys) => {
    for (const objectKey of Array.from(new Set(objectKeys.filter(Boolean)))) {
      assertAvatarObjectKey(objectKey);
      await deleteObject({ objectKey });
    }
    return { deleted: true };
  };

  return {
    prepareAvatarPhotoUpload,
    createProviderReadUrl,
    verifyAndNormalizeAvatarPhoto,
    persistAvatarProviderModel,
    persistAvatarMobileModel,
    persistAvatarProviderThumbnail,
    persistAvatarReferenceImages,
    streamAvatarObject,
    deleteAvatarObjects,
  };
}

export const avatar3dStorage = createAvatar3dStorage();
