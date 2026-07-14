import { preprocessFileContent } from "../file-preprocessing-service.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { createUsageEvent, hashRequestIp } from "../repositories.js";
import {
  createFileAsset,
  getFileAssetForUser,
  listFileAssetsForUser,
  updateFileAssetPreprocessing,
} from "../station-repository.js";
import {
  fileAssetParamsSchema,
  limitSchema,
  stationFileAssetSchema,
} from "../schemas.js";

const hour = 60 * 60 * 1000;
const fileAssetCreateLimit = createRateLimitMiddleware({
  action: "station.file_asset.create",
  limit: 60,
  windowMs: hour,
  message: "文件处理请求过于频繁，请稍后再试。",
});
const fileAssetPreprocessLimit = createRateLimitMiddleware({
  action: "station.file_asset.preprocess",
  limit: 60,
  windowMs: hour,
  message: "文件预处理请求过于频繁，请稍后再试。",
});

export function registerStationFileRoutes(app, { authenticate, asyncHandler }) {
  app.get(
    "/api/station/file-assets",
    authenticate,
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      res.json({ data: await listFileAssetsForUser(req.user.id, limit) });
    }),
  );

  app.post(
    "/api/station/file-assets",
    authenticate,
    fileAssetCreateLimit,
    asyncHandler(async (req, res) => {
      const body = stationFileAssetSchema.parse(req.body);
      const preprocessing = preprocessFileContent({
        originalFilename: body.originalFilename,
        mimeType: body.mimeType,
        content: body.content,
      });
      const byteSize = body.byteSize ?? Buffer.byteLength(body.content || "", "utf8");
      const asset = await createFileAsset({
        userId: req.user.id,
        originalFilename: body.originalFilename,
        mimeType: body.mimeType,
        byteSize,
        checksumSha256: preprocessing.checksumSha256,
        storageProvider: body.content ? "inline" : "pending",
        sourceKind: body.content ? "inline_text" : "upload_placeholder",
        status: preprocessing.status,
        preprocessingResult: preprocessing,
        metadata: body.metadata,
      });

      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.file_asset.create",
        targetType: "file_asset",
        targetId: asset.id,
        payload: {
          status: asset.status,
          kind: preprocessing.kind,
          hasInlineContent: Boolean(body.content),
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.status(201).json({ data: asset });
    }),
  );

  app.post(
    "/api/station/file-assets/:fileAssetId/preprocess",
    authenticate,
    fileAssetPreprocessLimit,
    asyncHandler(async (req, res) => {
      const { fileAssetId } = fileAssetParamsSchema.parse(req.params);
      const body = stationFileAssetSchema.partial({ originalFilename: true }).parse(req.body);
      const existing = await getFileAssetForUser({ userId: req.user.id, fileAssetId });
      if (!existing) {
        res.status(404).json({ error: { message: "File asset not found" } });
        return;
      }
      const originalFilename = body.originalFilename || existing.originalFilename;
      const mimeType = body.mimeType || existing.mimeType;
      const preprocessing = preprocessFileContent({
        originalFilename,
        mimeType,
        content: body.content || "",
      });
      const updated = await updateFileAssetPreprocessing({
        userId: req.user.id,
        fileAssetId,
        status: preprocessing.status,
        preprocessingResult: preprocessing,
        checksumSha256: preprocessing.checksumSha256,
      });

      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.file_asset.preprocess",
        targetType: "file_asset",
        targetId: updated.id,
        payload: {
          status: updated.status,
          kind: preprocessing.kind,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: updated });
    }),
  );
}
