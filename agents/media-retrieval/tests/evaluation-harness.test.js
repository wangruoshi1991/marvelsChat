import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateCase } from "../evaluation-harness.js";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("media-retrieval package executes every synthetic evaluation fixture in mock mode", async () => {
  const suite = JSON.parse(await fs.readFile(path.join(packageDirectory, "evaluation-suite.json"), "utf8"));
  const results = await Promise.all(suite.cases.map((definition) => evaluateCase({ definition, mode: "mock" })));

  assert.equal(results.length, suite.cases.length);
  assert.ok(results.every((result) => result.passed));
  assert.ok(results.every((result) => result.costFen === 0));
});
