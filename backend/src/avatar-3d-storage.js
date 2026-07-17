import path from "node:path";
import sharp from "sharp";
import { HttpError } from "./http-error.js";
import {
  createOssPutSignedUrl,
  deleteOssObject,
  fetchOssObject,
  inspectOssObject,
  putOssObject,
} from "./oss-service.js";

const photoUploadLimit = 10 * 1024 * 1024;
const providerImageLimit = 10 * 1024 * 1024;
const providerGlbLimit = 150 * 1024 * 1024;
const minimumImageSide = 512;
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

const buildAvatarThumbnailObjectKey = ({ userId, jobId, contentType }) =>
  `users/${userId}/avatar-3d/jobs/${jobId}/thumbnail.${imageExtension(contentType)}`;

const buildAvatarStylePreviewObjectKey = ({ userId, jobId, contentType }) =>
  `users/${userId}/avatar-3d/jobs/${jobId}/style-preview.${imageExtension(contentType)}`;

const isJpeg = (buffer) =>
  buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

const isPng = (buffer) =>
  buffer.length >= 8
  && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

const isGlb = (buffer) =>
  buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "glTF";

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

const safeHttpsUrl = (value) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname) throw new Error("HTTPS required");
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
  fetchImpl = fetch,
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
    if (width < minimumImageSide || height < minimumImageSide) {
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
    };
  };

  const downloadProviderResult = async ({ url, limit }) => {
    let response;
    try {
      response = await fetchImpl(safeHttpsUrl(url), {
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

  const persistAvatarProviderResult = async ({
    userId,
    jobId,
    modelUrl,
    thumbnailUrl = "",
  }) => {
    const modelResult = await downloadProviderResult({ url: modelUrl, limit: providerGlbLimit });
    if (!isGlb(modelResult.body)) {
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

    let thumbnail = null;
    if (thumbnailUrl) {
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
      thumbnail = {
        storageKey,
        contentType: normalizedThumbnail.contentType,
        byteSize: normalizedThumbnail.body.length,
      };
    }

    return {
      glb: {
        storageKey: glbStorageKey,
        contentType: "model/gltf-binary",
        byteSize: modelResult.body.length,
      },
      thumbnail,
    };
  };

  const persistAvatarStylePreview = async ({ userId, jobId, imageUrl }) => {
    const result = await downloadProviderResult({ url: imageUrl, limit: providerImageLimit });
    const normalized = await normalizeProviderImage(result.body, "INVALID_STYLE_PREVIEW");
    const storageKey = buildAvatarStylePreviewObjectKey({
      userId,
      jobId,
      contentType: normalized.contentType,
    });
    await putObject({
      objectKey: storageKey,
      body: normalized.body,
      contentType: normalized.contentType,
    });
    return {
      storageKey,
      contentType: normalized.contentType,
      byteSize: normalized.body.length,
      width: normalized.width,
      height: normalized.height,
    };
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
    verifyAndNormalizeAvatarPhoto,
    persistAvatarProviderResult,
    persistAvatarStylePreview,
    streamAvatarObject,
    deleteAvatarObjects,
  };
}

export const avatar3dStorage = createAvatar3dStorage();
