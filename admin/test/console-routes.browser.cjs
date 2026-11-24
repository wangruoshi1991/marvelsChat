const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, expect } = require("../../avatar-web/node_modules/@playwright/test");

const origin = "http://127.0.0.1:49389";
const dist = path.resolve(__dirname, "../dist");
const operator = { id: "console-operator", role: "admin", adminPermissions: ["*"] };
const account = { id: "user-fixture", displayName: "Fixture Account", status: "active", role: "user" };
const task = { id: "task-fixture", agentId: "fixture-agent", status: "failed", allowedOperations: ["retry"] };
const queuedTask = { id: "queued-fixture", agentId: "fixture-agent", status: "queued", allowedOperations: ["cancel"] };
const identity = {
  key: "fixture-agent", avatarKind: "agent-mark", displayName: "Fixture Agent",
  mark: "F", description: "Fixture description", shape: "circle",
  colors: { background: "#123456", foreground: "#FFFFFF", accent: "#DDDDDD" },
};
const release = {
  id: "release-fixture", agentKey: identity.key, version: "1.0.0", identity,
  contractHash: "a".repeat(64), declaredScopes: ["fixture:read"], readiness: { ready: true },
};
const incompleteRelease = {
  id: "incomplete-release", agentKey: "incomplete-agent", version: "1.0.0",
  catalogue: { displayName: "Dormant catalogue identity" }, catalogStatus: "draft",
};
const product = {
  id: "product-fixture", productVersionId: "version-fixture",
  productKey: "fixture-product", displayName: "Fixture Product", status: "draft",
  version: "1.0.0", supportedPlatforms: ["ios"], dependencies: [],
};
const listed = items => ({ items, total: items.length });
const button = (page, name) => page.getByRole("button", { name, exact: true });
const confirm = (page, title) => button(page.getByRole("dialog", { name: title }), /^确\s*认$/).click();

async function withConsole(browser, handle, check, user = operator) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(6500);
  const errors = [];
  const requests = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(value => sessionStorage.setItem("miaoxun.admin.auth.v2",
    JSON.stringify({ token: "console-fixture", user: value })), user);
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) {
      const asset = url.pathname.replace(/^\/admin\//, "");
      return route.fulfill({ path: path.join(dist, asset.includes(".") ? asset : "index.html") });
    }
    const request = route.request();
    assert.equal(request.headers().authorization, "Bearer console-fixture");
    if (url.pathname === "/api/me") return route.fulfill({ json: { data: { user } } });
    const entry = { url, method: request.method(), key: request.headers()["idempotency-key"],
      body: request.postData() ? request.postDataJSON() : null };
    requests.push(entry);
    const data = handle(entry);
    assert.notEqual(data, undefined, `Unexpected request ${entry.method} ${url.pathname}`);
    if (entry.loseResponse) return route.abort("failed");
    return route.fulfill({ json: { data } });
  });
  try {
    await check(page, requests);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

async function checkOperations(browser) {
  await withConsole(browser, ({ url }) => {
    if (url.pathname === "/api/admin/overview") {
      assert.equal(url.searchParams.get("days"), "30");
      return {
        metrics: { usersTotal: 3, agentRuns: 4 },
        freshness: { source: "postgresql" },
        daily: [
          { day: "2026-11-01", runs: 4, succeeded: 3, failed: 1, tasks: 2 },
          { day: "2026-11-02", runs: 0, succeeded: 0, failed: 0, tasks: 1 },
        ],
      };
    }
    if (url.pathname === "/api/admin/users") {
      assert.equal(url.searchParams.get("page"), "1");
      return listed(url.searchParams.get("query") ? [] : [account]);
    }
  }, async (page, requests) => {
    await page.goto(origin + "/admin/overview");
    await expect(page.getByRole("heading", { name: "每日运行与任务趋势" })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "2026-11-01" })).toContainText("75%");
    await expect(page.getByRole("row").filter({ hasText: "2026-11-02" })).toContainText("未知");
    await expect(page.getByRole("link", { name: "Agent 发布", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "用户与权限", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: account.displayName })).toBeVisible();
    await page.getByPlaceholder("昵称、邮箱、手机号或 AI ID").fill("missing");
    await button(page, /^筛\s*选$/).click();
    await expect.poll(() => requests.at(-1)?.url.searchParams.get("query")).toBe("missing");
    await expect(page.getByRole("row").filter({ hasText: account.displayName })).toHaveCount(0);
  }, { ...operator, adminPermissions: ["users:read"] });

  const adminAccount = { ...account, id: "managed-admin", displayName: "Managed Admin", role: "admin" };
  await withConsole(browser, ({ url }) => {
    if (url.pathname === "/api/admin/users") return listed([adminAccount, account]);
    if (url.pathname === `/api/admin/users/${adminAccount.id}`) return { user: adminAccount };
    if (url.pathname === `/api/admin/users/${account.id}`) return { user: account };
  }, async (page) => {
    await page.goto(origin + "/admin/users");
    await button(page, `查看用户 ${adminAccount.displayName} 详情`).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("管理员", { exact: true })).toBeVisible();
    await expect(button(drawer, /停用账号$/)).toHaveCount(0);
    await button(drawer, "Close").click();
    await button(page, `查看用户 ${account.displayName} 详情`).click();
    await expect(button(drawer, /停用账号$/)).toBeVisible();
    await expect(button(drawer, "设为管理员")).toHaveCount(0);
  }, { ...operator, adminPermissions: ["users:read", "users:write"] });

  const retryKeys = [];
  await withConsole(browser, (entry) => {
    const { url, method, key } = entry;
    if (url.pathname === "/api/admin/tasks") return listed([task, queuedTask]);
    if (url.pathname === `/api/admin/tasks/${task.id}/retry`) {
      assert.equal(method, "POST");
      assert.ok(key);
      retryKeys.push(key);
      if (retryKeys.length === 1) entry.loseResponse = true;
      return { id: task.id, status: "queued" };
    }
    if (url.pathname === `/api/admin/tasks/${queuedTask.id}/cancel`) {
      assert.equal(method, "POST");
      assert.ok(key);
      return { id: queuedTask.id, status: "cancelled" };
    }
  }, async (page, requests) => {
    await page.goto(origin + "/admin/tasks");
    const row = page.getByRole("row").filter({ hasText: task.id });
    await expect(row).toBeVisible();
    await page.getByPlaceholder("Agent key").fill(task.agentId);
    await page.getByRole("combobox").click();
    await page.locator(".ant-select-item-option-content").getByText("失败", { exact: true }).click();
    await button(page, /^筛\s*选$/).click();
    await expect.poll(() => requests.at(-1)?.url.searchParams.get("agentId")).toBe(task.agentId);
    assert.equal(requests.at(-1).url.searchParams.get("status"), "failed");
    assert.equal(requests.at(-1).url.searchParams.get("limit"), "80");
    assert.equal(await button(row, /^取\s*消$/).count(), 0);
    await button(row, /^重\s*试$/).click();
    await confirm(page, "重试任务？");
    const retry = page.getByRole("dialog", { name: "重试任务？" });
    await expect(retry.getByRole("alert")).toBeVisible();
    await confirm(page, "重试任务？");
    await expect(page.getByText("操作已提交")).toBeVisible();
    assert.equal(retryKeys.length, 2);
    assert.equal(retryKeys[0], retryKeys[1]);
    const queued = page.getByRole("row").filter({ hasText: queuedTask.id });
    await button(queued, /^取\s*消$/).click();
    const cancel = page.getByRole("dialog", { name: "取消任务？" });
    await button(cancel, /^取\s*消$/).click();
    await expect(cancel).toBeHidden();
    assert.equal(requests.filter(item => item.url.pathname.endsWith("/cancel")).length, 0);
    await button(queued, /^取\s*消$/).click();
    await confirm(page, "取消任务？");
    await expect(cancel).toBeHidden();
    assert.equal(requests.filter(item => item.url.pathname.endsWith("/cancel")).length, 1);
  });
}

async function checkPublishing(browser) {
  let status = "draft";
  let savedIdentity = null;
  const displayName = '<script data-publishing-fixture="owned">Fixture</script>';
  await withConsole(browser, ({ url, method, key, body }) => {
    if (url.pathname === "/api/admin/agent-registry") return { agents: [] };
    if (url.pathname === "/api/admin/agent-releases") {
      return listed([{ ...release, identity: savedIdentity || identity, catalogStatus: status }, incompleteRelease]);
    }
    if (url.pathname === `/api/admin/agent-releases/${release.id}`) {
      return { release: { ...release, identity: savedIdentity || identity, catalogStatus: status }, productsVisible: false };
    }
    if (url.pathname.endsWith("/identity")) {
      assert.equal(method, "PATCH");
      assert.ok(key);
      assert.deepEqual(body.colors, identity.colors);
      assert.equal(body.key, identity.key);
      assert.equal(body.mark, identity.mark);
      assert.equal(body.displayName, displayName);
      savedIdentity = body;
      return {};
    }
    if (url.pathname.endsWith("/review") || url.pathname.endsWith("/publish")) {
      assert.equal(method, "POST");
      assert.ok(key);
      if (url.pathname.endsWith("/review")) {
        assert.equal(status, "draft");
        status = "review";
      } else {
        assert.equal(status, "review");
        status = "published";
      }
      return {};
    }
  }, async (page) => {
    await page.goto(origin + "/admin/releases");
    const row = page.getByRole("row").filter({ hasText: release.agentKey });
    await expect(row).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: incompleteRelease.agentKey })).toBeVisible();
    await expect(page.getByText(incompleteRelease.catalogue.displayName, { exact: true })).toHaveCount(0);
    await expect(button(row, /^发\s*布$/)).toHaveCount(0);
    await button(row, "配置详情").click();
    const details = page.getByRole("dialog").filter({ hasText: "发布展示身份" });
    await details.getByLabel("身份显示名称").fill(displayName);
    await button(details, /保存发布身份$/).click();
    await button(page.getByRole("dialog", { name: "保存发布身份？" }), /^保\s*存$/).click();
    await expect(page.getByText("发布身份已保存")).toBeVisible();
    await expect(row.getByText(displayName, { exact: true })).toBeVisible();
    await expect(page.locator("script[data-publishing-fixture]")).toHaveCount(0);
    for (const [label, title] of [[/^提交审核$/, "提交 Agent release 审核？"], [/^发\s*布$/, "发布 Agent release？"]]) {
      await button(details, label).click();
      await confirm(page, title);
    }
    await expect(row.getByText("已发布", { exact: true })).toBeVisible();
  });

  let created = false;
  let submitted = false;
  await withConsole(browser, ({ url, method, key, body }) => {
    if (url.pathname === "/api/admin/products/published-agent-releases") {
      return { releases: [{ ...release, catalogStatus: "published" }] };
    }
    if (url.pathname === "/api/admin/products" && method === "GET") {
      return listed([{ ...product, status: submitted ? "review" : "draft" }]);
    }
    if (url.pathname === "/api/admin/products" && method === "POST") {
      assert.ok(key);
      assert.equal(body.productKey, "new-fixture");
      assert.equal(body.status, "draft");
      assert.deepEqual(body.dependencies, [{
        agentKey: release.agentKey, agentReleaseId: release.id,
        version: release.version, scopes: release.declaredScopes,
      }]);
      created = true;
      return {};
    }
    if (url.pathname === `/api/admin/products/${product.id}/submit`) {
      assert.equal(method, "POST");
      assert.ok(key);
      assert.deepEqual(body, { productVersionId: product.productVersionId });
      submitted = true;
      return {};
    }
  }, async (page) => {
    await page.goto(origin + "/admin/products");
    const row = page.getByRole("row").filter({ hasText: product.displayName });
    await expect(row).toBeVisible();
    await expect(button(row, /^发\s*布$/)).toHaveCount(0);
    await button(row, "提交审核").click();
    await confirm(page, "提交产品审核？");
    await expect(row).toContainText("审核中");
    await expect(button(row, /发\s*布$/)).toBeEnabled();
    assert.equal(submitted, true);
    await button(page, /创建产品草稿$/).click();
    const dialog = page.getByRole("dialog", { name: "创建产品草稿" });
    await dialog.getByLabel("产品 key").fill("new-fixture");
    await dialog.getByLabel("产品版本").fill("1.0.0");
    await dialog.getByLabel("产品名称").fill("New Fixture Product");
    await dialog.getByLabel("统一标记").fill("N");
    await dialog.getByLabel("绑定已发布 Agent release").click();
    await page.locator(".ant-select-item-option-content").getByText(/Fixture Agent · fixture-agent/).click();
    await button(dialog, "保存产品草稿").click();
    await button(page.getByRole("dialog", { name: "创建产品版本草稿？" }), "保存草稿").click();
    await expect(dialog).toBeHidden();
    assert.equal(created, true);
  });
}

(async () => {
  const browser = await chromium.launch();
  try {
    await checkOperations(browser);
    await checkPublishing(browser);
    console.log("PASS React overview, account filtering, task retry, release identity/review/publish, and product draft/submit");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
