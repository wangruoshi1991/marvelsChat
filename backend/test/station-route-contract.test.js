import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { registerStationRoutes } = await import("../src/routes/station-routes.js");

const collectRoutes = () => {
  const routes = [];
  const app = {};
  for (const method of ["get", "post", "patch", "delete"]) {
    app[method] = (path) => routes.push(`${method.toUpperCase()} ${path}`);
  }
  registerStationRoutes(app, {
    authenticate: (_req, _res, next) => next(),
    asyncHandler: (handler) => handler,
  });
  return new Set(routes);
};

test("registers the station content routes used by the mobile client", () => {
  const routes = collectRoutes();
  const expected = [
    "PATCH /api/station/diary/:entryId",
    "DELETE /api/station/diary/:entryId",
    "PATCH /api/station/albums/:albumId",
    "DELETE /api/station/albums/:albumId",
    "PATCH /api/station/media-assets/:mediaAssetId",
    "DELETE /api/station/media-assets/:mediaAssetId",
  ];

  for (const route of expected) {
    assert.ok(routes.has(route), `Missing route: ${route}`);
  }
});

