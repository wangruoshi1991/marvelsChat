import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { preprocessFileContent } from "../src/file-preprocessing-service.js";

test("file registration preserves literal text, spacing and line endings in its preview and hash", () => {
  const content = "  <script>source text</script>\r\n# 漫画  日记🙂\n\t末行\r";
  const result = preprocessFileContent({ originalFilename: "notes.md", content });
  assert.equal(result.status, "processed");
  assert.equal(result.kind, "markdown");
  assert.equal(result.textPreview, content);
  assert.equal(result.textPreviewTruncated, false);
  assert.equal(result.checksumSha256, crypto.createHash("sha256").update(content, "utf8").digest("hex"));
  assert.deepEqual(result.stats, { charCount: Array.from(content).length, lineCount: 4 });
  for (const field of ["title", "summary", "tags", "language", "wordCount"]) {
    assert.equal(Object.hasOwn(result, field), false);
    assert.equal(Object.hasOwn(result.stats, field), false);
  }
});

test("bounded preview is an exact Unicode prefix with an explicit truncation flag, not a summary", () => {
  const content = "🙂".repeat(999) + "尾" + "余下的原文";
  const result = preprocessFileContent({ originalFilename: "notes.txt", content });
  assert.equal(result.textPreview, "🙂".repeat(999) + "尾");
  assert.equal(result.textPreviewTruncated, true);
  assert.equal(result.stats.charCount, 1005);
  assert.equal(result.checksumSha256, crypto.createHash("sha256").update(content, "utf8").digest("hex"));
});

test("technical file kinds are explicit metadata and unsupported documents are never marked parsed", () => {
  for (const [originalFilename, kind] of [["a.json", "json"], ["a.csv", "csv"], ["a.tsv", "tsv"]]) {
    const result = preprocessFileContent({ originalFilename, content: "原样输入" });
    assert.equal(result.kind, kind);
    assert.equal(result.textPreview, "原样输入");
  }
  const result = preprocessFileContent({ originalFilename: "book.pdf", mimeType: "application/pdf", content: "Not an extracted PDF" });
  assert.equal(result.status, "unsupported");
  assert.equal(result.textPreview, "");
  assert.deepEqual(result.stats, { charCount: 0, lineCount: 0 });
  assert.deepEqual(result.warnings, ["unsupported_file_type"]);
  assert.equal(Object.hasOwn(result, "summary"), false);
});

test("metadata without text remains pending and invalid content is rejected without coercion", () => {
  const pending = preprocessFileContent({ originalFilename: "empty.txt" });
  assert.equal(pending.status, "pending_upload");
  assert.equal(pending.checksumSha256, "");
  assert.deepEqual(pending.stats, { charCount: 0, lineCount: 0 });
  for (const content of [null, {}, 12, "a\0b"]) {
    assert.throws(() => preprocessFileContent({ originalFilename: "text.txt", content }), error =>
      error.status === 400 && error.details.code === "FILE_TEXT_INVALID");
  }
  assert.throws(() => preprocessFileContent({ originalFilename: "text.txt", content: "a".repeat(200001) }), error => error.status === 413);
});
