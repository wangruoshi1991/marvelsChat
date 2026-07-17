import cors from "cors";
import express from "express";
import helmet from "helmet";
import http from "http";
import { createLegacyApiCompatibilityMiddleware } from "./api-compat.js";
import { authenticate, requireAdmin } from "./auth.js";
import { config } from "./config.js";
import { avatar3dJobRunner } from "./avatar-3d-job-runner.js";
import { registerAvatar3dWebRoutes } from "./avatar-3d-web-service.js";
import { homepageJobRunner } from "./homepage-job-runner.js";
import { registerHomepageWebRoutes } from "./homepage-web-service.js";
import { sentry } from "./instrument.js";
import {
  createRequestErrorHandler,
  createRequestObservabilityMiddleware,
} from "./request-observability.js";
import { createRealtimeGateway } from "./realtime-gateway.js";
import { registerAdminRoutes } from "./routes/admin-routes.js";
import { registerAccountRoutes } from "./routes/account-routes.js";
import { registerAppRoutes } from "./routes/app-routes.js";
import { registerAuthRoutes } from "./routes/auth-routes.js";
import { registerAvatar3dRoutes } from "./routes/avatar-3d-routes.js";
import { registerEventRoutes } from "./routes/event-routes.js";
import { registerMapRoutes } from "./routes/map-routes.js";
import { registerHomepagePublicRoutes } from "./routes/homepage-public-routes.js";
import { registerMessageRoutes } from "./routes/message-routes.js";
import { registerNotificationRoutes } from "./routes/notification-routes.js";
import { registerSocialRoutes } from "./routes/social-routes.js";
import { registerStationRoutes } from "./routes/station-routes.js";

const app = express();
const port = config.port;
const server = http.createServer(app);

app.use(createRequestObservabilityMiddleware());
app.use(helmet({
  referrerPolicy: { policy: "no-referrer" },
  contentSecurityPolicy: {
    directives: {
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(cors({
  origin: config.corsOrigin,
  exposedHeaders: ["X-Request-ID"],
}));
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

registerAccountRoutes(app, { authenticate, asyncHandler });

registerHomepagePublicRoutes(app, { asyncHandler });

registerHomepageWebRoutes(app);

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

app.use(createRequestErrorHandler({ sentry }));

server.listen(port, () => {
  console.log(`marvelsChat backend listening on http://127.0.0.1:${port}`);
  homepageJobRunner.start();
  avatar3dJobRunner.start();
});
