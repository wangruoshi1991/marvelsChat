import { HttpError } from "../http-error.js";
import { ensureFriendThreadForUser } from "../message-repository.js";
import {
  createUsageEvent,
  getRawUserById,
  hashRequestIp,
} from "../repositories.js";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  createFriendRequest,
  followUser,
  listRelationshipProfiles,
  rejectFriendRequest,
  unfollowUser,
} from "../social-repository.js";
import { friendRequestSchema, relationshipTypeSchema } from "../schemas.js";

export function registerSocialRoutes(
  app,
  {
    authenticate,
    asyncHandler,
    getOnlineUserIds,
    sendNotificationChanged,
    sendRelationshipsChanged,
  },
) {
  app.post(
    "/api/social/follows/:targetUserId",
    authenticate,
    asyncHandler(async (req, res) => {
      const target = await getRawUserById(req.params.targetUserId);
      if (!target || target.status !== "active") throw new HttpError(404, "User not found");
      const result = await followUser({
        followerUserId: req.user.id,
        followedUserId: target.id,
      });
      if (result.notification) {
        sendNotificationChanged(target.id, "follow.created", result.notification);
      }
      sendRelationshipsChanged(req.user.id, "follow.created");
      sendRelationshipsChanged(target.id, "follow.created");
      await createUsageEvent({
        userId: req.user.id,
        eventType: "social.follow",
        targetType: "user",
        targetId: target.id,
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.status(201).json({ data: result });
    }),
  );

  app.delete(
    "/api/social/follows/:targetUserId",
    authenticate,
    asyncHandler(async (req, res) => {
      const target = await getRawUserById(req.params.targetUserId);
      if (!target || target.status !== "active") throw new HttpError(404, "User not found");
      const result = await unfollowUser({
        followerUserId: req.user.id,
        followedUserId: target.id,
      });
      sendRelationshipsChanged(req.user.id, "follow.deleted");
      sendRelationshipsChanged(target.id, "follow.deleted");
      await createUsageEvent({
        userId: req.user.id,
        eventType: "social.unfollow",
        targetType: "user",
        targetId: target.id,
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.json({ data: result });
    }),
  );

  app.post(
    "/api/social/friend-requests/:targetUserId",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = friendRequestSchema.parse(req.body);
      const target = await getRawUserById(req.params.targetUserId);
      if (!target || target.status !== "active") throw new HttpError(404, "User not found");
      const request = await createFriendRequest({
        requesterUserId: req.user.id,
        targetUserId: target.id,
        message: body.message,
      });
      if (request.notification) {
        sendNotificationChanged(target.id, "friend.request", request.notification);
      }
      await createUsageEvent({
        userId: req.user.id,
        eventType: "social.friend_request",
        targetType: "user",
        targetId: target.id,
        payload: { requestId: request.id },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.status(201).json({ data: request });
    }),
  );

  app.post(
    "/api/social/friend-requests/:requestId/accept",
    authenticate,
    asyncHandler(async (req, res) => {
      const request = await acceptFriendRequest({
        requestId: req.params.requestId,
        targetUserId: req.user.id,
      });
      sendNotificationChanged(req.user.id, "friend.request.accepted", {
        id: req.params.requestId,
        kind: "friend.request",
      });
      if (request.notification) {
        sendNotificationChanged(request.notification.userId, "friend.accepted", request.notification);
      }
      sendRelationshipsChanged(req.user.id, "friend.accepted");
      if (request.notification?.userId) {
        sendRelationshipsChanged(request.notification.userId, "friend.accepted");
      }
      await createUsageEvent({
        userId: req.user.id,
        eventType: "social.friend_accept",
        targetType: "friend_request",
        targetId: request.id,
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.json({ data: request });
    }),
  );

  app.post(
    "/api/social/friend-requests/:requestId/reject",
    authenticate,
    asyncHandler(async (req, res) => {
      const request = await rejectFriendRequest({
        requestId: req.params.requestId,
        targetUserId: req.user.id,
      });
      sendNotificationChanged(req.user.id, "friend.request.rejected", {
        id: req.params.requestId,
        kind: "friend.request",
      });
      sendRelationshipsChanged(req.user.id, "friend.rejected");
      sendRelationshipsChanged(request.requesterUserId, "friend.rejected");
      await createUsageEvent({
        userId: req.user.id,
        eventType: "social.friend_reject",
        targetType: "friend_request",
        targetId: request.id,
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.json({ data: request });
    }),
  );

  app.post(
    "/api/social/friend-requests/:requestId/cancel",
    authenticate,
    asyncHandler(async (req, res) => {
      const request = await cancelFriendRequest({
        requestId: req.params.requestId,
        requesterUserId: req.user.id,
      });
      sendNotificationChanged(request.targetUserId, "friend.request.cancelled", {
        id: req.params.requestId,
        kind: "friend.request",
      });
      sendRelationshipsChanged(req.user.id, "friend.cancelled");
      sendRelationshipsChanged(request.targetUserId, "friend.cancelled");
      await createUsageEvent({
        userId: req.user.id,
        eventType: "social.friend_cancel",
        targetType: "friend_request",
        targetId: request.id,
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.json({ data: request });
    }),
  );

  app.get(
    "/api/social/relationships/:type",
    authenticate,
    asyncHandler(async (req, res) => {
      const { type } = relationshipTypeSchema.parse(req.params);
      res.json({ data: await listRelationshipProfiles(req.user.id, type, 60, getOnlineUserIds()) });
    }),
  );

  app.post(
    "/api/social/friends/:friendUserId/thread",
    authenticate,
    asyncHandler(async (req, res) => {
      const bundle = await ensureFriendThreadForUser(req.user.id, req.params.friendUserId, getOnlineUserIds());
      await createUsageEvent({
        userId: req.user.id,
        eventType: "social.friend_thread.open",
        targetType: "user",
        targetId: req.params.friendUserId,
        payload: { threadId: bundle.thread.id },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.json({ data: bundle });
    }),
  );
}
