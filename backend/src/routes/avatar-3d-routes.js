import { avatar3dLifecycleService } from "../avatar-3d-lifecycle-service.js";
import {
  avatar3dJobCreateLimit,
  avatar3dPhotoMutationLimit,
  noStore,
  streamAvatar3dPrivateObject,
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
import { loginSchema } from "../schemas.js";
import { registerAvatar3dLifecycleRoutes } from "./avatar-3d-lifecycle-routes.js";

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
  streamPrivateObject = streamAvatar3dPrivateObject,
} = {}) {
  app.post(
    "/api/avatar-3d/session",
    requireHttps,
    loginLimit,
    asyncHandler(async (req, res) => {
      const body = loginSchema.parse(req.body);
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

  registerAvatar3dLifecycleRoutes(app, {
    basePath: "/api/avatar-3d",
    authenticate,
    asyncHandler,
    service,
    recordUsageEvent,
    streamPrivateObject,
    projectBootstrap: (data, req) => ({
      ...data,
      csrfToken: sessionService.getAvatarCsrfToken(req),
    }),
    guards: {
      preparePhoto: [requireCsrf, avatar3dPhotoMutationLimit],
      completePhoto: [requireCsrf, avatar3dPhotoMutationLimit],
      deletePhoto: [requireCsrf, avatar3dPhotoMutationLimit],
      createJob: [requireCsrf, avatar3dJobCreateLimit],
      confirmReferences: [requireCsrf, avatar3dJobCreateLimit],
      rejectReferences: [requireCsrf],
      cancelJob: [requireCsrf],
      deleteModel: [requireCsrf],
    },
  });
}
