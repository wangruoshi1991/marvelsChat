// Build the admin bundle and install avatar-web's Chromium before running.
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, expect } = require("../../avatar-web/node_modules/@playwright/test");

const dist = path.resolve(__dirname, "../dist");
const origin = "http://127.0.0.1:49386";
const operator = { id: "operator", role: "admin", adminPermissions: ["audit:read"] };
const data = (days, userCount) => ({
  days, userCount, generatedAt: "2026-11-18T00:00:00Z",
  agents: [], products: [], taskStatuses: [], users: [],
});

async function checkMonitoring(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  let releasePrevious;
  const previous = new Promise(resolve => { releasePrevious = resolve; });
  let currentRequests = 0;
  try {
    await page.addInitScript(user => sessionStorage.setItem("miaoxun.admin.auth.v2",
      JSON.stringify({ token: "monitoring-fixture", user })), operator);
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith("/api/")) {
        const asset = url.pathname.replace(/^\/admin\//, "");
        return route.fulfill({ path: path.join(dist, asset.includes(".") ? asset : "index.html") });
      }
      if (url.pathname === "/api/me") return route.fulfill({ json: { data: { user: operator } } });
      assert.equal(url.pathname, "/api/admin/monitoring");
      assert.equal(route.request().headers().authorization, "Bearer monitoring-fixture");
      const days = Number(url.searchParams.get("days"));
      if (days === 30) {
        await previous;
        await route.fulfill({ json: { data: data(days, 201) } });
        return;
      }
      assert.equal(days, 7);
      if (++currentRequests === 1) {
        return route.fulfill({ status: 503, json: { error: { message: "窗口暂不可用" } } });
      }
      return route.fulfill({ json: { data: data(days, 0) } });
    });
    await page.goto(origin + "/admin/monitoring");
    await expect(page.getByText("正在读取 30 天运行统计…")).toBeVisible();
    await expect(page.getByText("用户数", { exact: true })).toHaveCount(0);
    const selector = page.getByRole("combobox", { name: "统计窗口" });
    await selector.press("Enter");
    const dropdown = page.locator(".ant-select-dropdown").filter({ visible: true });
    await expect(dropdown.locator(".ant-select-item-option-content"))
      .toHaveText(["7 天", "30 天", "90 天"]);
    const activeOption = dropdown.locator(".ant-select-item-option-active");
    await expect(activeOption).toHaveText("30 天");
    await selector.press("ArrowUp");
    await expect(activeOption).toHaveText("7 天");
    await selector.press("Enter");
    await expect(page.getByText("窗口暂不可用")).toBeVisible();
    await expect(selector).toBeFocused();
    await page.getByRole("button", { name: /^重\s*试$/ }).click();
    const metric = page.locator(".metric-strip-item").filter({ hasText: "用户数" });
    await expect(metric).toHaveText("用户数0");
    releasePrevious();
    await expect(metric).toHaveText("用户数0");
    assert.equal(currentRequests, 2);
    assert.equal(await page.evaluate(() => document.body.scrollWidth <= innerWidth), true);
    console.log(`Monitoring browser passed at ${width}px`);
  } finally {
    releasePrevious();
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [320, 1440]) await checkMonitoring(browser, width);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
