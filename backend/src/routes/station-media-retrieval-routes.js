import { config } from "../config.js";
import { ZodError } from "zod";
import { query, withTransaction } from "../db.js";
import { createMediaRetrievalProvider } from "../media-retrieval-provider.js";
import { createMediaRetrievalRepository } from "../media-retrieval-repository.js";
import { buildMediaRetrievalRuntimeStatus } from "../media-retrieval-runtime-status.js";
import {
  createMediaRetrievalUserService,
  MediaRetrievalServiceError,
} from "../media-retrieval-user-service.js";
import {
  mediaRetrievalEnableSchema,
  mediaRetrievalIdempotencyKeySchema,
  mediaRetrievalReindexSchema,
  mediaRetrievalSearchSchema,
} from "../schemas.js";
import { assertMediaRetrievalSearchResponse } from "../../../shared/media-retrieval-public-contract.js";
import {
  isMediaRetrievalPublicError,
  toPublicMediaRetrievalError,
} from "../media-retrieval-errors.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { MEDIA_RETRIEVAL_MINIMUM_APP_BUILD } from "../media-retrieval-constants.js";

const retrievalSearchLimit = createRateLimitMiddleware({
  action: "station.media_retrieval.search",
  limit: 30,
  windowMs: 60 * 1000,
  message: "检索请求过于频繁，请稍后再试。",
});
const retrievalEnableLimit = createRateLimitMiddleware({
  action: "station.media_retrieval.enable",
  limit: 10,
  windowMs: 60 * 60 * 1000,
  message: "检索启用请求过于频繁，请稍后再试。",
});
const retrievalReindexLimit = createRateLimitMiddleware({
  action: "station.media_retrieval.reindex",
  limit: 10,
  windowMs: 60 * 1000,
  message: "检索重建请求过于频繁，请稍后再试。",
});

const requireRetrievalContract = (req, res, next) => {
  const rawBuild = req.get("X-Miaoxun-App-Build");
  const build = /^\d+$/.test(String(rawBuild || "")) ? Number(rawBuild) : 0;
  const contractVersion = req.get("X-Miaoxun-Retrieval-Contract");
  if (build >= MEDIA_RETRIEVAL_MINIMUM_APP_BUILD || contractVersion === "2") {
    next();
    return;
  }
  const error = toPublicMediaRetrievalError(
    new MediaRetrievalServiceError("retrieval_client_update_required"),
  );
  res.status(426).json({ error });
};

const createDefaultService = () =>
  createMediaRetrievalUserService({
    repository: createMediaRetrievalRepository({ query, withTransaction }),
    provider: createMediaRetrievalProvider({ config }),
    getRuntimeStatus: buildMediaRetrievalRuntimeStatus,
  });

const idempotencyKeyFrom = (req) => mediaRetrievalIdempotencyKeySchema.parse(req.get("Idempotency-Key") || "");

const safeMediaRetrievalHandler = (asyncHandler, handler) =>
  asyncHandler(async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      if (error instanceof MediaRetrievalServiceError || isMediaRetrievalPublicError(error)) throw error;
      if (error instanceof ZodError) {
        throw new MediaRetrievalServiceError("retrieval_request_invalid");
      }
      throw new MediaRetrievalServiceError("retrieval_service_unavailable");
    }
  });

export function registerStationMediaRetrievalRoutes(app, { authenticate, asyncHandler, service = createDefaultService() }) {
  app.post(
    "/api/station/media-retrieval/enable",
    authenticate,
    requireRetrievalContract,
    retrievalEnableLimit,
    safeMediaRetrievalHandler(asyncHandler, async (req, res) => {
      const body = mediaRetrievalEnableSchema.parse(req.body);
      const data = await service.enableMediaRetrieval({
        userId: req.user.id,
        consentVersion: body.consentVersion,
        idempotencyKey: idempotencyKeyFrom(req),
      });
      res.status(202).json({ data });
    }),
  );

  app.get(
    "/api/station/media-retrieval/status",
    authenticate,
    requireRetrievalContract,
    safeMediaRetrievalHandler(asyncHandler, async (req, res) => {
      res.json({ data: await service.getMediaRetrievalStatus({ userId: req.user.id }) });
    }),
  );

  app.post(
    "/api/station/media-retrieval/search",
    authenticate,
    requireRetrievalContract,
    retrievalSearchLimit,
    safeMediaRetrievalHandler(asyncHandler, async (req, res) => {
      const body = mediaRetrievalSearchSchema.parse(req.body);
      const data = await service.searchMediaRetrieval({
        userId: req.user.id,
        ...body,
        idempotencyKey: idempotencyKeyFrom(req),
      });
      res.json({ data: assertMediaRetrievalSearchResponse(data) });
    }),
  );

  app.post(
    "/api/station/media-retrieval/reindex",
    authenticate,
    requireRetrievalContract,
    retrievalReindexLimit,
    safeMediaRetrievalHandler(asyncHandler, async (req, res) => {
      const body = mediaRetrievalReindexSchema.parse(req.body);
      const data = await service.requestMediaRetrievalReindex({
        userId: req.user.id,
        scope: body.scope,
        mediaAssetIds: body.mediaAssetIds,
        idempotencyKey: idempotencyKeyFrom(req),
      });
      res.status(202).json({ data });
    }),
  );

  app.delete(
    "/api/station/media-retrieval/index",
    authenticate,
    requireRetrievalContract,
    safeMediaRetrievalHandler(asyncHandler, async (req, res) => {
      const data = await service.deleteMediaRetrievalIndex({
        userId: req.user.id,
        idempotencyKey: idempotencyKeyFrom(req),
      });
      res.status(202).json({ data });
    }),
  );
}
