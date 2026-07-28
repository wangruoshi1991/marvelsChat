import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { registerAvatar3dAppRoutes } = await import(
  "../src/routes/avatar-3d-app-routes.js"
);

const createRouteHarness = () => {
  const routes = [];
  const register = (method) => (path, ...handlers) => {
    routes.push({ method, path, handlers });
  };
  return {
    app: {
      get: register("GET"),
      post: register("POST"),
      delete: register("DELETE"),
    },
    routes,
  };
};

const createResponse = () => {
  const headers = new Map();
  const response = {
    headers,
    payload: null,
    statusCode: 200,
    set(name, value) {
      headers.set(name, value);
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.payload = value;
      return this;
    },
    send() {
      return this;
    },
  };
  return response;
};

test("App avatar routes expose the native lifecycle behind Bearer authentication", () => {
  const { app, routes } = createRouteHarness();
  const authenticate = (_req, _res, next) => next();
  registerAvatar3dAppRoutes(app, {
    authenticate,
    asyncHandler: (handler) => handler,
  });

  assert.deepEqual(
    routes.map(({ method, path }) => `${method} ${path}`),
    [
      "GET /api/avatar-3d/app/bootstrap",
      "POST /api/avatar-3d/app/photos",
      "POST /api/avatar-3d/app/photos/:photoId/complete",
      "DELETE /api/avatar-3d/app/photos/:photoId",
      "POST /api/avatar-3d/app/jobs",
      "GET /api/avatar-3d/app/jobs/:jobId",
      "GET /api/avatar-3d/app/jobs/:jobId/references",
      "GET /api/avatar-3d/app/jobs/:jobId/references/:view/file",
      "POST /api/avatar-3d/app/jobs/:jobId/references/confirm",
      "POST /api/avatar-3d/app/jobs/:jobId/references/reject",
      "POST /api/avatar-3d/app/jobs/:jobId/cancel",
      "GET /api/avatar-3d/app/models/:modelId",
      "GET /api/avatar-3d/app/models/:modelId/thumbnail",
      "DELETE /api/avatar-3d/app/models/:modelId",
    ],
  );
  for (const route of routes) {
    assert.equal(route.handlers[0], authenticate, `${route.method} ${route.path}`);
  }
});

test("App bootstrap exposes no Web session credential", async () => {
  const { app, routes } = createRouteHarness();
  const service = {
    getBootstrap: async ({ user }) => ({ user, models: [], jobs: [] }),
  };
  registerAvatar3dAppRoutes(app, {
    authenticate: (_req, _res, next) => next(),
    asyncHandler: (handler) => handler,
    service,
  });

  const route = routes.find((item) => item.path === "/api/avatar-3d/app/bootstrap");
  const response = createResponse();
  await route.handlers.at(-1)(
    { user: { id: "user-1" } },
    response,
  );

  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.payload.data.user.id, "user-1");
  assert.equal(JSON.stringify(response.payload).includes("token"), false);
  assert.equal(response.headers.has("Set-Cookie"), false);
});

test("App job creation validates and forwards the idempotency key", async () => {
  const { app, routes } = createRouteHarness();
  const calls = [];
  const usageEvents = [];
  const service = {
    createJob: async (input) => {
      calls.push(input);
      return {
        created: true,
        job: {
          id: "f33eb4e8-ff56-43d7-97b6-a1c2b41d8a37",
          style: "realistic",
          status: "queued_references",
          photoCount: 1,
          estimatedCostFen: 420,
        },
      };
    },
  };
  registerAvatar3dAppRoutes(app, {
    authenticate: (_req, _res, next) => next(),
    asyncHandler: (handler) => handler,
    service,
    recordUsageEvent: async (event) => usageEvents.push(event),
  });

  const route = routes.find(
    (item) => item.method === "POST" && item.path === "/api/avatar-3d/app/jobs",
  );
  const idempotencyKey = "ad64ba1d-d6db-4540-b35c-4c0b09ca5fe6";
  const response = createResponse();
  await route.handlers.at(-1)(
    {
      body: {
        generationMode: "face_first_multiview",
        photoId: "ff28cdf6-7bf4-4497-b8a1-b6698f4aeb85",
        bodyShape: "balanced",
        pose: "natural",
        outfit: "smart_casual",
        userDescription: "",
        qualityPreset: "ultra",
        acceptedPhotoRights: true,
        acceptedAdultSubject: true,
        acceptedFaceCompletion: true,
        acceptedReferenceCostVersion: "2026-07-21",
      },
      get: (name) => {
        if (name === "idempotency-key") return idempotencyKey;
        if (name === "user-agent") return "MiaoxunRN/Test";
        return "";
      },
      ip: "127.0.0.1",
      user: { id: "user-1" },
    },
    response,
  );

  assert.equal(response.statusCode, 201);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].idempotencyKey, idempotencyKey);
  assert.equal(calls[0].user.id, "user-1");
  assert.equal(calls[0].body.generationMode, "face_first_multiview");
  assert.equal(usageEvents[0].eventType, "avatar3d.job.create");
});
