import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { registerStationModelRoutes } = await import("../src/routes/station-model-routes.js");

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const collectRoutes = (repository, usageCalls) => {
  const routes = [];
  const app = {};
  for (const method of ["get", "post"]) {
    app[method] = (path, ...handlers) => routes.push({ method, path, handlers });
  }
  registerStationModelRoutes(app, {
    authenticate: (_req, _res, next) => next(),
    asyncHandler: (handler) => handler,
    repository,
    recordUsageEvent: async (event) => usageCalls.push(event),
  });
  return routes;
};

const response = () => ({
  statusCode: 200,
  body: null,
  status(value) {
    this.statusCode = value;
    return this;
  },
  json(value) {
    this.body = value;
    return this;
  },
});

const request = ({ body = {}, params = {} } = {}) => ({
  body,
  params,
  query: {},
  user: { id: userId },
  ip: "127.0.0.1",
  get: () => "",
});

test("legacy create stores a blocked compatibility job without provider submission", async () => {
  const createCalls = [];
  const usageCalls = [];
  const repository = {
    createGenerationJob: async (input) => {
      createCalls.push(input);
      return { id: jobId, ...input };
    },
  };
  const routes = collectRoutes(repository, usageCalls);
  const route = routes.find((item) =>
    item.method === "post" && item.path === "/api/station/model-jobs");
  const res = response();

  await route.handlers.at(-1)(request({
    body: {
      inputType: "text",
      prompt: "旧客户端请求",
      provider: "legacy-mobile-provider",
      targetFormats: ["glb"],
    },
  }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].provider, "avatar-web");
  assert.equal(createCalls[0].providerTaskId, undefined);
  assert.equal(createCalls[0].status, "blocked");
  assert.deepEqual(createCalls[0].resultPayload, { nextPath: "/avatar/" });
  assert.deepEqual(res.body.data.provider, {
    provider: "avatar-web",
    configured: false,
    status: "migrated",
    webPath: "/avatar/",
  });
  assert.equal(JSON.stringify(res.body).includes("API_KEY"), false);
  assert.equal(usageCalls.length, 1);
});

test("legacy sync blocks an unfinished job without contacting a provider", async () => {
  const updateCalls = [];
  const usageCalls = [];
  const repository = {
    getGenerationJobForUser: async () => ({
      id: jobId,
      userId,
      inputType: "image",
      status: "processing",
      progress: 20,
    }),
    updateGenerationJob: async (input) => {
      updateCalls.push(input);
      return { id: jobId, userId, inputType: "image", ...input };
    },
  };
  const routes = collectRoutes(repository, usageCalls);
  const route = routes.find((item) =>
    item.method === "post" && item.path === "/api/station/model-jobs/:jobId/sync");
  const res = response();

  await route.handlers.at(-1)(request({ params: { jobId } }), res);

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].status, "blocked");
  assert.equal(updateCalls[0].providerTaskId, undefined);
  assert.equal(res.body.data.job.status, "blocked");
  assert.equal(res.body.data.provider.webPath, "/avatar/");
  assert.equal(usageCalls.length, 1);
});
