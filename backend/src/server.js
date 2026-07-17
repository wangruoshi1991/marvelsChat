import cors from "cors";
import express from "express";
import helmet from "helmet";
import http from "http";
import { ZodError } from "zod";
import { createLegacyApiCompatibilityMiddleware } from "./api-compat.js";
import { authenticate, requireAdmin } from "./auth.js";
import { avatar3dJobRunner } from "./avatar-3d-job-runner.js";
import { registerAvatar3dWebRoutes } from "./avatar-3d-web-service.js";
import { config } from "./config.js";
import { createRealtimeGateway } from "./realtime-gateway.js";
import { registerAdminRoutes } from "./routes/admin-routes.js";
import { registerAppRoutes } from "./routes/app-routes.js";
import { registerAuthRoutes } from "./routes/auth-routes.js";
import { registerAvatar3dRoutes } from "./routes/avatar-3d-routes.js";
import { registerEventRoutes } from "./routes/event-routes.js";
import { registerMapRoutes } from "./routes/map-routes.js";
import { registerMessageRoutes } from "./routes/message-routes.js";
import { registerNotificationRoutes } from "./routes/notification-routes.js";
import { registerSocialRoutes } from "./routes/social-routes.js";
import { registerStationRoutes } from "./routes/station-routes.js";

const app = express();
const port = config.port;
const server = http.createServer(app);

app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use(createLegacyApiCompatibilityMiddleware());

const asyncHandler = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    next(error);
  }
};

const {
  getOnlineUserIds,
  sendPresenceChanged,
  sendRealtimeToUser,
} = createRealtimeGateway(server);

const sendNotificationChanged = (userId, reason, notification = null) => {
  sendRealtimeToUser(userId, {
    type: "notification.changed",
    reason,
    notificationId: notification?.id || null,
    notificationKind: notification?.kind || null,
    title: notification?.title || null,
    body: notification?.body || null,
  });
};

const sendRelationshipsChanged = (userId, reason) => {
  sendRealtimeToUser(userId, {
    type: "relationships.changed",
    reason,
  });
};

registerAppRoutes(app, {
  authenticate,
  asyncHandler,
  getOnlineUserIds,
  sendPresenceChanged,
});

registerAuthRoutes(app, { authenticate, asyncHandler });

registerAvatar3dRoutes(app, { asyncHandler });

registerAvatar3dWebRoutes(app);

registerSocialRoutes(app, {
  authenticate,
  asyncHandler,
  getOnlineUserIds,
  sendNotificationChanged,
  sendRelationshipsChanged,
});

registerNotificationRoutes(app, {
  authenticate,
  asyncHandler,
  sendNotificationChanged,
});

registerMessageRoutes(app, {
  authenticate,
  asyncHandler,
  getOnlineUserIds,
  sendRealtimeToUser,
});

registerStationRoutes(app, { authenticate, asyncHandler });

registerMapRoutes(app, { asyncHandler });

registerEventRoutes(app, { authenticate, asyncHandler });

registerAdminRoutes(app, {
  authenticate,
  asyncHandler,
  requireAdmin,
});

app.use((error, _req, res, _next) => {
  const isValidationError = error instanceof ZodError;
  const isMissingTable = ["42P01", "3D000"].includes(error.code);
  const status = isValidationError ? 400 : isMissingTable ? 503 : error.status || 500;
  const message = isValidationError
    ? "Invalid request payload"
    : isMissingTable
      ? "Database is not migrated. Run `cd backend && npm run db:migrate`."
      : error.message || "Internal Server Error";

  res.status(status).json({
    error: {
      message,
      details: isValidationError ? error.flatten() : error.details,
    },
  });
});

server.listen(port, () => {
  console.log(`marvelsChat backend listening on http://127.0.0.1:${port}`);
  avatar3dJobRunner.start();
});
