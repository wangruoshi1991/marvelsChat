import { accountService } from "../account-service.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { accountDeletionSchema } from "../schemas.js";

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
} = {}) {
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
