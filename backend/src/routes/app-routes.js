import { listAgents } from "../../../agents/registry.js";
import {
  listPublishedRegisteredAgents,
  listRegisteredAgentsWithCatalogue,
} from "../agent-catalog-repository.js";
import { aiClientContracts } from "../ai-client-contract.js";
import { publicMessagesByThread } from "../public-message.js";
import { checkDatabase } from "../db.js";
import { HttpError } from "../http-error.js";
import {
  createUsageEvent,
  getBootstrapForUser,
  getAgentContextForUser,
  hashRequestIp,
  listNotificationsForUser,
  unreadNotificationCount,
  parseAiIdFromScanPayload,
  resolveAgentGrantedScopes,
  updateUserPresenceMode,
} from "../repositories.js";
import { listMessagesForThreads, listThreadIdsUpdatedSince, listThreadsForUser } from "../message-repository.js";
import { buildPublicStationView } from "../public-station-service.js";
import {
  clearSearchHistory,
  deleteSearchHistoryItem,
  listSearchHistory,
  saveSearchHistory,
  searchPublicProfiles,
} from "../search-repository.js";
import {
  getProfileForUser,
  getPublicProfileByAiId,
  getStationContentForViewer,
} from "../station-repository.js";
import {
  aiIdSchema,
  agentAccessSchema,
  presenceSchema,
  scanPayloadSchema,
  incrementalSyncSchema,
  searchHistoryParamsSchema,
  searchHistorySchema,
  searchUsersSchema,
} from "../schemas.js";
import { getPublishedProductCatalog } from "../product-catalog-projection.js";
import { agentPublishingService } from "../agent-publishing-service.js";

export function registerAppRoutes(
  app,
  {
    authenticate,
    asyncHandler,
    getOnlineUserIds,
    sendPresenceChanged,
    checkDatabaseStatus = checkDatabase,
    getBootstrap = getBootstrapForUser,
    resolveRegisteredAgents = null,
    getPublishedCatalog = getPublishedProductCatalog,
    setAgentProductAccess = agentPublishingService.setAgentAccessThroughProduct,
    getAgentContext = getAgentContextForUser,
    listUpdatedThreadIds = listThreadIdsUpdatedSince,
    listUserThreads = listThreadsForUser,
    listUserMessages = listMessagesForThreads,
    listUserNotifications = listNotificationsForUser,
    getUnreadNotices = unreadNotificationCount,
  },
) {
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      app: "marvelsChat",
      service: "miaoxun-backend",
    });
  });

  app.get(
    "/api/ready",
    asyncHandler(async (_req, res) => {
      const database = await checkDatabaseStatus();
      const ready =
        database.configured && database.connected && database.migrationsCurrent;
      res.status(ready ? 200 : 503).json({
        ok: ready,
        app: "marvelsChat",
        service: "miaoxun-backend",
        dependencies: {
          database: {
            configured: database.configured,
            connected: database.connected,
            migrationsCurrent: Boolean(database.migrationsCurrent),
          },
        },
      });
    }),
  );

  app.get(
    "/api/agents",
    asyncHandler(async (_req, res) => {
      const registered = await listAgents();
      res.json({ data: await listPublishedRegisteredAgents(registered) });
    }),
  );

  app.patch(
    "/api/me/presence",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = presenceSchema.parse(req.body);
      const user = await updateUserPresenceMode(req.user.id, body.presenceMode);
      req.user.presenceMode = user.presenceMode;
      await createUsageEvent({
        userId: req.user.id,
        eventType: "profile.presence.update",
        targetType: "user",
        targetId: req.user.id,
        payload: { presenceMode: user.presenceMode },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      await sendPresenceChanged(req.user.id, "mode_changed");
      res.json({ data: user });
    }),
  );

  app.get(
    "/api/app/bootstrap",
    authenticate,
    asyncHandler(async (req, res) => {
      const allRegisteredAgents = resolveRegisteredAgents
        ? await resolveRegisteredAgents()
        : getBootstrap === getBootstrapForUser
        ? await listRegisteredAgentsWithCatalogue(await listAgents())
        : await listAgents();
      const registeredAgents = allRegisteredAgents.filter(
        (agent) => agent.published === true,
      );
      const data = await getBootstrap(
        req.user,
        registeredAgents,
        getOnlineUserIds(),
        allRegisteredAgents,
      );
      const catalog = await getPublishedCatalog(req.user.id);
      if (data.agents?.owned && Array.isArray(data.agents.registered)) {
        const ownedKeys = new Set(data.agents.owned.map((agent) => agent.id));
        data.agents.registered = allRegisteredAgents.filter(
          (agent) => agent.published === true || ownedKeys.has(agent.key),
        );
      }
      res.json({
        data: {
          ...data,
          messagesByThread: publicMessagesByThread(data.messagesByThread),
          contracts: aiClientContracts,
          products: catalog.products,
          entitlements: catalog.entitlements,
          catalogRevision: catalog.catalogRevision,
          catalogStatus: catalog.catalogStatus,
          ...(catalog.catalogError ? { catalogError: catalog.catalogError } : {}),
        },
      });
    }),
  );

  app.get(
    "/api/app/sync",
    authenticate,
    asyncHandler(async (req, res) => {
      const { updatedAfter } = incrementalSyncSchema.parse(req.query);
      // Capture the cursor before database reads. Changes committed while this
      // snapshot is being assembled must remain eligible for the next sync.
      const serverTime = new Date().toISOString();
      const allRegisteredAgents = resolveRegisteredAgents
        ? await resolveRegisteredAgents()
        : await listRegisteredAgentsWithCatalogue(await listAgents());
      const registeredAgents = allRegisteredAgents.filter((agent) => agent.published === true);
      const onlineUserIds = getOnlineUserIds();
      const context = await getAgentContext(
        req.user,
        registeredAgents,
        allRegisteredAgents,
      );
      const threadIds = await listUpdatedThreadIds(req.user.id, updatedAfter || null);
      const allThreads = await listUserThreads(req.user.id, onlineUserIds);
      const threads = allThreads.filter((thread) => threadIds.includes(thread.id));
      const selectedMessages = await listUserMessages(req.user.id, threadIds);
      const messagesByThread = publicMessagesByThread(
        Object.fromEntries(Object.entries(selectedMessages).filter(([threadId]) => threadIds.includes(threadId))),
      );
      const [notices, unreadNotices, catalog] = await Promise.all([
        listUserNotifications(req.user.id),
        getUnreadNotices(req.user.id),
        getPublishedCatalog(req.user.id),
      ]);
      const ownedKeys = new Set(context.ownedAgents.map((agent) => agent.id));
      res.json({
        data: {
          serverTime,
          threads,
          messagesByThread,
          notices,
          unreadNoticeCount: unreadNotices,
          agents: {
            registered: allRegisteredAgents.filter((agent) => agent.published === true || ownedKeys.has(agent.key)),
            owned: context.ownedAgents,
          },
          products: catalog.products,
          entitlements: catalog.entitlements,
          catalogRevision: catalog.catalogRevision,
          catalogStatus: catalog.catalogStatus,
        },
      });
    }),
  );

  app.patch(
    "/api/me/agents/:agentId",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = agentAccessSchema.parse(req.body);
      const registeredAgents = await listRegisteredAgentsWithCatalogue(
        await listAgents(),
      );
      const agent = registeredAgents.find(
        (item) => item.key === req.params.agentId,
      );
      if (!agent) throw new HttpError(404, "Agent not found");
      if (body.enabled && agent.published === false) {
        throw new HttpError(409, "Agent 暂未上架，无法添加。", {
          code: "AGENT_NOT_PUBLISHED",
        });
      }
      // Validate scopes before any consent/index side effects.
      if (body.enabled) resolveAgentGrantedScopes(agent, body.grantedScopes);
      if (
        body.albumAIConsentVersion &&
        (agent.key !== "album-manager" || !body.enabled)
      )
        throw new HttpError(400, "相册 AI 授权请求无效。");

      const entitlement = await setAgentProductAccess({
        userId: req.user.id,
        agentKey: agent.key,
        enabled: body.enabled,
        grantedScopes: body.grantedScopes,
        consentVersion: body.albumAIConsentVersion || null,
        idempotencyKey: req.get("Idempotency-Key") || null,
      });
      const updated = {
        id: agent.key,
        name: agent.name,
        description: agent.description || "",
        category: agent.category || "",
        enabled: body.enabled,
        grantedScopes: entitlement.grantedScopes,
        published: agent.published === true,
        identity: agent.identity,
      };

      await createUsageEvent({
        userId: req.user.id,
        eventType: body.enabled ? "agent.enable" : "agent.disable",
        targetType: "agent",
        targetId: agent.key,
        payload: {
          category: agent.category,
          grantedScopes: body.grantedScopes,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: updated, entitlement });
    }),
  );

  app.post(
    "/api/scan/resolve",
    authenticate,
    asyncHandler(async (req, res) => {
      const { payload } = scanPayloadSchema.parse(req.body);
      const aiId = parseAiIdFromScanPayload(payload);
      if (!aiId) throw new HttpError(400, "Unsupported scan payload");
      const profile = await getPublicProfileByAiId({
        viewerUserId: req.user.id,
        aiId,
        onlineUserIds: getOnlineUserIds(),
      });
      if (!profile) throw new HttpError(404, "Profile not found");
      await createUsageEvent({
        userId: req.user.id,
        eventType: "scan.resolve",
        targetType: "user",
        targetId: profile.user.id,
        payload: { aiId },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.json({ data: profile });
    }),
  );

  app.delete(
    "/api/search/history",
    authenticate,
    asyncHandler(async (req, res) => {
      res.json({ data: await clearSearchHistory(req.user.id) });
    }),
  );

  app.delete(
    "/api/search/history/:historyId",
    authenticate,
    asyncHandler(async (req, res) => {
      const { historyId } = searchHistoryParamsSchema.parse(req.params);
      res.json({
        data: await deleteSearchHistoryItem({
          userId: req.user.id,
          historyId,
        }),
      });
    }),
  );

  app.get(
    "/api/profiles/ai/:aiId",
    authenticate,
    asyncHandler(async (req, res) => {
      const { aiId } = aiIdSchema.parse(req.params);
      const profile = await getPublicProfileByAiId({
        viewerUserId: req.user.id,
        aiId,
        onlineUserIds: getOnlineUserIds(),
      });
      if (!profile) throw new HttpError(404, "Profile not found");
      res.json({ data: profile });
    }),
  );

  app.get(
    "/api/stations/ai/:aiId",
    authenticate,
    asyncHandler(async (req, res) => {
      const { aiId } = aiIdSchema.parse(req.params);
      const publicProfile = await getPublicProfileByAiId({
        viewerUserId: req.user.id,
        aiId,
        onlineUserIds: getOnlineUserIds(),
      });
      if (!publicProfile) throw new HttpError(404, "Profile not found");

      const [ownerProfile, stationContent] = await Promise.all([
        getProfileForUser(publicProfile.user.id),
        getStationContentForViewer({
          ownerUserId: publicProfile.user.id,
          viewerUserId: req.user.id,
        }),
      ]);

      res.json({
        data: buildPublicStationView({
          publicProfile,
          ownerProfile,
          stationContent,
        }),
      });
    }),
  );

  app.get(
    "/api/search/history",
    authenticate,
    asyncHandler(async (req, res) => {
      res.json({ data: await listSearchHistory(req.user.id) });
    }),
  );

  app.post(
    "/api/search/history",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = searchHistorySchema.parse(req.body);
      res.status(201).json({
        data: await saveSearchHistory({
          userId: req.user.id,
          queryText: body.query,
          scope: body.scope,
        }),
      });
    }),
  );

  app.get(
    "/api/search/users",
    authenticate,
    asyncHandler(async (req, res) => {
      const { query } = searchUsersSchema.parse(req.query);
      res.json({
        data: await searchPublicProfiles({
          viewerUserId: req.user.id,
          queryText: query,
          onlineUserIds: getOnlineUserIds(),
        }),
      });
    }),
  );
}
