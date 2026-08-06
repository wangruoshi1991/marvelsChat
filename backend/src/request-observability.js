import crypto from "crypto";
import { ZodError } from "zod";
import { config } from "./config.js";

const defaultLogger = {
  info: (entry) => console.log(JSON.stringify(entry)),
  error: (entry) => console.error(JSON.stringify(entry)),
};

const normalizeStatus = (value) => {
  const status = Number(value);
  return Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : 500;
};

const publicErrorCode = (error) => {
  const candidate = error?.publicCode || error?.details?.code;
  return typeof candidate === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(candidate)
    ? candidate
    : null;
};

export function createRequestObservabilityMiddleware({
  createRequestId = crypto.randomUUID,
  now = () => Date.now(),
  logger = defaultLogger,
} = {}) {
  return (req, res, next) => {
    const startedAt = now();
    req.requestId = createRequestId();
    res.setHeader("X-Request-ID", req.requestId);
    res.on("finish", () => {
      logger.info({
        type: "http_request",
        requestId: req.requestId,
        method: req.method,
        route: req.route?.path || "unmatched",
        status: res.statusCode,
        durationMs: Math.max(0, now() - startedAt),
        userId: req.user?.id || null,
      });
    });
    next();
  };
}

export function createSafeErrorResponse(error, {
  requestId,
  production = config.isProduction,
} = {}) {
  const isValidationError = error instanceof ZodError;
  const isInvalidJson = error?.type === "entity.parse.failed";
  const isMissingDatabase = ["42P01", "3D000"].includes(error?.code);
  const status = isValidationError || isInvalidJson
    ? 400
    : isMissingDatabase
      ? 503
      : normalizeStatus(error?.status);
  const hideInternalError = production && status >= 500;
  const code = publicErrorCode(error);
  const message = isValidationError
    ? "Invalid request payload"
    : isInvalidJson
      ? "Invalid JSON payload"
      : hideInternalError
        ? "Internal Server Error"
        : isMissingDatabase
          ? "Database is not migrated. Run `cd backend && npm run db:migrate`."
          : error?.message || "Internal Server Error";
  const details = isValidationError
    ? error.flatten()
    : hideInternalError
      ? code ? { code } : undefined
      : error?.details;

  return {
    status,
    body: {
      error: {
        message,
        ...(details === undefined ? {} : { details }),
        requestId,
      },
    },
  };
}

export function createRequestErrorHandler({
  production = config.isProduction,
  logger = defaultLogger,
  captureException = null,
} = {}) {
  return (error, req, res, _next) => {
    const requestId = req.requestId || crypto.randomUUID();
    const response = createSafeErrorResponse(error, { requestId, production });
    res.setHeader("X-Request-ID", requestId);

    if (response.status >= 500) {
      logger.error({
        type: "http_error",
        requestId,
        route: req.route?.path || "unmatched",
        status: response.status,
        errorName: error?.name || "Error",
        errorCode: error?.code || publicErrorCode(error),
      });
      captureException?.(error, { requestId });
    }

    res.status(response.status).json(response.body);
  };
}
