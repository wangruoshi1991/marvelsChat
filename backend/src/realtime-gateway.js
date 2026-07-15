import WebSocket, { WebSocketServer } from "ws";
import { getSessionUserFromToken } from "./auth.js";
import {
  getRawUserById,
  publicUser,
} from "./repositories.js";
import { listPresenceAudienceUserIds } from "./social-repository.js";

const publicPresenceStatusFor = (user, isConnected) =>
  user.presenceMode === "online" && isConnected ? "online" : "offline";

export function createRealtimeGateway(server) {
  const realtimeServer = new WebSocketServer({ noServer: true });
  const realtimeClientsByUser = new Map();
  const offlineTimersByUser = new Map();
  const offlineBroadcastDelayMs = 8000;

  const sendRealtimeToUser = (userId, event) => {
    const clients = realtimeClientsByUser.get(userId);
    if (!clients?.size) return;

    const payload = JSON.stringify(event);
    for (const socket of clients) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  };

  const sendPresenceChanged = async (userId, reason) => {
    const rawUser = await getRawUserById(userId);
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

  const registerRealtimeClient = (userId, socket) => {
    const clients = realtimeClientsByUser.get(userId) || new Set();
    const wasOffline = !clients.size;
    const offlineTimer = offlineTimersByUser.get(userId);
    if (offlineTimer) {
      clearTimeout(offlineTimer);
      offlineTimersByUser.delete(userId);
    }
    clients.add(socket);
    realtimeClientsByUser.set(userId, clients);
    if (wasOffline) {
      sendPresenceChanged(userId, "connected").catch(() => undefined);
    }
    socket.on("close", () => {
      clients.delete(socket);
      if (!clients.size) {
        realtimeClientsByUser.delete(userId);
        const timer = setTimeout(() => {
          offlineTimersByUser.delete(userId);
          if (!realtimeClientsByUser.has(userId)) {
            sendPresenceChanged(userId, "disconnected").catch(() => undefined);
          }
        }, offlineBroadcastDelayMs);
        offlineTimersByUser.set(userId, timer);
      }
    });
  };

  server.on("upgrade", async (request, socket, head) => {
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
      const session = await getSessionUserFromToken(protocolToken);
      realtimeServer.handleUpgrade(request, socket, head, (ws) => {
        registerRealtimeClient(session.user.id, ws);
        ws.send(JSON.stringify({ type: "connection.ready", userId: session.user.id }));
      });
    } catch {
      socket.destroy();
    }
  });

  return {
    getOnlineUserIds: () => Array.from(realtimeClientsByUser.keys()),
    sendPresenceChanged,
    sendRealtimeToUser,
  };
}
