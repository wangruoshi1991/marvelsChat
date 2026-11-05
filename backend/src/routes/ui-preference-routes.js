import { uiPreferenceService } from "../ui-preference-service.js";
import {
  uiPreferenceConfirmRequestSchema,
  uiPreferencePreviewRequestSchema,
  uiPreferenceResetRequestSchema,
  uiPreferenceUndoRequestSchema,
} from "../schemas.js";
import { requireUIPreferencesContract } from "../ai-client-contract.js";

export function registerUIPreferenceRoutes(app, {
  authenticate,
  asyncHandler,
  service = uiPreferenceService,
} = {}) {
  const guard = [authenticate, requireUIPreferencesContract];
  app.post("/api/ui/preferences/preview", ...guard, asyncHandler(async (req, res) => {
    const body = uiPreferencePreviewRequestSchema.parse(req.body);
    res.status(201).json({ data: await service.preview({ user: req.user, ...body }) });
  }));

  app.get("/api/ui/preferences/previews/:id", ...guard, asyncHandler(async (req, res) => {
    const previewId = uiPreferenceConfirmRequestSchema.shape.previewId.parse(req.params.id);
    res.json({ data: await service.getPreview({ user: req.user, previewId }) });
  }));

  app.post("/api/ui/preferences/confirm", ...guard, asyncHandler(async (req, res) => {
    const body = uiPreferenceConfirmRequestSchema.parse(req.body);
    res.json({ data: await service.confirm({ user: req.user, ...body }) });
  }));

  app.post("/api/ui/preferences/reset", ...guard, asyncHandler(async (req, res) => {
    const body = uiPreferenceResetRequestSchema.parse(req.body);
    res.json({ data: await service.reset({ user: req.user, ...body }) });
  }));

  app.post("/api/ui/preferences/undo", ...guard, asyncHandler(async (req, res) => {
    const body = uiPreferenceUndoRequestSchema.parse(req.body);
    res.json({ data: await service.undo({ user: req.user, ...body }) });
  }));
}
