import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

import { projectAgentCard } from "../manifest-projection.js";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const worktree = path.resolve(packageDirectory, "..", "..");

const readJson = async (file) => JSON.parse(await fs.readFile(path.join(packageDirectory, file), "utf8"));

test("media-retrieval projects a public AgentCard without operational metadata", async () => {
  const [manifest, runtimeStatus, fixture] = await Promise.all([
    readJson("manifest.json"),
    readJson("runtime-status.fixture.json"),
    readJson("agent-card.fixture.json"),
  ]);
  const card = projectAgentCard(manifest, runtimeStatus);

  assert.equal(card.agentKey, "media-retrieval");
  assert.equal(card.availability.state, "temporarily-unavailable");
  assert.equal(card.interaction.runMode, "asynchronous");
  assert.equal(manifest.execution.cancellable, false);
  assert.equal(card.interaction.cancellable, false);
  assert.equal(fixture.interaction.cancellable, false);
  for (const forbiddenField of ["provider", "endpoint", "apiKey", "signedUrl", "storageKey", "query"]) {
    assert.equal(Object.hasOwn(card, forbiddenField), false, forbiddenField);
  }
});

test("media-retrieval public contracts reference the canonical search and error schemas", async () => {
  const [input, output, publicError, canonicalOutput, canonicalError, fixture] = await Promise.all([
    readJson("contracts/input.schema.json"),
    readJson("contracts/output.schema.json"),
    readJson("contracts/public-error.schema.json"),
    fs.readFile(path.join(worktree, "shared", "media-retrieval-search-response.schema.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(worktree, "shared", "media-retrieval-public-error.schema.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(worktree, "shared", "media-retrieval-public-contract.fixture.json"), "utf8").then(JSON.parse),
  ]);

  assert.ok(input.properties.operation.enum.includes("enable"));
  assert.ok(input.properties.operation.enum.includes("search"));
  assert.equal(input.properties.limit.maximum, 20);
  assert.equal(output.$ref, canonicalOutput.$id);
  assert.equal(publicError.$ref, canonicalError.$id);

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addSchema(canonicalOutput);
  ajv.addSchema(canonicalError);
  assert.equal(ajv.validate(output, fixture.searchSuccess), true, JSON.stringify(ajv.errors));
  assert.equal(ajv.validate(publicError, fixture.publicError.body), true, JSON.stringify(ajv.errors));
});
