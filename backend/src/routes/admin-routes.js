import { listAgents } from "../../../agents/registry.js";
import {
  listRegisteredAgentsWithCatalogue,
} from "../agent-catalog-repository.js";
import { buildAgentReadiness } from "../agent-readiness-service.js";
import { registerAdminMediaRetrievalRoutes } from "./admin-media-retrieval-routes.js";
import { registerAdminReleaseRoutes } from "./admin-release-routes.js";
import { registerAdminProductRoutes } from "./admin-product-routes.js";
import {
  adminAgentRuns,
  adminOverview,
  adminUserDetail,
  adminAgentUsage,
  updateUserAdminPermissions,
  updateUserPassword,
  updateUserProfileAdmin,
  updateUserRole,
  updateUserStatus,
} from "../admin-repository.js";
import { getModelRuntimeStatus, testModelRuntime } from "../agent-runtime.js";
import {
  assertAdminAccountMutationAllowed,
  hasAdminPermission,
  hashPassword,
} from "../auth.js";
import { HttpError } from "../http-error.js";
import { agentPublishingService } from "../agent-publishing-service.js";
import {
  createManagedUser,
  createUsageEvent,
  findUserByDisplayName,
  findUserByEmail,
  getRawUserById,
  hashRequestIp,
  revokeSessionsForUser,
} from "../repositories.js";
import {
  adminPermissionsSchema,
  agentAccessSchema,
  createAdminUserSchema,
  modelTestSchema,
  profileAdminSchema,
  adminUsageWindowSchema,
  adminPageSchema,
  resetPasswordSchema,
  userRoleSchema,
  userStatusSchema,
} from "../schemas.js";
import {
  adminOperationsOverview,
  adminMonitoring,
  listAdminTasks,
  getAdminTaskDetail,
  mutateAdminTask,
} from "../admin-operations-repository.js";
import { listAdminPage } from "../admin-list-repository.js";
import { z } from "zod";

const operationsWindowSchema = z.object({ days: z.coerce.number().int().refine(value => [7, 30, 90].includes(value)).default(30) }).strict();
const operationsTaskQuerySchema = z.object({
  agentId: z.string().trim().min(1).max(120).optional(),
  userId: z.string().uuid().optional(),
  status: z.enum(["queued", "running", "waiting_input", "awaiting_confirmation", "succeeded", "failed", "interrupted", "cancelling", "cancelled"]).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();
const operationsMutationSchema = z.object({ idempotencyKey: z.string().trim().min(8).max(160) }).strict();

export function createAdminAgentAccessHandler({
  findUser = getRawUserById,
  listRegisteredAgents = async () =>
    listRegisteredAgentsWithCatalogue(await listAgents()),
  setProductAccess = agentPublishingService.setAgentAccessThroughProduct,
  recordEvent = createUsageEvent,
} = {}) {
  return async (req, res) => {
    // The admin endpoint intentionally rejects every enable below. Mark the
    // shape as parsed without accepting admin consent as a substitute for the
    // account holder's product consent.
    const body = agentAccessSchema.parse(
      req.body?.enabled ? { ...req.body, consent: true } : req.body,
    );
    const target = await findUser(req.params.userId);
    if (!target) throw new HttpError(404, "User not found");
    assertAdminAccountMutationAllowed(req.user, { targetRole: target.role });
    const agent = (await listRegisteredAgents()).find(
      (item) => item.key === req.params.agentId
    );
    if (!agent) throw new HttpError(404, "Agent not found");
    if (body.enabled) {
      throw new HttpError(409, "用户 Agent 授权必须由账户本人确认产品权限。", {
        code: "USER_CONSENT_REQUIRED",
      });
    }
    const entitlement = await setProductAccess({
      userId: target.id,
      agentKey: agent.key,
      enabled: false,
      grantedScopes: [],
      idempotencyKey: req.get("Idempotency-Key") || null,
    });
    const access = {
      id: agent.key,
      name: agent.name,
      description: agent.description || "",
      category: agent.category || "",
      enabled: false,
      grantedScopes: entitlement.grantedScopes,
      published: agent.published === true,
      identity: agent.identity,
    };
    await recordEvent({
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
    res.json({ data: { agent: access, entitlement } });
  };
}

export function registerAdminRoutes(
  app,
  { authenticate, asyncHandler, requireAdmin }
) {
  const wantsPage = (req) => Object.prototype.hasOwnProperty.call(req.query, "page") || Object.prototype.hasOwnProperty.call(req.query, "pageSize");
  registerAdminMediaRetrievalRoutes(app, {
    authenticate,
    asyncHandler,
    requireAdmin,
  });
  registerAdminReleaseRoutes(app, { authenticate, asyncHandler, requireAdmin });
  registerAdminProductRoutes(app, { authenticate, asyncHandler, requireAdmin });
  app.get(
    "/api/admin/overview",
    authenticate,
    requireAdmin("users:read"),
    asyncHandler(async (req, res) => {
      const window = operationsWindowSchema.parse(req.query);
      const [legacy, operations] = await Promise.all([
        adminOverview(),
        adminOperationsOverview(window),
      ]);
      res.json({ data: { ...legacy, ...operations } });
    })
  );

  app.get(
    "/api/admin/operations/overview",
    authenticate,
    requireAdmin("users:read"),
    asyncHandler(async (req, res) => {
      res.json({ data: await adminOperationsOverview(operationsWindowSchema.parse(req.query)) });
    }),
  );

  // The modular console uses this path. Keep the legacy overview endpoint
  // above for existing operators while the response contract converges.
  app.get(
    "/api/admin/tasks",
    authenticate,
    requireAdmin("tasks:read"),
    asyncHandler(async (req, res) => {
      res.json({ data: { items: await listAdminTasks(operationsTaskQuerySchema.parse(req.query)) } });
    }),
  );

  app.get(
    "/api/admin/monitoring",
    authenticate,
    requireAdmin("audit:read"),
    asyncHandler(async (req, res) => {
      res.json({ data: await adminMonitoring(operationsWindowSchema.parse(req.query)) });
    }),
  );

  app.get(
    "/api/admin/tasks/:taskId",
    authenticate,
    requireAdmin("tasks:read"),
    asyncHandler(async (req, res) => {
      res.json({ data: await getAdminTaskDetail(req.params.taskId) });
    }),
  );

  for (const operation of ["retry", "cancel"]) {
    app.post(
      `/api/admin/tasks/:taskId/${operation}`,
      authenticate,
      requireAdmin("tasks:write"),
      asyncHandler(async (req, res) => {
        const body = operationsMutationSchema.parse({
          idempotencyKey: req.get("Idempotency-Key") || req.body?.idempotencyKey,
        });
        const result = await mutateAdminTask({
          taskId: req.params.taskId,
          operation,
          idempotencyKey: body.idempotencyKey,
          actor: req.user.id,
          requestId: req.get("X-Request-ID") || null,
          ipHash: hashRequestIp(req.ip),
          userAgent: req.get("user-agent") || "",
        });
        res.json({ data: result });
      }),
    );
  }

  app.get(
    "/api/admin/users",
    authenticate,
    requireAdmin("users:read"),
    asyncHandler(async (req, res) => {
      const page = await listAdminPage("users", adminPageSchema.parse(req.query));
      res.json({ data: wantsPage(req) ? page : page.items });
    })
  );

  app.post(
    "/api/admin/users",
    authenticate,
    requireAdmin("users:write"),
    asyncHandler(async (req, res) => {
      const body = createAdminUserSchema.parse(req.body);
      assertAdminAccountMutationAllowed(req.user, { requestedRole: body.role });
      const existed = await findUserByEmail(body.email);
      if (existed) throw new HttpError(409, "Email already registered");
      const existedName = await findUserByDisplayName(body.displayName);
      if (existedName)
        throw new HttpError(409, "Display name already registered");

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
        payload: {
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          status: user.status,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.status(201).json({ data: { user } });
    })
  );

  app.get(
    "/api/admin/users/:userId",
    authenticate,
    requireAdmin("users:read"),
    asyncHandler(async (req, res) => {
      const includeAgents = hasAdminPermission(req.user, "agents:manage");
      const includeAudit = hasAdminPermission(req.user, "audit:read");
      const detail = await adminUserDetail({
        userId: req.params.userId,
        registeredAgents: includeAgents
          ? await listRegisteredAgentsWithCatalogue(await listAgents())
          : [],
        includeAgents,
        includeAudit,
      });
      if (!detail) throw new HttpError(404, "User not found");
      res.json({ data: detail });
    })
  );

  app.patch(
    "/api/admin/users/:userId/status",
    authenticate,
    requireAdmin("users:write"),
    asyncHandler(async (req, res) => {
      const { status } = userStatusSchema.parse(req.body);
      const target = await getRawUserById(req.params.userId);
      if (!target) throw new HttpError(404, "User not found");
      assertAdminAccountMutationAllowed(req.user, { targetRole: target.role });
      if (target.id === req.user.id && status !== "active") {
        throw new HttpError(400, "You cannot disable your own admin account");
      }

      const user = await updateUserStatus(target.id, status);
      await createUsageEvent({
        userId: req.user.id,
        eventType: "admin.user.status",
        targetType: "user",
        targetId: target.id,
        payload: {
          status,
          targetEmail: target.email,
          targetLoginName: target.login_name || null,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: { user } });
    })
  );

  app.patch(
    "/api/admin/users/:userId/role",
    authenticate,
    requireAdmin("users:write"),
    asyncHandler(async (req, res) => {
      const { role } = userRoleSchema.parse(req.body);
      const target = await getRawUserById(req.params.userId);
      if (!target) throw new HttpError(404, "User not found");
      assertAdminAccountMutationAllowed(req.user, {
        targetRole: target.role,
        requestedRole: role,
      });
      if (target.id === req.user.id && role !== "admin") {
        throw new HttpError(400, "You cannot remove your own admin permission");
      }

      const user = await updateUserRole(target.id, role);
      await createUsageEvent({
        userId: req.user.id,
        eventType: "admin.user.role",
        targetType: "user",
        targetId: target.id,
        payload: {
          role,
          targetEmail: target.email,
          targetLoginName: target.login_name || null,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: { user } });
    })
  );

  app.patch(
    "/api/admin/users/:userId/permissions",
    authenticate,
    requireAdmin("users:write"),
    asyncHandler(async (req, res) => {
      const { permissions } = adminPermissionsSchema.parse(req.body);
      const target = await getRawUserById(req.params.userId);
      if (!target) throw new HttpError(404, "User not found");
      assertAdminAccountMutationAllowed(req.user, { targetRole: "admin" });
      if (target.role !== "admin") {
        throw new HttpError(
          400,
          "Only admin users can receive admin permissions"
        );
      }
      if (target.id === req.user.id && !permissions.includes("*")) {
        throw new HttpError(
          400,
          "You cannot reduce your own super admin permission"
        );
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
    })
  );

  app.patch(
    "/api/admin/users/:userId/profile",
    authenticate,
    requireAdmin("users:write"),
    asyncHandler(async (req, res) => {
      const body = profileAdminSchema.parse(req.body);
      const target = await getRawUserById(req.params.userId);
      if (!target) throw new HttpError(404, "User not found");
      assertAdminAccountMutationAllowed(req.user, { targetRole: target.role });

      const profile = await updateUserProfileAdmin({
        userId: target.id,
        ...body,
      });
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
    })
  );

  app.post(
    "/api/admin/users/:userId/revoke-sessions",
    authenticate,
    requireAdmin("users:write"),
    asyncHandler(async (req, res) => {
      const target = await getRawUserById(req.params.userId);
      if (!target) throw new HttpError(404, "User not found");
      assertAdminAccountMutationAllowed(req.user, { targetRole: target.role });
      if (target.id === req.user.id) {
        throw new HttpError(
          400,
          "Use logout to revoke your current admin session"
        );
      }

      await revokeSessionsForUser(target.id);
      await createUsageEvent({
        userId: req.user.id,
        eventType: "admin.user.revoke_sessions",
        targetType: "user",
        targetId: target.id,
        payload: {
          targetEmail: target.email,
          targetLoginName: target.login_name || null,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: { ok: true } });
    })
  );

  app.patch(
    "/api/admin/users/:userId/agents/:agentId",
    authenticate,
    requireAdmin("agents:manage"),
    asyncHandler(createAdminAgentAccessHandler())
  );

  app.post(
    "/api/admin/users/:userId/reset-password",
    authenticate,
    requireAdmin("users:write"),
    asyncHandler(async (req, res) => {
      const { password } = resetPasswordSchema.parse(req.body);
      const target = await getRawUserById(req.params.userId);
      if (!target) throw new HttpError(404, "User not found");
      assertAdminAccountMutationAllowed(req.user, { targetRole: target.role });
      if (target.id === req.user.id) {
        throw new HttpError(
          400,
          "Use account settings to change your own password"
        );
      }

      const user = await updateUserPassword(
        target.id,
        await hashPassword(password)
      );
      await createUsageEvent({
        userId: req.user.id,
        eventType: "admin.user.password_reset",
        targetType: "user",
        targetId: target.id,
        payload: {
          targetEmail: target.email,
          targetLoginName: target.login_name || null,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: { user } });
    })
  );

  app.get(
    "/api/admin/events",
    authenticate,
    requireAdmin("audit:read"),
    asyncHandler(async (req, res) => {
      const page = await listAdminPage("events", adminPageSchema.parse(req.query));
      res.json({ data: wantsPage(req) ? page : page.items });
    })
  );

  app.get(
    "/api/admin/agent-runs",
    authenticate,
    requireAdmin("audit:read"),
    asyncHandler(async (req, res) => {
      const page = await listAdminPage("runs", adminPageSchema.parse(req.query));
      res.json({ data: wantsPage(req) ? page : page.items });
    })
  );

  app.get(
    "/api/admin/agents",
    authenticate,
    requireAdmin("agents:manage"),
    asyncHandler(async (_req, res) => {
      const [registered, recentRuns] = await Promise.all([
        listRegisteredAgentsWithCatalogue(await listAgents()),
        adminAgentRuns({ limit: 500 }),
      ]);
      const runCounts = recentRuns.reduce((groups, run) => {
        groups[run.agentId] ||= { total: 0, success: 0, error: 0, pending: 0 };
        groups[run.agentId].total += 1;
        groups[run.agentId][run.status] =
          (groups[run.agentId][run.status] || 0) + 1;
        return groups;
      }, {});

      res.json({
        data: registered.map((agent) => ({
          ...agent,
          runs: runCounts[agent.key] || {
            total: 0,
            success: 0,
            error: 0,
            pending: 0,
          },
        })),
      });
    })
  );

  app.get(
    "/api/admin/agent-usage",
    authenticate,
    requireAdmin("audit:read"),
    asyncHandler(async (req, res) => {
      const { days } = adminUsageWindowSchema.parse(req.query);
      res.json({ data: await adminAgentUsage({ days }) });
    }),
  );

  app.get(
    "/api/admin/agent-readiness",
    authenticate,
    requireAdmin("agents:manage"),
    asyncHandler(async (_req, res) => {
      res.json({ data: await buildAgentReadiness() });
    })
  );

  app.get(
    "/api/admin/model-status",
    authenticate,
    requireAdmin("model:operate"),
    asyncHandler(async (_req, res) => {
      res.json({ data: getModelRuntimeStatus() });
    })
  );

  app.post(
    "/api/admin/model-test",
    authenticate,
    requireAdmin("model:operate"),
    asyncHandler(async (req, res) => {
      const body = modelTestSchema.parse(req.body);
      const result = await testModelRuntime({
        input: body.input,
        role: body.role,
      });
      await createUsageEvent({
        userId: req.user.id,
        eventType: "admin.model_test",
        targetType: "model",
        targetId: result.model,
        payload: {
          provider: result.provider,
          modelRole: result.modelRole,
          servedModel: result.servedModel,
          latencyMs: result.latencyMs,
          tokenTotal: result.tokenUsage.total,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: result });
    })
  );
}
