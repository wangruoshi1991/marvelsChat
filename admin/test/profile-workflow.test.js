import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import * as adminCore from "../admin-core.js";

const source = (await readFile(new URL("../admin.js", import.meta.url), "utf8"))
  .replace(/^import \{[\s\S]*?\} from "\.\/admin-core\.js";\n/, "");

// Run the actual drawer event handlers with a small DOM adapter. Browser layout
// and native validation remain a separate UI check; these tests prove requests,
// state transitions and error preservation without modifying an environment.
function element() {
  const classes = new Set();
  const attributes = new Map();
  return {
    value: "", innerHTML: "", textContent: "", disabled: false, hidden: false,
    listeners: {},
    classList: {
      add: (name) => classes.add(name), remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
    },
    addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); },
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    getAttribute: (name) => attributes.get(name),
  };
}

async function createWorkflow({ save } = {}) {
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  const calls = [];
  const profile = {
    nickname: "测试用户", bio: "个人简介", community: "社区", activityArea: "活动区域",
    headline: '设计师 <script>"&', publicLocation: "上海", experienceYears: 0, languages: ["zh", "en"],
  };
  const detail = {
    user: { id: "user-1", displayName: profile.nickname, email: "test@example.com", role: "user", status: "active" },
    profile, sessions: { active: 1 }, agents: [], threads: [], recentEvents: [], recentRuns: [],
  };
  const apiRequest = async (path, options) => {
    calls.push({ path, options });
    if (path === "/api/admin/users/user-1" && !options) return detail;
    if (path === "/api/admin/users/user-1/profile" && options?.method === "PATCH") {
      const update = JSON.parse(options.body);
      return save ? save(update) : { profile: { ...profile, ...update } };
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  vm.runInNewContext(source, {
    ...adminCore,
    createAdminApiRequest: () => apiRequest,
    window: { location: { protocol: "http:", origin: "http://127.0.0.1:5175" } },
    document: { querySelector: node, querySelectorAll: () => [] },
    localStorage: { removeItem() {} },
    sessionStorage: { getItem: () => null },
  }, { filename: "admin.js" });

  const button = { disabled: false, dataset: { userId: "user-1", userAction: "detail" } };
  button.closest = () => button;
  await node("#users-table").listeners.click[0]({ target: button });

  const form = element();
  form.id = "profile-admin-form";
  form.querySelector = node;
  const selectedLanguages = profile.languages.map((value) => ({ value }));
  form.querySelectorAll = (selector) => selector === "input, textarea"
    ? [...nodes.entries()].filter(([key]) => key.startsWith("#detail-")).map(([, value]) => value)
    : selectedLanguages;
  for (const [selector, field] of [
    ["#detail-nickname", "nickname"], ["#detail-bio", "bio"], ["#detail-community", "community"],
    ["#detail-area", "activityArea"], ["#detail-headline", "headline"],
    ["#detail-public-location", "publicLocation"], ["#detail-experience-years", "experienceYears"],
  ]) node(selector).value = String(profile[field]);

  return {
    node, calls, form, selectedLanguages,
    submit: () => node("#drawer-body").listeners.submit[0]({ target: form, preventDefault() {} }),
  };
}

test("profile drawer renders identity safely and saves explicit clearing with no location side effect", async () => {
  const flow = await createWorkflow();
  const html = flow.node("#drawer-body").innerHTML;
  assert.match(html, /value="设计师 &lt;script&gt;&quot;&amp;"/);
  assert.match(html, /id="detail-experience-years"[^>]*value="0"/);
  assert.match(html, /value="en" checked/);
  assert.match(html, /不会更改 GPS 位置/);

  flow.node("#detail-headline").value = "";
  flow.node("#detail-public-location").value = "";
  flow.node("#detail-experience-years").value = "";
  flow.selectedLanguages.length = 0;
  await flow.submit();
  assert.equal(flow.calls.length, 2);
  const update = JSON.parse(flow.calls[1].options.body);
  assert.deepEqual(update, {
    nickname: "测试用户", bio: "个人简介", community: "社区", activityArea: "活动区域",
    headline: "", publicLocation: "", experienceYears: null, languages: [],
  });
  assert.equal(flow.node("#profile-form-status").textContent, "小站资料已保存。");
  assert.match(flow.node("#drawer-body").innerHTML, /id="detail-experience-years"[^>]*value=""/);
});

test("profile drawer retains the draft and visible server error, then permits retry", async () => {
  let attempts = 0;
  const flow = await createWorkflow({ save: async (profile) => {
    if (++attempts === 1) throw new adminCore.AdminApiError("当前账号没有后台权限。", { status: 403 });
    return { profile };
  } });
  flow.node("#detail-headline").value = "更新后的身份";
  const before = flow.node("#drawer-body").innerHTML;
  await flow.submit();
  assert.equal(flow.node("#detail-headline").value, "更新后的身份");
  assert.equal(flow.node("#drawer-body").innerHTML, before);
  assert.equal(flow.node("#profile-form-status").textContent, "当前账号没有后台权限。");
  assert.equal(flow.node("#profile-form-status").hidden, false);
  assert.equal(flow.node('button[type="submit"]').disabled, false);
  assert.equal(flow.form.getAttribute("aria-busy"), undefined);
  await flow.submit();
  assert.equal(attempts, 2);
  assert.match(flow.node("#drawer-body").innerHTML, /value="更新后的身份"/);
});

test("profile drawer rejects malformed years before sending and prevents duplicate saves", async () => {
  let complete;
  const flow = await createWorkflow({ save: (profile) => new Promise((resolve) => {
    complete = () => resolve({ profile });
  }) });
  flow.node("#detail-experience-years").value = "2.5";
  await flow.submit();
  assert.equal(flow.calls.length, 1);
  assert.match(flow.node("#profile-form-status").textContent, /0 至 80/);
  flow.node("#detail-experience-years").value = "12";
  const pending = flow.submit();
  await flow.submit();
  assert.equal(flow.calls.length, 2);
  assert.equal(flow.form.getAttribute("aria-busy"), "true");
  assert.equal(flow.node("#detail-headline").disabled, true);
  complete();
  await pending;
  assert.equal(flow.node('button[type="submit"]').disabled, false);
  assert.equal(flow.node("#detail-headline").disabled, false);
});
