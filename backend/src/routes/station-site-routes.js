import { buildSiteDraftResponse } from "../site-builder-service.js";
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

export function registerStationSiteRoutes(app, { authenticate, asyncHandler }) {
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
}
