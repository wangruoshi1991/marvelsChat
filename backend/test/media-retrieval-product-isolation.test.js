import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(backendRoot, "..");
const productEntries = [
  "src/routes/station-media-retrieval-routes.js",
  "src/routes/agent-run-routes.js",
  "src/routes/admin-media-retrieval-routes.js",
  "src/routes/station-media-routes.js",
  "src/media-retrieval-worker.js",
].map((entry) => path.resolve(backendRoot, entry));

const importPattern = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const forbiddenProductPath = /(?:^|\/)(?:paper|research|privsearch)(?:\/|-|$)|(?:^|\/)IEEE(?:\/|$)|formal-(?:evaluator|receipt)|experiment-manifest/i;

const resolveRelativeImport = (sourceFile, specifier) => {
  const candidate = path.resolve(path.dirname(sourceFile), specifier);
  for (const resolved of [candidate, `${candidate}.js`, path.join(candidate, "index.js")]) {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  }
  throw new Error(`Cannot resolve product import ${specifier} from ${sourceFile}`);
};

const collectProductImportGraph = (entries) => {
  const visited = new Set();
  const pending = [...entries];
  while (pending.length) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    const source = fs.readFileSync(current, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1] || match[2];
      if (!specifier.startsWith(".")) continue;
      const resolved = resolveRelativeImport(current, specifier);
      const relative = path.relative(repositoryRoot, resolved).split(path.sep).join("/");
      assert.equal(relative.startsWith("../"), false, `Product import escapes the repository: ${relative}`);
      assert.doesNotMatch(relative, forbiddenProductPath, `Product entry imports research code: ${relative}`);
      pending.push(resolved);
    }
  }
  return new Set([...visited].map((file) => path.relative(repositoryRoot, file).split(path.sep).join("/")));
};

test("all media retrieval product entries remain isolated from research runtime code", () => {
  const graph = collectProductImportGraph(productEntries);
  for (const required of [
    "backend/src/media-retrieval-user-service.js",
    "backend/src/media-retrieval-b7-service.js",
    "backend/src/media-retrieval-b7-core.js",
    "backend/src/media-retrieval-provider.js",
    "backend/src/media-retrieval-repository.js",
    "backend/src/media-retrieval-service.js",
    "backend/src/media-retrieval-worker.js",
  ]) {
    assert.equal(graph.has(required), true, `Product import graph did not reach ${required}`);
  }
});
