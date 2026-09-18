import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as adminCore from "../admin-core.js";

test("admin renders diagnostic guidance with escaped values and budget uncertainty", async () => {
  const source = (await readFile(new URL("../admin.js", import.meta.url), "utf8"))
    .replace(/^import \{[\s\S]*?\} from "\.\/admin-core\.js";\n/, "");
  const nodes = new Map();
  const node = (key) => {
    if (!nodes.has(key)) nodes.set(key, { innerHTML: "", value: "0", classList: { remove() {}, toggle() {} }, addEventListener() {} });
    return nodes.get(key);
  };
  const context = vm.createContext({
    ...adminCore,
    window: { location: { protocol: "https:", origin: "https://test.invalid" } },
    document: { querySelector: node, querySelectorAll: () => [] },
    localStorage: { removeItem() {} }, sessionStorage: { getItem: () => null },
    overview: {
      runtimeStatus: {}, controls: {}, cost: { unknownFen: 200 },
      diagnostics: [{ agentRunId: '<script>"&', operation: "image-description", stage: "descriptor-validation", failureCode: "retrieval_policy_unverifiable", httpStatus: 200, schemaPaths: ["clothing[].color"], createdAt: "2026-09-16T00:00:00Z" }],
    },
  });
  vm.runInContext(`${source}\nrenderMediaRetrievalOverview(overview);`, context);
  const html = node("#media-retrieval-content").innerHTML;
  assert.match(html, /&lt;script&gt;&quot;&amp;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /clothing\[\]\.color/);
  assert.match(html, /保持校验开启/);
  assert.match(html, /不代表供应商实际扣款/);
  assert.match(html, /¥2\.00/);
  assert.match(adminCore.mediaRetrievalDiagnosticGuidance({ stage: "http-response", httpStatus: 403 }), /模型授权/);
  assert.match(adminCore.mediaRetrievalDiagnosticGuidance({ stage: "timeout" }), /勿自动重复调用/);
});
