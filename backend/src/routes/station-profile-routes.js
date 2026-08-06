import { resolveLocation } from "../location-service.js";
import {
  getProfileVisibility,
  listMiaoPointLedger,
  updateProfileVisibility,
  updateUserProfile,
  updateUserStationConfig,
} from "../station-repository.js";
import { createUsageEvent, hashRequestIp } from "../repositories.js";
import {
  locationResolveSchema,
  miaoPointLedgerQuerySchema,
  profileSelfSchema,
  profileVisibilitySchema,
  stationConfigSchema,
} from "../schemas.js";

export function registerStationProfileRoutes(app, { authenticate, asyncHandler }) {
  app.get(
    "/api/me/miao-points",
    authenticate,
    asyncHandler(async (req, res) => {
      const { limit } = miaoPointLedgerQuerySchema.parse(req.query);
      res.json({ data: await listMiaoPointLedger(req.user.id, limit) });
    }),
  );

  app.patch(
    "/api/me/station-config",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = stationConfigSchema.parse(req.body);
      const profile = await updateUserStationConfig(req.user.id, body);
      res.json({ data: profile });
    }),
  );

  app.patch(
    "/api/me/profile",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = profileSelfSchema.parse(req.body);
      const profile = await updateUserProfile({
        userId: req.user.id,
        ...body,
      });
      await createUsageEvent({
        userId: req.user.id,
        eventType: "profile.update",
        targetType: "user",
        targetId: req.user.id,
        payload: {
          hasCommunity: Boolean(body.community),
          hasActivityArea: Boolean(body.activityArea),
          avatarVersion: body.avatarConfig.version,
          avatarBody: body.avatarConfig.body,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.json({ data: profile });
    }),
  );

  app.get(
    "/api/me/profile-visibility",
    authenticate,
    asyncHandler(async (req, res) => {
      res.json({ data: await getProfileVisibility(req.user.id) });
    }),
  );

  app.patch(
    "/api/me/profile-visibility",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = profileVisibilitySchema.parse(req.body);
      res.json({ data: await updateProfileVisibility(req.user.id, body) });
    }),
  );

  app.post(
    "/api/location/resolve",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = locationResolveSchema.parse(req.body);
      const location = await resolveLocation(body);
      await createUsageEvent({
        userId: req.user.id,
        eventType: "location.resolve",
        targetType: "profile",
        targetId: req.user.id,
        payload: {
          provider: location.provider,
          hasCommunity: Boolean(location.community),
          hasActivityArea: Boolean(location.activityArea),
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.json({ data: location });
    }),
  );
}
