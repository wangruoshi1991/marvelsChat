import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { registerStationRoutes } = await import("../src/routes/station-routes.js");

const createRouteCollector = () => {
  const routes = [];
  const app = {};
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    app[method] = (path) => routes.push(`${method.toUpperCase()} ${path}`);
  }
  return { app, routes };
};

const collectStationRoutes = () => {
  const { app, routes } = createRouteCollector();
  registerStationRoutes(app, {
    authenticate: (_req, _res, next) => next(),
    asyncHandler: (handler) => handler,
  });
  return new Set(routes);
};

test("registers the station content routes used by the mobile client", () => {
  const routes = collectStationRoutes();
  const expected = [
    "GET /api/me/miao-points",
    "POST /api/station/posts",
    "DELETE /api/station/posts/:postId",
    "POST /api/station/posts/:postId/interactions",
    "PATCH /api/station/diary/:entryId",
    "DELETE /api/station/diary/:entryId",
    "PATCH /api/station/albums/:albumId",
    "DELETE /api/station/albums/:albumId",
    "PATCH /api/station/media-assets/:mediaAssetId",
    "DELETE /api/station/media-assets/:mediaAssetId",
    "POST /api/station/media-assets/:mediaAssetId/upload-url",
    "PUT /api/station/media-assets/:mediaAssetId/local-upload",
    "POST /api/station/media-assets/:mediaAssetId/upload-complete",
    "GET /api/station/media-assets/:mediaAssetId/file",
    "GET /api/station/media-assets/:mediaAssetId",
  ];

  for (const route of expected) {
    assert.ok(routes.has(route), `Missing route: ${route}`);
  }
});

test("video drafts are readable but the retired template generator is not a creation route", () => {
  const routes = collectStationRoutes();
  assert.ok(routes.has("GET /api/station/video-drafts"));
  assert.ok(!routes.has("POST /api/station/video-drafts"));
});

test("manual media search and tags remain while metadata-rule album and tag suggestions are absent", () => {
  const routes = collectStationRoutes();
  assert.ok(routes.has("GET /api/station/media-assets/search"));
  assert.ok(routes.has("PATCH /api/station/media-assets/:mediaAssetId/tags"));
  assert.ok(routes.has("POST /api/station/media-assets"));
  assert.ok(!routes.has("GET /api/station/album-suggestions"));
  assert.ok(!routes.has("POST /api/station/album-suggestions/apply"));
  assert.ok(!routes.has("POST /api/station/media-assets/:mediaAssetId/suggest-tags"));
});
