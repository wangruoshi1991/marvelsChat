import assert from "node:assert/strict";
import test from "node:test";

import {
  createCorsOptionsDelegate,
  isLocalAvatarViewerRequest,
} from "../src/cors-policy.js";

const request = ({
  method = "GET",
  origin = "null",
  path = "/api/avatar-3d/app/models/8e1ad937-c4dd-400c-855a-6c10d2ddd2db/file",
} = {}) => ({
  get: (name) => name.toLowerCase() === "origin" ? origin : "",
  method,
  path,
});

const resolveOptions = (delegate, req) => new Promise((resolve, reject) => {
  delegate(req, (error, options) => error ? reject(error) : resolve(options));
});

test("local avatar viewer CORS is limited to the private model file route", () => {
  assert.equal(isLocalAvatarViewerRequest(request()), true);
  assert.equal(isLocalAvatarViewerRequest(request({ method: "POST" })), false);
  assert.equal(isLocalAvatarViewerRequest(request({ origin: "https://example.com" })), false);
  assert.equal(isLocalAvatarViewerRequest(request({
    path: "/api/avatar-3d/app/models/8e1ad937-c4dd-400c-855a-6c10d2ddd2db/thumbnail",
  })), false);
  assert.equal(isLocalAvatarViewerRequest(request({
    path: "/api/avatar-3d/app/models/not-a-uuid/file",
  })), false);
});

test("local viewer receives only the headers required for authenticated GLB loading", async () => {
  const delegate = createCorsOptionsDelegate({ origin: "https://station.example" });
  const options = await resolveOptions(delegate, request({ method: "OPTIONS" }));

  assert.equal(options.origin, "null");
  assert.equal(options.credentials, false);
  assert.deepEqual(options.allowedHeaders, ["Authorization", "Range"]);
  assert.deepEqual(options.methods, ["GET", "HEAD", "OPTIONS"]);
});

test("all other requests preserve the configured CORS origin", async () => {
  const delegate = createCorsOptionsDelegate({ origin: "https://station.example" });
  const options = await resolveOptions(delegate, request({
    origin: "null",
    path: "/api/app/bootstrap",
  }));

  assert.deepEqual(options, {
    exposedHeaders: ["X-Request-ID"],
    origin: "https://station.example",
  });
});
