import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { avatar3dCostVersion } from "./avatar-3d-quality.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendEnvPath = path.resolve(__dirname, "../.env");

dotenv.config({ path: backendEnvPath });

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const parseTrustProxyHops = (value, fallback = 0) => {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10) {
    throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 10.");
  }
  return parsed;
};

const avatar3dProviderCallsEnabled = parseBoolean(
  process.env.AVATAR_3D_PROVIDER_CALLS_ENABLED,
  false,
);

const listFromEnv = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

export const parseCorsOrigin = (
  value,
  { production = isProduction } = {},
) => {
  if (value === undefined || value === "") {
    if (production) {
      throw new Error("CORS_ORIGIN must be set when NODE_ENV=production.");
    }
    return true;
  }
  const normalized = String(value).trim();
  if (normalized.toLowerCase() === "true") {
    if (production) {
      throw new Error("CORS_ORIGIN must be an explicit origin in production.");
    }
    return true;
  }
  if (normalized.toLowerCase() === "false") return false;

  let origin;
  try {
    const parsed = new URL(normalized);
    if (
      !["http:", "https:"].includes(parsed.protocol)
      || !parsed.hostname
      || parsed.username
      || parsed.password
      || (parsed.pathname && parsed.pathname !== "/")
      || parsed.search
      || parsed.hash
    ) {
      throw new Error("invalid origin");
    }
    origin = parsed.origin;
  } catch {
    throw new Error("CORS_ORIGIN must be one absolute HTTP(S) origin.");
  }
  return origin;
};

const databaseUrl = process.env.DATABASE_URL || "";
const defaultAdminEnabled = parseBoolean(process.env.DEFAULT_ADMIN_ENABLED, false);
const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "";
const adminEmails = listFromEnv(process.env.ADMIN_EMAILS);
const createFirstUserAsAdmin = parseBoolean(
  process.env.CREATE_FIRST_USER_AS_ADMIN,
  !isProduction,
);
const hasPostgresConfig = Boolean(
  databaseUrl ||
    (process.env.POSTGRES_HOST && process.env.POSTGRES_USER && process.env.POSTGRES_DATABASE),
);

if (defaultAdminEnabled && !defaultAdminPassword) {
  throw new Error("DEFAULT_ADMIN_PASSWORD must be set when default admin is enabled.");
}

export function validateAdminBootstrapConfig({
  production,
  allowedEmails,
  firstUserIsAdmin,
  defaultAccountEnabled,
  defaultAccountPassword,
}) {
  if (!production) return;
  if (firstUserIsAdmin) {
    throw new Error("CREATE_FIRST_USER_AS_ADMIN must be false in production.");
  }
  if (allowedEmails.length > 0) {
    throw new Error(
      "ADMIN_EMAILS cannot grant roles before contact verification is implemented.",
    );
  }
  if (
    defaultAccountEnabled
    && (
      defaultAccountPassword.length < 16
      || /^(change|password|admin|miaoxun)/i.test(defaultAccountPassword)
    )
  ) {
    throw new Error(
      "DEFAULT_ADMIN_PASSWORD must be a non-placeholder value of at least 16 characters.",
    );
  }
}

validateAdminBootstrapConfig({
  production: isProduction,
  allowedEmails: adminEmails,
  firstUserIsAdmin: createFirstUserAsAdmin,
  defaultAccountEnabled: defaultAdminEnabled,
  defaultAccountPassword: defaultAdminPassword,
});

export const config = {
  env: nodeEnv,
  isProduction,
  host: (process.env.HOST || "127.0.0.1").trim(),
  port: parseNumber(process.env.PORT, 4390),
  trustProxyHops: parseTrustProxyHops(process.env.TRUST_PROXY_HOPS),
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  adminEmails,
  createFirstUserAsAdmin,
  defaultAdmin: {
    enabled: defaultAdminEnabled,
    resetPasswordOnBootstrap: parseBoolean(
      process.env.DEFAULT_ADMIN_RESET_PASSWORD_ON_BOOTSTRAP,
      false,
    ),
    loginName: process.env.DEFAULT_ADMIN_LOGIN || "admin",
    email: process.env.DEFAULT_ADMIN_EMAIL || "admin@miaoxun.local",
    password: defaultAdminPassword,
    displayName: process.env.DEFAULT_ADMIN_DISPLAY_NAME || "妙讯管理员",
  },
  auth: {
    sessionTtlDays: parseNumber(process.env.SESSION_TTL_DAYS, 30),
  },
  newApi: {
    baseUrl: (process.env.NEW_API_BASE_URL || "").replace(/\/+$/, ""),
    apiKey: process.env.NEW_API_KEY || "",
    model: process.env.NEW_API_MODEL || "",
    timeoutMs: parseNumber(process.env.NEW_API_TIMEOUT_MS, 30000),
  },
  dashscope: {
    baseUrl: (process.env.DASHSCOPE_API_BASE_URL || "https://dashscope.aliyuncs.com")
      .trim()
      .replace(/\/+$/, ""),
    apiKey: process.env.DASHSCOPE_API_KEY || "",
    workspaceId: (process.env.DASHSCOPE_WORKSPACE_ID || "").trim(),
    wanBaseUrl: (
      process.env.DASHSCOPE_WANX_BASE_URL
      || (process.env.DASHSCOPE_WORKSPACE_ID
        ? `https://${process.env.DASHSCOPE_WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com`
        : "")
    ).trim().replace(/\/+$/, ""),
    tripoModel: (process.env.DASHSCOPE_TRIPO_MODEL || "Tripo/Tripo-H3.1").trim(),
    wanMultiviewModel: (
      process.env.DASHSCOPE_WAN_MULTIVIEW_MODEL || "wan2.7-image-pro"
    ).trim(),
    timeoutMs: parseNumber(process.env.DASHSCOPE_TIMEOUT_MS, 60000),
  },
  avatar3d: {
    enabled: parseBoolean(process.env.AVATAR_3D_ENABLED, false),
    providerCallsEnabled: avatar3dProviderCallsEnabled,
    allowlist: listFromEnv(process.env.AVATAR_3D_ALLOWLIST),
    requireAllowlist: isProduction,
    dailyLimit: parseNumber(process.env.AVATAR_3D_DAILY_LIMIT, 3),
    retentionDays: parseNumber(process.env.AVATAR_3D_RETENTION_DAYS, 7),
    costVersion: avatar3dCostVersion,
    referenceGenerationEstimatedCostFen: parseNumber(
      process.env.AVATAR_3D_REFERENCE_COST_FEN,
      200,
    ),
    qualityCostsFen: {
      standard: parseNumber(process.env.AVATAR_3D_STANDARD_COST_FEN, 280),
      ultra: parseNumber(process.env.AVATAR_3D_ULTRA_COST_FEN, 420),
    },
    providerReady: Boolean(
      avatar3dProviderCallsEnabled
      && process.env.DASHSCOPE_API_KEY
      && process.env.DASHSCOPE_WORKSPACE_ID
      && process.env.OSS_BUCKET
      && process.env.OSS_ENDPOINT
      && process.env.OSS_ACCESS_KEY_ID
      && process.env.OSS_ACCESS_KEY_SECRET
    ),
  },
  geocoding: {
    provider: (process.env.GEOCODING_PROVIDER || "nominatim").trim().toLowerCase(),
    reverseUrl: (process.env.GEOCODING_REVERSE_URL || "").trim(),
    userAgent: (process.env.GEOCODING_USER_AGENT || "").trim(),
    email: (process.env.GEOCODING_EMAIL || "").trim(),
    acceptLanguage: (process.env.GEOCODING_ACCEPT_LANGUAGE || "zh-CN,zh;q=0.9,en;q=0.6").trim(),
    timeoutMs: parseNumber(process.env.GEOCODING_TIMEOUT_MS, 15000),
    amapKey: (process.env.AMAP_WEB_SERVICE_KEY || "").trim(),
    amapReverseUrl: (process.env.AMAP_REVERSE_URL || "https://restapi.amap.com/v3/geocode/regeo").trim(),
  },
  redis: {
    url: (process.env.REDIS_URL || "").trim(),
  },
  oss: {
    region: (process.env.OSS_REGION || "").trim(),
    bucket: (process.env.OSS_BUCKET || "").trim(),
    endpoint: (process.env.OSS_ENDPOINT || "").trim(),
    internalEndpoint: (process.env.OSS_INTERNAL_ENDPOINT || "").trim(),
    publicBaseUrl: (process.env.OSS_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, ""),
    accessKeyId: (process.env.OSS_ACCESS_KEY_ID || "").trim(),
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || "",
    timeoutMs: parseNumber(process.env.OSS_TIMEOUT_MS, 60000),
  },
  db: {
    configured: hasPostgresConfig,
    databaseUrl,
    host: process.env.POSTGRES_HOST || "127.0.0.1",
    port: parseNumber(process.env.POSTGRES_PORT, 5432),
    user: process.env.POSTGRES_USER || "postgres",
    password: process.env.POSTGRES_PASSWORD || "",
    database: process.env.POSTGRES_DATABASE || "marvels_chat",
    connectionLimit: parseNumber(process.env.POSTGRES_CONNECTION_LIMIT, 10),
  },
};
