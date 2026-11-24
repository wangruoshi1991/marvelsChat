import assert from "node:assert/strict";
import test from "node:test";

test("the workbench shows the status API counts, quota and lifecycle", async (t) => {
  const controls = new Map();
  const document = { querySelector(selector) {
    if (!controls.has(selector)) {
      controls.set(selector, {
        value: "",
        addEventListener(type, listener) { this[type] = listener; },
      });
    }
    return controls.get(selector);
  } };
  globalThis.document = document;
  t.after(() => { delete globalThis.document; });
  let status;
  t.mock.method(globalThis, "fetch", async (path) => {
    const data = path === "/api/auth/login" ? { session: { token: "test-token" } } : status;
    return Response.json({ data });
  });
  await import("../src/main.js");
  const index = document.querySelector("#index-status");
  const setStatus = (lifecycleStatus, indexedAssets, totalAssets, dailyRemaining) => {
    status = { enabled: true, availability: {state: "available", canStartRun: true}, backfill: { lifecycleStatus, indexedAssets, totalAssets }, quota: { dailyRemaining } };
  };
  status = { enabled: false, availability: {state: "available", canStartRun: "yes"} };
  await document.querySelector("#login-form").submit({
    preventDefault() {},
    currentTarget: { querySelector: () => ({}) },
  });
  await t.test("an invalid initial response leaves only a retry path for index controls", async () => {
    assert.match(index.innerHTML, /索引状态未知/);
    assert.match(document.querySelector("#app").innerHTML, /id="refresh-status"/);
    assert.doesNotMatch(index.innerHTML, /尚未启用索引|id="enable-index"|id="reindex"|id="delete-index"/);
    assert.equal(document.querySelector("#search-query").disabled, true);
    setStatus("succeeded", 3, 3, null);
    await document.querySelector("#refresh-status").click();
    assert.match(index.innerHTML, /私有索引已启用/);
  });
  await t.test("completed assets are excluded and a null quota is unlimited", () => {
    assert.match(index.innerHTML, /已索引素材<\/dt><dd>3<\/dd>/);
    assert.match(index.innerHTML, /待处理或跳过<\/dt><dd>0<\/dd>/);
    assert.match(index.innerHTML, /今日剩余<\/dt><dd>不限<\/dd>/);
  });
  await t.test("cancelled, partially indexed, and zero quota are displayed independently", async () => {
    setStatus("cancelled", 2, 5, 0);
    await document.querySelector("#refresh-status").click();
    assert.match(index.innerHTML, /当前任务<\/dt><dd>已取消<\/dd>/);
    assert.match(index.innerHTML, /待处理或跳过<\/dt><dd>3<\/dd>/);
    assert.match(index.innerHTML, /今日剩余<\/dt><dd>0 次<\/dd>/);
  });
  await t.test("an unavailable status is explicitly unknown", async () => {
    status = {};
    await document.querySelector("#refresh-status").click();
    for (const label of ["当前任务", "已索引素材", "待处理或跳过", "今日剩余"]) {
      assert.ok(index.innerHTML.includes(`${label}</dt><dd>未知</dd>`));
    }
  });
  await t.test("awaiting consent and purging are valid public lifecycle states", async () => {
    for (const [state, label] of [["awaiting_user", "等待用户确认"], ["purging", "正在清理"]]) {
      setStatus(state, 0, 0, 0);
      await document.querySelector("#refresh-status").click();
      assert.ok(index.innerHTML.includes(`当前任务</dt><dd>${label}</dd>`));
    }
  });
});
