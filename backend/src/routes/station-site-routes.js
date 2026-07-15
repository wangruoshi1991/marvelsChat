import { buildSiteDraftResponse } from "../site-builder-service.js";
import { config } from "../config.js";
import { homepageLifecycleService } from "../homepage-lifecycle-service.js";
import { requireHomepageV1 } from "../homepage-feature.js";
import { HttpError } from "../http-error.js";
import {
  applyStationSiteDraft,
  createStationSiteDraft,
  getProfileForUser,
  getStationContentForUser,
  listStationSiteDraftsForUser,
} from "../station-repository.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { createUsageEvent, hashRequestIp } from "../repositories.js";
import {
  limitSchema,
  homepageDraftUpdateSchema,
  homepageGenerateSchema,
  homepageJobParamsSchema,
  homepagePublishSchema,
  homepageRefineSchema,
  homepageReleaseParamsSchema,
  stationSiteDraftParamsSchema,
  stationSiteDraftRequestSchema,
} from "../schemas.js";

const hour = 60 * 60 * 1000;
const siteDraftCreateLimit = createRateLimitMiddleware({
  action: "station.site_draft.create",
  limit: 20,
  windowMs: hour,
  message: "主页生成请求过于频繁，请稍后再试。",
});

const day = 24 * hour;
const homepageGenerationLimit = createRateLimitMiddleware({
  action: "homepage.generate",
  limit: config.homepage.generationDailyLimit,
  windowMs: day,
  message: "今天的主页生成次数已用完，请明天再试。",
});
const homepageRefineLimit = createRateLimitMiddleware({
  action: "homepage.refine",
  limit: config.homepage.refineDailyLimit,
  windowMs: day,
  message: "今天的主页修改次数已用完，请明天再试。",
});

export function registerStationSiteRoutes(app, {
  authenticate,
  asyncHandler,
  homepageService = homepageLifecycleService,
  schedule = queueMicrotask,
} = {}) {
  app.get(
    "/api/station/site-drafts",
    authenticate,
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      res.json({ data: await listStationSiteDraftsForUser(req.user.id, limit) });
    }),
  );

  app.post(
    "/api/station/site-drafts",
    authenticate,
    siteDraftCreateLimit,
    asyncHandler(async (req, res) => {
      const body = stationSiteDraftRequestSchema.parse(req.body);
      const [profile, stationContent] = await Promise.all([
        getProfileForUser(req.user.id),
        getStationContentForUser(req.user.id),
      ]);
      const generation = await buildSiteDraftResponse({
        prompt: body.prompt,
        user: req.user,
        profile,
        stationContent,
      });
      const created = await createStationSiteDraft({
        userId: req.user.id,
        prompt: body.prompt,
        draft: generation.draft,
        source: generation.source,
        model: generation.model,
      });
      const applied = body.apply
        ? await applyStationSiteDraft({ userId: req.user.id, draftId: created.id })
        : null;

      await createUsageEvent({
        userId: req.user.id,
        eventType: body.apply ? "station.site_draft.apply" : "station.site_draft.create",
        targetType: "station_site_draft",
        targetId: created.id,
        payload: {
          source: generation.source,
          applied: body.apply,
          modelConfigured: generation.model.configured,
          modelMissing: generation.model.missing,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.status(201).json({
        data: {
          siteDraft: applied?.siteDraft || created,
          profile: applied?.profile || null,
          generation: {
            source: generation.source,
            model: generation.model,
          },
        },
      });
    }),
  );

  app.post(
    "/api/station/site-drafts/:draftId/apply",
    authenticate,
    asyncHandler(async (req, res) => {
      const { draftId } = stationSiteDraftParamsSchema.parse(req.params);
      const result = await applyStationSiteDraft({ userId: req.user.id, draftId });

      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.site_draft.apply",
        targetType: "station_site_draft",
        targetId: draftId,
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: result });
    }),
  );

  app.get(
    "/api/station/homepage-jobs",
    authenticate,
    requireHomepageV1,
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      res.json({ data: await homepageService.listGenerationJobs({ userId: req.user.id, limit }) });
    }),
  );

  app.post(
    "/api/station/homepage-jobs",
    authenticate,
    requireHomepageV1,
    homepageGenerationLimit,
    asyncHandler(async (req, res) => {
      const payload = homepageGenerateSchema.parse(req.body);
      const created = await homepageService.createGenerationJob({ user: req.user, payload });
      if (["queued", "running"].includes(created.job.status)) {
        schedule(() => {
          homepageService.processGenerationJob({ user: req.user, jobId: created.job.id })
            .catch((error) => console.error(JSON.stringify({
              type: "homepage_job_error",
              requestId: req.requestId || null,
              jobId: created.job.id,
              errorName: error?.name || "Error",
            })));
        });
      }
      res.status(202).json({ data: created });
    }),
  );

  app.get(
    "/api/station/homepage-jobs/:jobId",
    authenticate,
    requireHomepageV1,
    asyncHandler(async (req, res) => {
      const { jobId } = homepageJobParamsSchema.parse(req.params);
      const job = await homepageService.getGenerationJob({ userId: req.user.id, jobId });
      if (!job) throw new HttpError(404, "Homepage generation job not found.");
      res.json({ data: job });
    }),
  );

  app.get(
    "/api/station/site-drafts/:draftId",
    authenticate,
    requireHomepageV1,
    asyncHandler(async (req, res) => {
      const { draftId } = stationSiteDraftParamsSchema.parse(req.params);
      const draft = await homepageService.getDraft({ userId: req.user.id, draftId });
      if (!draft) throw new HttpError(404, "Homepage draft not found.");
      res.json({ data: draft });
    }),
  );

  app.patch(
    "/api/station/site-drafts/:draftId",
    authenticate,
    requireHomepageV1,
    asyncHandler(async (req, res) => {
      const { draftId } = stationSiteDraftParamsSchema.parse(req.params);
      const body = homepageDraftUpdateSchema.parse(req.body);
      res.json({
        data: await homepageService.replaceDraft({
          userId: req.user.id,
          draftId,
          revision: body.revision,
          draft: body.draft,
        }),
      });
    }),
  );

  app.post(
    "/api/station/site-drafts/:draftId/refine",
    authenticate,
    requireHomepageV1,
    homepageRefineLimit,
    asyncHandler(async (req, res) => {
      const { draftId } = stationSiteDraftParamsSchema.parse(req.params);
      const body = homepageRefineSchema.parse(req.body);
      res.json({
        data: await homepageService.refineSection({
          user: req.user,
          draftId,
          revision: body.revision,
          sectionId: body.sectionId,
          instruction: body.instruction,
        }),
      });
    }),
  );

  app.post(
    "/api/station/site-drafts/:draftId/preview-token",
    authenticate,
    requireHomepageV1,
    asyncHandler(async (req, res) => {
      const { draftId } = stationSiteDraftParamsSchema.parse(req.params);
      res.status(201).json({
        data: await homepageService.issuePreviewToken({ userId: req.user.id, draftId }),
      });
    }),
  );

  app.post(
    "/api/station/site-drafts/:draftId/publish",
    authenticate,
    requireHomepageV1,
    asyncHandler(async (req, res) => {
      const { draftId } = stationSiteDraftParamsSchema.parse(req.params);
      const body = homepagePublishSchema.parse(req.body);
      res.json({
        data: await homepageService.publish({
          userId: req.user.id,
          draftId,
          revision: body.revision,
          visibility: body.visibility,
        }),
      });
    }),
  );

  app.get(
    "/api/station/site",
    authenticate,
    requireHomepageV1,
    asyncHandler(async (req, res) => {
      res.json({ data: await homepageService.getSite({ userId: req.user.id }) });
    }),
  );

  app.post(
    "/api/station/site/unpublish",
    authenticate,
    requireHomepageV1,
    asyncHandler(async (req, res) => {
      res.json({ data: await homepageService.unpublish({ userId: req.user.id }) });
    }),
  );

  app.get(
    "/api/station/site/releases",
    authenticate,
    requireHomepageV1,
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      res.json({ data: await homepageService.listReleases({ userId: req.user.id, limit }) });
    }),
  );

  app.post(
    "/api/station/site/releases/:releaseId/restore",
    authenticate,
    requireHomepageV1,
    asyncHandler(async (req, res) => {
      const { releaseId } = homepageReleaseParamsSchema.parse(req.params);
      res.status(201).json({
        data: await homepageService.restoreRelease({ userId: req.user.id, releaseId }),
      });
    }),
  );
}
