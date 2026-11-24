import { hashRequestIp } from "../repositories.js";
import { query, withTransaction } from "../db.js";
import { HttpError } from "../http-error.js";
import { buildMediaRetrievalRuntimeStatus } from "../media-retrieval-runtime-status.js";
import { createMediaRetrievalRepository } from "../media-retrieval-repository.js";
import { MEDIA_RETRIEVAL_MINIMUM_APP_BUILD } from "../media-retrieval-constants.js";
import { mediaRetrievalAdminControlsSchema } from "../schemas.js";
import { createMediaRetrievalDiagnostics } from "../media-retrieval-diagnostics.js";
import { z } from "zod";

const requestKeySchema = z.string().trim().min(8).max(160);

const publicControls = (controls = {}) => ({
  revision: Number(controls.revision || 1),
  operatorEnabled: Boolean(controls.agent_enabled),
  providerCallsEnabled: Boolean(controls.provider_calls_enabled),
  queueEnabled: Boolean(controls.index_requests_enabled),
  userDailyRequestLimit: controls.user_daily_request_limit == null ? null : Number(controls.user_daily_request_limit),
  userMonthlyBudgetFen: controls.user_monthly_budget_fen == null ? null : Number(controls.user_monthly_budget_fen),
  globalDailyBudgetFen: controls.global_daily_budget_fen == null ? null : Number(controls.global_daily_budget_fen),
  captionReserveFen: Number(controls.caption_reserve_fen || 0),
  embeddingReserveFen: Number(controls.embedding_reserve_fen || 0),
  lifecycle: controls.lifecycle || "draft",
});

const agentCard = {
  agentKey: "media-retrieval",
  displayName: "媒体检索 Agent",
  shortDescription: "从已上传的私有图片和视频中查找匹配素材。",
  artifactSupport: [],
  minimumAppBuild: MEDIA_RETRIEVAL_MINIMUM_APP_BUILD,
};

const defaultDependencies = () => {
  const repository = createMediaRetrievalRepository({ query, withTransaction });
  return {
    repository,
    getOverview: () => repository.getMediaRetrievalAdminOverview(),
    listDiagnostics: createMediaRetrievalDiagnostics().list,
    listRuns: (input) => repository.listMediaRetrievalAdminRuns(input),
    updateControls: (input) => repository.updateMediaRetrievalOperatorControls(input),
    buildRuntimeStatus: (input) => buildMediaRetrievalRuntimeStatus({ ...input, overview: input?.overview }),
  };
};

export function registerAdminMediaRetrievalRoutes(app, {
  authenticate,
  requireAdmin,
  asyncHandler,
  dependencies = defaultDependencies(),
}) {
  app.get(
    "/api/admin/media-retrieval/overview",
    authenticate,
    requireAdmin("agents:manage"),
    asyncHandler(async (_req, res) => {
      const [overview, diagnostics] = await Promise.all([
        dependencies.getOverview(), dependencies.listDiagnostics(),
      ]);
      const runtimeStatus = await dependencies.buildRuntimeStatus({ overview });
      res.json({
        data: {
          agentCard: { ...agentCard, availability: runtimeStatus.publicAvailability },
          runtimeStatus,
          queue: overview.queue || {},
          readySegments: Number(overview.readySegments || 0),
          cost: {
            reservedFen: Number(overview.globalCost?.reserved_fen || 0),
            estimatedFen: Number(overview.globalCost?.estimated_fen || 0),
            unknownFen: Number(overview.globalCost?.unknown_fen || 0),
          },
          controls: publicControls(overview.controls),
          recentRuns: overview.recentRuns || [],
          diagnostics,
        },
      });
    }),
  );

  app.get(
    "/api/admin/media-retrieval/runs",
    authenticate,
    requireAdmin("agents:manage"),
    asyncHandler(async (req, res) => {
      const limit = Math.min(200, Math.max(1, Number(req.query?.limit || 80)));
      res.json({ data: await dependencies.listRuns({ limit }) });
    }),
  );

  app.patch(
    "/api/admin/media-retrieval/controls",
    authenticate,
    requireAdmin("agents:manage"),
    asyncHandler(async (req, res) => {
      const body = mediaRetrievalAdminControlsSchema.parse(req.body);
      const { expectedRevision, ...changed } = body;
      if (expectedRevision === undefined || Object.keys(changed).length === 0) {
        throw new HttpError(400, "A control revision and at least one control change are required.");
      }
      const idempotencyKey = requestKeySchema.parse(req.get("Idempotency-Key"));
      const controls = await dependencies.updateControls(Object.fromEntries(Object.entries({
        agentEnabled: body.operatorEnabled,
        providerCallsEnabled: body.providerCallsEnabled,
        indexRequestsEnabled: body.queueEnabled,
        userDailyRequestLimit: body.userDailyRequestLimit,
        userMonthlyBudgetFen: body.userMonthlyBudgetFen,
        globalDailyBudgetFen: body.globalDailyBudgetFen,
        captionReserveFen: body.captionReserveFen,
        embeddingReserveFen: body.embeddingReserveFen,
        lifecycle: body.lifecycle,
        expectedRevision,
        _audit: {
          userId: req.user.id,
          idempotencyKey,
          ipHash: hashRequestIp(req.ip),
          userAgent: req.get("user-agent") || "",
          payload: changed,
        },
      }).filter(([, value]) => value !== undefined)));
      res.json({ data: { controls: publicControls(controls) } });
    }),
  );
}
