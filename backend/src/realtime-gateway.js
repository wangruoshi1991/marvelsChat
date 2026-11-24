import WebSocket, { WebSocketServer } from "ws";
import { getActiveRealtimeSessionIds, getSessionUserFromToken } from "./auth.js";
import {
  getRawUserById,
  publicUser,
} from "./repositories.js";
import { listPresenceAudienceUserIds } from "./social-repository.js";

const publicPresenceStatusFor = (user, isConnected) =>
  user.presenceMode === "online" && isConnected ? "online" : "offline";

const defaultLogger = { error: (entry) => console.error(JSON.stringify(entry)) };

export const reportPresenceBroadcastFailure = ({ error, logger, reason, userId }) => {
  logger.error({
    type: "presence_broadcast_failure",
    errorName:
      typeof error?.name === "string" && error.name.trim()
        ? error.name.trim().slice(0, 80)
        : "Error",
    reason,
    userId,
  });
};

export function createRealtimeGateway(server, {
  logger = defaultLogger,
  authenticateSession = getSessionUserFromToken,
  getActiveSessions = getActiveRealtimeSessionIds,
  loadPresenceUser = getRawUserById,
  sessionCheckMs = 5000,
} = {}) {
  const realtimeServer = new WebSocketServer({ noServer: true });
  const realtimeClientsByUser = new Map();
  const offlineTimersByUser = new Map();
  const pendingDeliveries = new Map();
  const offlineBroadcastDelayMs = 8000;
  let closing = false;
  let closePromise = null;

  const activeClients = async (clients) => {
    const sessionIds = [...new Set(clients.map(([, sessionId]) => sessionId))];
    if (!sessionIds.length || closing) return [];
    const activeSessions = await getActiveSessions(sessionIds);
    if (closing) return [];
    return clients.filter(([socket, sessionId]) => {
      if (activeSessions.has(sessionId)) return true;
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1008, "Session expired or revoked");
      }
      return false;
    });
  };

  const reportDeliveryError = (error) => logger.error({
    type: "realtime_session_validation_failure",
    errorName: error?.name || "Error",
  });

  const sendRealtimeToUser = (userId, event) => {
    const clients = realtimeClientsByUser.get(userId);
    if (!clients?.size || closing) return;
    const recipients = [...clients];
    const payload = JSON.stringify(event);
    const delivery = Promise.resolve(pendingDeliveries.get(userId)).then(async () => {
      for (const [socket] of await activeClients(recipients)) {
        if (socket.readyState === WebSocket.OPEN) socket.send(payload);
      }
    }).catch(reportDeliveryError).finally(() => {
      if (pendingDeliveries.get(userId) === delivery) pendingDeliveries.delete(userId);
    });
    pendingDeliveries.set(userId, delivery);
    return delivery;
  };

  const sendPresenceChanged = async (userId, reason) => {
    const rawUser = await loadPresenceUser(userId);
    if (!rawUser) return;

    const user = publicUser(rawUser);
    const audienceUserIds = await listPresenceAudienceUserIds(userId);
    const publicEvent = {
      type: "presence.changed",
      reason,
      userId,
      presenceStatus: publicPresenceStatusFor(user, realtimeClientsByUser.has(userId)),
    };
    const selfEvent = {
      ...publicEvent,
      presenceMode: user.presenceMode,
    };

    sendRealtimeToUser(userId, selfEvent);
    for (const audienceUserId of audienceUserIds) {
      sendRealtimeToUser(audienceUserId, publicEvent);
    }
  };

  const registerRealtimeClient = (userId, sessionId, socket) => {
    if (closing) {
      socket.close(1001, "Server shutting down");
      return;
    }
    const clients = realtimeClientsByUser.get(userId) || new Map();
    const wasOffline = !clients.size;
    const offlineTimer = offlineTimersByUser.get(userId);
    if (offlineTimer) {
      clearTimeout(offlineTimer);
      offlineTimersByUser.delete(userId);
    }
    clients.set(socket, sessionId);
    realtimeClientsByUser.set(userId, clients);
    if (wasOffline) {
      sendPresenceChanged(userId, "connected").catch((error) =>
        reportPresenceBroadcastFailure({ error, logger, reason: "connected", userId }),
      );
    }
    socket.on("close", () => {
      clients.delete(socket);
      if (!clients.size) {
        realtimeClientsByUser.delete(userId);
        if (closing) return;
        const timer = setTimeout(() => {
          offlineTimersByUser.delete(userId);
          if (!realtimeClientsByUser.has(userId)) {
            sendPresenceChanged(userId, "disconnected").catch((error) =>
              reportPresenceBroadcastFailure({
                error,
                logger,
                reason: "disconnected",
                userId,
              }),
            );
          }
        }, offlineBroadcastDelayMs);
        offlineTimersByUser.set(userId, timer);
      }
    });
  };

  const handleUpgrade = async (request, socket, head) => {
    try {
      const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
      if (url.pathname !== "/api/realtime") {
        socket.destroy();
        return;
      }

      const protocols = String(request.headers["sec-websocket-protocol"] || "")
        .split(",")
        .map((item) => item.trim());
      const protocolToken = protocols
        .find((item) => item.startsWith("miaoxun.auth."))
        ?.slice("miaoxun.auth.".length) || "";
      const session = await authenticateSession(protocolToken);
      if (!(await getActiveSessions([session.sessionId])).has(session.sessionId) || closing) {
        socket.destroy();
        return;
      }
      realtimeServer.handleUpgrade(request, socket, head, (ws) => {
        registerRealtimeClient(session.user.id, session.sessionId, ws);
        ws.send(JSON.stringify({ type: "connection.ready", userId: session.user.id }));
      });
    } catch {
      socket.destroy();
    }
  };

  server.on("upgrade", handleUpgrade);
  let checkingSessions = false;
  const sessionCheck = setInterval(() => {
    if (checkingSessions || closing || !realtimeClientsByUser.size) return;
    checkingSessions = true;
    const clients = [...realtimeClientsByUser.values()].flatMap(clients => [...clients]);
    void activeClients(clients).catch(reportDeliveryError).finally(() => { checkingSessions = false; });
  }, sessionCheckMs);
  sessionCheck.unref();

  const close = () => {
    if (closePromise) return closePromise;
    closing = true;
    clearInterval(sessionCheck);
    server.off("upgrade", handleUpgrade);
    for (const timer of offlineTimersByUser.values()) clearTimeout(timer);
    offlineTimersByUser.clear();
    const sockets = Array.from(realtimeClientsByUser.values()).flatMap((clients) => [
      ...clients.keys(),
    ]);
    for (const socket of sockets) socket.close(1001, "Server shutting down");
    closePromise = new Promise((resolve, reject) => {
      const forceTimer = setTimeout(() => {
        for (const socket of sockets) socket.terminate();
      }, 5000);
      realtimeServer.close((error) => {
        clearTimeout(forceTimer);
        if (error) reject(error);
        else resolve();
      });
    }).finally(() => {
      realtimeClientsByUser.clear();
    });
    return closePromise;
  };

  return {
    getOnlineUserIds: () => Array.from(realtimeClientsByUser.keys()),
    sendPresenceChanged,
    sendRealtimeToUser,
    close,
  };
}
