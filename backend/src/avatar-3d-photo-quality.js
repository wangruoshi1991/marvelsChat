import sharp from "sharp";
import { HttpError } from "./http-error.js";

export const avatarPhotoMinimumSide = 240;

const advisoryMinimumSide = 640;
const darkLumaMaximum = 45;
const brightLumaMinimum = 220;
const softFocusVarianceMaximum = 35;
const qualityVersion = "avatar-photo-quality-v1";

const warningMessages = new Map([
  ["low_resolution", "这张照片可以继续使用；补充一张更清晰的正面照片，会更接近本人。"],
  ["soft_focus", "照片清晰度偏低，但仍可继续；清楚展示眼睛、鼻子和嘴部会提升相似度。"],
  ["too_dark", "照片偏暗，但仍可继续；光线均匀的正面照片会保留更多脸部细节。"],
  ["too_bright", "照片偏亮，但仍可继续；避免脸部过曝会保留更多五官细节。"],
]);

const qualityError = (message, code) => new HttpError(422, message, { code });

const rounded = (value) => Math.round(value * 100) / 100;

const grayscaleSignals = async (buffer) => {
  const { data, info } = await sharp(buffer, {
    failOn: "warning",
    limitInputPixels: 80_000_000,
  })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({
      width: 256,
      height: 256,
      fit: "inside",
      withoutEnlargement: true,
    })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const sample = (x, y) => data[(y * width + x) * channels];
  let lumaTotal = 0;
  for (let offset = 0; offset < data.length; offset += channels) {
    lumaTotal += data[offset];
  }
  const meanLuma = lumaTotal / (width * height);

  let laplacianCount = 0;
  let laplacianTotal = 0;
  let laplacianSquaredTotal = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const laplacian = (
        4 * sample(x, y)
        - sample(x - 1, y)
        - sample(x + 1, y)
        - sample(x, y - 1)
        - sample(x, y + 1)
      );
      laplacianCount += 1;
      laplacianTotal += laplacian;
      laplacianSquaredTotal += laplacian * laplacian;
    }
  }
  const laplacianMean = laplacianCount ? laplacianTotal / laplacianCount : 0;
  const laplacianVariance = laplacianCount
    ? laplacianSquaredTotal / laplacianCount - laplacianMean * laplacianMean
    : 0;

  return {
    meanLuma: rounded(meanLuma),
    laplacianVariance: rounded(Math.max(0, laplacianVariance)),
  };
};

export const assessAvatarPhotoQuality = async (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw qualityError("Uploaded photo could not be decoded.", "INVALID_IMAGE_CONTENT");
  }

  let metadata;
  let signals;
  try {
    metadata = await sharp(buffer, {
      failOn: "warning",
      limitInputPixels: 80_000_000,
    }).metadata();
    signals = await grayscaleSignals(buffer);
  } catch {
    throw qualityError("Uploaded photo could not be decoded.", "INVALID_IMAGE_CONTENT");
  }

  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (!width || !height) {
    throw qualityError("Uploaded photo could not be decoded.", "INVALID_IMAGE_CONTENT");
  }
  if (Math.min(width, height) < avatarPhotoMinimumSide) {
    throw qualityError("Uploaded photo resolution is too small.", "PHOTO_RESOLUTION_TOO_SMALL");
  }

  const warningCodes = [];
  if (Math.min(width, height) < advisoryMinimumSide) warningCodes.push("low_resolution");
  if (signals.laplacianVariance < softFocusVarianceMaximum) warningCodes.push("soft_focus");
  if (signals.meanLuma < darkLumaMaximum) warningCodes.push("too_dark");
  if (signals.meanLuma > brightLumaMinimum) warningCodes.push("too_bright");

  return {
    status: warningCodes.length ? "advisory" : "good",
    canContinue: true,
    width,
    height,
    warningCodes,
    metadata: {
      version: qualityVersion,
      warningCodes,
      signals,
    },
  };
};

export const projectAvatarPhotoQuality = ({ qualityStatus, qualityMetadata } = {}) => {
  if (!qualityStatus) return null;
  const warningCodes = Array.isArray(qualityMetadata?.warningCodes)
    ? qualityMetadata.warningCodes
    : [];
  const suggestions = Array.from(new Set(
    warningCodes.map((code) => warningMessages.get(code)).filter(Boolean),
  ));
  return {
    level: qualityStatus === "advisory" ? "advisory" : "good",
    canContinue: true,
    suggestions,
  };
};
