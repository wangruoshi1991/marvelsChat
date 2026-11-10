import assert from "node:assert/strict";
import test from "node:test";

import * as providerModule from "../src/comic-image-provider.js";
const { createComicImageProvider } = providerModule;

const configuration = {
  enabled: true,
  provider: "fixture-image",
  apiBaseUrl: "https://images.example.test/v1",
  apiKey: "test-only-private-credential",
  imageModel: "fixture-model",
  timeoutMs: 100,
};
const input = { prompt: "One selected storyboard frame", selectedImages: [], width: 1024, height: 1024, idempotencyKey: "frame-1" };
const imageResult = () => ({ bytes: Buffer.from("fixture image bytes"), mimeType: "image/png", width: 1024, height: 1024,
  providerRequestId: "fixture-request", model: "fixture-model", usage: null });
const adapter = (generateFrame) => ({ contractVerified: true, allowedHosts: ["images.example.test"], generateFrame });

test("disabled media generation is unavailable before any provider request", async () => {
  let requests = 0;
  const provider = createComicImageProvider({ config: { ...configuration, enabled: false },
    fetchImpl: async () => { requests += 1; }, adapters: { "fixture-image": adapter(async () => { requests += 1; return imageResult(); }) } });
  assert.equal(provider.readiness().configured, false);
  await assert.rejects(provider.generateFrame(input), error => error.details?.code === "COMIC_IMAGE_PROVIDER_UNAVAILABLE");
  assert.equal(requests, 0);
});

test("complete environment settings cannot activate an unverified image protocol", async () => {
  let requests = 0;
  const provider = createComicImageProvider({ config: configuration, fetchImpl: async () => { requests += 1; } });
  assert.deepEqual(provider.readiness(), { configured: false, provider: "fixture-image", missing: [], contractVerified: false });
  await assert.rejects(provider.generateFrame(input), error => error.details?.code === "COMIC_IMAGE_PROVIDER_UNAVAILABLE");
  assert.equal(requests, 0);
});

test("readiness and public failures expose only configuration names and safe errors", async () => {
  const provider = createComicImageProvider({ config: { ...configuration, imageModel: "" } });
  assert.deepEqual(provider.readiness().missing, ["MEDIA_GENERATION_IMAGE_MODEL"]);
  const serializedStatus = JSON.stringify(provider.readiness());
  assert.equal(serializedStatus.includes(configuration.apiKey), false);
  await assert.rejects(provider.generateFrame(input), error => {
    assert.equal(JSON.stringify(error).includes(configuration.apiKey), false);
    assert.equal(String(error).includes(configuration.apiKey), false);
    return error.details.code === "COMIC_IMAGE_PROVIDER_UNAVAILABLE";
  });
});

test("a verified injected adapter is bound to a fixed HTTPS host", async () => {
  for (const apiBaseUrl of ["https://other.example.test/v1", "http://images.example.test/v1", "https://secret@images.example.test/v1", "https://images.example.test/v1?key=secret", "https://images.example.test/v1?", "https://images.example.test/v1#"]) {
    const provider = createComicImageProvider({ config: { ...configuration, apiBaseUrl }, adapters: { "fixture-image": adapter(async () => imageResult()) } });
    assert.equal(provider.readiness().configured, false);
    await assert.rejects(provider.generateFrame(input), error => error.details?.code === "COMIC_IMAGE_PROVIDER_UNAVAILABLE");
  }
});

test("the port returns adapter bytes and keeps unknown provider usage unknown", async () => {
  const provider = createComicImageProvider({ config: configuration, adapters: { "fixture-image": adapter(async (request, context) => {
    assert.equal(request.prompt, input.prompt);
    assert.equal(context.config.apiKey, configuration.apiKey);
    assert.ok(context.signal instanceof AbortSignal);
    return imageResult();
  }) } });
  assert.equal(provider.readiness().configured, true);
  const result = await provider.generateFrame(input);
  assert.deepEqual(result.bytes, Buffer.from("fixture image bytes"));
  assert.equal(result.usage, null);
  assert.equal(result.model, "fixture-model");
});

test("invalid frame inputs fail before dispatch", async () => {
  let dispatched = false;
  const provider = createComicImageProvider({ config: configuration, adapters: { "fixture-image": adapter(async () => { dispatched = true; return imageResult(); }) } });
  for (const change of [{ prompt: "" }, { selectedImages: ["https://outside.example/image.png"] }, { width: 0 }, { height: 4097 }, { idempotencyKey: "" }]) {
    await assert.rejects(provider.generateFrame({ ...input, ...change }), error => error.details?.code === "COMIC_IMAGE_PROVIDER_INVALID_INPUT");
  }
  assert.equal(dispatched, false);
});

test("adapter failures and timeouts become safe unknown outcomes without replay", async () => {
  for (const generateFrame of [async () => { throw new Error(`remote body ${configuration.apiKey}`); }, () => new Promise(() => {})]) {
    let attempts = 0;
    const provider = createComicImageProvider({ config: { ...configuration, timeoutMs: 10 }, adapters: { "fixture-image": adapter(async (...args) => { attempts += 1; return generateFrame(...args); }) } });
    await assert.rejects(provider.generateFrame(input), error => {
      assert.equal(error.outcomeUnknown, true);
      assert.equal(String(error).includes(configuration.apiKey), false);
      return error.details?.code === "COMIC_IMAGE_PROVIDER_OUTCOME_UNKNOWN";
    });
    assert.equal(attempts, 1);
  }
});

test("only typed verified adapter rejections become deterministic safe failures", async () => {
  assert.equal(typeof providerModule.ComicImageProviderRejection, "function");
  for (const code of ["COMIC_IMAGE_PROVIDER_REJECTED", "COMIC_IMAGE_PROVIDER_RATE_LIMITED", "COMIC_IMAGE_PROVIDER_AUTH_FAILED", "COMIC_IMAGE_PROVIDER_CONTENT_REJECTED"]) {
    const provider = createComicImageProvider({ config: configuration, adapters: { "fixture-image": adapter(async () => { throw new providerModule.ComicImageProviderRejection(code); }) } });
    await assert.rejects(provider.generateFrame(input), error => {
      assert.equal(error.outcomeUnknown, false);
      assert.equal(error.details.code, code);
      assert.equal(String(error).includes(configuration.apiKey), false);
      return true;
    });
  }
  assert.throws(() => new providerModule.ComicImageProviderRejection(configuration.apiKey), error => !String(error).includes(configuration.apiKey));
});

test("malformed typed adapter errors cannot bypass the safe rejection allowlist", async () => {
  const forged = Object.create(providerModule.ComicImageProviderRejection.prototype);
  forged.code = configuration.apiKey;
  const provider = createComicImageProvider({ config: configuration, adapters: { "fixture-image": adapter(async () => { throw forged; }) } });
  await assert.rejects(provider.generateFrame(input), error => {
    assert.equal(JSON.stringify(error).includes(configuration.apiKey), false);
    return error.details?.code === "COMIC_IMAGE_PROVIDER_OUTCOME_UNKNOWN" && error.outcomeUnknown === true;
  });
  const rejected = new providerModule.ComicImageProviderRejection("COMIC_IMAGE_PROVIDER_REJECTED");
  assert.throws(() => { rejected.code = configuration.apiKey; }, TypeError);
});

test("provider result metadata and usage reject raw response text, secrets and control characters", async () => {
  for (const result of [
    { ...imageResult(), usage: { raw: configuration.apiKey } },
    { ...imageResult(), usage: { images: "1" } },
    { ...imageResult(), usage: { totalTokens: -1 } },
    { ...imageResult(), usage: { totalTokens: Number.MAX_SAFE_INTEGER + 1 } },
    { ...imageResult(), model: "model\nforged-log" },
    { ...imageResult(), providerRequestId: "request\u0000id" },
    { ...imageResult(), model: configuration.apiKey },
    { ...imageResult(), providerRequestId: configuration.apiKey },
  ]) {
    const provider = createComicImageProvider({ config: configuration, adapters: { "fixture-image": adapter(async () => result) } });
    await assert.rejects(provider.generateFrame(input), error => {
      assert.equal(JSON.stringify(error).includes(configuration.apiKey), false);
      return error.details.code === "COMIC_IMAGE_PROVIDER_INVALID_RESPONSE";
    });
  }
  const provider = createComicImageProvider({ config: configuration, adapters: { "fixture-image": adapter(async () => ({ ...imageResult(), usage: { images: 1, inputTokens: 17, outputTokens: 0, totalTokens: 17 } })) } });
  assert.deepEqual((await provider.generateFrame(input)).usage, { images: 1, inputTokens: 17, outputTokens: 0, totalTokens: 17 });
});

test("malformed or oversized responses are rejected without returning provider bodies", async () => {
  for (const [result, code] of [[{ ...imageResult(), bytes: Buffer.alloc(16 * 1024 * 1024 + 1) }, "COMIC_IMAGE_PROVIDER_RESPONSE_TOO_LARGE"],
    [{ ...imageResult(), mimeType: "text/html" }, "COMIC_IMAGE_PROVIDER_INVALID_RESPONSE"], [{ ...imageResult(), bytes: Buffer.alloc(0) }, "COMIC_IMAGE_PROVIDER_INVALID_RESPONSE"]]) {
    const provider = createComicImageProvider({ config: configuration, adapters: { "fixture-image": adapter(async () => result) } });
    await assert.rejects(provider.generateFrame(input), error => error.details?.code === code);
  }
});
