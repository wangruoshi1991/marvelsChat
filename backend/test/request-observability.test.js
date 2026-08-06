import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { z } from "zod";

import { HttpError } from "../src/http-error.js";
import {
  createRequestObservabilityMiddleware,
  createSafeErrorResponse,
} from "../src/request-observability.js";

test("request middleware logs route metadata without raw URLs or credentials", () => {
  const logs = [];
  const req = {
    method: "GET",
    originalUrl: "/api/avatar-3d/models/private-token?signature=secret",
    headers: { authorization: "Bearer secret-session" },
    route: { path: "/api/avatar-3d/models/:modelId" },
    user: { id: "user-1" },
  };
  const res = new EventEmitter();
  res.statusCode = 200;
  res.setHeader = (name, value) => {
    res.headers ||= {};
    res.headers[name] = value;
  };
  const middleware = createRequestObservabilityMiddleware({
    createRequestId: () => "request-123",
    now: (() => {
      const values = [100, 112];
      return () => values.shift();
    })(),
    logger: { info: (entry) => logs.push(entry) },
  });

  middleware(req, res, () => {});
  res.emit("finish");

  assert.equal(req.requestId, "request-123");
  assert.equal(res.headers["X-Request-ID"], "request-123");
  assert.equal(logs[0].route, "/api/avatar-3d/models/:modelId");
  assert.equal(logs[0].durationMs, 12);
  assert.equal(JSON.stringify(logs).includes("private-token"), false);
  assert.equal(JSON.stringify(logs).includes("secret-session"), false);
});

test("production server errors hide internal messages and retain a safe public code", () => {
  const error = new HttpError(503, "OSS_ACCESS_KEY_SECRET is missing", {
    code: "PROVIDER_UNAVAILABLE",
    missing: ["OSS_ACCESS_KEY_SECRET"],
  });
  const safe = createSafeErrorResponse(error, {
    requestId: "request-456",
    production: true,
  });

  assert.deepEqual(safe, {
    status: 503,
    body: {
      error: {
        message: "Internal Server Error",
        details: { code: "PROVIDER_UNAVAILABLE" },
        requestId: "request-456",
      },
    },
  });
});

test("client errors keep their actionable message and details", () => {
  const safe = createSafeErrorResponse(
    new HttpError(409, "Another avatar task is active.", {
      code: "ACTIVE_JOB_EXISTS",
    }),
    { requestId: "request-789", production: true },
  );

  assert.equal(safe.status, 409);
  assert.equal(safe.body.error.message, "Another avatar task is active.");
  assert.deepEqual(safe.body.error.details, { code: "ACTIVE_JOB_EXISTS" });
});

test("validation and malformed JSON receive stable public messages", () => {
  const validationError = z.object({ name: z.string() }).safeParse({ name: 2 }).error;
  const validation = createSafeErrorResponse(validationError, {
    requestId: "request-validation",
    production: true,
  });
  const malformedJson = createSafeErrorResponse(
    Object.assign(new SyntaxError("Unexpected token with raw body"), {
      status: 400,
      type: "entity.parse.failed",
    }),
    { requestId: "request-json", production: true },
  );

  assert.equal(validation.status, 400);
  assert.equal(validation.body.error.message, "Invalid request payload");
  assert.equal(malformedJson.status, 400);
  assert.equal(malformedJson.body.error.message, "Invalid JSON payload");
});
