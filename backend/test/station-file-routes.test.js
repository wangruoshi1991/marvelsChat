import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import express from "express";
import { registerStationFileRoutes } from "../src/routes/station-file-routes.js";
import { createRequestErrorHandler } from "../src/request-observability.js";

async function fixture(t, existing = []) {
  const owner = crypto.randomUUID();
  const writes = [];
  const usage = [];
  const reads = [];
  const app = express();
  app.use(express.json());
  registerStationFileRoutes(app, {
    authenticate: (req, _res, next) => { req.user = { id: owner }; next(); },
    asyncHandler: handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    createAsset: async input => { writes.push(input); return { id: crypto.randomUUID(), ...input }; },
    listAssets: async (userId, limit) => { reads.push({ userId, limit }); return existing; },
    recordUsage: async input => usage.push(input),
  });
  app.use(createRequestErrorHandler({ production: true, logger: { error() {} } }));
  const server = await new Promise(resolve => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (method, path = "/api/station/file-assets", body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { request, owner, writes, usage, reads };
}

test("file creation registers literal preview and measured UTF-8 bytes with one write", async t => {
  const f = await fixture(t);
  const content = "  <p>文字</p>\n\t下一行  ";
  const response = await f.request("POST", undefined, { originalFilename: "notes.txt", content });
  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].userId, f.owner);
  assert.equal(data.byteSize, Buffer.byteLength(content, "utf8"));
  assert.equal(data.preprocessingResult.textPreview, content);
  assert.equal(data.status, "processed");
  assert.equal(data.sourceKind, "inline_text");
  assert.equal(Object.hasOwn(data.preprocessingResult, "summary"), false);
  assert.equal(f.usage.length, 1);
  assert.equal(f.usage[0].eventType, "station.file_asset.create");
});

test("mismatched claimed byte sizes fail instead of replacing metadata silently", async t => {
  const f = await fixture(t);
  const response = await f.request("POST", undefined, { originalFilename: "notes.txt", content: "中文", byteSize: 2 });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.details.code, "FILE_SIZE_MISMATCH");
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.usage, []);
});

test("file metadata alone stays pending and existing records remain readable without rewriting", async t => {
  const existing = [{ id: "existing-file", originalFilename: "old.txt", preprocessingResult: { summary: "Previously stored", textPreview: "Old preview" } }];
  const f = await fixture(t, existing);
  const created = await f.request("POST", undefined, { originalFilename: "pending.txt" });
  assert.equal(created.status, 201);
  const { data } = await created.json();
  assert.equal(data.status, "pending_upload");
  assert.equal(data.byteSize, null);
  const response = await f.request("GET", "/api/station/file-assets?limit=5");
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, existing);
  assert.deepEqual(f.reads, [{ userId: f.owner, limit: 5 }]);
});

test("empty-content placeholders enforce the same filename and format allowlist as text uploads", async t => {
  const invalidCases = [
    [{ originalFilename: "../notes.txt" }, "FILE_NAME_INVALID"],
    [{ originalFilename: "folder\\notes.txt" }, "FILE_NAME_INVALID"],
    [{ originalFilename: "notes.pdf", mimeType: "application/pdf" }, "FILE_FORMAT_UNSUPPORTED"],
    [{ originalFilename: "notes.txt", mimeType: "application/pdf" }, "FILE_FORMAT_UNSUPPORTED"],
  ];

  for (const [body, code] of invalidCases) {
    const f = await fixture(t);
    const response = await f.request("POST", undefined, body);
    assert.equal(response.status, code === "FILE_NAME_INVALID" ? 400 : 415);
    assert.equal((await response.json()).error.details.code, code);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.usage, []);
  }

  const f = await fixture(t);
  const response = await f.request("POST", undefined, { originalFilename: "notes.txt", mimeType: "text/plain" });
  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.equal(data.status, "pending_upload");
  assert.equal(data.storageProvider, "pending");
  assert.equal(data.sourceKind, "upload_placeholder");
  assert.equal(data.extractedText, null);
  assert.equal(f.writes.length, 1);
  assert.equal(f.usage.length, 1);
});

test("retired preprocess route is absent instead of performing a second content rewrite", async t => {
  const f = await fixture(t);
  const response = await f.request("POST", `/api/station/file-assets/${crypto.randomUUID()}/preprocess`, { content: "Never write" });
  assert.equal(response.status, 404);
  assert.deepEqual(f.writes, []);
});

test('raw upload validates bytes, content type, idempotency key, filenames and format before persistence', async t => {
  const owner = crypto.randomUUID();
  const writes = [];
  const app = express();
  registerStationFileRoutes(app, {
    authenticate: (req, _res, next) => { req.user = { id: owner }; next(); },
    asyncHandler: handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    uploadAsset: async input => { writes.push(input); return { asset: { id: crypto.randomUUID(), status: 'processed' }, replayed: false }; },
  });
  app.use(createRequestErrorHandler({ production: true, logger: { error() {} } }));
  const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const send = (body, extra = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/station/file-assets/upload`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Miaoxun-Filename': encodeURIComponent('文字.md'),
      'X-Miaoxun-File-Mime': 'text/markdown', 'X-Miaoxun-Idempotency-Key': crypto.randomUUID(), ...extra }, body,
  });
  const content = '# 完整正文\n' + '远超预览的文字'.repeat(1000);
  assert.equal((await send(content)).status, 201);
  assert.equal(writes[0].content, content);
  assert.equal(writes[0].userId, owner);
  assert.equal(writes[0].byteSize, Buffer.byteLength(content));
  assert.equal((await send(Buffer.from([0xff]))).status, 400);
  assert.equal((await send('text', { 'X-Miaoxun-Filename': '%FF' })).status, 400);
  assert.equal((await send('text', { 'X-Miaoxun-Filename': 'a.pdf', 'X-Miaoxun-File-Mime': 'application/pdf' })).status, 415);
  assert.equal((await send('text', { 'X-Miaoxun-Idempotency-Key': 'bad' })).status, 400);
  assert.equal((await send(Buffer.alloc(262145, 97))).status, 413);
  assert.equal((await send(' '.repeat(2))).status, 400);
  assert.equal(writes.length, 1);
});

test('legacy JSON registration rejects isolated Unicode surrogates instead of encoding replacement text', async t => {
  const f = await fixture(t);
  for (const content of ['before\ud800after', 'before\udc00after']) {
    const response = await f.request('POST', undefined, { originalFilename: 'notes.txt', content });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.details.code, 'FILE_UTF8_INVALID');
  }
  assert.deepEqual(f.writes, []);
});
