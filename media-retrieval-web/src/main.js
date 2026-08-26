import { MediaRetrievalApiError, mediaRetrievalApi } from "./api.js";

const previewUrls = new Map();
const state = {
  auth: null,
  status: null,
  results: [],
  activeRunId: "",
  events: [],
  loading: false,
};

const app = document.querySelector("#app");
const byId = (id) => document.querySelector(`#${id}`);

function writeSession(auth) {
  state.auth = auth?.token ? auth : null;
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
  if (error.status === 409 || error.code === "retrieval_consent_required") return "需要先确认私有素材索引同意。";
  if (error.status === 503 || error.code === "retrieval_temporarily_unavailable") return "检索服务暂不可用，请稍后再试。";
  if (error.status === 400) return "输入内容不符合要求。";
  return fallback;
}

function availabilityText(status) {
  if (status?.availability?.state === "available") return "可开始";
  return "暂不可用";
}

function runStatusText(status) {
  const map = {
    accepted: "已接收",
    queued: "排队中",
    running: "处理中",
    blocked: "已暂停",
    succeeded: "已完成",
    failed: "未完成",
    idle: "尚未开始",
  };
  return map[status] || "处理中";
}

function formatTime(value) {
  if (!value) return "刚刚";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
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
  clearPreviewUrls();
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

function renderWorkbench(message = "") {
  const status = state.status || {};
  const availability = status.availability || { state: "temporarily-unavailable", canStartRun: false, reasonCodes: [] };
  const isEnabled = Boolean(status.enabled);
  const run = status.backfill || {};
  app.innerHTML = `
    <main class="workbench-shell">
      <header class="topbar">
        <div class="brand-lockup"><span class="brand-mark" aria-hidden="true">MX</span><strong>妙讯</strong><span>私有媒体检索</span></div>
        <div class="topbar-actions"><span class="availability ${availability.state === "available" ? "ready" : ""}">${escapeHtml(availabilityText(status))}</span><button id="refresh-status" type="button">刷新状态</button><button id="logout" type="button">退出</button></div>
      </header>
      <p class="notice" id="workbench-status" role="status">${escapeHtml(message)}</p>
      <div class="workbench-layout">
        <aside class="control-rail">
          <section class="rail-section">
            <p class="eyebrow">索引状态</p>
            <h2>${isEnabled ? "私有索引已启用" : "尚未启用索引"}</h2>
            <dl class="status-list">
              <div><dt>当前任务</dt><dd>${escapeHtml(runStatusText(run.lifecycleStatus))}</dd></div>
              <div><dt>已索引素材</dt><dd>${Number(run.indexedAssets || 0)}</dd></div>
              <div><dt>待处理或跳过</dt><dd>${Number(run.totalAssets || 0)}</dd></div>
              <div><dt>今日剩余</dt><dd>${Number(status.quota?.dailyRemaining || 0)} 次</dd></div>
            </dl>
            ${isEnabled ? `
              <div class="rail-actions">
                <button id="reindex" type="button" ${availability.canStartRun ? "" : "disabled"}>重新建立索引</button>
                <button id="delete-index" class="danger" type="button">删除检索索引</button>
              </div>
            ` : `
              <label class="consent-row"><input id="consent" type="checkbox" ${availability.canStartRun ? "" : "disabled"} /><span>我同意仅为我已上传的私有素材建立描述与检索向量，并由受控模型服务短暂处理必要副本。</span></label>
              <button id="enable-index" type="button" disabled>开始建立索引</button>
            `}
          </section>
          <section class="rail-section run-history">
            <header><strong>任务进度</strong>${state.activeRunId ? `<button id="refresh-events" type="button">刷新</button>` : ""}</header>
            ${renderEvents()}
          </section>
        </aside>
        <section class="search-workspace" aria-labelledby="search-title">
          <header class="search-header">
            <div><p class="eyebrow">自然语言检索</p><h1 id="search-title">查找我的素材</h1></div>
            <p>仅在当前账号已上传的私有图片和视频中检索。</p>
          </header>
          <form class="search-form" id="search-form">
            <label class="query-field"><span class="sr-only">检索描述</span><input id="search-query" placeholder="例如：海边穿黄裙子的人" maxlength="240" ${isEnabled && availability.canStartRun ? "" : "disabled"} required /></label>
            <select id="search-kind" aria-label="素材类型" ${isEnabled && availability.canStartRun ? "" : "disabled"}><option value="">全部素材</option><option value="image">图片</option><option value="video">视频</option></select>
            <button type="submit" ${isEnabled && availability.canStartRun ? "" : "disabled"}>检索</button>
          </form>
          <div class="result-heading"><strong>${state.results.length ? `找到 ${state.results.length} 个结果` : "检索结果"}</strong><span>${isEnabled ? "" : "启用索引后即可开始检索"}</span></div>
          <div class="results-grid" id="results-grid">${renderResults()}</div>
        </section>
      </div>
    </main>
  `;
  bindWorkbench();
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
    return "<p class=\"empty-results\">提交自然语言描述后，匹配的私有素材会显示在这里。</p>";
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

function bindWorkbench() {
  byId("logout").addEventListener("click", () => {
    writeSession(null);
    state.status = null;
    state.results = [];
    state.events = [];
    state.activeRunId = "";
    renderLogin("已退出检索工作区。");
  });
  byId("refresh-status").addEventListener("click", () => refreshStatus());
  byId("search-form")?.addEventListener("submit", search);
  byId("consent")?.addEventListener("change", (event) => {
    byId("enable-index").disabled = !event.target.checked;
  });
  byId("enable-index")?.addEventListener("click", enableIndex);
  byId("reindex")?.addEventListener("click", requestReindex);
  byId("delete-index")?.addEventListener("click", deleteIndex);
  byId("refresh-events")?.addEventListener("click", () => refreshEvents());
}

async function login(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  byId("login-status").textContent = "正在登录...";
  try {
    const data = await mediaRetrievalApi.login({
      identifier: byId("login-identifier").value.trim(),
      password: byId("login-password").value,
    });
    writeSession({ token: data.session.token, user: data.user });
    await refreshStatus("已进入私有媒体检索工作区。");
  } catch (error) {
    byId("login-status").textContent = safeErrorMessage(error, "账号或密码不正确。");
  } finally {
    button.disabled = false;
  }
}

async function refreshStatus(message = "") {
  if (!state.auth?.token) return renderLogin();
  try {
    state.status = await mediaRetrievalApi.status(state.auth.token);
    renderWorkbench(message);
  } catch (error) {
    if (error instanceof MediaRetrievalApiError && error.status === 401) {
      writeSession(null);
      renderLogin("登录状态已失效，请重新登录。");
      return;
    }
    renderWorkbench(safeErrorMessage(error));
  }
}

async function enableIndex() {
  byId("enable-index").disabled = true;
  setWorkbenchStatus("正在确认并创建私有索引任务...");
  try {
    const result = await mediaRetrievalApi.enable(state.auth.token, idempotencyKey("media-index"));
    trackRun(result.agentRunId);
    await refreshStatus("私有索引任务已创建。");
  } catch (error) {
    setWorkbenchStatus(safeErrorMessage(error));
    byId("enable-index").disabled = false;
  }
}

async function requestReindex() {
  if (!window.confirm("重新建立索引会处理当前账号中已上传的素材。是否继续？")) return;
  setWorkbenchStatus("正在创建重建任务...");
  try {
    const result = await mediaRetrievalApi.reindex(state.auth.token, { scope: "all", mediaAssetIds: [] }, idempotencyKey("media-reindex"));
    trackRun(result.agentRunId);
    await refreshStatus("重建任务已创建。");
  } catch (error) {
    setWorkbenchStatus(safeErrorMessage(error));
  }
}

async function deleteIndex() {
  if (!window.confirm("删除后，当前账号的检索描述和向量将被清除；原始图片和视频不会删除。是否继续？")) return;
  setWorkbenchStatus("正在删除检索索引...");
  try {
    const result = await mediaRetrievalApi.deleteIndex(state.auth.token, idempotencyKey("media-purge"));
    trackRun(result.agentRunId);
    state.results = [];
    await refreshStatus("删除索引任务已创建。");
  } catch (error) {
    setWorkbenchStatus(safeErrorMessage(error));
  }
}

async function search(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  setWorkbenchStatus("正在检索你的私有素材...");
  try {
    const result = await mediaRetrievalApi.search(state.auth.token, {
      query: byId("search-query").value.trim(),
      kind: byId("search-kind").value || null,
      limit: 10,
    });
    retainPreviewUrls(result.results || []);
    state.results = result.results || [];
    trackRun(result.agentRunId);
    renderWorkbench(state.results.length ? "检索完成。" : "没有找到符合描述的私有素材。");
  } catch (error) {
    setWorkbenchStatus(safeErrorMessage(error));
  } finally {
    button.disabled = false;
  }
}

function trackRun(runId) {
  if (!runId) return;
  state.activeRunId = runId;
  state.events = [];
  void refreshEvents();
}

async function refreshEvents() {
  if (!state.activeRunId) return;
  try {
    const afterSequence = state.events.at(-1)?.sequence || 0;
    const data = await mediaRetrievalApi.events(state.auth.token, state.activeRunId, afterSequence);
    const existing = new Map(state.events.map((event) => [event.sequence, event]));
    for (const event of data.events || []) existing.set(event.sequence, event);
    state.events = [...existing.values()].sort((left, right) => left.sequence - right.sequence);
    renderWorkbench();
  } catch {
    setWorkbenchStatus("任务状态暂时无法刷新。");
  }
}

function setWorkbenchStatus(message) {
  const status = byId("workbench-status");
  if (status) status.textContent = message;
}

async function hydratePreviews() {
  if (!state.auth?.token || !state.results.length) return;
  const cards = [...document.querySelectorAll("[data-media-asset-id]")];
  await Promise.all(cards.map(async (card) => {
    const mediaAssetId = card.dataset.mediaAssetId;
    if (!mediaAssetId) return;
    let url = previewUrls.get(mediaAssetId);
    if (!url) {
      url = await mediaRetrievalApi.mediaPreview(state.auth.token, mediaAssetId);
      if (url) previewUrls.set(mediaAssetId, url);
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
