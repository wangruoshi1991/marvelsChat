import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { registerAvatar3dWebRoutes } = await import("../src/avatar-3d-web-service.js");

const createApp = () => {
  const uses = [];
  const gets = [];
  return {
    uses,
    gets,
    app: {
      use: (path, ...handlers) => uses.push({ path, handlers }),
      get: (path, ...handlers) => gets.push({ path, handlers }),
    },
  };
};

test("avatar Web mounts immutable assets and a private no-store shell", () => {
  const state = createApp();
  const staticCalls = [];
  const requireHttps = (_req, _res, next) => next();
  registerAvatar3dWebRoutes(state.app, {
    distDir: "/tmp/avatar-dist",
    staticMiddleware: (directory, options) => {
      staticCalls.push({ directory, options });
      return "static-handler";
    },
    fileExists: () => true,
    requireHttps,
    uploadOrigin: "https://private-bucket.oss-cn-hangzhou.aliyuncs.com",
  });

  assert.deepEqual(state.uses.map((entry) => entry.path), ["/avatar-assets"]);
  assert.deepEqual(state.gets.map((entry) => entry.path), [
    "/avatar/app-session",
    "/avatar",
    "/avatar/",
    "/avatar/*",
  ]);
  assert.equal(staticCalls[0].directory, "/tmp/avatar-dist");
  assert.equal(staticCalls[0].options.immutable, true);
  assert.equal(state.uses[0].handlers[0], requireHttps);
  for (const route of state.gets) assert.equal(route.handlers[0], requireHttps);

  const headers = new Map();
  const response = {
    set: (name, value) => headers.set(name, value),
    sendFile: (_path, callback) => callback(null),
  };
  const shellRoute = state.gets.find((route) => route.path === "/avatar");
  shellRoute.handlers.at(-1)({}, response, () => {});
  assert.equal(headers.get("Cache-Control"), "private, no-store");
  assert.match(headers.get("Content-Security-Policy"), /img-src 'self' blob: data:/);
  assert.match(
    headers.get("Content-Security-Policy"),
    /connect-src 'self' blob: https:\/\/private-bucket\.oss-cn-hangzhou\.aliyuncs\.com/,
  );
  assert.equal(
    headers.get("Content-Security-Policy").includes("connect-src 'self' https:;"),
    false,
  );
});

test("avatar Web reports a controlled error when its build is missing", () => {
  const state = createApp();
  registerAvatar3dWebRoutes(state.app, {
    distDir: "/tmp/avatar-dist",
    staticMiddleware: () => "static-handler",
    fileExists: () => false,
  });
  let observed = null;
  const shellRoute = state.gets.find((route) => route.path === "/avatar");
  shellRoute.handlers.at(-1)({}, {}, (error) => {
    observed = error;
  });

  assert.equal(observed?.status, 503);
  assert.equal(observed?.message, "Avatar Web build is unavailable.");
});

test("App handoff exchanges only the Authorization header and opens one requested model", async () => {
  const state = createApp();
  const calls = [];
  registerAvatar3dWebRoutes(state.app, {
    asyncHandler: (handler) => handler,
    staticMiddleware: () => "static-handler",
    fileExists: () => true,
    requireHttps: (_req, _res, next) => next(),
    secureRequest: () => false,
    sessionService: {
      createAvatarAppSession: async (input) => {
        calls.push(input);
        return { cookies: ["mx_avatar_session=opaque; HttpOnly"] };
      },
    },
  });

  const route = state.gets.find((entry) => entry.path === "/avatar/app-session");
  const headers = new Map();
  let html = "";
  const response = {
    setHeader: (name, value) => headers.set(name, value),
    set: (name, value) => headers.set(name, value),
    status() { return this; },
    type() { return this; },
    send(value) { html = value; },
  };
  const modelId = "4ab04377-00d1-44d4-b31b-3af973afb8d8";
  await route.handlers.at(-1)({
    query: { modelId },
    get: (name) => name.toLowerCase() === "authorization"
      ? "Bearer private-app-token"
      : "",
  }, response);

  assert.deepEqual(calls, [{ token: "private-app-token", secure: false }]);
  assert.deepEqual(headers.get("Set-Cookie"), ["mx_avatar_session=opaque; HttpOnly"]);
  assert.match(html, new RegExp(`url=/avatar/\\?mode=viewer&amp;modelId=${modelId}`));
  assert.equal(html.includes("private-app-token"), false);
  assert.equal(headers.get("Cache-Control"), "private, no-store");
});
