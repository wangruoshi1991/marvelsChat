import { submitSiteTask, siteTaskRequestSchema } from "../ai-site-task-service.js";
import { listStationSiteDraftsForUser } from "../station-repository.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { limitSchema } from "../schemas.js";
import { requireAIClientContract, requireSiteDocumentContract, rejectRetiredSiteApply } from "../ai-client-contract.js";
import { getStationSiteDocumentForUser } from "../site-document-repository.js";
import { z } from "zod";

const siteDraftCreateLimit = createRateLimitMiddleware({
  action: "station.site_draft.create",
  limit: 20,
  windowMs: 60 * 60 * 1000,
  message: "主页生成请求过于频繁，请稍后再试。",
});

export function registerStationSiteRoutes(app, { authenticate, asyncHandler, submit = submitSiteTask, readDocument = getStationSiteDocumentForUser }) {
  app.get("/api/station/site-drafts", authenticate, asyncHandler(async (req, res) => {
    const { limit } = limitSchema.parse(req.query);
    res.json({ data: await listStationSiteDraftsForUser(req.user.id, limit) });
  }));
  app.get("/api/station/site-drafts/:draftId/document", authenticate, requireSiteDocumentContract, asyncHandler(async (req, res) => {
    const draftId = z.string().uuid().parse(req.params.draftId);
    res.json({ data: await readDocument({ userId: req.user.id, draftId }) });
  }));
  app.post("/api/station/site-drafts", authenticate, requireAIClientContract, requireSiteDocumentContract, siteDraftCreateLimit, asyncHandler(async (req, res) => {
    const body = siteTaskRequestSchema.parse(req.body);
    const task = await submit({ user: req.user, ...body });
    res.status(202).json({ data: { task } });
  }));
  app.post("/api/station/site-drafts/:draftId/apply", authenticate, rejectRetiredSiteApply);
}
