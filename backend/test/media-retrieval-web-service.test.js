import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { registerMediaRetrievalWebRoutes } = await import(
  "../src/media-retrieval-web-service.js"
);

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

test("media retrieval Web mounts immutable assets and a private HTTPS shell", () => {
  const state = createApp();
  const staticCalls = [];
  const requireHttps = (_req, _res, next) => next();

  registerMediaRetrievalWebRoutes(state.app, {
    distDir: "/tmp/media-retrieval-dist",
    staticMiddleware: (directory, options) => {
      staticCalls.push({ directory, options });
      return "static-handler";
    },
    fileExists: () => true,
    requireHttps,
  });

  assert.deepEqual(state.uses.map((entry) => entry.path), ["/media-retrieval-assets"]);
  assert.deepEqual(state.gets.map((entry) => entry.path), [
    "/media-retrieval",
    "/media-retrieval/",
    "/media-retrieval/*",
  ]);
  assert.equal(staticCalls[0].directory, "/tmp/media-retrieval-dist");
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
  assert.match(headers.get("Content-Security-Policy"), /default-src 'self'/);
  assert.match(headers.get("Content-Security-Policy"), /connect-src 'self' blob:/);
});

test("media retrieval Web reports a controlled error when its build is missing", () => {
  const state = createApp();
  registerMediaRetrievalWebRoutes(state.app, {
    distDir: "/tmp/media-retrieval-dist",
    staticMiddleware: () => "static-handler",
    fileExists: () => false,
    requireHttps: (_req, _res, next) => next(),
  });

  let observed = null;
  state.gets[0].handlers.at(-1)({}, {}, (error) => {
    observed = error;
  });

  assert.equal(observed?.status, 503);
  assert.equal(observed?.message, "Media retrieval Web build is unavailable.");
});
