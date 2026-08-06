import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  assessAvatarPhotoQuality,
  projectAvatarPhotoQuality,
} = await import("../src/avatar-3d-photo-quality.js");

const solidImage = ({ width, height, value }) => sharp({
  create: {
    width,
    height,
    channels: 3,
    background: { r: value, g: value, b: value },
  },
}).jpeg().toBuffer();

const checkerboardImage = async ({ width = 800, height = 800 } = {}) => {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 220 : 35;
      const offset = (y * width + x) * 3;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
};

test("photo quality hard-fails only undecodable images and a side below 240 pixels", async () => {
  await assert.rejects(
    () => assessAvatarPhotoQuality(Buffer.from("not-an-image")),
    (error) => error?.details?.code === "INVALID_IMAGE_CONTENT",
  );

  const tooSmall = await solidImage({ width: 239, height: 800, value: 120 });
  await assert.rejects(
    () => assessAvatarPhotoQuality(tooSmall),
    (error) => error?.details?.code === "PHOTO_RESOLUTION_TOO_SMALL",
  );

  const usable = await solidImage({ width: 240, height: 800, value: 120 });
  const result = await assessAvatarPhotoQuality(usable);
  assert.equal(result.canContinue, true);
  assert.equal(result.width, 240);
  assert.equal(result.height, 800);
});

test("low resolution, soft focus, and exposure are advisory signals", async () => {
  const darkSoftPhoto = await solidImage({ width: 480, height: 720, value: 18 });
  const result = await assessAvatarPhotoQuality(darkSoftPhoto);

  assert.equal(result.status, "advisory");
  assert.equal(result.canContinue, true);
  assert.deepEqual(result.warningCodes, ["low_resolution", "soft_focus", "too_dark"]);
  assert.equal(typeof result.metadata.signals.meanLuma, "number");
  assert.equal(typeof result.metadata.signals.laplacianVariance, "number");
});

test("a sufficiently detailed, evenly exposed photo receives no warning", async () => {
  const detailedPhoto = await checkerboardImage();
  const result = await assessAvatarPhotoQuality(detailedPhoto);

  assert.equal(result.status, "good");
  assert.equal(result.canContinue, true);
  assert.deepEqual(result.warningCodes, []);
});

test("public quality projection contains product advice but no internal signals", () => {
  const projection = projectAvatarPhotoQuality({
    qualityStatus: "advisory",
    qualityMetadata: {
      version: "avatar-photo-quality-v1",
      warningCodes: ["soft_focus", "too_bright", "unknown-internal-code"],
      signals: { meanLuma: 248.2, laplacianVariance: 1.25 },
    },
  });

  assert.equal(projection.level, "advisory");
  assert.equal(projection.canContinue, true);
  assert.equal(projection.suggestions.length, 2);
  assert.match(projection.suggestions[0], /仍可继续/);
  assert.equal(JSON.stringify(projection).includes("meanLuma"), false);
  assert.equal(JSON.stringify(projection).includes("laplacianVariance"), false);
  assert.equal(JSON.stringify(projection).includes("unknown-internal-code"), false);
});
