import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import sharp from "sharp";

const secret = "smoke-test-secret-never-print";
const environment = [
  "MEDIA_GENERATION_ENABLED=true",
  "MEDIA_GENERATION_PROVIDER=fixture-image",
  "MEDIA_GENERATION_API_BASE_URL=https://images.example.test/v1",
  `MEDIA_GENERATION_API_KEY=${secret}`,
  "MEDIA_GENERATION_IMAGE_MODEL=fixture-image-v1",
  "MEDIA_GENERATION_TIMEOUT_MS=1000",
].join("\n");

async function fixture(t, contents = environment) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "comic-smoke-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const envFile = path.join(directory, "secret.env");
  const outputDir = path.join(directory, "output");
  await fs.writeFile(envFile, contents, { mode: 0o600 });
  return { directory, envFile, outputDir };
}

const load = () => import("../scripts/comic-image-live-smoke.js");
const adapter = generateFrame => ({ "fixture-image": {
  contractVerified: true, allowedHosts: ["images.example.test"], generateFrame,
} });
const records = async outputDir => (await fs.readFile(path.join(outputDir, "receipt.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
const imageResult = async () => ({
  bytes: await sharp({ create: { width: 48, height: 32, channels: 3, background: "#e6c45b" } }).withMetadata().png().toBuffer(),
  mimeType: "image/png", width: 48, height: 32,
  providerRequestId: null, model: "fixture-image-v1", usage: null,
});

test("single smoke call durably records dispatch and saves decoded metadata-free WebP", async t => {
  const f = await fixture(t);
  const { runComicImageLiveSmoke } = await load();
  let calls = 0;
  const result = await runComicImageLiveSmoke(f, { adapters: adapter(async (input, context) => {
    calls++;
    assert.equal((await records(f.outputDir)).at(-1).type, "dispatch");
    assert.equal((await fs.stat(path.join(f.outputDir, "receipt.jsonl"))).mode & 0o777, 0o600);
    assert.equal(context.config.apiKey, secret);
    assert.equal(input.width, 1024);
    assert.equal(input.height, 1024);
    assert.deepEqual(input.selectedImages, []);
    assert.match(input.prompt, /four.panel|四格/iu);
    return imageResult();
  }) });
  assert.equal(calls, 1);
  assert.equal(result.status, "succeeded");
  const image = await fs.readFile(path.join(f.outputDir, "frame-1.webp"));
  const metadata = await sharp(image).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 48);
  assert.equal(metadata.height, 32);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(result.sha256, crypto.createHash("sha256").update(image).digest("hex"));
  assert.equal(result.byteLength, image.length);
  assert.equal((await fs.stat(f.outputDir)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(path.join(f.outputDir, "frame-1.webp"))).mode & 0o777, 0o600);
  const report = await records(f.outputDir);
  assert.equal(report.at(-1).status, "succeeded");
  assert.equal(JSON.stringify({ result, report }).includes(secret), false);
});

test("unknown remote result is recorded safely once without a retry or output image", async t => {
  const f = await fixture(t);
  const { runComicImageLiveSmoke } = await load();
  let calls = 0;
  const result = await runComicImageLiveSmoke(f, { adapters: adapter(async () => {
    calls++;
    throw new Error(`raw upstream message ${secret}`);
  }) });
  assert.equal(calls, 1);
  assert.equal(result.status, "unknown");
  assert.equal(result.outcomeUnknown, true);
  assert.equal(result.errorCode, "COMIC_IMAGE_PROVIDER_OUTCOME_UNKNOWN");
  assert.equal((await records(f.outputDir)).filter(record => record.type === "dispatch").length, 1);
  assert.equal(JSON.stringify(await records(f.outputDir)).includes(secret), false);
  await assert.rejects(fs.access(path.join(f.outputDir, "frame-1.webp")));
});

test("non-image bytes cannot produce smoke success even with valid provider metadata", async t => {
  const f = await fixture(t);
  const { runComicImageLiveSmoke } = await load();
  const result = await runComicImageLiveSmoke(f, { adapters: adapter(async () => ({
    ...await imageResult(), bytes: Buffer.from("<html>not an image</html>"),
  })) });
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "COMIC_IMAGE_BYTES_INVALID");
  assert.equal(result.outcomeUnknown, false);
  await assert.rejects(fs.access(path.join(f.outputDir, "frame-1.webp")));
});

test("secret permissions and an existing output directory fail before provider dispatch", async t => {
  const f = await fixture(t);
  const { runComicImageLiveSmoke } = await load();
  let calls = 0;
  const dependencies = { adapters: adapter(async () => { calls++; return imageResult(); }) };
  await fs.chmod(f.envFile, 0o644);
  await assert.rejects(runComicImageLiveSmoke(f, dependencies), error => error.code === "COMIC_SMOKE_SECRET_FILE_INVALID");
  await assert.rejects(fs.access(f.outputDir));
  await fs.chmod(f.envFile, 0o600);
  await fs.mkdir(f.outputDir);
  await fs.writeFile(path.join(f.outputDir, "keep.txt"), "keep");
  await assert.rejects(runComicImageLiveSmoke(f, dependencies), error => error.code === "COMIC_SMOKE_OUTPUT_EXISTS");
  assert.equal(await fs.readFile(path.join(f.outputDir, "keep.txt"), "utf8"), "keep");
  assert.equal(calls, 0);
});

test("an absent file credential never falls back to ambient process credentials", async t => {
  const f = await fixture(t, environment.replace(`MEDIA_GENERATION_API_KEY=${secret}`, "MEDIA_GENERATION_API_KEY="));
  const previous = process.env.MEDIA_GENERATION_API_KEY;
  process.env.MEDIA_GENERATION_API_KEY = "ambient-secret-must-not-be-used";
  t.after(() => previous === undefined ? delete process.env.MEDIA_GENERATION_API_KEY : process.env.MEDIA_GENERATION_API_KEY = previous);
  const { runComicImageLiveSmoke } = await load();
  let calls = 0;
  const result = await runComicImageLiveSmoke(f, { adapters: adapter(async () => { calls++; return imageResult(); }) });
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "COMIC_IMAGE_PROVIDER_UNAVAILABLE");
  assert.equal(calls, 0);
  assert.equal((await records(f.outputDir)).some(record => record.type === "dispatch"), false);
});

test("CLI accepts only required file and output options and never accepts an inline key", async () => {
  const { parseComicImageSmokeArguments } = await load();
  assert.deepEqual(parseComicImageSmokeArguments(["--env-file", "/tmp/secret.env", "--output-dir", "/tmp/new-output"]), { envFile: "/tmp/secret.env", outputDir: "/tmp/new-output" });
  for (const args of [[], ["--env-file", "/tmp/secret.env"], ["--env-file", "/tmp/secret.env", "--output-dir", "/tmp/output", "--api-key", secret]]) {
    assert.throws(() => parseComicImageSmokeArguments(args), error => error.code === "COMIC_SMOKE_INVALID_ARGUMENTS" && !String(error).includes(secret));
  }
});

test("secret symlinks are rejected without creating output or making a call", async t => {
  const f = await fixture(t);
  const link = path.join(f.directory, "secret-link.env");
  await fs.symlink(f.envFile, link);
  const { runComicImageLiveSmoke } = await load();
  let calls = 0;
  await assert.rejects(runComicImageLiveSmoke({ ...f, envFile: link }, { adapters: adapter(async () => { calls++; return imageResult(); }) }),
    error => error.code === "COMIC_SMOKE_SECRET_FILE_INVALID");
  assert.equal(calls, 0);
  await assert.rejects(fs.access(f.outputDir));
});

test("the real CLI rejects credential arguments with safe stderr and nonzero exit", () => {
  const result = spawnSync(process.execPath, ["--", new URL("../scripts/comic-image-live-smoke.js", import.meta.url).pathname,
    "--env-file", "/nonexistent/secret.env", "--output-dir", "/nonexistent/output", "--api-key", secret],
  { encoding: "utf8", env: { PATH: process.env.PATH, MIAOXUN_DOTENV_ENABLED: "false" } });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), { status: "failed", errorCode: "COMIC_SMOKE_INVALID_ARGUMENTS", outcomeUnknown: false });
  assert.equal(result.stderr.includes(secret), false);
});

test("decode failures preserve safe known generation usage without claiming success", async t => {
  const f = await fixture(t);
  const { runComicImageLiveSmoke } = await load();
  const result = await runComicImageLiveSmoke(f, { adapters: adapter(async () => ({
    ...await imageResult(), bytes: Buffer.from("invalid image"), usage: { images: 1, inputTokens: 17, outputTokens: 0, totalTokens: 17 },
  })) });
  assert.equal(result.status, "failed");
  assert.deepEqual(result.usage, { images: 1, inputTokens: 17, outputTokens: 0, totalTokens: 17 });
  assert.deepEqual((await records(f.outputDir)).at(-1).usage, result.usage);
});
