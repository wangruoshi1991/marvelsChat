import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { gzipSync } from "node:zlib";
import express from "express";
import { createSafeErrorResponse } from "../src/request-observability.js";

test("compressed JSON remains bounded and malformed trailing bytes return a client error", async () => {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.post("/payload", (req, res) => res.json({ accepted: req.body.value === "synthetic-valid" }));
  app.use((error, req, res, next) => {
    void next;
    const response = createSafeErrorResponse(error, { production: true, requestId: "compressed-json-test" });
    res.status(response.status).json(response.body);
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const send = (body) => fetch(`http://127.0.0.1:${server.address().port}/payload`, {
    method: "POST", headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
    body, signal: AbortSignal.timeout(3000),
  });
  try {
    const valid = gzipSync(JSON.stringify({ value: "synthetic-valid" }));
    const success = await send(valid);
    assert.equal(success.status, 200);
    assert.deepEqual(await success.json(), { accepted: true });
    const malformed = await send(Buffer.concat([valid, Buffer.from("invalid-trailing-gzip-bytes")]));
    assert.equal(malformed.status, 400);
    const oversized = await send(gzipSync(JSON.stringify({ value: "x".repeat(1024 * 1024 + 1) })));
    assert.equal(oversized.status, 413);
    const afterFailure = await send(valid);
    assert.equal(afterFailure.status, 200);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
