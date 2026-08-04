import { listAgents } from "../../../agents/registry.js";
import { checkDatabase } from "../db.js";
import { HttpError } from "../http-error.js";
import {
  createUsageEvent,
  getBootstrapForUser,
  hashRequestIp,
  parseAiIdFromScanPayload,
  setUserAgentAccess,
  updateUserPresenceMode,
} from "../repositories.js";
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
  getStationContentForUser,
} from "../station-repository.js";
import {
  aiIdSchema,
  agentAccessSchema,
  presenceSchema,
  scanPayloadSchema,
  searchHistoryParamsSchema,
  searchHistorySchema,
  searchUsersSchema,
} from "../schemas.js";

export function registerAppRoutes(
  app,
  {
    authenticate,
    asyncHandler,
    getOnlineUserIds,
    sendPresenceChanged,
    checkDatabaseStatus = checkDatabase,
  },
) {
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      app: "marvelsChat",
      service: "miaoxun-backend",
    });
  });

  app.get("/api/ready", asyncHandler(async (_req, res) => {
    const database = await checkDatabaseStatus();
    const ready = database.configured && database.connected && database.migrationsCurrent;
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
  }));

  app.get("/api/agents", asyncHandler(async (_req, res) => {
    res.json({ data: await listAgents() });
  }));

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
      const registeredAgents = await listAgents();
      const data = await getBootstrapForUser(req.user, registeredAgents, getOnlineUserIds());
      res.json({ data });
    }),
  );

  app.patch(
    "/api/me/agents/:agentId",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = agentAccessSchema.parse(req.body);
      const registeredAgents = await listAgents();
      const agent = registeredAgents.find((item) => item.key === req.params.agentId);
      if (!agent) throw new HttpError(404, "Agent not found");

      const [updated] = await setUserAgentAccess({
        userId: req.user.id,
        agent,
        enabled: body.enabled,
        alias: body.alias,
        grantedScopes: body.grantedScopes,
      });

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

      res.json({ data: updated });
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
        getStationContentForUser(publicProfile.user.id),
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
