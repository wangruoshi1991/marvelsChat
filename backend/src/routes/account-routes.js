import { accountService } from "../account-service.js";
import { config } from "../config.js";
import { assertCurrentPolicyConsent } from "../legal-policy-service.js";
import { recordUserConsents } from "../repositories.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { accountDeletionSchema, userConsentSchema } from "../schemas.js";

const legalUrl = (path) => config.homepage.webBaseUrl
  ? `${config.homepage.webBaseUrl}${path}`
  : path;

const accountDeletionLimit = createRateLimitMiddleware({
  action: "account.delete",
  limit: 5,
  windowMs: 60 * 60 * 1000,
  message: "账号验证尝试过于频繁，请稍后再试。",
});

export function registerAccountRoutes(app, {
  authenticate,
  asyncHandler,
  service = accountService,
  recordConsents = recordUserConsents,
} = {}) {
  app.get("/api/legal/policies", (_req, res) => {
    res.json({
      data: {
        privacy: {
          version: config.legal.privacyPolicyVersion,
          url: legalUrl("/legal/privacy"),
        },
        terms: {
          version: config.legal.termsVersion,
          url: legalUrl("/legal/terms"),
        },
      },
    });
  });

  app.post(
    "/api/me/consents",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = userConsentSchema.parse(req.body);
      assertCurrentPolicyConsent(body);
      const consent = await recordConsents({
        userId: req.user.id,
        privacyPolicyVersion: body.privacyPolicyVersion,
        termsVersion: body.termsVersion,
        metadata: {
          requestId: req.requestId || null,
          appVersion: String(req.get("x-app-version") || "").slice(0, 40),
        },
      });
      res.status(201).json({ data: consent });
    }),
  );

  app.delete(
    "/api/account",
    authenticate,
    accountDeletionLimit,
    asyncHandler(async (req, res) => {
      const body = accountDeletionSchema.parse(req.body);
      res.json({
        data: await service.deleteAccount({
          userId: req.user.id,
          password: body.password,
        }),
      });
    }),
  );
}
