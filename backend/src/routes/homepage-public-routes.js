import { config } from "../config.js";
import { homepageLifecycleService } from "../homepage-lifecycle-service.js";
import { HttpError } from "../http-error.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { homepageAccessTokenSchema } from "../schemas.js";

const publicHomepageLimit = createRateLimitMiddleware({
  action: "homepage.public.read",
  limit: 120,
  windowMs: 60 * 1000,
  message: "访问过于频繁，请稍后再试。",
});

export function registerHomepagePublicRoutes(app, {
  asyncHandler,
  service = homepageLifecycleService,
} = {}) {
  const requireEnabled = () => {
    if (!config.homepage.enabled) {
      throw new HttpError(404, "Homepage feature is not available.");
    }
  };

  app.get(
    "/api/homepage-previews/:token",
    publicHomepageLimit,
    asyncHandler(async (req, res) => {
      requireEnabled();
      const { token } = homepageAccessTokenSchema.parse(req.params);
      res.set("Cache-Control", "private, no-store");
      res.json({ data: await service.getPreviewPage({ token }) });
    }),
  );

  app.get(
    "/api/homepage-shares/:token",
    publicHomepageLimit,
    asyncHandler(async (req, res) => {
      requireEnabled();
      const { token } = homepageAccessTokenSchema.parse(req.params);
      res.set("Cache-Control", "private, no-store");
      res.json({ data: await service.getSharedPage({ token }) });
    }),
  );
}
