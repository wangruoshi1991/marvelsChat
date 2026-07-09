import {
  listNotificationsForUser,
  markNotificationRead,
  markNotificationsRead,
  unreadNotificationCount,
} from "../repositories.js";

export function registerNotificationRoutes(
  app,
  { authenticate, asyncHandler, sendNotificationChanged },
) {
  app.get(
    "/api/notifications",
    authenticate,
    asyncHandler(async (req, res) => {
      const [items, unreadCount] = await Promise.all([
        listNotificationsForUser(req.user.id),
        unreadNotificationCount(req.user.id),
      ]);
      res.json({ data: { items, unreadCount } });
    }),
  );

  app.post(
    "/api/notifications/read",
    authenticate,
    asyncHandler(async (req, res) => {
      const result = await markNotificationsRead(req.user.id);
      sendNotificationChanged(req.user.id, "notifications.read");
      res.json({ data: result });
    }),
  );

  app.post(
    "/api/notifications/:notificationId/read",
    authenticate,
    asyncHandler(async (req, res) => {
      const result = await markNotificationRead(req.user.id, req.params.notificationId);
      sendNotificationChanged(req.user.id, "notification.read");
      res.json({ data: result });
    }),
  );
}
