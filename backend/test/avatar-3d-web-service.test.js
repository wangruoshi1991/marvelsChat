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
  assert.deepEqual(state.gets.map((entry) => entry.path), ["/avatar", "/avatar/", "/avatar/*"]);
  assert.equal(staticCalls[0].directory, "/tmp/avatar-dist");
  assert.equal(staticCalls[0].options.immutable, true);
  assert.equal(state.uses[0].handlers[0], requireHttps);
  for (const route of state.gets) assert.equal(route.handlers[0], requireHttps);

  const headers = new Map();
  const response = {
    set: (name, value) => headers.set(name, value),
    sendFile: (_path, callback) => callback(null),
  };
  state.gets[0].handlers.at(-1)({}, response, () => {});
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
  state.gets[0].handlers.at(-1)({}, {}, (error) => {
    observed = error;
  });

  assert.equal(observed?.status, 503);
  assert.equal(observed?.message, "Avatar Web build is unavailable.");
});
