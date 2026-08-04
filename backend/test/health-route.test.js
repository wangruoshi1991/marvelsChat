import assert from "node:assert/strict";
import test from "node:test";

import { registerAppRoutes } from "../src/routes/app-routes.js";

const registerHealthRoutes = (checkDatabaseStatus) => {
  const routes = new Map();
  const app = {};
  for (const method of ["get", "post", "patch", "delete"]) {
    app[method] = (path, ...handlers) => {
      if (method === "get" && ["/api/health", "/api/ready"].includes(path)) {
        routes.set(path, handlers.at(-1));
      }
    };
  }
  registerAppRoutes(app, {
    authenticate: (_req, _res, next) => next(),
    asyncHandler: (handler) => handler,
    getOnlineUserIds: () => [],
    sendPresenceChanged: () => undefined,
    checkDatabaseStatus,
  });
  return routes;
};

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
  },
});

test("liveness does not expose dependency details", () => {
  const routes = registerHealthRoutes(async () => ({
    configured: true,
    connected: false,
    message: "private database error",
  }));
  const res = response();

  routes.get("/api/health")({}, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    app: "marvelsChat",
    service: "miaoxun-backend",
  });
});

test("readiness returns 503 without exposing database errors", async () => {
  const routes = registerHealthRoutes(async () => ({
    configured: true,
    connected: false,
    database: "private-name",
    message: "private database error",
  }));
  const res = response();

  await routes.get("/api/ready")({}, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    ok: false,
    app: "marvelsChat",
    service: "miaoxun-backend",
    dependencies: {
      database: {
        configured: true,
        connected: false,
        migrationsCurrent: false,
      },
    },
  });
  assert.doesNotMatch(JSON.stringify(res.body), /private/);
});

test("readiness returns 503 while database migrations are pending", async () => {
  const routes = registerHealthRoutes(async () => ({
    configured: true,
    connected: true,
    migrationsCurrent: false,
    message: "private migration detail",
  }));
  const res = response();

  await routes.get("/api/ready")({}, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.ok, false);
  assert.deepEqual(res.body.dependencies.database, {
    configured: true,
    connected: true,
    migrationsCurrent: false,
  });
  assert.doesNotMatch(JSON.stringify(res.body), /private/);
});

test("readiness returns 200 only when the database is connected and current", async () => {
  const routes = registerHealthRoutes(async () => ({
    configured: true,
    connected: true,
    migrationsCurrent: true,
  }));
  const res = response();

  await routes.get("/api/ready")({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
});
