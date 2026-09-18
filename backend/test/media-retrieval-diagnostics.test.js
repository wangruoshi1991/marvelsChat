import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { createMediaRetrievalProvider } = await import("../src/media-retrieval-provider.js");
const { createMediaRetrievalDiagnostics } = await import("../src/media-retrieval-diagnostics.js");
const { projectMediaRetrievalDiagnostic, toPublicMediaRetrievalError } = await import("../src/media-retrieval-errors.js");
const { registerEventRoutes } = await import("../src/routes/event-routes.js");

const reservation = { reserved: true, reservationId: "11111111-1111-4111-8111-111111111111" };
const runId = "22222222-2222-4222-8222-222222222222";
const config = { mediaRetrieval: {
  enabled: true, providerCallsEnabled: true, dashscopeApiKey: "private-key-marker",
  dashscopeApiBaseUrl: "https://workspace.example/api/v1", captionModel: "caption", embeddingModel: "embedding",
} };
const response = (payload, status = 200) =>
  new Response(JSON.stringify(payload), { status });
const assertPrivate = (value) => {
  assert.doesNotMatch(JSON.stringify(value), /private-|workspace\.example|signed\.example/);
};

test("provider HTTP failures preserve only status and allowlisted codes in the audit, never public errors", async () => {
  for (const providerCode of ["InvalidApiKey", "private-arbitrary-code"]) {
    const recorded = [];
    const provider = createMediaRetrievalProvider({
      config, recordDiagnostic: async (value) => recorded.push(value),
      fetchImpl: async () => response({ code: providerCode, message: "private-response-message", url: "https://signed.example/private-file" }, 403),
    });
    await assert.rejects(() => provider.describeImage({ imageUrl: "https://signed.example/private-file", reservation }), (error) => {
      assert.deepEqual(toPublicMediaRetrievalError(error), {
        code: "retrieval_service_unavailable", message: "Media retrieval is temporarily unavailable.", retryable: true,
      });
      assertPrivate(error);
      return true;
    });
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].diagnostic.httpStatus, 403);
    assert.equal(recorded[0].diagnostic.providerCode, providerCode === "InvalidApiKey" ? providerCode : "unrecognized");
    assertPrivate(recorded);
  }
});

test("model descriptor and query failures persist schema paths but no values or arbitrary keys", async () => {
  const scenarios = [
    { method: "describeImage", stage: "descriptor-validation", input: { imageUrl: "https://signed.example/private-file" }, candidate: { summary: "private-caption", clothing: [{ type: "private-type" }] }, path: "clothing[].color" },
    { method: "parseRetrievalQuery", stage: "query-validation", input: { query: "private-query" }, candidate: { visualQuery: "private-query", identityTerms: "private-identity", parseConfidence: "high", "private-key": "private-value" }, path: "identityTerms" },
  ];
  for (const scenario of scenarios) {
    const recorded = [];
    const provider = createMediaRetrievalProvider({
      config, recordDiagnostic: async (value) => recorded.push(value),
      fetchImpl: async () => response({ output: { choices: [{ message: { content: JSON.stringify(scenario.candidate) } }] } }),
    });
    await assert.rejects(() => provider[scenario.method]({ ...scenario.input, reservation }), (error) => error.code === "retrieval_policy_unverifiable");
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].diagnostic.stage, scenario.stage);
    assert.ok(recorded[0].diagnostic.schemaPaths.includes(scenario.path));
    assertPrivate(recorded);
  }
});

test("transport and embedding failures are distinguishable without retaining thrown messages", async () => {
  for (const stage of ["timeout", "transport", "response-json", "embedding-validation"]) {
    const recorded = [];
    const provider = createMediaRetrievalProvider({
      config, recordDiagnostic: async (value) => recorded.push(value),
      fetchImpl: async () => {
        const error = new Error("private-network-error");
        if (stage === "timeout") { error.name = "AbortError"; throw error; }
        if (stage === "transport") throw error;
        if (stage === "response-json") return new Response("{invalid-json", { status: 200 });
        return response({ output: { embeddings: [{ embedding: ["private-vector"] }] } });
      },
    });
    await assert.rejects(() => provider.embedImage({ imageUrl: "https://signed.example/private-file", reservation }), (error) => error.code === "retrieval_service_unavailable");
    assert.equal(recorded[0].diagnostic.stage, stage);
    assertPrivate(recorded);
  }
});

test("audit persistence derives ownership from the reservation and admin reads re-project every record", async () => {
  const calls = [];
  const unsafe = { operation: "image-description", stage: "descriptor-validation", httpStatus: 200,
    schemaPaths: ["summary", "private-property"], providerCode: "private-provider-code", body: "private-caption" };
  const diagnostics = createMediaRetrievalDiagnostics({
    idFactory: () => "33333333-3333-4333-8333-333333333333",
    queryFn: async (sql, values) => {
      calls.push({ sql, values });
      return sql.includes("INSERT INTO") ? [{ id: "created" }] : [
        { agent_run_id: runId, payload: { ...unsafe, failureCode: "retrieval_policy_unverifiable" }, created_at: "2026-09-16T00:00:00Z" },
        { agent_run_id: runId, payload: { stage: "private-stage" }, created_at: "2026-09-16T00:00:00Z" },
      ];
    },
  });
  await diagnostics.record({ reservationId: reservation.reservationId, failureCode: "retrieval_policy_unverifiable", diagnostic: unsafe });
  assert.match(calls[0].sql, /run\.user_id = cost\.user_id/);
  assert.equal(calls[0].values.at(-1), reservation.reservationId);
  assertPrivate(calls[0].values);
  const rows = await diagnostics.list();
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].schemaPaths, ["summary"]);
  assertPrivate(rows);
  assert.match(calls[1].sql, /INTERVAL '30 days'/);
  assert.equal(projectMediaRetrievalDiagnostic({ ...unsafe, operation: "private-operation" }), null);
});

test("a diagnostic write failure is explicit and never logs database or provider content", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  const provider = createMediaRetrievalProvider({
    config, recordDiagnostic: async () => { throw new Error("private-database-url"); },
    fetchImpl: async () => response({ code: "InvalidApiKey", message: "private-provider-body" }, 401),
  });
  await assert.rejects(() => provider.describeImage({ imageUrl: "https://signed.example/private-file", reservation }), (error) => error.code === "retrieval_repository_write_failed");
  assert.equal(log.mock.calls.length, 1);
  assertPrivate(log.mock.calls[0].arguments);
});

test("client analytics cannot forge provider diagnostic audit events", async () => {
  let handler;
  registerEventRoutes({ post: (_path, ...handlers) => { handler = handlers.at(-1); } }, {
    authenticate: () => {}, asyncHandler: (value) => value,
  });
  await assert.rejects(() => handler({
    body: { eventType: "  media_retrieval.provider.failed  ", payload: { operation: "image-description", stage: "timeout" } },
  }, {}), (error) => error.status === 400);
});
