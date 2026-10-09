import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const worktree = path.resolve(webDirectory, "..");
const fixture = JSON.parse(await fs.readFile(
  path.join(worktree, "shared", "media-retrieval-public-contract.fixture.json"),
  "utf8",
));
const outputSchema = JSON.parse(await fs.readFile(
  path.join(worktree, "shared", "media-retrieval-search-response.schema.json"),
  "utf8",
));
const { MediaRetrievalApiError, mediaRetrievalApi } = await import("../src/api.js");

const response = ({ ok, status, payload }) => ({
  ok,
  status,
  json: async () => payload,
});

test("Web search consumes the same canonical search fixture and rejects malformed or unsafe DTOs", async () => {
  const originalFetch = globalThis.fetch;
  try {
    assert.deepEqual(outputSchema.required, ["agentRunId", "lifecycleStatus", "method", "results"]);
    globalThis.fetch = async () => response({ ok: true, status: 200, payload: { data: fixture.searchSuccess } });
    assert.deepEqual(
      await mediaRetrievalApi.search("test-token", { query: "Alice wearing a yellow dress", limit: 10 }),
      fixture.searchSuccess,
    );

    globalThis.fetch = async () => response({
      ok: true,
      status: 200,
      payload: { data: { ...fixture.searchSuccess, lifecycleStatus: "not-a-lifecycle" } },
    });
    await assert.rejects(
      () => mediaRetrievalApi.search("test-token", { query: "Alice wearing a yellow dress", limit: 10 }),
      (error) => error instanceof MediaRetrievalApiError && error.code === "retrieval_service_unavailable",
    );

    globalThis.fetch = async () => response({ ok: false, status: fixture.publicError.status, payload: { error: fixture.publicError.body } });
    await assert.rejects(
      () => mediaRetrievalApi.search("test-token", { query: "Alice wearing a yellow dress", limit: 10 }),
      (error) => error instanceof MediaRetrievalApiError &&
        error.status === fixture.publicError.status &&
        error.code === fixture.publicError.body.code &&
        error.retryable === fixture.publicError.body.retryable,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Web sends the current retrieval contract on every media retrieval endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (url, options) => {
      requests.push({ url: String(url), options });
      return response({
        ok: true,
        status: 200,
        payload: {
          data: String(url).endsWith("/search") ? fixture.searchSuccess : {},
        },
      });
    };

    await mediaRetrievalApi.status("test-token");
    await mediaRetrievalApi.enable("test-token", "enable-key-0001");
    await mediaRetrievalApi.search("test-token", { query: "yellow dress", limit: 10 });
    await mediaRetrievalApi.reindex("test-token", { scope: "all" }, "reindex-key-0001");
    await mediaRetrievalApi.deleteIndex("test-token", "delete-key-0001");

    assert.equal(requests.length, 5);
    for (const { options } of requests) {
      assert.equal(options.headers["X-Miaoxun-Retrieval-Contract"], "2");
    }
    for (const { options } of requests.filter(({ options }) => options.body !== undefined)) {
      assert.equal(options.headers["Content-Type"], "application/json");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
