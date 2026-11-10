import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { registerStationMediaRetrievalRoutes } from "../src/routes/station-media-retrieval-routes.js";
import { toPublicMediaRetrievalError } from "../src/media-retrieval-errors.js";
import { mediaRetrievalApi } from "../../media-retrieval-web/src/api.js";

const fixture = JSON.parse(await readFile(new URL("../../shared/media-retrieval-public-contract.fixture.json", import.meta.url), "utf8"));

test("Web search crosses the real HTTP contract gate with an explicit owner and operation key", async () => {
  // Provider output is the frozen fixture. This verifies transport and route
  // validation only; it does not claim live retrieval or visual quality.
  const searches = [];
  const app = express();
  app.use(express.json());
  registerStationMediaRetrievalRoutes(app, {
    authenticate: (req, res, next) => {
      if (req.get("Authorization") !== "Bearer isolated-test-session") return res.sendStatus(401);
      req.user = { id: "isolated-http-owner" };
      next();
    },
    asyncHandler: handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    service: {
      searchMediaRetrieval: async input => {
        searches.push(input);
        return fixture.searchSuccess;
      },
    },
  });
  app.use((error, _req, res, _next) => res.status(error.status || 503).json({ error: toPublicMediaRetrievalError(error) }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (routePath, options) => originalFetch(new URL(routePath, origin), options);
    const input = { query: "isolated yellow dress", kind: "image", limit: 10 };
    for (const key of ["search-http-0001", "search-http-0001", "search-http-0002"]) {
      assert.deepEqual(await mediaRetrievalApi.search("isolated-test-session", input, key), fixture.searchSuccess);
    }
    assert.deepEqual(searches.map(({ idempotencyKey }) => idempotencyKey), ["search-http-0001", "search-http-0001", "search-http-0002"]);
    assert.ok(searches.every(({ userId, query }) => userId === "isolated-http-owner" && query === input.query));

    const withoutKey = await originalFetch(`${origin}/api/station/media-retrieval/search`, {
      method: "POST",
      headers: { Authorization: "Bearer isolated-test-session", "Content-Type": "application/json", "X-Miaoxun-Retrieval-Contract": "2" },
      body: JSON.stringify(input),
    });
    assert.equal(withoutKey.status, 400);
    assert.equal((await withoutKey.json()).error.code, "retrieval_request_invalid");
    assert.equal(searches.length, 3, "invalid request must never reach the retrieval service");
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
