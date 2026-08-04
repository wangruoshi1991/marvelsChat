import assert from "node:assert/strict";
import test from "node:test";

import {
  AdminApiError,
  createAdminApiRequest,
  escapeHtml,
  friendlyAdminErrorMessage,
} from "../admin-core.js";

const jsonResponse = (body, { status = 200, requestId = "server-request" } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => name === "X-Request-ID" ? requestId : null },
  text: async () => JSON.stringify(body),
});

test("admin API client injects auth and request metadata", async () => {
  const calls = [];
  const request = createAdminApiRequest({
    baseOrigin: "https://console.example.com",
    getToken: () => "session-token",
    createRequestId: () => "client-request",
    fetchImpl: async (...args) => {
      calls.push(args);
      return jsonResponse({ data: { ok: true } });
    },
  });

  assert.deepEqual(
    await request("/api/admin/users", { method: "POST", body: "{}" }),
    { ok: true },
  );
  assert.equal(calls[0][0], "https://console.example.com/api/admin/users");
  assert.equal(calls[0][1].headers.Authorization, "Bearer session-token");
  assert.equal(calls[0][1].headers["X-Request-ID"], "client-request");
  assert.equal(calls[0][1].headers["Content-Type"], "application/json");
});

test("admin API client exposes safe server errors and request IDs", async () => {
  const request = createAdminApiRequest({
    createRequestId: () => "client-request",
    fetchImpl: async () => jsonResponse({
      error: {
        message: "Current account lacks admin permission",
        details: { code: "ADMIN_REQUIRED" },
        requestId: "server-request",
      },
    }, { status: 403 }),
  });

  await assert.rejects(
    () => request("/api/admin/overview"),
    (error) => error instanceof AdminApiError
      && error.status === 403
      && error.requestId === "server-request"
      && error.details.code === "ADMIN_REQUIRED",
  );
});

test("admin API client rejects non-API paths before sending a request", async () => {
  let called = false;
  const request = createAdminApiRequest({
    fetchImpl: async () => {
      called = true;
      return jsonResponse({ data: null });
    },
  });

  await assert.rejects(() => request("/admin/users"), /must start with \/api/);
  assert.equal(called, false);
});

test("admin API timeout remains active while the response body is read", async () => {
  const request = createAdminApiRequest({
    timeoutMs: 5,
    createRequestId: () => "client-request",
    fetchImpl: async (_url, { signal }) => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: () => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      }),
    }),
  });

  await assert.rejects(
    () => request("/api/admin/overview"),
    (error) => error instanceof AdminApiError && error.isTimeout,
  );
});

test("admin presentation helpers escape markup and normalize known errors", () => {
  assert.equal(escapeHtml(`<script data-x="1">'&`), "&lt;script data-x=&quot;1&quot;&gt;&#039;&amp;");
  assert.equal(
    friendlyAdminErrorMessage(
      new AdminApiError("Current account lacks admin permission", { status: 403 }),
    ),
    "当前账号没有后台权限。",
  );
});
