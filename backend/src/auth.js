import crypto from "crypto";
import { promisify } from "util";
import { config } from "./config.js";
import { query } from "./db.js";
import { HttpError } from "./http-error.js";

const pbkdf2Async = promisify(crypto.pbkdf2);
const passwordIterations = 310000;
const passwordKeyLength = 32;
const passwordDigest = "sha256";

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const key = await pbkdf2Async(
    password,
    salt,
    passwordIterations,
    passwordKeyLength,
    passwordDigest,
  );

  return `pbkdf2$${passwordIterations}$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(password, storedHash) {
  const [scheme, iterationsText, salt, storedKey] = String(storedHash || "").split("$");
  if (scheme !== "pbkdf2" || !iterationsText || !salt || !storedKey) return false;

  const iterations = Number(iterationsText);
  if (!Number.isFinite(iterations)) return false;

  const expected = Buffer.from(storedKey, "base64url");
  const actual = await pbkdf2Async(password, salt, iterations, expected.length, passwordDigest);

  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

export function createPlainToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function sessionExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.auth.sessionTtlDays);
  return expiresAt;
}

export async function getSessionUserFromToken(token) {
  const plainToken = String(token || "").trim();
  if (!plainToken) throw new HttpError(401, "Authentication required");

  const rows = await query(
    `SELECT
      s.id AS session_id,
      s.expires_at,
      u.id,
      u.login_name,
      u.email,
      u.phone_number,
      u.display_name,
      u.ai_id,
      u.role,
      u.admin_permissions,
      u.status,
      u.presence_mode,
      u.created_at
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > CURRENT_TIMESTAMP
    LIMIT 1`,
    [hashToken(plainToken)],
  );

  const user = rows[0];
  if (!user || user.status !== "active") throw new HttpError(401, "Invalid session");

  await query("UPDATE auth_sessions SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?", [
    user.session_id,
  ]);

  return {
    sessionId: user.session_id,
    expiresAt: user.expires_at,
    user: {
      id: user.id,
      loginName: user.login_name || null,
      email: user.email,
      phoneNumber: user.phone_number || null,
      displayName: user.display_name,
      aiId: user.ai_id,
      role: user.role,
      adminPermissions: typeof user.admin_permissions === "string"
        ? JSON.parse(user.admin_permissions || "[]")
        : user.admin_permissions || [],
      presenceMode: ["online", "offline", "hidden"].includes(user.presence_mode)
        ? user.presence_mode
        : "online",
      createdAt: user.created_at,
    },
  };
}

export async function authenticate(req, _res, next) {
  try {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const session = await getSessionUserFromToken(token);
    req.user = session.user;
    req.sessionId = session.sessionId;
    next();
  } catch (error) {
    next(error);
  }
}

function hasAdminPermission(user, permission) {
  if (user?.role !== "admin") return false;
  const permissions = Array.isArray(user.adminPermissions) ? user.adminPermissions : [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function requireAdmin(permission = "admin:access") {
  return (req, _res, next) => {
    if (!hasAdminPermission(req.user, permission)) {
      next(new HttpError(403, "Admin permission required"));
      return;
    }

    next();
  };
}
