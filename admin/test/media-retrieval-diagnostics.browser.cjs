const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, expect } = require("../../avatar-web/node_modules/@playwright/test");

const origin = "http://127.0.0.1:49388";
const dist = path.resolve(__dirname, "../dist");
const operator = { id: "diagnostic-operator", role: "admin", adminPermissions: ["agents:manage"] };
const escaped = '<script data-fixture="diagnostic">&';

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.addInitScript(user => sessionStorage.setItem("miaoxun.admin.auth.v2",
      JSON.stringify({ token: "diagnostics-fixture", user })), operator);
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith("/api/")) {
        const asset = url.pathname.replace(/^\/admin\//, "");
        return route.fulfill({ path: path.join(dist, asset.includes(".") ? asset : "index.html") });
      }
      if (url.pathname === "/api/me") return route.fulfill({ json: { data: { user: operator } } });
      assert.equal(url.pathname, "/api/admin/media-retrieval/overview");
      assert.equal(route.request().headers().authorization, "Bearer diagnostics-fixture");
      return route.fulfill({ json: { data: {
        runtimeStatus: {
          lifecycle: "limited_release",
          publicAvailability: { state: "available" },
          liveness: { lastSeenAt: "2026-11-18T00:00:00.000Z" },
        },
        recentRuns: [{ id: "index-fixture", agentRunId: "index-fixture", runType: "index", lifecycleStatus: "succeeded" }],
        readySegments: 12,
        cost: { reservedFen: 0, estimatedFen: 5, unknownFen: 200 },
        diagnostics: [
          { agentRunId: escaped, operation: "image-description", stage: "descriptor-validation",
            failureCode: "retrieval_policy_unverifiable", httpStatus: 200, schemaPaths: ["clothing[].color"] },
          { agentRunId: "auth", stage: "http-response", httpStatus: 403, schemaPaths: [] },
          { agentRunId: "uncertain", stage: "timeout", schemaPaths: [] },
        ],
      } } });
    });
    await page.goto(origin + "/admin/media");
    await expect(page.getByText("limited_release", { exact: true })).toBeVisible();
    await expect(page.getByText("available", { exact: true })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "index-fixture" })).toContainText("succeeded");
    await expect(page.getByText(escaped, { exact: true })).toBeVisible();
    await expect(page.locator("script[data-fixture=diagnostic]")).toHaveCount(0);
    await expect(page.getByText("clothing[].color", { exact: true })).toBeVisible();
    await expect(page.getByText(/保持校验开启/)).toBeVisible();
    await expect(page.getByText(/模型授权/)).toBeVisible();
    await expect(page.getByText(/勿自动重复调用/)).toBeVisible();
    await expect(page.getByText(/不代表供应商实际扣款/)).toBeVisible();
    await expect(page.getByText("¥2.00", { exact: true })).toBeVisible();
    console.log("Media diagnostics browser passed");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
