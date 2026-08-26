import cors from "cors";
import express from "express";
import helmet from "helmet";
import http from "http";
import { authenticate, requireAdmin } from "./auth.js";
import { avatar3dJobRunner } from "./avatar-3d-job-runner.js";
import { registerAvatar3dWebRoutes } from "./avatar-3d-web-service.js";
import { config } from "./config.js";
import { closeDatabase } from "./db.js";
import { createCorsOptionsDelegate } from "./cors-policy.js";
import { HttpError } from "./http-error.js";
import {
  createRequestErrorHandler,
  createRequestObservabilityMiddleware,
} from "./request-observability.js";
import { createRealtimeGateway } from "./realtime-gateway.js";
import { installGracefulShutdown } from "./server-shutdown.js";
import { registerAdminRoutes } from "./routes/admin-routes.js";
import { registerAccountRoutes } from "./routes/account-routes.js";
import { registerAgentRunRoutes } from "./routes/agent-run-routes.js";
import { registerAppRoutes } from "./routes/app-routes.js";
import { registerAuthRoutes } from "./routes/auth-routes.js";
import { registerAvatar3dAppRoutes } from "./routes/avatar-3d-app-routes.js";
import { registerAvatar3dRoutes } from "./routes/avatar-3d-routes.js";
import { registerEventRoutes } from "./routes/event-routes.js";
import { registerMessageRoutes } from "./routes/message-routes.js";
import { registerNotificationRoutes } from "./routes/notification-routes.js";
import { registerSocialRoutes } from "./routes/social-routes.js";
import { registerStationRoutes } from "./routes/station-routes.js";

const app = express();
const host = config.host;
const port = config.port;
const server = http.createServer(app);

if (config.trustProxyHops > 0) {
  app.set("trust proxy", config.trustProxyHops);
}
app.use(createRequestObservabilityMiddleware());
app.use(helmet());
app.use(cors(createCorsOptionsDelegate({ origin: config.corsOrigin })));
app.use(express.json({ limit: "1mb" }));

const asyncHandler = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    next(error);
  }
};

const realtimeGateway = createRealtimeGateway(server);
const {
  getOnlineUserIds,
  sendPresenceChanged,
  sendRealtimeToUser,
} = realtimeGateway;

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

registerAccountRoutes(app, { authenticate, asyncHandler });

registerAvatar3dAppRoutes(app, { authenticate, asyncHandler });

registerAvatar3dRoutes(app, { asyncHandler });

registerAvatar3dWebRoutes(app, { asyncHandler });

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

registerAgentRunRoutes(app, { authenticate, asyncHandler });

registerEventRoutes(app, { authenticate, asyncHandler });

registerAdminRoutes(app, {
  authenticate,
  asyncHandler,
  requireAdmin,
});

app.use((_req, _res, next) => next(new HttpError(404, "Not Found")));
app.use(createRequestErrorHandler());

installGracefulShutdown({
  server,
  realtimeGateway,
  jobRunner: avatar3dJobRunner,
  closeDatabase,
  logger: console,
});

server.listen(port, host, () => {
  console.log(`marvelsChat backend listening on http://${host}:${port}`);
  avatar3dJobRunner.start();
});
