import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "media-retrieval");

const requiredCasePrefixes = [
  "image-",
  "video-",
  "ocr-",
  "quality-",
  "authorization-",
  "deletion-",
  "privacy-",
  "cost-",
  "recovery-",
  "no-result-",
];

test("media-retrieval evaluation suite is a 30-case synthetic, mock-only contract", async () => {
  const suite = JSON.parse(await fs.readFile(path.join(packageDirectory, "evaluation-suite.json"), "utf8"));

  assert.equal(suite.cases.length, 30);
  assert.equal(new Set(suite.cases.map((testCase) => testCase.id)).size, 30);
  for (const prefix of requiredCasePrefixes) {
    assert.ok(suite.cases.some((testCase) => testCase.id.startsWith(prefix)), `missing ${prefix} case`);
  }
  for (const testCase of suite.cases) {
    assert.match(testCase.fixtureRef, /^fixtures\/media-retrieval\/v1\//);
    assert.ok(["none", "mock-only"].includes(testCase.expected.providerInteraction));
    assert.equal(testCase.review.requiresHumanJudgement, false);
  }
  assert.equal(suite.fixturePolicy.noProductionPersonalData, true);
});

test("media-retrieval docs declare a single-person draft exception and keep provider calls disabled", async () => {
  const proposal = await fs.readFile(
    path.resolve(packageDirectory, "..", "..", "docs", "agents", "media-retrieval", "proposal.md"),
    "utf8",
  );

  assert.match(proposal, /Jarson/);
  assert.match(proposal, /draft/);
  assert.match(proposal, /MEDIA_RETRIEVAL_PROVIDER_CALLS_ENABLED=false/);
});
