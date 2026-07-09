import crypto from "crypto";
import path from "path";
import { HttpError } from "./http-error.js";

const maxInlineChars = 200_000;
const supportedTextKinds = new Set(["text", "markdown", "json", "csv", "tsv"]);
const stopWords = new Set([
  "the", "and", "for", "with", "this", "that", "from", "have", "will", "your",
  "about", "into", "file", "data", "计划", "文件", "一个", "这个", "我们", "你们",
]);
const domainKeywords = [
  "相册",
  "漫画日记",
  "日记",
  "视频脚本",
  "视频",
  "摄影",
  "拍照",
  "主页",
  "3D",
  "模型",
  "文件",
];

const extensionKindMap = {
  ".txt": "text",
  ".md": "markdown",
  ".markdown": "markdown",
  ".json": "json",
  ".csv": "csv",
  ".tsv": "tsv",
  ".pdf": "pdf",
  ".doc": "document",
  ".docx": "document",
  ".ppt": "presentation",
  ".pptx": "presentation",
  ".xls": "spreadsheet",
  ".xlsx": "spreadsheet",
};

const mimeKindMap = {
  "text/plain": "text",
  "text/markdown": "markdown",
  "application/json": "json",
  "text/csv": "csv",
  "text/tab-separated-values": "tsv",
  "application/pdf": "pdf",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.ms-powerpoint": "presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "presentation",
  "application/vnd.ms-excel": "spreadsheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "spreadsheet",
};

const stripUnsafeText = (value) =>
  String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const baseTitle = (originalFilename) => {
  const parsed = path.parse(String(originalFilename || "未命名文件").trim());
  return (parsed.name || "未命名文件").slice(0, 120);
};

export function normalizeFileKind({ originalFilename = "", mimeType = "" } = {}) {
  const normalizedMime = String(mimeType || "").trim().toLowerCase().split(";")[0];
  if (mimeKindMap[normalizedMime]) return mimeKindMap[normalizedMime];

  const ext = path.extname(String(originalFilename || "").trim()).toLowerCase();
  return extensionKindMap[ext] || "unknown";
}

export const hashFileContent = (content) =>
  crypto.createHash("sha256").update(String(content || ""), "utf8").digest("hex");

function detectLanguage(text) {
  const zhCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const enCount = (text.match(/[a-zA-Z]/g) || []).length;
  if (zhCount > enCount * 0.3) return "zh";
  if (enCount > 0) return "en";
  return "unknown";
}

function countWords(text) {
  const englishWords = text.match(/[a-zA-Z0-9][a-zA-Z0-9_-]{1,}/g) || [];
  const zhChars = text.match(/[\u3400-\u9fff]/g) || [];
  return englishWords.length + Math.ceil(zhChars.length / 2);
}

function splitSentences(text) {
  return text
    .split(/(?<=[。！？!?；;.\n])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildSummary(text, title) {
  const compact = stripUnsafeText(text);
  const sentences = splitSentences(compact);
  const selected = sentences.slice(0, 2).join(" ");
  return (selected || compact || `${title} 暂无可提取文本。`).slice(0, 280);
}

function extractTags(text, kind) {
  const domainTags = domainKeywords.filter((keyword) => text.includes(keyword));
  const candidates = [
    ...(text.match(/[\u3400-\u9fff]{2,8}/g) || []),
    ...(text.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,24}/g) || []),
  ];
  const counts = new Map();
  for (const candidate of candidates) {
    if (stopWords.has(candidate)) continue;
    counts.set(candidate, (counts.get(candidate) || 0) + 1);
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag)
    .slice(0, 7);
  return Array.from(new Set([kind, ...domainTags, ...ranked])).slice(0, 8);
}

export function preprocessFileContent({
  originalFilename = "未命名文件",
  mimeType = "",
  content = "",
} = {}) {
  const kind = normalizeFileKind({ originalFilename, mimeType });
  const title = baseTitle(originalFilename);
  const rawContent = String(content || "");

  if (rawContent.length > maxInlineChars) {
    throw new HttpError(413, "Inline file content is too large");
  }

  if (!supportedTextKinds.has(kind)) {
    return {
      status: "unsupported",
      kind,
      title,
      summary: `${kind === "unknown" ? "该文件类型" : kind} 暂未接入自动解析。`,
      tags: [kind],
      language: "unknown",
      textPreview: "",
      checksumSha256: rawContent ? hashFileContent(rawContent) : "",
      stats: {
        charCount: 0,
        wordCount: 0,
        lineCount: 0,
      },
      warnings: ["unsupported_file_type"],
    };
  }

  const safeContent = stripUnsafeText(rawContent);
  const lineCount = rawContent ? rawContent.split(/\r?\n/).length : 0;
  return {
    status: "processed",
    kind,
    title,
    summary: buildSummary(safeContent, title),
    tags: extractTags(safeContent, kind),
    language: detectLanguage(safeContent),
    textPreview: safeContent.slice(0, 1000),
    checksumSha256: hashFileContent(rawContent),
    stats: {
      charCount: safeContent.length,
      wordCount: countWords(safeContent),
      lineCount,
    },
    warnings: [],
  };
}
