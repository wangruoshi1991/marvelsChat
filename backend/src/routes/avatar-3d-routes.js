import { avatar3dLifecycleService } from "../avatar-3d-lifecycle-service.js";
import {
  avatar3dJobCreateLimit as jobCreateLimit,
  avatar3dPhotoMutationLimit as photoMutationLimit,
  createAvatar3dUsageRecorder,
  noStore,
  streamAvatar3dPrivateObject as streamPrivateObject,
} from "../avatar-3d-route-support.js";
import {
  authenticateAvatarWeb,
  clearAvatarWebSession,
  createAvatarWebSession,
  getAvatarCsrfToken,
  requireAvatarCsrf,
  requireAvatarHttps,
} from "../avatar-3d-session.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { createUsageEvent } from "../repositories.js";
import {
  avatar3dCreateJobSchema,
  avatar3dIdempotencySchema,
  avatar3dJobParamsSchema,
  avatar3dModelParamsSchema,
  avatar3dPhotoCompleteSchema,
  avatar3dPhotoParamsSchema,
  avatar3dPhotoUploadSchema,
  avatar3dReferenceConfirmSchema,
  avatar3dReferenceImageParamsSchema,
  avatar3dReferenceRejectSchema,
  avatar3dSessionSchema,
  avatar3dStyleConfirmSchema,
  limitSchema,
} from "../schemas.js";

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

const defaultSessionService = {
  createAvatarWebSession,
  clearAvatarWebSession,
  getAvatarCsrfToken,
};

const setSessionCookies = (res, cookies) => {
  res.setHeader("Set-Cookie", cookies);
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
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.photo.prepare", "avatar_3d_photo", data.photo.id, {
        mimeType: data.photo.mimeType,
        byteSize: data.photo.byteSize,
        },
      );
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
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.photo.complete", "avatar_3d_photo", photo.id, {
        status: photo.status,
        },
      );
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
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.photo.delete", "avatar_3d_photo", photoId,
      );
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
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.job.create", "avatar_3d_job", result.job.id, {
        created: result.created,
        style: result.job.style,
        status: result.job.status,
        photoCount: result.job.photoCount,
        estimatedCostFen: result.job.estimatedCostFen,
        },
      );
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

  app.get(
    "/api/avatar-3d/jobs/:jobId/references",
    authenticate,
    asyncHandler(async (req, res) => {
      const { jobId } = avatar3dJobParamsSchema.parse(req.params);
      noStore(res);
      res.json({ data: await service.getReferences({ user: req.user, jobId }) });
    }),
  );

  app.get(
    "/api/avatar-3d/jobs/:jobId/references/:view/file",
    authenticate,
    asyncHandler(async (req, res) => {
      const { jobId, view } = avatar3dReferenceImageParamsSchema.parse(req.params);
      const resource = await service.getReferenceImageFile({
        user: req.user,
        jobId,
        view,
        range: req.get("range") || "",
      });
      await streamPrivateObject(res, resource);
    }),
  );

  app.post(
    "/api/avatar-3d/jobs/:jobId/references/confirm",
    authenticate,
    requireCsrf,
    jobCreateLimit,
    asyncHandler(async (req, res) => {
      const { jobId } = avatar3dJobParamsSchema.parse(req.params);
      const body = avatar3dReferenceConfirmSchema.parse(req.body);
      const data = await service.confirmReferences({ user: req.user, jobId, body });
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.references.confirm", "avatar_3d_job", jobId, {
        referenceSetId: body.referenceSetId,
        qualityPreset: body.qualityPreset,
        status: data.job.status,
        estimatedCostFen: data.job.estimatedCostFen,
        },
      );
      noStore(res);
      res.json({ data });
    }),
  );

  app.post(
    "/api/avatar-3d/jobs/:jobId/references/reject",
    authenticate,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const { jobId } = avatar3dJobParamsSchema.parse(req.params);
      const { referenceSetId } = avatar3dReferenceRejectSchema.parse(req.body);
      const job = await service.rejectReferences({
        user: req.user,
        jobId,
        referenceSetId,
      });
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.references.reject", "avatar_3d_job", jobId, {
        referenceSetId,
        status: job.status,
        },
      );
      noStore(res);
      res.json({ data: job });
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
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.style.confirm", "avatar_3d_job", job.id, {
        style: job.style,
        status: job.status,
        },
      );
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
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.job.cancel", "avatar_3d_job", job.id, {
        style: job.style,
        status: job.status,
        },
      );
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
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.model.delete", "avatar_3d_model", modelId,
      );
      noStore(res);
      res.status(204).send();
    }),
  );
}
