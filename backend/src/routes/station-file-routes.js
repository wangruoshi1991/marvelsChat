import express from 'express';
import { z } from 'zod';
import { parseUploadedText, validateUploadedTextMetadata, maxFileBytes } from '../file-content.js';
import { createUploadedFile, getFileAssetForUser, deleteFileAssetForUser } from '../file-asset-repository.js';
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
  uploadAsset = createUploadedFile, getAsset = getFileAssetForUser, deleteAsset = deleteFileAssetForUser,
}) {
  app.post('/api/station/file-assets/upload', authenticate, fileAssetCreateLimit,
    express.raw({ type: 'application/octet-stream', limit: maxFileBytes, inflate: false }),
    asyncHandler(async (req, res) => {
      let originalFilename;
      try { originalFilename = decodeURIComponent(req.get('X-Miaoxun-Filename') || ''); }
      catch { throw new HttpError(400, '文件名称无效。', { code: 'FILE_NAME_INVALID' }); }
      const mimeType = req.get('X-Miaoxun-File-Mime') || '';
      const idempotencyKey = z.string().uuid().parse(req.get('X-Miaoxun-Idempotency-Key'));
      const parsed = parseUploadedText({ originalFilename, mimeType, bytes: req.body });
      const preprocessingResult = preprocessFileContent({ originalFilename, mimeType, content: parsed.content });
      const result = await uploadAsset({ userId: req.user.id, originalFilename, mimeType, idempotencyKey,
        ...parsed, byteSize: req.body.length, preprocessingResult });
      res.status(result.replayed ? 200 : 201).json({ data: result.asset });
    }));
  app.get('/api/station/file-assets/:fileAssetId', authenticate, asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.fileAssetId);
    const asset = await getAsset(req.user.id, id);
    if (!asset) throw new HttpError(404, '文件不存在或已删除。', { code: 'FILE_NOT_FOUND' });
    res.json({ data: asset });
  }));
  app.delete('/api/station/file-assets/:fileAssetId', authenticate, asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.fileAssetId);
    if (!await deleteAsset(req.user.id, id)) throw new HttpError(404, '文件不存在或已删除。', { code: 'FILE_NOT_FOUND' });
    res.status(204).end();
  }));
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
      validateUploadedTextMetadata({ originalFilename: body.originalFilename, mimeType: body.mimeType });
      const preprocessing = preprocessFileContent({
        originalFilename: body.originalFilename,
        mimeType: body.mimeType,
        content: body.content,
      });
      if (body.content && Buffer.from(body.content, 'utf8').toString('utf8') !== body.content) throw new HttpError(400, '文件文字编码无效。', { code: 'FILE_UTF8_INVALID' });
      const parsedText = body.content ? parseUploadedText({ originalFilename: body.originalFilename,
        mimeType: body.mimeType, bytes: Buffer.from(body.content, 'utf8') }) : null;
      const measuredBytes = Buffer.byteLength(body.content, "utf8");
      if (body.content && body.byteSize != null && body.byteSize !== measuredBytes) {
        throw new HttpError(400, "文件大小与提供的文字不一致。", { code: "FILE_SIZE_MISMATCH" });
      }
      const byteSize = body.content ? measuredBytes : body.byteSize ?? null;
      const asset = await createAsset({
        extractedText: parsedText?.content ?? null, parseVersion: parsedText?.parseVersion ?? null,
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
