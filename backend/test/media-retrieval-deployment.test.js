import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendDir, "..");

test("deployment keeps the product worker independent and Provider dispatch disabled by default", async () => {
  const [dockerfile, compose, backendEnv, productionEnv] = await Promise.all([
    readFile(path.join(backendDir, "Dockerfile"), "utf8"),
    readFile(path.join(repoRoot, "deploy", "docker-compose.prod.yml"), "utf8"),
    readFile(path.join(backendDir, ".env.example"), "utf8"),
    readFile(path.join(repoRoot, "deploy", "miaoxun-prod.env.example"), "utf8"),
  ]);

  assert.match(dockerfile, /apt-get install[^\n]*ffmpeg/i);
  assert.match(compose, /media-retrieval-worker:/);
  assert.match(compose, /command: \["node", "src\/media-retrieval-worker\.js"\]/);
  assert.match(compose, /init: true/);
  assert.match(compose, /stop_grace_period: 30s/);

  for (const envFile of [backendEnv, productionEnv]) {
    assert.match(envFile, /^MEDIA_RETRIEVAL_ENABLED=$/m);
    assert.match(envFile, /^MEDIA_RETRIEVAL_PROVIDER_CALLS_ENABLED=$/m);
    assert.match(envFile, /^MEDIA_RETRIEVAL_DASHSCOPE_API_KEY=$/m);
    assert.match(envFile, /^MEDIA_RETRIEVAL_CAPTION_MODEL_VERSION=$/m);
    assert.match(envFile, /^MEDIA_RETRIEVAL_EMBEDDING_MODEL_VERSION=$/m);
    assert.match(envFile, /^MEDIA_RETRIEVAL_EMBEDDING_NORMALIZATION=$/m);
    assert.doesNotMatch(envFile, /MEDIA_RETRIEVAL_DASHSCOPE_API_KEY=\S+/);
  }
});
