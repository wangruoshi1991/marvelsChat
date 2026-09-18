import assert from "node:assert/strict";
import test from "node:test";

import {
  AdminApiError,
  buildAdminProfileUpdate,
  canManageAdminAccount,
  createAdminApiRequest,
  escapeHtml,
  friendlyAdminErrorMessage,
  hasAdminPermission,
  shouldClearAdminSession,
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

test("admin permission checks preserve least privilege and wildcard access", () => {
  assert.equal(hasAdminPermission({ role: "user", adminPermissions: ["*"] }, "users:read"), false);
  assert.equal(hasAdminPermission({ role: "admin", adminPermissions: ["audit:read"] }, "audit:read"), true);
  assert.equal(hasAdminPermission({ role: "admin", adminPermissions: ["audit:read"] }, "users:read"), false);
  assert.equal(hasAdminPermission({ role: "admin", adminPermissions: ["*"] }, "model:operate"), true);
  assert.equal(hasAdminPermission({ role: "admin", adminPermissions: null }, "users:read"), false);
});

test("restricted operators cannot manage administrator accounts or promote users", () => {
  const operator = { role: "admin", adminPermissions: ["users:write"] };
  const superAdmin = { role: "admin", adminPermissions: ["*"] };
  assert.equal(canManageAdminAccount(operator, "admin"), false);
  assert.equal(canManageAdminAccount(operator, "user", "admin"), false);
  assert.equal(canManageAdminAccount(operator, "user"), true);
  assert.equal(canManageAdminAccount(superAdmin, "admin"), true);
});

test("only authentication failures clear the admin session", () => {
  assert.equal(shouldClearAdminSession(new AdminApiError("expired", { status: 401 })), true);
  assert.equal(shouldClearAdminSession(new AdminApiError("forbidden", { status: 403 })), false);
  assert.equal(shouldClearAdminSession(new AdminApiError("offline", { isNetworkError: true })), false);
});

test("profile updates distinguish omitted display years from zero and never write GPS fields", () => {
  const values = {
    nickname: "  测试用户  ", headline: "  独立设计师  ", publicLocation: "  上海  ",
    experienceYears: "0", languages: ["zh", "en"], latitude: 31.2, longitude: 121.5,
  };
  const update = buildAdminProfileUpdate(values);
  assert.equal(update.nickname, "测试用户");
  assert.equal(update.headline, "独立设计师");
  assert.equal(update.publicLocation, "上海");
  assert.equal(update.experienceYears, 0);
  assert.equal("latitude" in update, false);
  assert.equal("longitude" in update, false);
  assert.deepEqual(buildAdminProfileUpdate({ nickname: "测试用户", languages: [] }), {
    nickname: "测试用户", bio: "", community: "", activityArea: "",
    headline: "", publicLocation: "", experienceYears: null, languages: [],
  });
});

test("profile updates reject invalid years, unsupported language codes and oversized identity text", () => {
  const values = { nickname: "测试用户", languages: [] };
  for (const experienceYears of ["-1", "81", "3.5", "NaN", "Infinity", "2年"]) {
    assert.throws(() => buildAdminProfileUpdate({ ...values, experienceYears }), /0 至 80/);
  }
  for (const languages of [["zh", "zh"], ["unknown"], "zh"]) {
    assert.throws(() => buildAdminProfileUpdate({ ...values, languages }), /选择语言/);
  }
  assert.equal(buildAdminProfileUpdate({ ...values, experienceYears: "80" }).experienceYears, 80);
  assert.throws(() => buildAdminProfileUpdate({ ...values, headline: "字".repeat(81) }), /身份标题最多 80/);
  assert.throws(() => buildAdminProfileUpdate({ ...values, publicLocation: "字".repeat(121) }), /公开城市最多 120/);
});
