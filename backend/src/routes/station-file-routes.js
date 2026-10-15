import { preprocessFileContent } from "../file-preprocessing-service.js";
import { HttpError } from "../http-error.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { createUsageEvent, hashRequestIp } from "../repositories.js";
import {
  createFileAsset,
  listFileAssetsForUser,
} from "../station-repository.js";
import {
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
export function registerStationFileRoutes(app, {
  authenticate, asyncHandler,
  createAsset = createFileAsset,
  listAssets = listFileAssetsForUser,
  recordUsage = createUsageEvent,
}) {
  app.get(
    "/api/station/file-assets",
    authenticate,
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      res.json({ data: await listAssets(req.user.id, limit) });
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
      const measuredBytes = Buffer.byteLength(body.content, "utf8");
      if (body.content && body.byteSize != null && body.byteSize !== measuredBytes) {
        throw new HttpError(400, "文件大小与提供的文字不一致。", { code: "FILE_SIZE_MISMATCH" });
      }
      const byteSize = body.content ? measuredBytes : body.byteSize ?? null;
      const asset = await createAsset({
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

      await recordUsage({
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
}
