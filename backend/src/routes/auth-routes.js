import { hashPassword, verifyPassword } from "../auth.js";
import { HttpError } from "../http-error.js";
import {
  createSessionForUser,
  createUsageEvent,
  createUserWithDefaults,
  determineUserRole,
  findUserByDisplayName,
  findUserByEmail,
  findUserByLoginIdentifier,
  findUserByPhoneNumber,
  hashRequestIp,
  markLogin,
  publicUser,
  revokeSession,
} from "../repositories.js";
import { loginSchema, registerSchema } from "../schemas.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";

const minute = 60 * 1000;
const dummyPasswordHash =
  "pbkdf2$310000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const authKey = (req) => {
  const identifier = String(req.body?.identifier || req.body?.email || req.body?.phoneNumber || req.body?.displayName || "")
    .trim()
    .toLowerCase()
    .slice(0, 190);
  return `${req.ip || "anonymous"}:${identifier || "unknown"}`;
};

const loginLimit = createRateLimitMiddleware({
  action: "auth.login",
  limit: 12,
  windowMs: 5 * minute,
  keyGenerator: authKey,
  message: "登录尝试过于频繁，请稍后再试。",
});

const registerLimit = createRateLimitMiddleware({
  action: "auth.register",
  limit: 8,
  windowMs: 10 * minute,
  keyGenerator: authKey,
  message: "注册请求过于频繁，请稍后再试。",
});

export async function verifyLoginCredentials(
  { identifier, password },
  {
    findUser = findUserByLoginIdentifier,
    verify = verifyPassword,
  } = {},
) {
  const user = await findUser(identifier);
  const valid = await verify(
    password,
    user?.password_hash || dummyPasswordHash,
  );
  if (!user || !valid) {
    throw new HttpError(401, "Invalid account or password");
  }
  if (user.status !== "active") throw new HttpError(403, "User is disabled");
  return user;
}

export function registerAuthRoutes(app, { authenticate, asyncHandler }) {
  app.post(
    "/api/auth/register",
    registerLimit,
    asyncHandler(async (req, res) => {
      const body = registerSchema.parse(req.body);
      if (body.contactType === "email") {
        const existed = await findUserByEmail(body.email);
        if (existed) throw new HttpError(409, "Email already registered");
      } else {
        const existed = await findUserByPhoneNumber(body.phoneNumber);
        if (existed) throw new HttpError(409, "Phone number already registered");
      }
      const existedName = await findUserByDisplayName(body.displayName);
      if (existedName) throw new HttpError(409, "Display name already registered");

      const passwordHash = await hashPassword(body.password);
      const role = body.email ? await determineUserRole(body.email) : "user";
      const user = await createUserWithDefaults({
        email: body.email,
        phoneNumber: body.phoneNumber,
        displayName: body.displayName,
        passwordHash,
        role,
      });
      const session = await createSessionForUser(user.id);
      await markLogin(user.id);
      await createUsageEvent({
        userId: user.id,
        eventType: "auth.register",
        targetType: "user",
        targetId: user.id,
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.status(201).json({ data: { user: { ...user, lastLoginAt: new Date().toISOString() }, session } });
    }),
  );

  app.post(
    "/api/auth/login",
    loginLimit,
    asyncHandler(async (req, res) => {
      const body = loginSchema.parse(req.body);
      const userRow = await verifyLoginCredentials(body);

      const session = await createSessionForUser(userRow.id);
      await markLogin(userRow.id);
      await createUsageEvent({
        userId: userRow.id,
        eventType: "auth.login",
        targetType: "user",
        targetId: userRow.id,
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({
        data: {
          user: { ...publicUser(userRow), lastLoginAt: new Date().toISOString() },
          session,
        },
      });
    }),
  );

  app.get("/api/me", authenticate, (req, res) => {
    res.json({ data: { user: req.user } });
  });

  app.post(
    "/api/auth/logout",
    authenticate,
    asyncHandler(async (req, res) => {
      await createUsageEvent({
        userId: req.user.id,
        eventType: "auth.logout",
        targetType: "user",
        targetId: req.user.id,
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      await revokeSession(req.sessionId);
      res.json({ data: { ok: true } });
    }),
  );
}
