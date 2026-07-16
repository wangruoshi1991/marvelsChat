import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  createRequestObservabilityMiddleware,
  createSafeErrorResponse,
} = await import("../src/request-observability.js");

test("request middleware sets one diagnostic ID and logs no raw URL or authorization", () => {
  const logs = [];
  const req = {
    method: "GET",
    originalUrl: "/api/homepage-shares/private-bearer-token?signature=secret",
    headers: { authorization: "Bearer secret-session" },
    route: { path: "/api/homepage-shares/:token" },
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
  assert.equal(logs[0].route, "/api/homepage-shares/:token");
  assert.equal(logs[0].durationMs, 12);
  assert.equal(JSON.stringify(logs).includes("private-bearer-token"), false);
  assert.equal(JSON.stringify(logs).includes("secret-session"), false);
});

test("safe errors carry the same request ID without exposing internal messages", () => {
  const safe = createSafeErrorResponse(new Error("database password leaked"), {
    requestId: "request-456",
    production: true,
  });

  assert.equal(safe.status, 500);
  assert.deepEqual(safe.body, {
    error: {
      message: "Internal Server Error",
      requestId: "request-456",
    },
  });
});
