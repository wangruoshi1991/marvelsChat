import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { registerStationRoutes } = await import("../src/routes/station-routes.js");
const { registerMapRoutes } = await import("../src/routes/map-routes.js");

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
  ];

  for (const route of expected) {
    assert.ok(routes.has(route), `Missing route: ${route}`);
  }
});

test("registers short-lived map ticket routes", () => {
  const { app, routes } = createRouteCollector();
  registerMapRoutes(app, { asyncHandler: (handler) => handler });
  const routeSet = new Set(routes);

  assert.ok(routeSet.has("POST /api/map/ticket"));
  assert.ok(routeSet.has("GET /api/map/style"));
  assert.ok(routeSet.has("GET /api/map/tiles/:z/:x/:y.png"));
});
