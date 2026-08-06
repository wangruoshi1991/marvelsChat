import {
  createAvatar3dUsageRecorder,
  noStore,
} from "../avatar-3d-route-support.js";
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

const guardList = (guards, name) => Array.isArray(guards?.[name]) ? guards[name] : [];

export function registerAvatar3dLifecycleRoutes(app, {
  basePath,
  authenticate,
  asyncHandler,
  service,
  recordUsageEvent,
  streamPrivateObject,
  guards = {},
  projectBootstrap = (data) => data,
  modelFileMethod = "getModelFile",
  modelAssetCacheControl,
}) {
  const authenticated = (handler, guardName) => [
    authenticate,
    ...guardList(guards, guardName),
    asyncHandler(handler),
  ];

  app.get(
    `${basePath}/bootstrap`,
    ...authenticated(async (req, res) => {
      const data = await service.getBootstrap({ user: req.user });
      noStore(res);
      res.json({ data: projectBootstrap(data, req) });
    }),
  );

  app.post(
    `${basePath}/photos`,
    ...authenticated(async (req, res) => {
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
    }, "preparePhoto"),
  );

  app.post(
    `${basePath}/photos/:photoId/complete`,
    ...authenticated(async (req, res) => {
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
    }, "completePhoto"),
  );

  app.delete(
    `${basePath}/photos/:photoId`,
    ...authenticated(async (req, res) => {
      const { photoId } = avatar3dPhotoParamsSchema.parse(req.params);
      await service.deletePhoto({ user: req.user, photoId });
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.photo.delete",
        "avatar_3d_photo",
        photoId,
      );
      noStore(res);
      res.status(204).send();
    }, "deletePhoto"),
  );

  app.post(
    `${basePath}/jobs`,
    ...authenticated(async (req, res) => {
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
    }, "createJob"),
  );

  app.get(
    `${basePath}/jobs/:jobId`,
    ...authenticated(async (req, res) => {
      const { jobId } = avatar3dJobParamsSchema.parse(req.params);
      noStore(res);
      res.json({ data: await service.getJob({ user: req.user, jobId }) });
    }),
  );

  app.get(
    `${basePath}/jobs/:jobId/references`,
    ...authenticated(async (req, res) => {
      const { jobId } = avatar3dJobParamsSchema.parse(req.params);
      noStore(res);
      res.json({ data: await service.getReferences({ user: req.user, jobId }) });
    }),
  );

  app.get(
    `${basePath}/jobs/:jobId/references/:view/file`,
    ...authenticated(async (req, res) => {
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
    `${basePath}/jobs/:jobId/references/confirm`,
    ...authenticated(async (req, res) => {
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
    }, "confirmReferences"),
  );

  app.post(
    `${basePath}/jobs/:jobId/references/reject`,
    ...authenticated(async (req, res) => {
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
    }, "rejectReferences"),
  );

  app.post(
    `${basePath}/jobs/:jobId/cancel`,
    ...authenticated(async (req, res) => {
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
    }, "cancelJob"),
  );

  app.get(
    `${basePath}/models/:modelId`,
    ...authenticated(async (req, res) => {
      const { modelId } = avatar3dModelParamsSchema.parse(req.params);
      noStore(res);
      res.json({ data: await service.getModel({ user: req.user, modelId }) });
    }),
  );

  app.get(
    `${basePath}/models/:modelId/file`,
    ...authenticated(async (req, res) => {
      const { modelId } = avatar3dModelParamsSchema.parse(req.params);
      const resource = await service[modelFileMethod]({
        user: req.user,
        modelId,
        range: req.get("range") || "",
      });
      await streamPrivateObject(
        res,
        resource,
        modelAssetCacheControl ? { cacheControl: modelAssetCacheControl } : undefined,
      );
    }),
  );

  app.get(
    `${basePath}/models/:modelId/thumbnail`,
    ...authenticated(async (req, res) => {
      const { modelId } = avatar3dModelParamsSchema.parse(req.params);
      const resource = await service.getModelThumbnail({
        user: req.user,
        modelId,
        range: req.get("range") || "",
      });
      await streamPrivateObject(
        res,
        resource,
        modelAssetCacheControl ? { cacheControl: modelAssetCacheControl } : undefined,
      );
    }),
  );

  app.delete(
    `${basePath}/models/:modelId`,
    ...authenticated(async (req, res) => {
      const { modelId } = avatar3dModelParamsSchema.parse(req.params);
      await service.deleteModel({ user: req.user, modelId });
      await createAvatar3dUsageRecorder(req, recordUsageEvent)(
        "avatar3d.model.delete",
        "avatar_3d_model",
        modelId,
      );
      noStore(res);
      res.status(204).send();
    }, "deleteModel"),
  );
}
