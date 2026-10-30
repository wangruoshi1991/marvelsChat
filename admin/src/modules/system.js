import { createModule } from "./_module.js";
import { escapeHtml } from "../../admin-core.js";

export function createSystemModule(client) {
  return createModule({
    name: "system", title: "服务配置", permission: "model:operate", endpoint: "/api/admin/model-status", client,
    renderData(data) {
      const missing = Array.isArray(data?.missing) ? data.missing : [];
      const rows = [["Provider", data?.provider], ["模型", data?.model || data?.modelName], ["请求 Endpoint", data?.endpoint], ["配置状态", data?.configured ? "已配置" : "未配置"], ["缺失配置", missing.length ? missing.join(", ") : "无"]];
      return `<section class="module-header"><div><span>SYSTEM &amp; CONFIGURATION</span><h2>服务配置</h2><p>只显示脱敏运行时状态；连通测试会产生审计记录并可能调用供应商。</p></div><button data-system-test type="button">连通测试</button></section><div class="system-status"><strong>${data?.configured ? "模型已配置" : "模型未配置"}</strong><p>${escapeHtml(data?.provider || "服务端尚未返回 provider。")}</p></div><dl class="system-details">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value ?? "未知")}</dd></div>`).join("")}</dl>`;
    },
  });
}
