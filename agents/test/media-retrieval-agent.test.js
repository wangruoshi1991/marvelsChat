import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const agentsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDirectory = path.join(agentsDirectory, "media-retrieval");

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));

test("media-retrieval Agent has the approved private-media contract", async () => {
  const manifest = await readJson(path.join(packageDirectory, "manifest.json"));
  const agent = (await import(pathToFileURL(path.join(agentsDirectory, "media-retrieval.agent.js")).href)).default;

  assert.equal(manifest.key, "media-retrieval");
  assert.deepEqual(manifest.profiles, [
    "synchronous-tool",
    "asynchronous-generation",
    "external-provider",
    "paid",
    "sensitive-data",
  ]);
  assert.equal(manifest.risk.level, "R2");
  assert.equal(manifest.risk.consentVersion, "media-retrieval-consent-v1");
  assert.equal(manifest.billing.mode, "metered");
  assert.equal(manifest.billing.providerCallsDefaultEnabled, false);
  assert.equal(manifest.billing.confirmationRequired, true);
  assert.equal(manifest.billing.userDailyLimit, 3);
  assert.equal(manifest.billing.globalDailyBudgetFen, 1000);
  assert.equal(manifest.billing.alertThresholdPercent, 80);
  assert.equal(manifest.billing.retryOnUnknownBilling, false);
  assert.deepEqual(manifest.permissions, [
    "private-media:read",
    "private-media-index:write",
    "agent-runs:read",
  ]);
  assert.deepEqual(manifest.artifacts, []);
  assert.equal(manifest.catalog.interaction.artifactAccess, false);
  assert.equal(manifest.compatibility.minimumAppBuild, 26);

  assert.equal(agent.category, "media-retrieval");
  assert.deepEqual(agent.capabilities, [
    "private-media-index",
    "semantic-media-search",
    "video-frame-retrieval",
  ]);
  assert.deepEqual(agent.permissions, manifest.permissions);
  assert.deepEqual(agent.identity, {
    avatarKind: "agent-mark",
    mark: "检",
    shape: "squircle",
    colors: { background: "#14532d", foreground: "#ffffff", accent: "#facc15" },
  });
});

test("media-retrieval Card is a safe projection with no operational metadata", async () => {
  const [manifest, runtimeStatus, card] = await Promise.all([
    readJson(path.join(packageDirectory, "manifest.json")),
    readJson(path.join(packageDirectory, "runtime-status.fixture.json")),
    readJson(path.join(packageDirectory, "agent-card.fixture.json")),
  ]);
  const { projectAgentCard } = await import(pathToFileURL(path.join(packageDirectory, "manifest-projection.js")).href);

  assert.deepEqual(projectAgentCard(manifest, runtimeStatus), card);
  const serialized = JSON.stringify(card).toLowerCase();
  for (const forbidden of ["provider", "endpoint", "apikey", "authorization", "signedurl", "storagekey", "billing", "audit"]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} must not appear in AgentCard`);
  }
});
