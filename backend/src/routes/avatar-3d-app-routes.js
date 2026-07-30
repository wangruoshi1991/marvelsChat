import { avatar3dLifecycleService } from "../avatar-3d-lifecycle-service.js";
import {
  avatar3dJobCreateLimit,
  avatar3dPhotoMutationLimit,
  createAvatar3dUsageRecorder,
  noStore,
  privateImmutableCacheControl,
  streamAvatar3dPrivateObject,
} from "../avatar-3d-route-support.js";
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
} from "../schemas.js";

export function registerAvatar3dAppRoutes(app, {
  authenticate,
  asyncHandler,
  service = avatar3dLifecycleService,
  recordUsageEvent = createUsageEvent,
  streamPrivateObject = streamAvatar3dPrivateObject,
} = {}) {
  app.get(
    "/api/avatar-3d/app/bootstrap",
    authenticate,
    asyncHandler(async (req, res) => {
      const data = await service.getBootstrap({ user: req.user });
      noStore(res);
      res.json({ data });
    }),
  );

  app.post(
    "/api/avatar-3d/app/photos",
    authenticate,
    avatar3dPhotoMutationLimit,
    asyncHandler(async (req, res) => {
      const body = avatar3dPhotoUploadSchema.parse(req.body);
      const data = await service.preparePhotoUpload({ user: req.user, body });
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.photo.prepare",
        "avatar_3d_photo",
        data.photo.id,
        { mimeType: data.photo.mimeType, byteSize: data.photo.byteSize },
      );
      noStore(res);
      res.status(201).json({ data });
    }),
  );

  app.post(
    "/api/avatar-3d/app/photos/:photoId/complete",
    authenticate,
    avatar3dPhotoMutationLimit,
    asyncHandler(async (req, res) => {
      const { photoId } = avatar3dPhotoParamsSchema.parse(req.params);
      avatar3dPhotoCompleteSchema.parse(req.body || {});
      const photo = await service.completePhotoUpload({ user: req.user, photoId });
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.photo.complete",
        "avatar_3d_photo",
        photo.id,
        { status: photo.status },
      );
      noStore(res);
      res.json({ data: photo });
    }),
  );

  app.delete(
    "/api/avatar-3d/app/photos/:photoId",
    authenticate,
    avatar3dPhotoMutationLimit,
    asyncHandler(async (req, res) => {
      const { photoId } = avatar3dPhotoParamsSchema.parse(req.params);
      await service.deletePhoto({ user: req.user, photoId });
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.photo.delete",
        "avatar_3d_photo",
        photoId,
      );
      noStore(res);
      res.status(204).send();
    }),
  );

  app.post(
    "/api/avatar-3d/app/jobs",
    authenticate,
    avatar3dJobCreateLimit,
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
        "avatar3d.job.create",
        "avatar_3d_job",
        result.job.id,
        {
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
    "/api/avatar-3d/app/jobs/:jobId",
    authenticate,
    asyncHandler(async (req, res) => {
      const { jobId } = avatar3dJobParamsSchema.parse(req.params);
      noStore(res);
      res.json({ data: await service.getJob({ user: req.user, jobId }) });
    }),
  );

  app.get(
    "/api/avatar-3d/app/jobs/:jobId/references",
    authenticate,
    asyncHandler(async (req, res) => {
      const { jobId } = avatar3dJobParamsSchema.parse(req.params);
      noStore(res);
      res.json({ data: await service.getReferences({ user: req.user, jobId }) });
    }),
  );

  app.get(
    "/api/avatar-3d/app/jobs/:jobId/references/:view/file",
    authenticate,
    asyncHandler(async (req, res) => {
      const { jobId, view } = avatar3dReferenceImageParamsSchema.parse(req.params);
      const resource = await service.getReferenceImageFile({
        user: req.user,
        jobId,
        view,
        range: req.get("range") || "",
      });
      await streamAvatar3dPrivateObject(res, resource);
    }),
  );

  app.post(
    "/api/avatar-3d/app/jobs/:jobId/references/confirm",
    authenticate,
    avatar3dJobCreateLimit,
    asyncHandler(async (req, res) => {
      const { jobId } = avatar3dJobParamsSchema.parse(req.params);
      const body = avatar3dReferenceConfirmSchema.parse(req.body);
      const data = await service.confirmReferences({ user: req.user, jobId, body });
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.references.confirm",
        "avatar_3d_job",
        jobId,
        {
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
    "/api/avatar-3d/app/jobs/:jobId/references/reject",
    authenticate,
    asyncHandler(async (req, res) => {
      const { jobId } = avatar3dJobParamsSchema.parse(req.params);
      const { referenceSetId } = avatar3dReferenceRejectSchema.parse(req.body);
      const job = await service.rejectReferences({
        user: req.user,
        jobId,
        referenceSetId,
      });
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.references.reject",
        "avatar_3d_job",
        jobId,
        { referenceSetId, status: job.status },
      );
      noStore(res);
      res.json({ data: job });
    }),
  );

  app.post(
    "/api/avatar-3d/app/jobs/:jobId/cancel",
    authenticate,
    asyncHandler(async (req, res) => {
      const { jobId } = avatar3dJobParamsSchema.parse(req.params);
      avatar3dPhotoCompleteSchema.parse(req.body || {});
      const job = await service.cancelJob({ user: req.user, jobId });
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.job.cancel",
        "avatar_3d_job",
        job.id,
        { style: job.style, status: job.status },
      );
      noStore(res);
      res.json({ data: job });
    }),
  );

  app.get(
    "/api/avatar-3d/app/models/:modelId",
    authenticate,
    asyncHandler(async (req, res) => {
      const { modelId } = avatar3dModelParamsSchema.parse(req.params);
      noStore(res);
      res.json({ data: await service.getModel({ user: req.user, modelId }) });
    }),
  );

  app.get(
    "/api/avatar-3d/app/models/:modelId/file",
    authenticate,
    asyncHandler(async (req, res) => {
      const { modelId } = avatar3dModelParamsSchema.parse(req.params);
      const resource = await service.getAppModelFile({
        user: req.user,
        modelId,
        range: req.get("range") || "",
      });
      await streamPrivateObject(res, resource, {
        cacheControl: privateImmutableCacheControl,
      });
    }),
  );

  app.get(
    "/api/avatar-3d/app/models/:modelId/thumbnail",
    authenticate,
    asyncHandler(async (req, res) => {
      const { modelId } = avatar3dModelParamsSchema.parse(req.params);
      const resource = await service.getModelThumbnail({
        user: req.user,
        modelId,
        range: req.get("range") || "",
      });
      await streamPrivateObject(res, resource, {
        cacheControl: privateImmutableCacheControl,
      });
    }),
  );

  app.delete(
    "/api/avatar-3d/app/models/:modelId",
    authenticate,
    asyncHandler(async (req, res) => {
      const { modelId } = avatar3dModelParamsSchema.parse(req.params);
      await service.deleteModel({ user: req.user, modelId });
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.model.delete",
        "avatar_3d_model",
        modelId,
      );
      noStore(res);
      res.status(204).send();
    }),
  );
}
