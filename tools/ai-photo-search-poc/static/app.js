"use strict";

const $ = (id) => document.getElementById(id);
const state = {status: null, mode: "gallery", query: "", uploading: false, searching: false, polling: false, lastReady: -1, lastCount: -1, lastPending: -1, feedback: new Map(), searchVersion: 0};

async function api(path, options = {}) {
  const response = await fetch(path, {cache: "no-store", ...options});
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : Array.isArray(data.detail) ? data.detail.map((item) => item.type === "string_too_long" ? "描述过长，请用更简短的句子。" : item.type === "string_too_short" ? "请先输入想找的照片描述。" : "输入内容不符合要求，请检查后重试。").join(" ") : typeof data.error === "string" ? data.error : `本地服务返回错误（${response.status}）`;
    throw new Error(detail);
  }
  return data;
}

function notice(message, isError = false) {
  $("notice-text").textContent = message;
  $("notice").classList.toggle("error", isError);
  $("notice").hidden = !message;
}

function setBusy() {
  $("choose-files").disabled = state.uploading;
  $("choose-folder").disabled = state.uploading;
  $("empty-import").disabled = state.uploading;
  $("clear-library").disabled = state.uploading || !state.status?.photo_count || Boolean(state.status?.indexing?.active);
  $("search-button").disabled = state.searching;
  $("search-button").textContent = state.searching ? "寻找中…" : "找照片 →";
}

function renderStatus(data) {
  state.status = data;
  const lan = data.network_mode === "lan";
  if (lan) {
    $("privacy-label").textContent = "局域网测试相册 · 共享照片与搜索记录";
    $("storage-note").textContent = "照片上传到运行服务的电脑并在那里处理。同一相册由访问者共享，导入和清空会影响所有访问者。";
  }
  $("photo-count").textContent = Number(data.photo_count || 0).toLocaleString("zh-CN");
  $("ready-count").textContent = Number(data.ready_count || 0).toLocaleString("zh-CN");
  const model = data.model || {};
  const dot = $("model-dot");
  dot.className = "status-dot";
  $("load-model").hidden = !["idle", "error"].includes(model.state);
  if (model.state === "ready") {
    $("model-title").textContent = "本地搜索模型已就绪";
    $("model-description").textContent = data.pending_count ? "正在理解照片中的画面，完成的照片可以立即搜索。" : "照片与描述在本机匹配。添加照片后，会自动建立搜索索引。";
  } else if (model.state === "loading") {
    dot.classList.add("loading");
    $("model-title").textContent = "正在准备搜索模型";
    $("model-description").textContent = "首次下载模型可能需要几分钟。你可以先导入照片，准备好后会自动处理。";
  } else if (model.state === "error") {
    dot.classList.add("error");
    $("model-title").textContent = "模型暂未准备好";
    $("model-description").textContent = model.error || "请检查网络连接后重试。";
    $("load-model").textContent = "重试加载模型 →";
  } else {
    dot.classList.add("neutral");
    $("model-title").textContent = "等待准备搜索模型";
    $("model-description").textContent = "首次使用需要下载模型。导入照片后会自动开始，照片不会上传。";
    $("load-model").textContent = "准备搜索模型 →";
  }
  const indexing = data.indexing || {};
  $("index-progress").hidden = !(indexing.active || data.pending_count);
  const total = Number(indexing.total || 0);
  const current = Number(indexing.current || 0);
  $("index-message").textContent = total ? `理解照片中 · ${current} / ${total}` : `等待理解 ${data.pending_count || 0} 张照片`;
  $("index-bar").value = total ? Math.min(100, current / total * 100) : 0;
  if (data.failed_count > 0 && indexing.last_error) {
    $("model-description").textContent += ` ${data.failed_count} 张处理失败：${indexing.last_error}`;
  }
  if (lan) {
    $("model-title").textContent = $("model-title").textContent.replace("本地搜索模型", "共享搜索模型");
    $("model-description").textContent = $("model-description").textContent.replace("本机", "运行服务的电脑").replace("照片不会上传", "照片会上传到运行服务的电脑");
  }
  setBusy();
}

async function pollStatus() {
  if (state.polling) return;
  state.polling = true;
  try {
    const data = await api("/api/status");
    const changed = data.ready_count !== state.lastReady || data.photo_count !== state.lastCount || data.pending_count !== state.lastPending;
    renderStatus(data);
    state.lastReady = data.ready_count;
    state.lastCount = data.photo_count;
    state.lastPending = data.pending_count;
    if (changed && state.mode === "gallery") await loadGallery();
  } catch (error) {
    $("model-title").textContent = "未能连接相册服务";
    $("model-description").textContent = `请确认原型仍在运行。${error.message}`;
    $("model-dot").className = "status-dot error";
  } finally { state.polling = false; }
}

function emptyState(title, copy, canImport = false) {
  $("empty-state").hidden = false;
  $("empty-title").textContent = title;
  $("empty-copy").textContent = copy;
  $("empty-import").hidden = !canImport;
}

function openPhoto(photo) {
  $("preview-title").textContent = photo.filename;
  $("preview-image").src = photo.image_url;
  $("preview-image").alt = photo.filename;
  $("photo-dialog").showModal();
}

function photoCard(photo, index, isResult, resultQuery) {
  const article = document.createElement("article");
  article.className = "photo-card";
  const open = document.createElement("button");
  open.type = "button";
  open.className = "photo-open";
  open.setAttribute("aria-label", `查看照片：${photo.filename}`);
  open.addEventListener("click", () => openPhoto(photo));
  const img = document.createElement("img");
  img.src = photo.thumbnail_url;
  img.alt = photo.filename;
  img.loading = "lazy";
  open.append(img);
  if (isResult) {
    const rank = document.createElement("span");
    rank.className = "photo-rank";
    rank.textContent = String(index + 1).padStart(2, "0");
    open.append(rank);
  }
  const body = document.createElement("div");
  body.className = "photo-body";
  const title = document.createElement("h3");
  title.className = "photo-name";
  title.textContent = photo.filename;
  title.title = photo.filename;
  const meta = document.createElement("p");
  meta.className = "photo-meta";
  meta.textContent = isResult ? `相似度 ${Number(photo.score).toFixed(3)}` : photo.status === "ready" ? "已就绪 · 可搜索" : ["failed", "error"].includes(photo.status) ? "处理失败" : "正在等待理解画面";
  body.append(title, meta);
  if (photo.attribution) {
    const credit = document.createElement("p");
    credit.className = "photo-credit";
    const source = document.createElement("a");
    source.textContent = photo.attribution.author || "查看图片来源";
    if (/^https?:\/\//i.test(photo.attribution.source_page || "")) {
      source.href = photo.attribution.source_page;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
    }
    const license = document.createElement("a");
    license.textContent = photo.attribution.license;
    if (/^https?:\/\//i.test(photo.attribution.license_url || "")) {
      license.href = photo.attribution.license_url;
      license.target = "_blank";
      license.rel = "noopener noreferrer";
    }
    credit.append(source, document.createTextNode(" · "), license);
    body.append(credit);
  }
  if (isResult) {
    const feedback = document.createElement("div");
    feedback.className = "feedback";
    feedback.setAttribute("aria-label", "这张照片是否符合描述");
    const feedbackKey = `${resultQuery}\u0000${photo.id}`;
    for (const [label, relevant] of [["✓ 符合", true], ["× 不符合", false]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      if (!relevant) button.className = "negative";
      button.setAttribute("aria-pressed", String(state.feedback.has(feedbackKey) && state.feedback.get(feedbackKey) === relevant));
      button.addEventListener("click", async () => {
        const buttons = [...feedback.querySelectorAll("button")];
        buttons.forEach((item) => { item.disabled = true; });
        try {
          await api("/api/feedback", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({query: resultQuery, photo_id: photo.id, relevant, rank: index + 1})});
          state.feedback.set(feedbackKey, relevant);
          buttons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
          notice("已记录这次判断，用于评估搜索效果。");
        } catch (error) { notice(error.message, true); }
        finally { buttons.forEach((item) => { item.disabled = false; }); }
      });
      feedback.append(button);
    }
    body.append(feedback);
  }
  article.append(open, body);
  return article;
}

function renderPhotos(photos, isResult = false, resultQuery = "") {
  $("photo-grid").replaceChildren(...photos.map((photo, index) => photoCard(photo, index, isResult, resultQuery)));
  $("empty-state").hidden = photos.length > 0;
}

async function loadGallery() {
  const version = state.searchVersion;
  const data = await api("/api/photos?limit=60");
  if (state.mode !== "gallery" || version !== state.searchVersion) return;
  $("results-title").textContent = "我的照片";
  $("results-meta").textContent = data.total ? `共 ${data.total} 张 · 已理解 ${state.status?.ready_count || 0} 张` : "导入后，照片会出现在这里";
  $("show-all").hidden = true;
  const photos = data.photos || [];
  renderPhotos(photos);
  $("results-footnote").hidden = !photos.length;
  $("results-footnote").textContent = data.total > photos.length ? `当前展示最近 ${photos.length} 张照片；搜索会覆盖所有已完成索引的照片。` : "可以描述照片中的场景、物品、颜色和动作。搜索会覆盖所有已完成索引的照片。";
  if (!photos.length) emptyState("从一小段回忆开始", "先添加一批照片，再描述其中的场景、人物或物品。不需要提前打标签，也不需要记住拍摄日期。", true);
}

async function search(query = $("search-input").value) {
  query = query.trim();
  if (!query) { $("search-input").focus(); return; }
  if (state.searching) return;
  if (!state.status?.ready_count) {
    notice(state.status?.photo_count ? "照片还在准备中。至少有一张照片完成索引后，就可以开始搜索。" : "请先添加一批照片，再试着描述你想找的画面。", true);
    return;
  }
  state.searching = true;
  const version = ++state.searchVersion;
  setBusy();
  notice("");
  try {
    const data = await api("/api/search", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({query, limit: 12})});
    if (version !== state.searchVersion) return;
    state.mode = "results";
    state.query = query;
    $("results-title").textContent = `“${query}”`;
    $("results-meta").textContent = `从 ${data.indexed_count} 张照片中寻找 · ${(Number(data.elapsed_ms) / 1000).toFixed(2)} 秒`;
    $("show-all").hidden = false;
    const results = data.results || [];
    renderPhotos(results, true, query);
    $("results-footnote").hidden = !results.length;
    $("results-footnote").textContent = `展示最相关的 ${results.length} 张照片。相似度用于排序，不代表正确概率；点击“符合 / 不符合”可以记录这次验证。`;
    if (!results.length) emptyState("暂时没有可展示的搜索结果", "确认照片已完成索引后再试一次。这里按相似度排序，是否符合描述需要你来判断。");
  } catch (error) { notice(error.message, true); }
  finally { state.searching = false; setBusy(); }
}

async function uploadFiles(files) {
  if (state.uploading) return;
  const photos = [...files].filter((file) => file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|bmp|gif|tiff?)$/i.test(file.name));
  if (!photos.length) { notice("没有找到可导入的图片，请选择照片文件。", true); return; }
  state.uploading = true;
  state.mode = "gallery";
  state.searchVersion += 1;
  setBusy();
  notice("");
  $("upload-progress").hidden = false;
  $("upload-bar").value = 0;
  let accepted = 0, duplicates = 0, processed = 0;
  const errors = [];
  try {
    for (let offset = 0; offset < photos.length; offset += 10) {
      const batch = photos.slice(offset, offset + 10);
      $("upload-message").textContent = `正在导入 ${Math.min(offset + batch.length, photos.length)} / ${photos.length} 张`;
      const form = new FormData();
      batch.forEach((file) => form.append("files", file, file.name));
      const data = await api("/api/photos", {method: "POST", body: form});
      accepted += Number(data.accepted || 0);
      duplicates += Number(data.duplicates || 0);
      errors.push(...(data.errors || []));
      processed += batch.length;
      const percent = Math.round(processed / photos.length * 100);
      $("upload-bar").value = percent;
      $("upload-percent").textContent = `${percent}%`;
    }
    const parts = [`已导入 ${accepted} 张照片`];
    if (duplicates) parts.push(`${duplicates} 张重复照片已跳过`);
    if (errors.length) parts.push(`${errors.length} 张未能导入：${errors.slice(0, 3).map((item) => `${item.filename}（${item.error}）`).join("；")}${errors.length > 3 ? "…" : ""}`);
    notice(parts.join("。"), errors.length > 0);
    $("upload-message").textContent = "导入完成，正在准备搜索";
    await pollStatus();
    await loadGallery();
  } catch (error) {
    $("upload-message").textContent = "导入中断";
    notice(`已导入 ${accepted} 张。${error.message}`, true);
    await pollStatus();
  } finally {
    state.uploading = false;
    $("file-input").value = "";
    $("folder-input").value = "";
    setBusy();
  }
}

$("choose-files").addEventListener("click", () => $("file-input").click());
$("empty-import").addEventListener("click", () => $("file-input").click());
$("choose-folder").addEventListener("click", () => $("folder-input").click());
$("file-input").addEventListener("change", (event) => uploadFiles(event.target.files));
$("folder-input").addEventListener("change", (event) => uploadFiles(event.target.files));
$("search-form").addEventListener("submit", (event) => { event.preventDefault(); search(); });
document.querySelectorAll("[data-query]").forEach((button) => button.addEventListener("click", () => {
  $("search-input").value = button.dataset.query;
  $("search-input").focus();
  if (state.status?.ready_count) search(button.dataset.query);
}));
$("show-all").addEventListener("click", () => {
  state.mode = "gallery";
  state.searchVersion += 1;
  loadGallery().catch((error) => notice(error.message, true));
});
$("dismiss-notice").addEventListener("click", () => notice(""));
$("export-records").addEventListener("click", async () => {
  $("export-records").disabled = true;
  try {
    const data = await api("/api/evaluation");
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: "application/json;charset=utf-8"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = `photo-search-evaluation-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice("验证记录已导出，包含搜索与人工判断，不包含照片文件。");
  } catch (error) { notice(error.message, true); }
  finally { $("export-records").disabled = false; }
});
$("load-model").addEventListener("click", async () => {
  $("load-model").disabled = true;
  try { await api("/api/model/load", {method: "POST"}); await pollStatus(); }
  catch (error) { notice(error.message, true); }
  finally { $("load-model").disabled = false; }
});
$("clear-library").addEventListener("click", async () => {
  if (!window.confirm("清空这个 PoC 中的照片副本、索引和评测记录？电脑中的原照片不会被删除。")) return;
  $("clear-library").disabled = true;
  try {
    await api("/api/photos", {method: "DELETE"});
    state.mode = "gallery";
    state.searchVersion += 1;
    state.feedback.clear();
    $("search-input").value = "";
    $("upload-progress").hidden = true;
    notice("本次相册已清空，原照片未被修改。");
    await pollStatus();
    await loadGallery();
  } catch (error) { notice(error.message, true); }
  finally { setBusy(); }
});
const dropZone = $("drop-zone");
let dragDepth = 0;
dropZone.addEventListener("dragenter", (event) => { event.preventDefault(); dragDepth += 1; dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; });
dropZone.addEventListener("dragleave", (event) => { event.preventDefault(); dragDepth -= 1; if (dragDepth <= 0) dropZone.classList.remove("drag-over"); });
dropZone.addEventListener("drop", (event) => { event.preventDefault(); dragDepth = 0; dropZone.classList.remove("drag-over"); uploadFiles(event.dataTransfer.files); });
document.addEventListener("dragover", (event) => event.preventDefault());
document.addEventListener("drop", (event) => event.preventDefault());
$("close-preview").addEventListener("click", () => $("photo-dialog").close());
$("photo-dialog").addEventListener("click", (event) => { if (event.target === $("photo-dialog")) $("photo-dialog").close(); });
$("photo-dialog").addEventListener("close", () => { $("preview-image").removeAttribute("src"); });

pollStatus();
setInterval(pollStatus, 2000);
