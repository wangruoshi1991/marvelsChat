import {
  getOssRuntimeStatus,
  persistProviderModelAssets,
} from "../asset-storage-service.js";
import {
  fetchMeshyModelJob,
  getMeshyRuntimeStatus,
  submitMeshyModelJob,
} from "../model-generation-service.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import {
  createGenerationJob,
  getGenerationJobForUser,
  listGenerationJobsForUser,
  updateGenerationJob,
  upsertStationModelAsset,
} from "../station-repository.js";
import { createUsageEvent, hashRequestIp } from "../repositories.js";
import {
  generationJobParamsSchema,
  limitSchema,
  stationModelJobRequestSchema,
} from "../schemas.js";

const hour = 60 * 60 * 1000;
const modelJobCreateLimit = createRateLimitMiddleware({
  action: "station.model_job.create",
  limit: 10,
  windowMs: hour,
  message: "3D 生成请求过于频繁，请稍后再试。",
});

export function registerStationModelRoutes(app, { authenticate, asyncHandler }) {
  app.get(
    "/api/station/model-jobs",
    authenticate,
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      res.json({ data: await listGenerationJobsForUser({ userId: req.user.id, kind: "3d_model", limit }) });
    }),
  );

  app.post(
    "/api/station/model-jobs",
    authenticate,
    modelJobCreateLimit,
    asyncHandler(async (req, res) => {
      const body = stationModelJobRequestSchema.parse(req.body);
      const providerStatus = getMeshyRuntimeStatus();
      let providerResult = null;
      let jobStatus = "blocked";
      let errorMessage = providerStatus.configured ? "" : `Missing provider config: ${providerStatus.missing.join(", ")}`;

      if (providerStatus.configured) {
        try {
          providerResult = await submitMeshyModelJob({
            inputType: body.inputType,
            prompt: body.prompt,
            imageUrl: body.imageUrl || "",
            targetFormats: body.targetFormats,
            topology: body.topology,
            poseMode: body.poseMode,
          });
          jobStatus = providerResult.status;
        } catch (error) {
          jobStatus = "failed";
          errorMessage = error.message || "3D model provider request failed";
        }
      }

      const job = await createGenerationJob({
        userId: req.user.id,
        agentId: "model-3d",
        kind: "3d_model",
        inputType: body.inputType,
        prompt: body.prompt,
        sourceAssetId: body.sourceAssetId || null,
        provider: body.provider,
        providerTaskId: providerResult?.providerTaskId || "",
        status: jobStatus,
        progress: jobStatus === "blocked" || jobStatus === "failed" ? 0 : 1,
        requestPayload: providerResult?.requestPayload || {
          inputType: body.inputType,
          targetFormats: body.targetFormats,
          topology: body.topology,
          poseMode: body.poseMode,
          hasImageUrl: Boolean(body.imageUrl),
        },
        resultPayload: providerResult?.resultPayload || {},
        errorMessage,
      });

      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.model_job.create",
        targetType: "generation_job",
        targetId: job.id,
        payload: {
          inputType: body.inputType,
          provider: body.provider,
          status: job.status,
          providerConfigured: providerStatus.configured,
          missing: providerStatus.missing,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.status(201).json({
        data: {
          job,
          provider: providerStatus,
        },
      });
    }),
  );

  app.post(
    "/api/station/model-jobs/:jobId/sync",
    authenticate,
    asyncHandler(async (req, res) => {
      const { jobId } = generationJobParamsSchema.parse(req.params);
      const job = await getGenerationJobForUser({ userId: req.user.id, jobId });
      if (!job) {
        res.status(404).json({ error: { message: "Generation job not found" } });
        return;
      }
      const providerStatus = getMeshyRuntimeStatus();
      if (!providerStatus.configured || !job.providerTaskId) {
        res.json({ data: { job, provider: providerStatus } });
        return;
      }

      const providerJob = await fetchMeshyModelJob({
        providerTaskId: job.providerTaskId,
        inputType: job.inputType,
      });
      let status = providerJob.status;
      let storage = null;
      let modelAsset = null;
      let errorMessage = providerJob.status === "failed" ? "3D model provider reported failure" : "";

      if (providerJob.status === "succeeded") {
        try {
          storage = await persistProviderModelAssets({
            userId: req.user.id,
            job,
            providerJob,
          });
          modelAsset = await upsertStationModelAsset({
            userId: req.user.id,
            generationJobId: job.id,
            title: job.prompt,
            provider: job.provider,
            providerTaskId: job.providerTaskId,
            modelFiles: storage.modelFiles,
            thumbnail: storage.thumbnail,
            metadata: {
              source: "provider_sync",
              providerStatus: providerJob.providerStatus,
            },
          });
        } catch (error) {
          status = "blocked";
          errorMessage = error.message || "Generated model assets could not be persisted";
          storage = {
            configured: getOssRuntimeStatus().configured,
            missing: getOssRuntimeStatus().missing,
            error: errorMessage,
          };
        }
      }

      const updated = await updateGenerationJob({
        userId: req.user.id,
        jobId: job.id,
        status,
        progress: providerJob.progress,
        resultPayload: {
          providerStatus: providerJob.providerStatus,
          thumbnailUrl: providerJob.thumbnailUrl,
          modelUrls: providerJob.modelUrls,
          storage,
          modelAssetId: modelAsset?.id || null,
          raw: providerJob.raw,
        },
        errorMessage,
      });

      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.model_job.sync",
        targetType: "generation_job",
        targetId: updated.id,
        payload: { status: updated.status, progress: updated.progress },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: { job: updated, provider: providerStatus, storage, modelAsset } });
    }),
  );
}
