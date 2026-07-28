import crypto from "node:crypto";
import {
  getSessionUserFromToken,
  verifyPassword as verifyStoredPassword,
} from "./auth.js";
import { config } from "./config.js";
import { HttpError } from "./http-error.js";
import {
  createSessionForUser,
  findUserByLoginIdentifier,
  markLogin,
  revokeSession as revokeStoredSession,
} from "./repositories.js";
import { publicUser } from "./repository-mappers.js";

export const avatarSessionCookieName = "mx_avatar_session";
export const avatarCsrfCookieName = "mx_avatar_csrf";

const cookiePath = "/api/avatar-3d";
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

const parseCookies = (header = "") => {
  const result = {};
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = "";
    }
  }
  return result;
};

export const getAvatarCsrfToken = (req) => {
  const cookies = parseCookies(req.get("cookie") || "");
  return cookies[avatarCsrfCookieName] || "";
};

const serializeCookie = ({
  name,
  value,
  expiresAt,
  httpOnly = false,
  clear = false,
  secure = true,
}) => {
  const parts = [
    `${name}=${clear ? "" : encodeURIComponent(value)}`,
    `Path=${cookiePath}`,
    "SameSite=Strict",
  ];
  if (secure) parts.push("Secure");
  if (httpOnly) parts.push("HttpOnly");
  if (clear) {
    parts.push("Max-Age=0", "Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  } else if (expiresAt) {
    parts.push(`Expires=${new Date(expiresAt).toUTCString()}`);
  }
  return parts.join("; ");
};

const equalTokens = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length > 0
    && leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const isAvatarHttpsRequest = (req) => (req.get("x-forwarded-proto") || "")
  .split(",", 1)[0]
  .trim()
  .toLowerCase() === "https";

const requestHostname = (req) => {
  const host = String(req.get("host") || "").trim().toLowerCase();
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]"));
  return host.split(":", 1)[0];
};

const isLoopbackHostname = (hostname) =>
  ["localhost", "127.0.0.1", "::1"].includes(String(hostname || "").toLowerCase());

export const isAvatarLoopbackRequest = (req) =>
  !config.isProduction && isLoopbackHostname(requestHostname(req));

export const isAvatarTrustedRequest = (req) =>
  isAvatarHttpsRequest(req) || isAvatarLoopbackRequest(req);

export const requireAvatarHttps = (req, _res, next) => {
  if (!isAvatarTrustedRequest(req)) {
    next(new HttpError(426, "HTTPS is required.", { code: "HTTPS_REQUIRED" }));
    return;
  }
  next();
};

const isSameTrustedOrigin = (req) => {
  const origin = req.get("origin") || "";
  const host = req.get("host") || "";
  if (!origin || !host || !isAvatarTrustedRequest(req)) return false;
  try {
    const parsed = new URL(origin);
    const validProtocol = isAvatarHttpsRequest(req)
      ? parsed.protocol === "https:"
      : parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname);
    return validProtocol && parsed.host === host;
  } catch {
    return false;
  }
};

export function createAvatar3dSessionService({
  findUser = findUserByLoginIdentifier,
  verifyPassword = verifyStoredPassword,
  createSession = createSessionForUser,
  getSession = getSessionUserFromToken,
  markLogin: recordLogin = markLogin,
  revokeSession = revokeStoredSession,
  randomToken = () => crypto.randomBytes(32).toString("base64url"),
} = {}) {
  const createAvatarWebSession = async ({ identifier, password }) => {
    const userRow = await findUser(identifier);
    const valid = userRow
      && userRow.status === "active"
      && await verifyPassword(password, userRow.password_hash);
    if (!valid) throw new HttpError(401, "Invalid login credentials.");

    const session = await createSession(userRow.id);
    await recordLogin(userRow.id);
    const csrfToken = randomToken();
    return {
      user: { ...publicUser(userRow), lastLoginAt: new Date().toISOString() },
      csrfToken,
      cookies: [
        serializeCookie({
          name: avatarSessionCookieName,
          value: session.token,
          expiresAt: session.expiresAt,
          httpOnly: true,
        }),
        serializeCookie({
          name: avatarCsrfCookieName,
          value: csrfToken,
          expiresAt: session.expiresAt,
        }),
      ],
    };
  };

  const createAvatarAppSession = async ({ token, secure = true }) => {
    const normalizedToken = String(token || "").trim();
    const session = await getSession(normalizedToken);
    const csrfToken = randomToken();
    return {
      user: session.user,
      csrfToken,
      cookies: [
        serializeCookie({
          name: avatarSessionCookieName,
          value: normalizedToken,
          expiresAt: session.expiresAt,
          httpOnly: true,
          secure,
        }),
        serializeCookie({
          name: avatarCsrfCookieName,
          value: csrfToken,
          expiresAt: session.expiresAt,
          secure,
        }),
      ],
    };
  };

  const authenticateAvatarWeb = async (req, _res, next) => {
    try {
      if (!isAvatarTrustedRequest(req)) {
        throw new HttpError(426, "HTTPS is required.", { code: "HTTPS_REQUIRED" });
      }
      const cookies = parseCookies(req.get("cookie") || "");
      const session = await getSession(cookies[avatarSessionCookieName] || "");
      req.user = session.user;
      req.sessionId = session.sessionId;
      next();
    } catch (error) {
      next(error);
    }
  };

  const requireAvatarCsrf = (req, _res, next) => {
    if (safeMethods.has(String(req.method || "GET").toUpperCase())) {
      next();
      return;
    }
    const cookies = parseCookies(req.get("cookie") || "");
    const cookieToken = cookies[avatarCsrfCookieName] || "";
    const headerToken = req.get("x-csrf-token") || "";
    if (!equalTokens(cookieToken, headerToken) || !isSameTrustedOrigin(req)) {
      next(new HttpError(403, "Request verification failed.", { code: "CSRF_REJECTED" }));
      return;
    }
    next();
  };

  const clearAvatarWebSession = async ({ sessionId }) => {
    await revokeSession(sessionId);
    return {
      cookies: [
        serializeCookie({ name: avatarSessionCookieName, value: "", httpOnly: true, clear: true }),
        serializeCookie({ name: avatarCsrfCookieName, value: "", clear: true }),
      ],
    };
  };

  return {
    createAvatarWebSession,
    createAvatarAppSession,
    authenticateAvatarWeb,
    requireAvatarCsrf,
    clearAvatarWebSession,
  };
}

const avatar3dSessionService = createAvatar3dSessionService();

export const createAvatarWebSession = avatar3dSessionService.createAvatarWebSession;
export const createAvatarAppSession = avatar3dSessionService.createAvatarAppSession;
export const authenticateAvatarWeb = avatar3dSessionService.authenticateAvatarWeb;
export const requireAvatarCsrf = avatar3dSessionService.requireAvatarCsrf;
export const clearAvatarWebSession = avatar3dSessionService.clearAvatarWebSession;
