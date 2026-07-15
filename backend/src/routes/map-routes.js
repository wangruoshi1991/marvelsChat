import crypto from "crypto";
import { getSessionUserFromToken } from "../auth.js";
import { config } from "../config.js";
import { HttpError } from "../http-error.js";

const mapTicketTtlMs = 5 * 60 * 1000;
const mapTickets = new Map();

const pruneMapTickets = () => {
  const now = Date.now();
  for (const [ticket, record] of mapTickets.entries()) {
    if (record.expiresAt <= now) {
      mapTickets.delete(ticket);
    }
  }
};

const createMapTicket = (userId) => {
  pruneMapTickets();
  const ticket = crypto.randomBytes(24).toString("base64url");
  const expiresAt = Date.now() + mapTicketTtlMs;
  mapTickets.set(ticket, { userId, expiresAt });
  return {
    ticket,
    expiresAt: new Date(expiresAt).toISOString(),
  };
};

const getUserFromMapTicket = (ticket) => {
  const record = mapTickets.get(String(ticket || ""));
  if (!record || record.expiresAt <= Date.now()) {
    if (record) mapTickets.delete(ticket);
    throw new HttpError(401, "Invalid map ticket");
  }
  return { id: record.userId };
};

const authenticateMapAsset = async (req, _res, next) => {
  try {
    const header = req.get("authorization") || "";
    const headerToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const ticket = typeof req.query.ticket === "string" ? req.query.ticket.trim() : "";
    if (ticket) {
      req.user = getUserFromMapTicket(ticket);
    } else {
      const session = await getSessionUserFromToken(headerToken);
      req.user = session.user;
      req.sessionId = session.sessionId;
    }
    next();
  } catch (error) {
    next(error);
  }
};

export function registerMapRoutes(app, { asyncHandler }) {
  app.post(
    "/api/map/ticket",
    authenticateMapAsset,
    asyncHandler(async (req, res) => {
      res.set("Cache-Control", "no-store");
      res.json({ data: createMapTicket(req.user.id) });
    }),
  );

  app.get(
    "/api/map/style",
    authenticateMapAsset,
    asyncHandler(async (req, res) => {
      if (!config.mapTiles.urlTemplate) {
        throw new HttpError(503, "MAP_TILE_URL_TEMPLATE is not configured.");
      }
      if (!config.mapTiles.userAgent) {
        throw new HttpError(503, "MAP_TILE_USER_AGENT is not configured.");
      }
      if (!config.publicApiBaseUrl) {
        throw new HttpError(503, "PUBLIC_API_BASE_URL is not configured.");
      }

      const ticket = typeof req.query.ticket === "string" ? req.query.ticket.trim() : "";
      const mapTicket = ticket ? { ticket } : createMapTicket(req.user.id);
      const tileUrl = `${config.publicApiBaseUrl}/api/map/tiles/{z}/{x}/{y}.png?ticket=${encodeURIComponent(mapTicket.ticket)}`;

      res.set("Cache-Control", "private, max-age=60");
      res.json({
        version: 8,
        name: "Miaoxun Location Map",
        sources: {
          miaoxunTiles: {
            type: "raster",
            tiles: [tileUrl],
            tileSize: 256,
            attribution: "Map data provider configured by Miaoxun backend",
          },
        },
        layers: [
          {
            id: "miaoxunTiles",
            type: "raster",
            source: "miaoxunTiles",
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      });
    }),
  );

  app.get(
    "/api/map/tiles/:z/:x/:y.png",
    authenticateMapAsset,
    asyncHandler(async (req, res) => {
      if (!config.mapTiles.urlTemplate) {
        throw new HttpError(503, "MAP_TILE_URL_TEMPLATE is not configured.");
      }
      if (!config.mapTiles.userAgent) {
        throw new HttpError(503, "MAP_TILE_USER_AGENT is not configured.");
      }

      const z = Number(req.params.z);
      const x = Number(req.params.x);
      const y = Number(req.params.y);
      if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 19) {
        throw new HttpError(400, "Invalid map tile coordinates.");
      }
      const maxTile = 2 ** z;
      if (x < 0 || y < 0 || x >= maxTile || y >= maxTile) {
        throw new HttpError(400, "Map tile coordinates are out of range.");
      }

      const tileUrl = config.mapTiles.urlTemplate
        .replace("{z}", String(z))
        .replace("{x}", String(x))
        .replace("{y}", String(y));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.mapTiles.timeoutMs);
      let response;
      try {
        response = await fetch(tileUrl, {
          headers: {
            "Accept": "image/png,image/*",
            "User-Agent": config.mapTiles.userAgent,
          },
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new HttpError(504, "Map tile request timed out.");
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) {
        throw new HttpError(response.status, "Map tile service rejected the request.");
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      res.set("Content-Type", response.headers.get("content-type") || "image/png");
      res.set("Cache-Control", "private, max-age=300");
      res.send(bytes);
    }),
  );
}
