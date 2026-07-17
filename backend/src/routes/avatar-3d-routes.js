import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { avatar3dLifecycleService } from "../avatar-3d-lifecycle-service.js";
import {
  authenticateAvatarWeb,
  clearAvatarWebSession,
  createAvatarWebSession,
  getAvatarCsrfToken,
  requireAvatarCsrf,
  requireAvatarHttps,
} from "../avatar-3d-session.js";
import { HttpError } from "../http-error.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { createUsageEvent, hashRequestIp } from "../repositories.js";
import {
  avatar3dCreateJobSchema,
  avatar3dIdempotencySchema,
  avatar3dJobParamsSchema,
  avatar3dModelParamsSchema,
  avatar3dPhotoCompleteSchema,
  avatar3dPhotoParamsSchema,
  avatar3dPhotoUploadSchema,
  avatar3dSessionSchema,
  avatar3dStyleConfirmSchema,
  limitSchema,
} from "../schemas.js";

const hour = 60 * 60 * 1000;
const day = 24 * hour;

const loginLimit = createRateLimitMiddleware({
  action: "avatar3d.session.create",
  limit: 12,
  windowMs: 5 * 60 * 1000,
  message: "登录尝试过于频繁，请稍后再试。",
  keyGenerator: (req) => {
    const identifier = String(req.body?.identifier || req.body?.email || "")
      .trim()
      .toLowerCase();
    return `${req.ip || "anonymous"}:${identifier}`;
  },
});

const photoMutationLimit = createRateLimitMiddleware({
  action: "avatar3d.photo.mutate",
  limit: 30,
  windowMs: hour,
  message: "照片操作过于频繁，请稍后再试。",
});

const jobCreateLimit = createRateLimitMiddleware({
  action: "avatar3d.job.create",
  limit: 6,
  windowMs: day,
  message: "生成请求过于频繁，请明天再试。",
});

const defaultSessionService = {
  createAvatarWebSession,
  clearAvatarWebSession,
  getAvatarCsrfToken,
};

const noStore = (res) => res.set("Cache-Control", "private, no-store");

const setSessionCookies = (res, cookies) => {
  res.setHeader("Set-Cookie", cookies);
};

const streamPrivateObject = async (res, resource) => {
  const response = resource?.response;
  if (!response?.body) throw new HttpError(502, "Private storage returned an empty response.");

  res.status(response.status);
  for (const header of ["accept-ranges", "content-length", "content-range", "content-type"]) {
    const value = response.headers?.get?.(header);
    if (value) res.setHeader(header, value);
  }
  if (!response.headers?.get?.("content-type") && resource.contentType) {
    res.setHeader("content-type", resource.contentType);
  }
  res.setHeader("cache-control", "private, no-store");
  res.setHeader("x-content-type-options", "nosniff");

  try {
    await pipeline(Readable.fromWeb(response.body), res);
  } catch (error) {
    if (!res.destroyed) res.destroy(error);
  }
};

export function registerAvatar3dRoutes(app, {
  asyncHandler,
  authenticate = authenticateAvatarWeb,
  requireCsrf = requireAvatarCsrf,
  requireHttps = requireAvatarHttps,
  sessionService = defaultSessionService,
  service = avatar3dLifecycleService,
  recordUsageEvent = createUsageEvent,
} = {}) {
  const recordUsage = (req, eventType, targetType, targetId, payload = {}) =>
    recordUsageEvent({
      userId: req.user.id,
      eventType,
      targetType,
      targetId,
      payload,
      ipHash: hashRequestIp(req.ip),
      userAgent: req.get("user-agent") || "",
    });

  app.post(
    "/api/avatar-3d/session",
    requireHttps,
    loginLimit,
    asyncHandler(async (req, res) => {
      const body = avatar3dSessionSchema.parse(req.body);
      const result = await sessionService.createAvatarWebSession(body);
      setSessionCookies(res, result.cookies);
      noStore(res);
      res.json({ data: { user: result.user, csrfToken: result.csrfToken } });
    }),
  );

  app.delete(
    "/api/avatar-3d/session",
    authenticate,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const result = await sessionService.clearAvatarWebSession({ sessionId: req.sessionId });
      setSessionCookies(res, result.cookies);
      noStore(res);
      res.status(204).send();
    }),
  );

  app.get(
    "/api/avatar-3d/bootstrap",
    authenticate,
    asyncHandler(async (req, res) => {
      const data = await service.getBootstrap({ user: req.user });
      noStore(res);
      res.json({
        data: {
          ...data,
          csrfToken: sessionService.getAvatarCsrfToken(req),
        },
      });
    }),
  );

  app.post(
    "/api/avatar-3d/photos",
    authenticate,
    requireCsrf,
    photoMutationLimit,
    asyncHandler(async (req, res) => {
      const body = avatar3dPhotoUploadSchema.parse(req.body);
      const data = await service.preparePhotoUpload({ user: req.user, body });
      await recordUsage(req, "avatar3d.photo.prepare", "avatar_3d_photo", data.photo.id, {
        mimeType: data.photo.mimeType,
        byteSize: data.photo.byteSize,
      });
      noStore(res);
      res.status(201).json({ data });
    }),
  );

  app.post(
    "/api/avatar-3d/photos/:photoId/complete",
    authenticate,
    requireCsrf,
    photoMutationLimit,
    asyncHandler(async (req, res) => {
      const { photoId } = avatar3dPhotoParamsSchema.parse(req.params);
      avatar3dPhotoCompleteSchema.parse(req.body || {});
      const photo = await service.completePhotoUpload({ user: req.user, photoId });
      await recordUsage(req, "avatar3d.photo.complete", "avatar_3d_photo", photo.id, {
        status: photo.status,
      });
      noStore(res);
      res.json({ data: photo });
    }),
  );

  app.delete(
    "/api/avatar-3d/photos/:photoId",
    authenticate,
    requireCsrf,
    photoMutationLimit,
    asyncHandler(async (req, res) => {
      const { photoId } = avatar3dPhotoParamsSchema.parse(req.params);
      await service.deletePhoto({ user: req.user, photoId });
      await recordUsage(req, "avatar3d.photo.delete", "avatar_3d_photo", photoId);
      noStore(res);
      res.status(204).send();
    }),
  );

  app.get(
    "/api/avatar-3d/photos/:photoId/file",
    authenticate,
    asyncHandler(async (req, res) => {
      const { photoId } = avatar3dPhotoParamsSchema.parse(req.params);
      const resource = await service.getPhotoFile({
        user: req.user,
        photoId,
        range: req.get("range") || "",
      });
      await streamPrivateObject(res, resource);
    }),
  );

  app.post(
    "/api/avatar-3d/jobs",
    authenticate,
    requireCsrf,
    jobCreateLimit,
    asyncHandler(async (req, res) => {
      const body = avatar3dCreateJobSchema.parse(req.body);
      const { idempotencyKey } = avatar3dIdempotencySchema.parse({
        idempotencyKey: req.get("idempotency-key"),
      });
      const result = await service.createJob({
        user: req.user,
        body,
        idempotencyKey,
      });
      await recordUsage(req, "avatar3d.job.create", "avatar_3d_job", result.job.id, {
        created: result.created,
        style: result.job.style,
        status: result.job.status,
        photoCount: result.job.photoCount,
        estimatedCostFen: result.job.estimatedCostFen,
      });
      noStore(res);
      res.status(result.created ? 201 : 200).json({ data: result });
    }),
  );

  app.get(
    "/api/avatar-3d/jobs",
    authenticate,
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      noStore(res);
      res.json({ data: await service.listJobs({ user: req.user, limit }) });
    }),
  );

  app.get(
    "/api/avatar-3d/jobs/:jobId",
    authenticate,
    asyncHandler(async (req, res) => {
      const { jobId } = avatar3dJobParamsSchema.parse(req.params);
      noStore(res);
      res.json({ data: await service.getJob({ user: req.user, jobId }) });
    }),
  );

  app.post(
    "/api/avatar-3d/jobs/:jobId/confirm-style",
    authenticate,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const { jobId } = avatar3dJobParamsSchema.parse(req.params);
      avatar3dStyleConfirmSchema.parse(req.body);
      const job = await service.confirmStyle({ user: req.user, jobId });
      await recordUsage(req, "avatar3d.style.confirm", "avatar_3d_job", job.id, {
        style: job.style,
        status: job.status,
      });
      noStore(res);
      res.json({ data: job });
    }),
  );

  app.post(
    "/api/avatar-3d/jobs/:jobId/cancel",
    authenticate,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const { jobId } = avatar3dJobParamsSchema.parse(req.params);
      avatar3dPhotoCompleteSchema.parse(req.body || {});
      const job = await service.cancelJob({ user: req.user, jobId });
      await recordUsage(req, "avatar3d.job.cancel", "avatar_3d_job", job.id, {
        style: job.style,
        status: job.status,
      });
      noStore(res);
      res.json({ data: job });
    }),
  );

  app.get(
    "/api/avatar-3d/jobs/:jobId/style-preview",
    authenticate,
    asyncHandler(async (req, res) => {
      const { jobId } = avatar3dJobParamsSchema.parse(req.params);
      const resource = await service.getStylePreviewFile({
        user: req.user,
        jobId,
        range: req.get("range") || "",
      });
      await streamPrivateObject(res, resource);
    }),
  );

  app.get(
    "/api/avatar-3d/models/:modelId",
    authenticate,
    asyncHandler(async (req, res) => {
      const { modelId } = avatar3dModelParamsSchema.parse(req.params);
      noStore(res);
      res.json({ data: await service.getModel({ user: req.user, modelId }) });
    }),
  );

  app.get(
    "/api/avatar-3d/models/:modelId/file",
    authenticate,
    asyncHandler(async (req, res) => {
      const { modelId } = avatar3dModelParamsSchema.parse(req.params);
      const resource = await service.getModelFile({
        user: req.user,
        modelId,
        range: req.get("range") || "",
      });
      await streamPrivateObject(res, resource);
    }),
  );

  app.get(
    "/api/avatar-3d/models/:modelId/thumbnail",
    authenticate,
    asyncHandler(async (req, res) => {
      const { modelId } = avatar3dModelParamsSchema.parse(req.params);
      const resource = await service.getModelThumbnail({
        user: req.user,
        modelId,
        range: req.get("range") || "",
      });
      await streamPrivateObject(res, resource);
    }),
  );

  app.delete(
    "/api/avatar-3d/models/:modelId",
    authenticate,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const { modelId } = avatar3dModelParamsSchema.parse(req.params);
      await service.deleteModel({ user: req.user, modelId });
      await recordUsage(req, "avatar3d.model.delete", "avatar_3d_model", modelId);
      noStore(res);
      res.status(204).send();
    }),
  );
}
