import { listAgents } from "../../../agents/registry.js";
import { buildAgentReadiness } from "../agent-readiness-service.js";
import { registerAdminMediaRetrievalRoutes } from "./admin-media-retrieval-routes.js";
import {
  adminAgentRuns,
  adminEvents,
  adminOverview,
  adminUserDetail,
  adminUsers,
  updateUserAdminPermissions,
  updateUserPassword,
  updateUserProfileAdmin,
  updateUserRole,
  updateUserStatus,
} from "../admin-repository.js";
import { getModelRuntimeStatus, testModelRuntime } from "../agent-runtime.js";
import { hashPassword } from "../auth.js";
import { HttpError } from "../http-error.js";
import {
  createManagedUser,
  createUsageEvent,
  findUserByDisplayName,
  findUserByEmail,
  getRawUserById,
  hashRequestIp,
  revokeSessionsForUser,
  setUserAgentAccess,
} from "../repositories.js";
import {
  adminPermissionsSchema,
  agentAccessSchema,
  createAdminUserSchema,
  limitSchema,
  modelTestSchema,
  profileAdminSchema,
  resetPasswordSchema,
  userRoleSchema,
  userStatusSchema,
} from "../schemas.js";

export function registerAdminRoutes(app, { authenticate, asyncHandler, requireAdmin }) {
  registerAdminMediaRetrievalRoutes(app, { authenticate, asyncHandler, requireAdmin });
  app.get(
    "/api/admin/overview",
    authenticate,
    requireAdmin("users:read"),
    asyncHandler(async (_req, res) => {
      res.json({ data: await adminOverview() });
    }),
  );

  app.get(
    "/api/admin/users",
    authenticate,
    requireAdmin("users:read"),
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      res.json({ data: await adminUsers({ limit }) });
    }),
  );

  app.post(
    "/api/admin/users",
    authenticate,
    requireAdmin("users:write"),
    asyncHandler(async (req, res) => {
      const body = createAdminUserSchema.parse(req.body);
      const existed = await findUserByEmail(body.email);
      if (existed) throw new HttpError(409, "Email already registered");
      const existedName = await findUserByDisplayName(body.displayName);
      if (existedName) throw new HttpError(409, "Display name already registered");

      const user = await createManagedUser({
        email: body.email,
        displayName: body.displayName,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        status: body.status,
      });
      await createUsageEvent({
        userId: req.user.id,
        eventType: "admin.user.create",
        targetType: "user",
        targetId: user.id,
        payload: { email: user.email, displayName: user.displayName, role: user.role, status: user.status },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.status(201).json({ data: { user } });
    }),
  );

  app.get(
    "/api/admin/users/:userId",
    authenticate,
    requireAdmin("users:read"),
    asyncHandler(async (req, res) => {
      const detail = await adminUserDetail(req.params.userId, await listAgents());
      if (!detail) throw new HttpError(404, "User not found");
      res.json({ data: detail });
    }),
  );

  app.patch(
    "/api/admin/users/:userId/status",
    authenticate,
    requireAdmin("users:write"),
    asyncHandler(async (req, res) => {
      const { status } = userStatusSchema.parse(req.body);
      const target = await getRawUserById(req.params.userId);
      if (!target) throw new HttpError(404, "User not found");
      if (target.id === req.user.id && status !== "active") {
        throw new HttpError(400, "You cannot disable your own admin account");
      }

      const user = await updateUserStatus(target.id, status);
      await createUsageEvent({
        userId: req.user.id,
        eventType: "admin.user.status",
        targetType: "user",
        targetId: target.id,
        payload: { status, targetEmail: target.email, targetLoginName: target.login_name || null },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: { user } });
    }),
  );

  app.patch(
    "/api/admin/users/:userId/role",
    authenticate,
    requireAdmin("users:write"),
    asyncHandler(async (req, res) => {
      const { role } = userRoleSchema.parse(req.body);
      const target = await getRawUserById(req.params.userId);
      if (!target) throw new HttpError(404, "User not found");
      if (target.id === req.user.id && role !== "admin") {
        throw new HttpError(400, "You cannot remove your own admin permission");
      }

      const user = await updateUserRole(target.id, role);
      await createUsageEvent({
        userId: req.user.id,
        eventType: "admin.user.role",
        targetType: "user",
        targetId: target.id,
        payload: { role, targetEmail: target.email, targetLoginName: target.login_name || null },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: { user } });
    }),
  );

  app.patch(
    "/api/admin/users/:userId/permissions",
    authenticate,
    requireAdmin("users:write"),
    asyncHandler(async (req, res) => {
      const { permissions } = adminPermissionsSchema.parse(req.body);
      const target = await getRawUserById(req.params.userId);
      if (!target) throw new HttpError(404, "User not found");
      if (target.role !== "admin") {
        throw new HttpError(400, "Only admin users can receive admin permissions");
      }
      if (target.id === req.user.id && !permissions.includes("*")) {
        throw new HttpError(400, "You cannot reduce your own super admin permission");
      }

      const user = await updateUserAdminPermissions(target.id, permissions);
      await createUsageEvent({
        userId: req.user.id,
        eventType: "admin.user.permissions",
        targetType: "user",
        targetId: target.id,
        payload: {
          permissions,
          targetEmail: target.email,
          targetLoginName: target.login_name || null,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: { user } });
    }),
  );

  app.patch(
    "/api/admin/users/:userId/profile",
    authenticate,
    requireAdmin("users:write"),
    asyncHandler(async (req, res) => {
      const body = profileAdminSchema.parse(req.body);
      const target = await getRawUserById(req.params.userId);
      if (!target) throw new HttpError(404, "User not found");

      const profile = await updateUserProfileAdmin({ userId: target.id, ...body });
      await createUsageEvent({
        userId: req.user.id,
        eventType: "admin.user.profile",
        targetType: "user",
        targetId: target.id,
        payload: {
          nickname: body.nickname,
          targetEmail: target.email,
          targetLoginName: target.login_name || null,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: { profile } });
    }),
  );

  app.post(
    "/api/admin/users/:userId/revoke-sessions",
    authenticate,
    requireAdmin("users:write"),
    asyncHandler(async (req, res) => {
      const target = await getRawUserById(req.params.userId);
      if (!target) throw new HttpError(404, "User not found");
      if (target.id === req.user.id) {
        throw new HttpError(400, "Use logout to revoke your current admin session");
      }

      await revokeSessionsForUser(target.id);
      await createUsageEvent({
        userId: req.user.id,
        eventType: "admin.user.revoke_sessions",
        targetType: "user",
        targetId: target.id,
        payload: { targetEmail: target.email, targetLoginName: target.login_name || null },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: { ok: true } });
    }),
  );

  app.patch(
    "/api/admin/users/:userId/agents/:agentId",
    authenticate,
    requireAdmin("agents:manage"),
    asyncHandler(async (req, res) => {
      const body = agentAccessSchema.parse(req.body);
      const target = await getRawUserById(req.params.userId);
      if (!target) throw new HttpError(404, "User not found");

      const agent = (await listAgents()).find((item) => item.key === req.params.agentId);
      if (!agent) throw new HttpError(404, "Agent not found");

      const [access] = await setUserAgentAccess({
        userId: target.id,
        agent,
        enabled: body.enabled,
        alias: body.alias,
        grantedScopes: body.grantedScopes,
      });
      await createUsageEvent({
        userId: req.user.id,
        eventType: "admin.user.agent",
        targetType: "user",
        targetId: target.id,
        payload: {
          agentId: agent.key,
          enabled: body.enabled,
          targetEmail: target.email,
          targetLoginName: target.login_name || null,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: { agent: access } });
    }),
  );

  app.post(
    "/api/admin/users/:userId/reset-password",
    authenticate,
    requireAdmin("users:write"),
    asyncHandler(async (req, res) => {
      const { password } = resetPasswordSchema.parse(req.body);
      const target = await getRawUserById(req.params.userId);
      if (!target) throw new HttpError(404, "User not found");
      if (target.id === req.user.id) {
        throw new HttpError(400, "Use account settings to change your own password");
      }

      const user = await updateUserPassword(target.id, await hashPassword(password));
      await createUsageEvent({
        userId: req.user.id,
        eventType: "admin.user.password_reset",
        targetType: "user",
        targetId: target.id,
        payload: { targetEmail: target.email, targetLoginName: target.login_name || null },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: { user } });
    }),
  );

  app.get(
    "/api/admin/events",
    authenticate,
    requireAdmin("audit:read"),
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      res.json({ data: await adminEvents({ limit }) });
    }),
  );

  app.get(
    "/api/admin/agent-runs",
    authenticate,
    requireAdmin("audit:read"),
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      res.json({ data: await adminAgentRuns({ limit }) });
    }),
  );

  app.get(
    "/api/admin/agents",
    authenticate,
    requireAdmin("agents:manage"),
    asyncHandler(async (_req, res) => {
      const [registered, recentRuns] = await Promise.all([
        listAgents(),
        adminAgentRuns({ limit: 500 }),
      ]);
      const runCounts = recentRuns.reduce((groups, run) => {
        groups[run.agentId] ||= { total: 0, success: 0, error: 0, pending: 0 };
        groups[run.agentId].total += 1;
        groups[run.agentId][run.status] = (groups[run.agentId][run.status] || 0) + 1;
        return groups;
      }, {});

      res.json({
        data: registered.map((agent) => ({
          ...agent,
          runs: runCounts[agent.key] || { total: 0, success: 0, error: 0, pending: 0 },
        })),
      });
    }),
  );

  app.get(
    "/api/admin/agent-readiness",
    authenticate,
    requireAdmin("agents:manage"),
    asyncHandler(async (_req, res) => {
      res.json({ data: await buildAgentReadiness() });
    }),
  );

  app.get(
    "/api/admin/model-status",
    authenticate,
    requireAdmin("model:operate"),
    asyncHandler(async (_req, res) => {
      res.json({ data: getModelRuntimeStatus() });
    }),
  );

  app.post(
    "/api/admin/model-test",
    authenticate,
    requireAdmin("model:operate"),
    asyncHandler(async (req, res) => {
      const body = modelTestSchema.parse(req.body);
      const result = await testModelRuntime({ input: body.input });
      await createUsageEvent({
        userId: req.user.id,
        eventType: "admin.model_test",
        targetType: "model",
        targetId: result.model,
        payload: {
          provider: result.provider,
          latencyMs: result.latencyMs,
          tokenTotal: result.tokenUsage.total,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: result });
    }),
  );
}
