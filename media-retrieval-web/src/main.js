import { MediaRetrievalApiError, mediaRetrievalApi } from "./api.js";
import { MEDIA_RETRIEVAL_LIFECYCLE_STATUSES } from "../../shared/media-retrieval-public-contract.js";

const previewUrls = new Map();
const pendingQueries = new Set();
let loginAttempt = 0;
let statusRequest = 0;
let searchRequest = 0;
let eventRequest = 0;
let workbenchMounted = false;
let queryComposing = false;
const state = {
  auth: null,
  status: null,
  results: [],
  hasSearched: false,
  activeRunId: "",
  events: [],
};

const app = document.querySelector("#app");
const byId = (id) => document.querySelector(`#${id}`);

function endSession(message) {
  loginAttempt++;
  state.auth = null;
  state.status = null;
  state.results = [];
  state.hasSearched = false;
  state.activeRunId = "";
  state.events = [];
  pendingQueries.clear();
  clearPreviewUrls();
  renderLogin(message);
}

function ignoreSessionError(session, error) {
  if (session !== state.auth) return true;
  if (error instanceof MediaRetrievalApiError && error.status === 401) {
    endSession(safeErrorMessage(error));
    return true;
  }
  return false;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function idempotencyKey(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function safeErrorMessage(error, fallback = "暂时无法完成此操作。") {
  if (!(error instanceof MediaRetrievalApiError)) return fallback;
  if (error.status === 401) return "登录状态已失效，请重新登录。";
  if (error.code === "retrieval_consent_required") return "需要先确认私有素材索引同意。";
  if (error.code === "retrieval_request_in_progress") return "请求仍在处理中，请稍后刷新任务状态。";
  if (error.code === "asset_not_indexable") return "所选素材当前无法建立索引。";
  if (error.status === 503 || error.code === "retrieval_temporarily_unavailable") return "检索服务暂不可用，请稍后再试。";
  if (error.status === 400) return "输入内容不符合要求。";
  return fallback;
}

function availabilityText(status) {
  if (!status) return "可用性未知";
  if (status?.availability?.state === "available") return "可开始";
  return "暂不可用";
}

function runStatusText(status) {
  const map = {
    accepted: "已接收",
    queued: "排队中",
    running: "处理中",
    awaiting_user: "等待用户确认",
    purging: "正在清理",
    blocked: "已暂停",
    succeeded: "已完成",
    failed: "未完成",
    cancelled: "已取消",
    idle: "尚未开始",
  };
  return Object.hasOwn(map, status) ? map[status] : "未知";
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isWorkbenchStatus(status) {
  const availability = status?.availability;
  const backfill = status?.backfill;
  const remaining = status?.quota?.dailyRemaining;
  return typeof status?.enabled === "boolean" &&
    ["available", "temporarily-unavailable"].includes(availability?.state) &&
    typeof availability.canStartRun === "boolean" &&
    (!availability.canStartRun || availability.state === "available") &&
    MEDIA_RETRIEVAL_LIFECYCLE_STATUSES.includes(backfill?.lifecycleStatus) &&
    isCount(backfill.indexedAssets) && isCount(backfill.totalAssets) &&
    backfill.indexedAssets <= backfill.totalAssets &&
    (remaining === null || isCount(remaining));
}

function formatTime(value) {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function clearPreviewUrls() {
  for (const url of previewUrls.values()) URL.revokeObjectURL(url);
  previewUrls.clear();
}

function retainPreviewUrls(results) {
  const activeAssetIds = new Set((results || []).map((result) => result.mediaAssetId));
  for (const [mediaAssetId, url] of previewUrls.entries()) {
    if (activeAssetIds.has(mediaAssetId)) continue;
    URL.revokeObjectURL(url);
    previewUrls.delete(mediaAssetId);
  }
}

function renderLogin(message = "") {
  workbenchMounted = false;
  queryComposing = false;
  app.innerHTML = `
    <main class="login-shell">
      <section class="login-panel" aria-labelledby="login-title">
        <div class="brand-mark" aria-hidden="true">MX</div>
        <div>
          <p class="eyebrow">妙讯私有媒体库</p>
          <h1 id="login-title">媒体检索</h1>
          <p class="subtle">在你已上传的图片和视频中查找符合描述的素材。</p>
        </div>
        <form id="login-form" class="login-form">
          <label>账号<input id="login-identifier" autocomplete="username" required /></label>
          <label>密码<input id="login-password" type="password" autocomplete="current-password" required /></label>
          <button type="submit">进入检索工作区</button>
        </form>
        <p class="form-status" id="login-status" role="status">${escapeHtml(message)}</p>
      </section>
    </main>
  `;
  byId("login-form").addEventListener("submit", login);
}

function renderWorkbench() {
  workbenchMounted = true;
  app.innerHTML = `
    <main class="workbench-shell">
      <header class="topbar">
        <div class="brand-lockup"><span class="brand-mark" aria-hidden="true">MX</span><strong>妙讯</strong><span>私有媒体检索</span></div>
        <div class="topbar-actions"><span id="availability" class="availability"></span><button id="refresh-status" type="button">刷新状态</button><button id="logout" type="button">退出</button></div>
      </header>
      <p class="notice" id="workbench-status" role="status"></p>
      <div class="workbench-layout">
        <aside class="control-rail">
          <section class="rail-section" id="index-status"></section>
          <section class="rail-section run-history">
            <header><strong>任务进度</strong><button id="refresh-events" type="button" hidden>刷新</button></header>
            <div id="task-events" aria-live="polite"></div>
            <p class="empty-text" id="event-status" role="status"></p>
          </section>
        </aside>
        <section class="search-workspace" aria-labelledby="search-title">
          <header class="search-header">
            <div><p class="eyebrow">自然语言检索</p><h1 id="search-title">查找我的素材</h1></div>
            <p>仅在当前账号已上传的私有图片和视频中检索。</p>
          </header>
          <form class="search-form" id="search-form">
            <label class="query-field"><span class="sr-only">检索描述</span><input id="search-query" placeholder="例如：海边穿黄裙子的人" maxlength="240" required disabled /></label>
            <select id="search-kind" aria-label="素材类型" disabled><option value="">全部素材</option><option value="image">图片</option><option value="video">视频</option></select>
            <button id="submit-search" type="submit" disabled>检索</button>
          </form>
          <div class="result-heading"><strong id="result-count">检索结果</strong><span id="result-instruction"></span></div>
          <div class="results-grid" id="results-grid"></div>
        </section>
      </div>
    </main>
  `;
  byId("logout").addEventListener("click", logout);
  byId("refresh-status").addEventListener("click", () => refreshStatus());
  byId("refresh-events").addEventListener("click", () => refreshEvents());
  byId("search-form").addEventListener("submit", search);
  const input = byId("search-query");
  input.addEventListener("compositionstart", () => { queryComposing = true; });
  input.addEventListener("compositionend", () => { queryComposing = false; });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (queryComposing || event.isComposing || event.keyCode === 229)) {
      event.preventDefault();
    }
  });
  updateHistory();
  updateResults();
}

function updateIndexStatus() {
  const status = state.status;
  const availability = status?.availability;
  const canStart = availability?.canStartRun === true;
  const isEnabled = status?.enabled === true;
  const run = status?.backfill || {};
  const { totalAssets, indexedAssets } = run;
  const remainingAssets = isCount(totalAssets) && isCount(indexedAssets)
    ? totalAssets - indexedAssets : "未知";
  const dailyRemaining = status?.quota?.dailyRemaining;
  const quotaText = dailyRemaining === null ? "不限" : isCount(dailyRemaining) ? `${dailyRemaining} 次` : "未知";
  const badge = byId("availability");
  badge.className = availability?.state === "available" ? "availability ready" : "availability";
  badge.textContent = availabilityText(status);
  byId("index-status").innerHTML = `
    <p class="eyebrow">索引状态</p>
    <h2>${!status ? "索引状态未知" : isEnabled ? "私有索引已启用" : "尚未启用索引"}</h2>
    <dl class="status-list">
      <div><dt>当前任务</dt><dd>${escapeHtml(runStatusText(run.lifecycleStatus))}</dd></div>
      <div><dt>已索引素材</dt><dd>${isCount(indexedAssets) ? indexedAssets : "未知"}</dd></div>
      <div><dt>待处理或跳过</dt><dd>${remainingAssets}</dd></div>
      <div><dt>今日剩余</dt><dd>${quotaText}</dd></div>
    </dl>
    ${!status ? "" : isEnabled ? `
      <div class="rail-actions">
        <button id="reindex" type="button" ${canStart ? "" : "disabled"}>重新建立索引</button>
        <button id="delete-index" class="danger" type="button">删除检索索引</button>
      </div>
    ` : `
      <label class="consent-row"><input id="consent" type="checkbox" ${canStart ? "" : "disabled"} /><span>我同意仅为我已上传的私有素材建立描述与检索向量，并由受控模型服务短暂处理必要副本。</span></label>
      <button id="enable-index" type="button" disabled>开始建立索引</button>
    `}
  `;
  byId("consent")?.addEventListener("change", (event) => {
    byId("enable-index").disabled = !canStart || !event.target.checked;
  });
  byId("enable-index")?.addEventListener("click", enableIndex);
  byId("reindex")?.addEventListener("click", requestReindex);
  byId("delete-index")?.addEventListener("click", deleteIndex);
  for (const id of ["search-query", "search-kind", "submit-search"]) {
    const control = byId(id);
    const disabled = !isEnabled || !canStart;
    if (control.disabled !== disabled) control.disabled = disabled;
  }
  byId("result-instruction").textContent = status && !isEnabled ? "启用索引后即可开始检索" : "";
}

function updateHistory(message = "") {
  byId("refresh-events").hidden = !state.activeRunId;
  byId("task-events").innerHTML = renderEvents();
  byId("event-status").textContent = message;
}

function updateResults() {
  byId("result-count").textContent = state.results.length ? `找到 ${state.results.length} 个结果` : "检索结果";
  byId("results-grid").innerHTML = renderResults();
  void hydratePreviews();
}

function renderEvents() {
  if (!state.activeRunId) return "<p class=\"empty-text\">新任务的阶段会显示在这里。</p>";
  if (!state.events.length) return "<p class=\"empty-text\">任务已创建，正在等待状态更新。</p>";
  return `<ol class="event-list">${state.events.map((event) => `
    <li><span>${escapeHtml(runStatusText(event.lifecycleStatus))}</span><small>${escapeHtml(formatTime(event.createdAt))}</small></li>
  `).join("")}</ol>`;
}

function renderResults() {
  if (!state.results.length) {
    return `<p class="empty-results">${state.hasSearched
      ? "没有找到符合描述的私有素材。"
      : "提交自然语言描述后，匹配的私有素材会显示在这里。"}</p>`;
  }
  return state.results.map((result) => `
    <article class="result-tile" data-media-asset-id="${escapeHtml(result.mediaAssetId)}">
      <div class="media-preview"><span>加载预览</span></div>
      <div class="result-body">
        <div class="result-meta"><span>${result.kind === "video" ? "视频" : "图片"}</span><span>${escapeHtml(result.scoreBucket || "")}</span></div>
        <p>${escapeHtml(result.summary || "匹配的私有素材")}</p>
        ${result.matchedFrameTimestampMs === null || result.matchedFrameTimestampMs === undefined ? "" : `<small>可能匹配时间点 ${Math.round(result.matchedFrameTimestampMs / 1000)} 秒</small>`}
        <div class="match-reasons">${(result.matchReasons || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
      </div>
    </article>
  `).join("");
}

async function logout() {
  const session = state.auth;
  if (!session) return;
  endSession("已清除本页内容，正在确认服务器注销。");
  const attempt = loginAttempt;
  let message = "已退出检索工作区。";
  try {
    await mediaRetrievalApi.logout(session.token);
  } catch (error) {
    message = error instanceof MediaRetrievalApiError && error.status === 401
      ? "本页内容已清除，服务器会话已失效。"
      : "本页内容已清除，服务器注销未确认。";
  }
  if (attempt === loginAttempt) byId("login-status").textContent = message;
}

async function login(event) {
  event.preventDefault();
  const attempt = ++loginAttempt;
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  byId("login-status").textContent = "正在登录...";
  try {
    const data = await mediaRetrievalApi.login({
      identifier: byId("login-identifier").value.trim(),
      password: byId("login-password").value,
    });
    if (attempt !== loginAttempt) return;
    if (!data?.session?.token) throw new Error("Missing session token");
    state.auth = { token: data.session.token, user: data.user };
    await refreshStatus("已进入私有媒体检索工作区。");
  } catch (error) {
    if (attempt !== loginAttempt) return;
    byId("login-status").textContent = safeErrorMessage(error, "账号或密码不正确。");
  } finally {
    button.disabled = false;
  }
}

async function refreshStatus(message = "") {
  const session = state.auth;
  if (!session) return;
  const request = ++statusRequest;
  try {
    const status = await mediaRetrievalApi.status(session.token);
    if (session !== state.auth || request !== statusRequest) return;
    if (!isWorkbenchStatus(status)) throw new Error("Invalid retrieval status");
    state.status = status;
  } catch (error) {
    if (ignoreSessionError(session, error) || request !== statusRequest) return;
    state.status = null;
    message = safeErrorMessage(error, "无法确认索引状态，请刷新状态重试。");
  }
  if (!workbenchMounted) renderWorkbench();
  updateIndexStatus();
  setWorkbenchStatus(message);
}

async function enableIndex() {
  const session = state.auth;
  const button = byId("enable-index");
  button.disabled = true;
  setWorkbenchStatus("正在确认并创建私有索引任务...");
  try {
    const result = await mediaRetrievalApi.enable(session.token, idempotencyKey("media-index"));
    if (session !== state.auth) return;
    trackRun(result.agentRunId);
    await refreshStatus("私有索引任务已创建。");
  } catch (error) {
    if (ignoreSessionError(session, error)) return;
    setWorkbenchStatus(safeErrorMessage(error));
    button.disabled = false;
  }
}

async function requestReindex() {
  if (!window.confirm("重新建立索引会处理当前账号中已上传的素材。是否继续？")) return;
  const session = state.auth;
  setWorkbenchStatus("正在创建重建任务...");
  try {
    const result = await mediaRetrievalApi.reindex(session.token, { scope: "all", mediaAssetIds: [] }, idempotencyKey("media-reindex"));
    if (session !== state.auth) return;
    trackRun(result.agentRunId);
    await refreshStatus("重建任务已创建。");
  } catch (error) {
    if (ignoreSessionError(session, error)) return;
    setWorkbenchStatus(safeErrorMessage(error));
  }
}

async function deleteIndex() {
  if (!window.confirm("删除后，当前账号的检索描述和向量将被清除；原始图片和视频不会删除。是否继续？")) return;
  const session = state.auth;
  setWorkbenchStatus("正在删除检索索引...");
  try {
    const result = await mediaRetrievalApi.deleteIndex(session.token, idempotencyKey("media-purge"));
    if (session !== state.auth) return;
    trackRun(result.agentRunId);
    searchRequest++;
    state.results = [];
    state.hasSearched = false;
    clearPreviewUrls();
    updateResults();
    await refreshStatus("删除索引任务已创建。");
  } catch (error) {
    if (ignoreSessionError(session, error)) return;
    setWorkbenchStatus(safeErrorMessage(error));
  }
}

async function search(event) {
  event.preventDefault();
  const session = state.auth;
  const query = byId("search-query").value.trim();
  if (!session || queryComposing || byId("submit-search").disabled || !query) return;
  const kind = byId("search-kind").value || null;
  const signature = JSON.stringify([query, kind]);
  if (pendingQueries.has(signature)) return;
  pendingQueries.add(signature);
  const request = ++searchRequest;
  setWorkbenchStatus("正在检索你的私有素材...");
  try {
    const result = await mediaRetrievalApi.search(session.token, {
      query,
      kind,
      limit: 10,
    }, idempotencyKey("media-search"));
    if (session !== state.auth || request !== searchRequest) return;
    retainPreviewUrls(result.results || []);
    state.results = result.results || [];
    state.hasSearched = true;
    trackRun(result.agentRunId);
    updateResults();
    setWorkbenchStatus(state.results.length ? "检索完成。" : "没有找到符合描述的私有素材。");
  } catch (error) {
    if (ignoreSessionError(session, error) || request !== searchRequest) return;
    setWorkbenchStatus(safeErrorMessage(error));
  } finally {
    if (session === state.auth) pendingQueries.delete(signature);
  }
}

function trackRun(runId) {
  if (!runId) return;
  state.activeRunId = runId;
  state.events = [];
  updateHistory();
  void refreshEvents();
}

async function refreshEvents() {
  const session = state.auth;
  const runId = state.activeRunId;
  if (!session || !runId) return;
  const request = ++eventRequest;
  try {
    const afterSequence = state.events.at(-1)?.sequence || 0;
    const data = await mediaRetrievalApi.events(session.token, runId, afterSequence);
    if (session !== state.auth || runId !== state.activeRunId) return;
    const existing = new Map(state.events.map((event) => [event.sequence, event]));
    for (const event of data.events || []) existing.set(event.sequence, event);
    state.events = [...existing.values()].sort((left, right) => left.sequence - right.sequence);
    if (request === eventRequest) updateHistory();
    else byId("task-events").innerHTML = renderEvents();
  } catch (error) {
    if (ignoreSessionError(session, error) || runId !== state.activeRunId || request !== eventRequest) return;
    byId("event-status").textContent = "任务状态暂时无法刷新。";
  }
}

function setWorkbenchStatus(message) {
  const status = byId("workbench-status");
  if (status) status.textContent = message;
}

async function hydratePreviews() {
  const session = state.auth;
  if (!session || !state.results.length) return;
  const results = state.results;
  const cards = [...document.querySelectorAll("[data-media-asset-id]")];
  await Promise.all(cards.map(async (card) => {
    const mediaAssetId = card.dataset.mediaAssetId;
    if (!mediaAssetId) return;
    let url = previewUrls.get(mediaAssetId);
    if (!url) {
      try {
        url = await mediaRetrievalApi.mediaPreview(session.token, mediaAssetId);
      } catch (error) {
        if (ignoreSessionError(session, error)) return;
      }
      if (session !== state.auth || results !== state.results || !card.isConnected) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (url) {
        const cached = previewUrls.get(mediaAssetId);
        if (cached && cached !== url) {
          URL.revokeObjectURL(url);
          url = cached;
        } else {
          previewUrls.set(mediaAssetId, url);
        }
      }
    }
    const preview = card.querySelector(".media-preview");
    if (!preview) return;
    if (url) {
      preview.innerHTML = `<img src="${url}" alt="匹配的私有素材预览" />`;
    } else {
      preview.innerHTML = "<span>预览暂不可用</span>";
    }
  }));
}

if (state.auth?.token) void refreshStatus();
else renderLogin();
