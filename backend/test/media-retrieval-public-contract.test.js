import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertMediaRetrievalPublicError,
  assertMediaRetrievalSearchResponse,
  getMediaRetrievalPublicError,
  MEDIA_RETRIEVAL_ERROR_CONTRACTS,
} from "../../shared/media-retrieval-public-contract.js";
import {
  createMediaRetrievalUserService as createUserService,
  MediaRetrievalServiceError,
} from "../src/media-retrieval-user-service.js";
import { toPublicMediaRetrievalError } from "../src/media-retrieval-errors.js";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { registerStationMediaRetrievalRoutes } = await import("../src/routes/station-media-retrieval-routes.js");

const worktree = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturePath = path.join(worktree, "shared", "media-retrieval-public-contract.fixture.json");
const outputSchemaPath = path.join(worktree, "shared", "media-retrieval-search-response.schema.json");
const publicErrorSchemaPath = path.join(worktree, "shared", "media-retrieval-public-error.schema.json");
const USER_ID = "11111111-1111-4111-8111-111111111111";
const createMediaRetrievalUserService = (input) => createUserService({
  getRuntimeStatus: async () => ({ routeEligibility: { canRouteNewRun: true } }),
  ...input,
});

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));

const createRecordedRoutes = () => {
  const routes = [];
  const app = {};
  for (const method of ["get", "post", "delete"]) {
    app[method] = (routePath, ...handlers) => routes.push({ method, routePath, handlers });
  }
  return {
    routes,
    app,
  };
};

const createActualSearchService = () => createMediaRetrievalUserService({
  repository: {
    getMediaRetrievalProfile: async () => ({
      indexState: "enabled",
      consentVersion: "media-retrieval-consent-v1",
    }),
    createOrGetMediaRetrievalRun: async () => ({
      reused: false,
      run: {
        id: "33333333-3333-4333-8333-333333333333",
        traceId: "a".repeat(32),
      },
    }),
    transitionMediaRetrievalRun: async () => null,
    searchMediaRetrievalSegments: async () => [{
      mediaAssetId: "asset-1",
      kind: "image",
      matchedFrameTimestampMs: null,
      summary: "yellow dress",
      score: null,
      caption: "Alice",
      tags: [],
      descriptor: { ocrText: [] },
      metadata: {},
    }],
  },
  provider: {
    getRuntimeStatus: () => ({ configured: false, enabled: false, providerCallsEnabled: false }),
  },
});

test("the real B7 search service and HTTP route emit the canonical search DTO fixture", async () => {
  const [fixture, outputSchema] = await Promise.all([
    readJson(fixturePath),
    readJson(outputSchemaPath),
  ]);
  const service = createActualSearchService();
  const directResult = await service.searchMediaRetrieval({
    userId: USER_ID,
    query: "Alice wearing a yellow dress",
  });

  assert.deepEqual(directResult, fixture.searchSuccess);
  assert.deepEqual(assertMediaRetrievalSearchResponse(directResult), fixture.searchSuccess);
  assert.deepEqual(outputSchema.required, ["agentRunId", "lifecycleStatus", "method", "results"]);
  assert.equal(outputSchema.additionalProperties, false);

  const { app, routes } = createRecordedRoutes();
  registerStationMediaRetrievalRoutes(app, {
    authenticate: (_req, _res, next) => next?.(),
    asyncHandler: (handler) => handler,
    service,
  });
  const route = routes.find((candidate) => candidate.routePath === "/api/station/media-retrieval/search");
  const response = {
    body: null,
    json(value) {
      this.body = value;
      return this;
    },
  };
  await route.handlers[1]({
    user: { id: USER_ID },
    body: { query: "Alice wearing a yellow dress", limit: 10 },
  }, response);

  assert.deepEqual(response.body?.data, fixture.searchSuccess);
  assert.deepEqual(assertMediaRetrievalSearchResponse(response.body?.data), fixture.searchSuccess);
});

test("real public errors validate against the one shared code, body, and HTTP mapping", async () => {
  const [fixture, publicErrorSchema] = await Promise.all([
    readJson(fixturePath),
    readJson(publicErrorSchemaPath),
  ]);
  assert.deepEqual(
    [...publicErrorSchema.properties.code.enum].sort(),
    Object.keys(MEDIA_RETRIEVAL_ERROR_CONTRACTS).sort(),
  );

  for (const [code, contract] of Object.entries(MEDIA_RETRIEVAL_ERROR_CONTRACTS)) {
    const actualError = new MediaRetrievalServiceError(code);
    const publicBody = toPublicMediaRetrievalError(actualError);
    assert.equal(actualError.status, contract.status);
    assert.deepEqual(assertMediaRetrievalPublicError(publicBody, { status: actualError.status }), publicBody);
    assert.deepEqual(getMediaRetrievalPublicError(code), contract);
  }

  assert.deepEqual(
    assertMediaRetrievalPublicError(fixture.publicError.body, { status: fixture.publicError.status }),
    fixture.publicError.body,
  );
  assert.throws(
    () => assertMediaRetrievalPublicError({
      ...fixture.publicError.body,
      retryable: !fixture.publicError.body.retryable,
    }, { status: fixture.publicError.status }),
    /public error contract/i,
  );
});
