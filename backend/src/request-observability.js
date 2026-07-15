import crypto from "crypto";
import { ZodError } from "zod";
import { config } from "./config.js";

const defaultLogger = {
  info: (entry) => console.log(JSON.stringify(entry)),
  error: (entry) => console.error(JSON.stringify(entry)),
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
  const validation = error instanceof ZodError;
  const missingDatabase = ["42P01", "3D000"].includes(error?.code);
  const status = validation ? 400 : missingDatabase ? 503 : Number(error?.status || 500);
  const exposeMessage = status < 500 || !production;
  const message = validation
    ? "Invalid request payload"
    : exposeMessage
      ? error?.message || "Internal Server Error"
      : "Internal Server Error";
  const details = validation
    ? error.flatten()
    : status < 500 && error?.details
      ? error.details
      : undefined;

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
  sentry = null,
} = {}) {
  return (error, req, res, _next) => {
    const requestId = req.requestId || crypto.randomUUID();
    res.setHeader("X-Request-ID", requestId);
    const response = createSafeErrorResponse(error, { requestId, production });

    if (response.status >= 500) {
      logger.error({
        type: "http_error",
        requestId,
        route: req.route?.path || "unmatched",
        status: response.status,
        errorName: error?.name || "Error",
        errorCode: error?.code || null,
      });
      sentry?.captureException?.(error, { tags: { requestId } });
    }
    res.status(response.status).json(response.body);
  };
}
