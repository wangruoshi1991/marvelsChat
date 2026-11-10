#!/usr/bin/env node
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse as parseDotenv } from "dotenv";

// Importing this evaluator must never load the checkout's normal runtime .env.
// Invoke with `node -- backend/scripts/comic-image-live-smoke.js --env-file ...
// --output-dir ...`: `--` prevents Node itself from interpreting --env-file.
process.env.MIAOXUN_DOTENV_ENABLED = "false";

const safeCodes = new Set([
  "COMIC_SMOKE_INVALID_ARGUMENTS", "COMIC_SMOKE_SECRET_FILE_INVALID",
  "COMIC_SMOKE_CONFIGURATION_INVALID", "COMIC_SMOKE_OUTPUT_EXISTS",
  "COMIC_SMOKE_OUTPUT_FAILED", "COMIC_SMOKE_RECEIPT_FAILED",
  "COMIC_IMAGE_PROVIDER_UNAVAILABLE", "COMIC_IMAGE_PROVIDER_INVALID_INPUT",
  "COMIC_IMAGE_PROVIDER_REJECTED", "COMIC_IMAGE_PROVIDER_RATE_LIMITED",
  "COMIC_IMAGE_PROVIDER_AUTH_FAILED", "COMIC_IMAGE_PROVIDER_CONTENT_REJECTED",
  "COMIC_IMAGE_PROVIDER_OUTCOME_UNKNOWN", "COMIC_IMAGE_PROVIDER_RESPONSE_TOO_LARGE",
  "COMIC_IMAGE_PROVIDER_INVALID_RESPONSE", "COMIC_IMAGE_BYTES_INVALID",
]);
const fail = code => Object.assign(new Error("Comic image smoke stopped; see its safe error code."), { code });
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const safeModel = (value, secret) => typeof value === "string" && value.length > 0 && value.length <= 160
  // eslint-disable-next-line no-control-regex -- No control characters in receipts.
  && !/[\u0000-\u001f\u007f]/.test(value) && (!secret || !value.includes(secret)) ? value : null;
const safeUsage = value => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = ["images", "inputTokens", "outputTokens", "totalTokens"];
  return Object.entries(value).every(([key, count]) => fields.includes(key) && Number.isSafeInteger(count) && count >= 0)
    ? { ...value } : null;
};

// Public synthetic content only: one square image containing a four-panel comic.
const prompt = [
  "Create a charming four-panel comic (四格漫画) arranged in a clear 2 by 2 grid.",
  "Use the same small orange cat, blue scarf, clean ink outlines and warm watercolor palette in every panel.",
  "Panel 1: the cat notices a tiny seed on a sunny windowsill.",
  "Panel 2: the cat plants the seed in a little terracotta pot.",
  "Panel 3: the cat gently waters a small green sprout.",
  "Panel 4: a bright sunflower blooms and the cat smiles beside it.",
  "Keep all four panels visually distinct with consistent characters. No lettering, logos or speech bubbles.",
].join("\n");

export function parseComicImageSmokeArguments(args) {
  const result = {};
  const names = { "--env-file": "envFile", "--output-dir": "outputDir" };
  for (let index = 0; index < args.length; index += 2) {
    const name = names[args[index]], value = args[index + 1];
    if (!name || Object.hasOwn(result, name) || typeof value !== "string" || !value.trim() || value.startsWith("--")) {
      throw fail("COMIC_SMOKE_INVALID_ARGUMENTS");
    }
    result[name] = value;
  }
  if (!result.envFile || !result.outputDir) throw fail("COMIC_SMOKE_INVALID_ARGUMENTS");
  return result;
}

async function readSecretEnvironment(filename) {
  let handle;
  try {
    handle = await fs.open(path.resolve(filename), constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await handle.stat();
    if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600 || metadata.size < 1 || metadata.size > 65536
      || (typeof process.getuid === "function" && metadata.uid !== process.getuid())) throw fail("COMIC_SMOKE_SECRET_FILE_INVALID");
    const contents = await handle.readFile();
    if (contents.length > 65536) throw fail("COMIC_SMOKE_SECRET_FILE_INVALID");
    return parseDotenv(contents);
  } catch { throw fail("COMIC_SMOKE_SECRET_FILE_INVALID"); }
  finally { await handle?.close(); }
}

function safeFailure(error, fallback = "COMIC_SMOKE_OUTPUT_FAILED") {
  const candidate = error?.details?.code || error?.code;
  const errorCode = safeCodes.has(candidate) ? candidate : fallback;
  const outcomeUnknown = error?.outcomeUnknown === true || errorCode === "COMIC_IMAGE_PROVIDER_OUTCOME_UNKNOWN";
  return { status: outcomeUnknown ? "unknown" : "failed", errorCode, outcomeUnknown };
}

export async function runComicImageLiveSmoke({ envFile, outputDir } = {}, { adapters, fetchImpl = globalThis.fetch } = {}) {
  if (typeof envFile !== "string" || !envFile.trim() || typeof outputDir !== "string" || !outputDir.trim()) {
    throw fail("COMIC_SMOKE_INVALID_ARGUMENTS");
  }
  const environment = await readSecretEnvironment(envFile);
  const [{ createMediaGenerationConfig }, { createComicImageProvider }, { normalizeComicImage }] = await Promise.all([
    import("../src/config.js"), import("../src/comic-image-provider.js"), import("../src/comic-render-storage.js"),
  ]);
  let settings;
  try { settings = createMediaGenerationConfig(environment); }
  catch { throw fail("COMIC_SMOKE_CONFIGURATION_INVALID"); }
  const provider = createComicImageProvider({ config: settings, fetchImpl, ...(adapters === undefined ? {} : { adapters }) });
  const directory = path.resolve(outputDir);
  try { await fs.mkdir(directory, { mode: 0o700 }); }
  catch (error) { throw fail(error?.code === "EEXIST" ? "COMIC_SMOKE_OUTPUT_EXISTS" : "COMIC_SMOKE_OUTPUT_FAILED"); }
  let receipt;
  try { receipt = await fs.open(path.join(directory, "receipt.jsonl"), "wx", 0o600); }
  catch { throw fail("COMIC_SMOKE_RECEIPT_FAILED"); }
  let dispatched = false;
  const append = async record => {
    try {
      await receipt.writeFile(`${JSON.stringify({ ...record, at: new Date().toISOString() })}\n`);
      await receipt.sync();
    } catch {
      throw Object.assign(fail("COMIC_SMOKE_RECEIPT_FAILED"), { outcomeUnknown: dispatched });
    }
  };
  const model = safeModel(settings.imageModel, settings.apiKey);
  try {
    await append({ type: "run_start", version: 1, source: "public-synthetic", model,
      requestedImages: 1, requestedWidth: 1024, requestedHeight: 1024, retryCount: 0, promptSha256: hash(prompt) });
    if (!provider.readiness().configured) {
      const result = { status: "failed", model, usage: null, errorCode: "COMIC_IMAGE_PROVIDER_UNAVAILABLE", outcomeUnknown: false };
      await append({ type: "result", ...result });
      return result;
    }
    const input = { prompt, selectedImages: [], width: 1024, height: 1024, idempotencyKey: `comic-smoke:${crypto.randomUUID()}` };
    // Durable intent precedes the only remote generation call. Never retry.
    await append({ type: "dispatch", status: "dispatched", model, idempotencyKey: input.idempotencyKey });
    dispatched = true;
    let generated;
    try { generated = await provider.generateFrame(input); }
    catch (error) {
      const result = { ...safeFailure(error, "COMIC_IMAGE_PROVIDER_OUTCOME_UNKNOWN"), model, usage: null };
      await append({ type: "result", ...result });
      return result;
    }
    let image;
    try { image = await normalizeComicImage(generated); }
    catch (error) {
      const result = { ...safeFailure(error, "COMIC_IMAGE_BYTES_INVALID"), model: safeModel(generated.model, settings.apiKey), usage: safeUsage(generated.usage) };
      await append({ type: "result", ...result });
      return result;
    }
    try { await fs.writeFile(path.join(directory, "frame-1.webp"), image.bytes, { flag: "wx", mode: 0o600 }); }
    catch {
      const result = { status: "failed", model: safeModel(generated.model, settings.apiKey), usage: safeUsage(generated.usage), errorCode: "COMIC_SMOKE_OUTPUT_FAILED", outcomeUnknown: false };
      await append({ type: "result", ...result });
      return result;
    }
    const result = { status: "succeeded", model: safeModel(generated.model, settings.apiKey),
      width: image.width, height: image.height, byteLength: image.bytes.length, sha256: hash(image.bytes),
      usage: safeUsage(generated.usage), errorCode: null, outcomeUnknown: false, imageFile: "frame-1.webp" };
    await append({ type: "result", ...result });
    return result;
  } finally { await receipt.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await runComicImageLiveSmoke(parseComicImageSmokeArguments(process.argv.slice(2)));
    console.log(JSON.stringify(result));
    if (result.status !== "succeeded") process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify(safeFailure(error)));
    process.exitCode = 1;
  }
}
