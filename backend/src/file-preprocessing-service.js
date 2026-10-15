import crypto from "crypto";
import path from "path";
import { HttpError } from "./http-error.js";

const maxInlineChars = 200_000;
const supportedTextKinds = new Set(["text", "markdown", "json", "csv", "tsv"]);
const maxPreviewChars = 1000;

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

function normalizeFileKind({ originalFilename = "", mimeType = "" } = {}) {
  const normalizedMime = String(mimeType || "").trim().toLowerCase().split(";")[0];
  if (mimeKindMap[normalizedMime]) return mimeKindMap[normalizedMime];

  const ext = path.extname(String(originalFilename || "").trim()).toLowerCase();
  return extensionKindMap[ext] || "unknown";
}

export function preprocessFileContent({
  originalFilename = "未命名文件",
  mimeType = "",
  content = "",
} = {}) {
  const kind = normalizeFileKind({ originalFilename, mimeType });
  if (typeof content !== "string" || content.includes("\0")) {
    throw new HttpError(400, "文件文字包含无效内容，无法登记。", { code: "FILE_TEXT_INVALID" });
  }
  if (content.length > maxInlineChars) {
    throw new HttpError(413, "Inline file content is too large");
  }
  const supported = supportedTextKinds.has(kind);
  const characters = supported ? Array.from(content) : [];
  // This is a bounded literal preview, not a summary or parsed document.
  // Consumers render it as plain text; formatting and markup stay untouched.
  return {
    status: !supported ? "unsupported" : content ? "processed" : "pending_upload",
    kind,
    textPreview: characters.slice(0, maxPreviewChars).join(""),
    textPreviewTruncated: characters.length > maxPreviewChars,
    checksumSha256: content ? crypto.createHash("sha256").update(content, "utf8").digest("hex") : "",
    stats: {
      charCount: characters.length,
      lineCount: supported && content ? content.split(/\r\n|\r|\n/).length : 0,
    },
    warnings: supported ? [] : ["unsupported_file_type"],
  };
}
