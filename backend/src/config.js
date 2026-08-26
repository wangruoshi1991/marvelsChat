import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  MEDIA_RETRIEVAL_LIMITS,
  MEDIA_RETRIEVAL_RUNTIME_LIMITS,
} from "./media-retrieval-constants.js";

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

const parseBoundedInteger = ({ env, name, fallback, minimum, maximum, exact = null }) => {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^-?\d+$/.test(String(raw).trim())) {
    throw new Error(`${name} must be an integer.`);
  }
  const parsed = Number(raw);
  if (exact !== null && parsed !== exact) {
    throw new Error(`${name} must equal ${exact}.`);
  }
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
};

const parseStrictBoolean = ({ env, name, fallback = false }) => {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`${name} must be a boolean.`);
};

const parseRequiredString = ({ env, name, fallback, maximum = 160 }) => {
  const value = String(env[name] ?? fallback ?? "").trim();
  if (!value || value.length > maximum) {
    throw new Error(`${name} must be a non-empty string up to ${maximum} characters.`);
  }
  return value;
};

const parseMediaRetrievalBaseUrl = (value) => {
  const normalized = String(value || "").trim().replace(/\/+$/, "");
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    if (
      url.protocol !== "https:" ||
      url.search ||
      url.hash ||
      !url.pathname.endsWith("/api/v1")
    ) {
      throw new Error("invalid");
    }
  } catch {
    throw new Error("MEDIA_RETRIEVAL_DASHSCOPE_API_BASE_URL must be an HTTPS regional or workspace /api/v1 URL.");
  }
  return normalized;
};

const listFromEnv = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const parseCorsOrigin = (value) => {
  if (value === undefined || value === "") {
    if (isProduction) {
      throw new Error("CORS_ORIGIN must be set when NODE_ENV=production.");
    }
    return true;
  }
  if (String(value).toLowerCase() === "true") return true;
  if (String(value).toLowerCase() === "false") return false;
  return value;
};

export const createMediaRetrievalConfig = (env = process.env) => ({
  enabled: parseStrictBoolean({
    env,
    name: "MEDIA_RETRIEVAL_ENABLED",
    fallback: false,
  }),
  providerCallsEnabled: parseStrictBoolean({
    env,
    name: "MEDIA_RETRIEVAL_PROVIDER_CALLS_ENABLED",
    fallback: false,
  }),
  dashscopeApiKey: String(env.MEDIA_RETRIEVAL_DASHSCOPE_API_KEY || ""),
  dashscopeApiBaseUrl: parseMediaRetrievalBaseUrl(env.MEDIA_RETRIEVAL_DASHSCOPE_API_BASE_URL),
  captionModel: parseRequiredString({
    env,
    name: "MEDIA_RETRIEVAL_CAPTION_MODEL",
    fallback: "qwen3.6-flash",
  }),
  captionModelVersion: parseRequiredString({
    env,
    name: "MEDIA_RETRIEVAL_CAPTION_MODEL_VERSION",
    fallback: String(env.MEDIA_RETRIEVAL_CAPTION_MODEL || "qwen3.6-flash").trim(),
  }),
  embeddingModel: parseRequiredString({
    env,
    name: "MEDIA_RETRIEVAL_EMBEDDING_MODEL",
    fallback: "qwen3-vl-embedding",
  }),
  embeddingModelVersion: parseRequiredString({
    env,
    name: "MEDIA_RETRIEVAL_EMBEDDING_MODEL_VERSION",
    fallback: String(env.MEDIA_RETRIEVAL_EMBEDDING_MODEL || "qwen3-vl-embedding").trim(),
  }),
  embeddingNormalization: parseRequiredString({
    env,
    name: "MEDIA_RETRIEVAL_EMBEDDING_NORMALIZATION",
    fallback: "provider-native-dense-v1",
    maximum: 80,
  }),
  embeddingDimension: parseBoundedInteger({
    env,
    name: "MEDIA_RETRIEVAL_EMBEDDING_DIMENSION",
    fallback: MEDIA_RETRIEVAL_LIMITS.embeddingDimension,
    minimum: MEDIA_RETRIEVAL_LIMITS.embeddingDimension,
    maximum: MEDIA_RETRIEVAL_LIMITS.embeddingDimension,
    exact: MEDIA_RETRIEVAL_LIMITS.embeddingDimension,
  }),
  maxVideoFrames: parseBoundedInteger({
    env,
    name: "MEDIA_RETRIEVAL_MAX_VIDEO_FRAMES",
    fallback: MEDIA_RETRIEVAL_LIMITS.maxVideoFrames,
    minimum: 1,
    maximum: MEDIA_RETRIEVAL_LIMITS.maxVideoFrames,
  }),
  workerPollMs: parseBoundedInteger({
    env,
    name: "MEDIA_RETRIEVAL_WORKER_POLL_MS",
    fallback: 5000,
    minimum: MEDIA_RETRIEVAL_RUNTIME_LIMITS.minWorkerPollMs,
    maximum: MEDIA_RETRIEVAL_RUNTIME_LIMITS.maxWorkerPollMs,
  }),
  userDailyRequestLimit: parseBoundedInteger({
    env,
    name: "MEDIA_RETRIEVAL_USER_DAILY_REQUEST_LIMIT",
    fallback: 0,
    minimum: 0,
    maximum: MEDIA_RETRIEVAL_RUNTIME_LIMITS.maxUserDailyRequestLimit,
  }),
  userMonthlyBudgetFen: parseBoundedInteger({
    env,
    name: "MEDIA_RETRIEVAL_USER_MONTHLY_BUDGET_FEN",
    fallback: 0,
    minimum: 0,
    maximum: MEDIA_RETRIEVAL_RUNTIME_LIMITS.maxUserMonthlyBudgetFen,
  }),
  globalDailyBudgetFen: parseBoundedInteger({
    env,
    name: "MEDIA_RETRIEVAL_GLOBAL_DAILY_BUDGET_FEN",
    fallback: 0,
    minimum: 0,
    maximum: MEDIA_RETRIEVAL_RUNTIME_LIMITS.maxGlobalDailyBudgetFen,
  }),
  captionReserveFen: parseBoundedInteger({
    env,
    name: "MEDIA_RETRIEVAL_CAPTION_RESERVE_FEN",
    fallback: 0,
    minimum: 0,
    maximum: MEDIA_RETRIEVAL_RUNTIME_LIMITS.maxProviderCallReservationFen,
  }),
  embeddingReserveFen: parseBoundedInteger({
    env,
    name: "MEDIA_RETRIEVAL_EMBEDDING_RESERVE_FEN",
    fallback: 0,
    minimum: 0,
    maximum: MEDIA_RETRIEVAL_RUNTIME_LIMITS.maxProviderCallReservationFen,
  }),
});

export const getMediaRetrievalConfigStatus = (runtimeConfig) => {
  const retrieval = runtimeConfig?.mediaRetrieval || runtimeConfig;
  const missing = [];
  if (!retrieval?.dashscopeApiKey) missing.push("credentials-not-configured");
  if (!retrieval?.dashscopeApiBaseUrl) missing.push("model-api-not-configured");
  if (!retrieval?.enabled) missing.push("feature-disabled");
  if (!retrieval?.providerCallsEnabled) missing.push("provider-calls-disabled");
  return {
    configured: Boolean(retrieval?.dashscopeApiKey && retrieval?.dashscopeApiBaseUrl),
    enabled: Boolean(retrieval?.enabled),
    providerCallsEnabled: Boolean(retrieval?.providerCallsEnabled),
    missing,
    captionModel: retrieval?.captionModel || "qwen3.6-flash",
    captionModelVersion: retrieval?.captionModelVersion || retrieval?.captionModel || "qwen3.6-flash",
    embeddingModel: retrieval?.embeddingModel || "qwen3-vl-embedding",
    embeddingModelVersion: retrieval?.embeddingModelVersion || retrieval?.embeddingModel || "qwen3-vl-embedding",
    embeddingDimension: retrieval?.embeddingDimension || MEDIA_RETRIEVAL_LIMITS.embeddingDimension,
    embeddingNormalization: retrieval?.embeddingNormalization || "provider-native-dense-v1",
    maxVideoFrames: retrieval?.maxVideoFrames || MEDIA_RETRIEVAL_LIMITS.maxVideoFrames,
    userDailyRequestLimit: retrieval?.userDailyRequestLimit || 0,
    userMonthlyBudgetFen: retrieval?.userMonthlyBudgetFen || 0,
    globalDailyBudgetFen: retrieval?.globalDailyBudgetFen || 0,
  };
};

const databaseUrl = process.env.DATABASE_URL || "";
const defaultAdminEnabled = parseBoolean(process.env.DEFAULT_ADMIN_ENABLED, !isProduction);
const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "";
const hasPostgresConfig = Boolean(
  databaseUrl ||
    (process.env.POSTGRES_HOST && process.env.POSTGRES_USER && process.env.POSTGRES_DATABASE),
);

if (defaultAdminEnabled && !defaultAdminPassword) {
  throw new Error("DEFAULT_ADMIN_PASSWORD must be set when default admin is enabled.");
}

export const config = {
  env: nodeEnv,
  isProduction,
  port: parseNumber(process.env.PORT, 4390),
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  adminEmails: listFromEnv(process.env.ADMIN_EMAILS),
  createFirstUserAsAdmin: parseBoolean(process.env.CREATE_FIRST_USER_AS_ADMIN, !isProduction),
  defaultAdmin: {
    enabled: defaultAdminEnabled,
    resetPasswordOnMigrate: parseBoolean(process.env.DEFAULT_ADMIN_RESET_PASSWORD_ON_MIGRATE, false),
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
  meshy: {
    baseUrl: (process.env.MESHY_API_BASE_URL || "https://api.meshy.ai").trim().replace(/\/+$/, ""),
    apiKey: process.env.MESHY_API_KEY || "",
    timeoutMs: parseNumber(process.env.MESHY_TIMEOUT_MS, 60000),
  },
  mediaRetrieval: createMediaRetrievalConfig(process.env),
  publicApiBaseUrl: (process.env.PUBLIC_API_BASE_URL || "").trim().replace(/\/+$/, ""),
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
  mapTiles: {
    urlTemplate: (process.env.MAP_TILE_URL_TEMPLATE || "").trim(),
    userAgent: (process.env.MAP_TILE_USER_AGENT || process.env.GEOCODING_USER_AGENT || "").trim(),
    timeoutMs: parseNumber(process.env.MAP_TILE_TIMEOUT_MS, 8000),
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
