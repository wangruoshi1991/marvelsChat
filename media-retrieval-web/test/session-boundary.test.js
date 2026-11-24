import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { setImmediate as settle } from "node:timers/promises";
import { MediaRetrievalApiError, mediaRetrievalApi } from "../src/api.js";

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}

test("private media pilot does not persist bearer sessions in browser storage", async () => {
  const source = await fs.readFile(path.join(webDirectory, "src", "main.js"), "utf8");

  assert.equal(/\bsessionStorage\b/.test(source), false);
  assert.equal(/\blocalStorage\b/.test(source), false);
});

test("late private requests follow their session and task, including blob cleanup", async (t) => {
  const controls = new Map();
  const control = (id) => {
    if (!controls.has(id)) controls.set(id, {
      value: "",
      addEventListener(type, listener) { this[type] = listener; },
    });
    return controls.get(id);
  };
  const card = {
    dataset: { mediaAssetId: "asset-A" }, isConnected: true,
    querySelector: () => ({}),
  };
  const cards = [card];
  globalThis.document = {
    querySelector: control,
    querySelectorAll: () => cards,
  };
  t.after(() => { delete globalThis.document; });
  const submit = (id) => control(id).submit({
    preventDefault() {}, currentTarget: { querySelector: () => ({}) },
  });
  t.mock.method(mediaRetrievalApi, "login", async ({identifier}) => ({session: {token: identifier}}));
  const login = async (account) => {
    control("#login-identifier").value = account;
    await submit("#login-form");
    control("#search-query").value = "local test query";
  };
  const status = t.mock.method(mediaRetrievalApi, "status", async () => ({
    enabled: true, availability: { state: "available", canStartRun: true },
    backfill: { lifecycleStatus: "idle", indexedAssets: 0, totalAssets: 0 }, quota: { dailyRemaining: null },
  }));
  const search = t.mock.method(mediaRetrievalApi, "search", async () => ({
    agentRunId: "run-A", results: [{mediaAssetId: "asset-A", summary: "private-A"}],
  }));
  const oldEvents = deferred();
  t.mock.method(mediaRetrievalApi, "events", async (_token, runId) =>
    runId === "run-A" ? oldEvents.promise : {events: []});
  const oldPreview = deferred();
  const preview = t.mock.method(mediaRetrievalApi, "mediaPreview", () => oldPreview.promise);
  const revoked = [];
  t.mock.method(URL, "revokeObjectURL", (url) => revoked.push(url));
  await import("../src/main.js");
  const app = control("#app");
  await login("A");
  await submit("#search-form");
  const oldSearch = deferred();
  search.mock.mockImplementationOnce(() => oldSearch.promise);
  const pendingSearch = submit("#search-form");
  const oldStatus = deferred();
  status.mock.mockImplementationOnce(() => oldStatus.promise);
  const pendingStatus = control("#refresh-status").click();
  const oldLogout = deferred();
  const logout = t.mock.method(mediaRetrievalApi, "logout", () => oldLogout.promise);
  const pendingLogout = control("#logout").click();
  assert.deepEqual(logout.mock.calls[0].arguments, ["A"]);
  assert.doesNotMatch(app.innerHTML, /private-A/);
  await login("B");
  const currentHTML = app.innerHTML;
  oldSearch.resolve({agentRunId: "old-search", results: [{summary: "late-private-A"}]});
  oldEvents.resolve({events: [{sequence: 1, lifecycleStatus: "failed"}]});
  oldStatus.reject(new MediaRetrievalApiError(401));
  oldPreview.resolve("blob:late-A");
  oldLogout.reject(new MediaRetrievalApiError(503));
  await Promise.all([pendingLogout, pendingSearch, pendingStatus, settle()]);
  assert.equal(app.innerHTML, currentHTML);
  assert.doesNotMatch(control("#login-status").textContent, /注销未确认/);
  assert.deepEqual(revoked, ["blob:late-A"]);

  const earlierRun = deferred();
  const events = mediaRetrievalApi.events.mock;
  events.mockImplementationOnce(() => earlierRun.promise);
  search.mock.mockImplementationOnce(async () => ({agentRunId: "run-B1", results: []}));
  await submit("#search-form");
  search.mock.mockImplementationOnce(async () => ({agentRunId: "run-B2", results: [{mediaAssetId: "asset-A", summary: "private-B"}]}));
  cards.push({...card});
  const created = [];
  preview.mock.mockImplementation(async () => {
    const url = `blob:B-${created.length}`;
    created.push(url);
    return url;
  });
  await submit("#search-form");
  await settle();
  earlierRun.resolve({events: [{sequence: 7, lifecycleStatus: "failed"}]});
  await settle();
  assert.doesNotMatch(control("#task-events").innerHTML, /未完成/);
  assert.match(control("#results-grid").innerHTML, /private-B/);

  const firstQuery = deferred();
  search.mock.mockImplementationOnce(() => firstQuery.promise);
  control("#search-query").value = "slow query";
  const pendingFirstQuery = submit("#search-form");
  const beforeDuplicate = search.mock.callCount();
  await submit("#search-form");
  assert.equal(search.mock.callCount(), beforeDuplicate);
  control("#search-query").value = "fast query";
  search.mock.mockImplementationOnce(async () => ({agentRunId: "latest-query", results: [{mediaAssetId: "asset-A", summary: "latest-result"}]}));
  await submit("#search-form");
  firstQuery.resolve({agentRunId: "older-query", results: [{summary: "stale-result"}]});
  await pendingFirstQuery;
  assert.match(control("#results-grid").innerHTML, /latest-result/);
  assert.doesNotMatch(control("#results-grid").innerHTML, /stale-result/);

  search.mock.mockImplementationOnce(async () => { throw new MediaRetrievalApiError(401); });
  await submit("#search-form");
  assert.match(app.innerHTML, /登录状态已失效/);
  assert.ok(created.length >= 2);
  assert.deepEqual(revoked.filter(url => url.startsWith("blob:B-")).sort(), created.sort());
  await login("C");
  assert.doesNotMatch(control("#results-grid").innerHTML, /private-B|latest-result/);
  assert.equal(control("#refresh-events").hidden, true);
  logout.mock.mockImplementationOnce(async () => { throw new MediaRetrievalApiError(0); });
  await control("#logout").click();
  assert.match(control("#login-status").textContent, /服务器注销未确认/);
});

test("a preview 401 expires the session while unavailable thumbnails remain optional", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 401 }));
  await assert.rejects(mediaRetrievalApi.mediaPreview("token", "asset"), {status: 401});
  fetch.mock.mockImplementation(async () => new Response(null, { status: 404 }));
  assert.equal(await mediaRetrievalApi.mediaPreview("token", "asset"), null);
});

test("logout posts the bearer and requires the backend's explicit success receipt", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({data: {ok: true}}));
  await mediaRetrievalApi.logout("test-account");
  const [route, options] = fetch.mock.calls[0].arguments;
  assert.equal(route, "/api/auth/logout");
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, "Bearer test-account");
  fetch.mock.mockImplementation(async () => Response.json({data: {}}));
  await assert.rejects(mediaRetrievalApi.logout("test-account"), {status: 502});
});
