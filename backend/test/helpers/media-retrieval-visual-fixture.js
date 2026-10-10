import crypto from "node:crypto";
import sharp from "sharp";

const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#abcdef" } }).webp().toBuffer();
export const visualFixture = {
  imageUrl: "data:image/webp;base64," + bytes.toString("base64"),
  imageSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
};
export const resolveCalibrationImage = async () => ({ imageUrl: visualFixture.imageUrl, sha256: visualFixture.imageSha256 });
export const resolveTestCandidateVisuals = async ({ candidates, assertAuthorized }) => {
  await assertAuthorized();
  return { candidates: candidates.map(candidate => ({ ...candidate, ...visualFixture })), assertCurrent: assertAuthorized };
};
