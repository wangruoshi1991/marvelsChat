import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { createUsageEvent, hashRequestIp } from "../repositories.js";
import {
  createGenerationJob,
  getGenerationJobForUser,
  listGenerationJobsForUser,
  updateGenerationJob,
} from "../station-repository.js";
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

const compatibility = Object.freeze({
  provider: "avatar-web",
  configured: false,
  status: "migrated",
  webPath: "/avatar/",
});

const migrationMessage = "3D 个人形象生成已迁移到 Web 体验，请前往 /avatar/。";
const terminalStatuses = new Set(["succeeded", "failed", "cancelled", "blocked"]);

const defaultRepository = {
  createGenerationJob,
  getGenerationJobForUser,
  listGenerationJobsForUser,
  updateGenerationJob,
};

export function registerStationModelRoutes(app, {
  authenticate,
  asyncHandler,
  repository = defaultRepository,
  recordUsageEvent = createUsageEvent,
} = {}) {
  const recordUsage = (req, eventType, targetId, payload) => recordUsageEvent({
    userId: req.user.id,
    eventType,
    targetType: "generation_job",
    targetId,
    payload,
    ipHash: hashRequestIp(req.ip),
    userAgent: req.get("user-agent") || "",
  });

  app.get(
    "/api/station/model-jobs",
    authenticate,
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      const jobs = await repository.listGenerationJobsForUser({
        userId: req.user.id,
        kind: "3d_model",
        limit,
      });
      res.json({ data: jobs });
    }),
  );

  app.post(
    "/api/station/model-jobs",
    authenticate,
    modelJobCreateLimit,
    asyncHandler(async (req, res) => {
      const body = stationModelJobRequestSchema.parse(req.body);
      const job = await repository.createGenerationJob({
        userId: req.user.id,
        agentId: "model-3d",
        kind: "3d_model",
        inputType: body.inputType,
        prompt: body.prompt,
        sourceAssetId: body.sourceAssetId || null,
        provider: compatibility.provider,
        status: "blocked",
        progress: 0,
        requestPayload: {
          legacyClient: true,
          inputType: body.inputType,
          hasImageReference: Boolean(body.imageUrl),
        },
        resultPayload: { nextPath: compatibility.webPath },
        errorMessage: migrationMessage,
      });

      await recordUsage(req, "station.model_job.migrated", job.id, {
        inputType: job.inputType,
        status: job.status,
      });

      res.status(201).json({ data: { job, provider: compatibility } });
    }),
  );

  app.post(
    "/api/station/model-jobs/:jobId/sync",
    authenticate,
    asyncHandler(async (req, res) => {
      const { jobId } = generationJobParamsSchema.parse(req.params);
      let job = await repository.getGenerationJobForUser({
        userId: req.user.id,
        jobId,
      });
      if (!job) {
        res.status(404).json({ error: { message: "Generation job not found" } });
        return;
      }

      if (!terminalStatuses.has(job.status)) {
        job = await repository.updateGenerationJob({
          userId: req.user.id,
          jobId: job.id,
          status: "blocked",
          progress: job.progress,
          resultPayload: { nextPath: compatibility.webPath },
          errorMessage: migrationMessage,
        });
      }

      await recordUsage(req, "station.model_job.sync_compatibility", job.id, {
        status: job.status,
      });
      res.json({ data: { job, provider: compatibility } });
    }),
  );
}
