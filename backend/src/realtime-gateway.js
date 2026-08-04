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
  let closing = false;
  let closePromise = null;

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
    if (closing) {
      socket.close(1001, "Server shutting down");
      return;
    }
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
        if (closing) return;
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
      const session = await getSessionUserFromToken(protocolToken);
      realtimeServer.handleUpgrade(request, socket, head, (ws) => {
        registerRealtimeClient(session.user.id, ws);
        ws.send(JSON.stringify({ type: "connection.ready", userId: session.user.id }));
      });
    } catch {
      socket.destroy();
    }
  };

  server.on("upgrade", handleUpgrade);

  const close = () => {
    if (closePromise) return closePromise;
    closing = true;
    server.off("upgrade", handleUpgrade);
    for (const timer of offlineTimersByUser.values()) clearTimeout(timer);
    offlineTimersByUser.clear();
    const sockets = Array.from(realtimeClientsByUser.values()).flatMap((clients) => [
      ...clients,
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
