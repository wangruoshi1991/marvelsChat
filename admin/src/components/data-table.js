import { escapeHtml } from "../../admin-core.js";

export function dataTable({ columns = [], rows = [], empty = "暂无真实数据。", row = (value) => columns.map((column) => {
  const cell = column.format ? column.format(value[column.key], value) : String(value[column.key] ?? "--");
  return `<td>${escapeHtml(cell)}</td>`;
}).join("") } = {}) {
  if (!rows.length) return `<div class="console-empty">${empty}</div>`;
  return `<div class="table-wrap"><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((value) => `<tr>${row(value)}</tr>`).join("")}</tbody></table></div>`;
}
