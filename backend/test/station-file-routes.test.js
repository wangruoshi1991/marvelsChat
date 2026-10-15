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

test("retired preprocess route is absent instead of performing a second content rewrite", async t => {
  const f = await fixture(t);
  const response = await f.request("POST", `/api/station/file-assets/${crypto.randomUUID()}/preprocess`, { content: "Never write" });
  assert.equal(response.status, 404);
  assert.deepEqual(f.writes, []);
});
