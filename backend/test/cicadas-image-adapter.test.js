import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { createComicImageProvider } from '../src/comic-image-provider.js';

const config = { enabled: true, provider: 'cicadas-openai-images', apiBaseUrl: 'https://api.cicadas.top/v1',
  apiKey: 'private-test-credential', imageModel: 'gpt-image-2', timeoutMs: 1000 };
const input = { prompt: 'A public synthetic comic', selectedImages: [], width: 1024, height: 1024, idempotencyKey: 'task:1' };
const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#f0bc50' } }).png().toBuffer();
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-request-id': 'request-123' } });
const success = () => response({ data: [{ b64_json: png.toString('base64') }], usage: { input_tokens: 13, output_tokens: 21, total_tokens: 34 } });

test('registered Cicadas adapter sends one documented generation and decodes its real image format', async () => {
  let calls = 0;
  const provider = createComicImageProvider({ config, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.cicadas.top/v1/images/generations');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, `Bearer ${config.apiKey}`);
    assert.deepEqual(JSON.parse(options.body), { model: 'gpt-image-2', prompt: input.prompt, size: '1024x1024', n: 1, response_format: 'b64_json' });
    return success();
  } });
  assert.equal(provider.readiness().configured, true);
  const result = await provider.generateFrame(input);
  assert.equal(calls, 1);
  assert.deepEqual(result.bytes, png);
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.width, 16);
  assert.equal(result.height, 16);
  assert.equal(result.providerRequestId, 'request-123');
  assert.deepEqual(result.usage, { images: 1, inputTokens: 13, outputTokens: 21, totalTokens: 34 });
});

test('Cicadas uses multipart edits for explicit reference bytes, never remote image URLs', async () => {
  const provider = createComicImageProvider({ config, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.cicadas.top/v1/images/edits');
    assert.ok(options.body instanceof FormData);
    assert.equal(options.headers['Content-Type'], undefined);
    assert.equal(options.body.get('response_format'), 'b64_json');
    assert.equal(options.body.get('model'), config.imageModel);
    const images = options.body.getAll('image[]');
    assert.equal(images.length, 2);
    assert.deepEqual(Buffer.from(await images[0].arrayBuffer()), png);
    return success();
  } });
  await provider.generateFrame({ ...input, selectedImages: [{ bytes: png, mimeType: 'image/png' }, { bytes: png, mimeType: 'image/png' }] });
});

test('unverified Cicadas bases and models fail readiness before dispatch', async () => {
  for (const change of [{ apiBaseUrl: 'https://api.cicadas.top/other' }, { apiBaseUrl: 'https://evil.test/v1' }, { imageModel: 'unknown-image' }]) {
    const provider = createComicImageProvider({ config: { ...config, ...change }, fetchImpl: () => assert.fail('must not dispatch') });
    assert.equal(provider.readiness().configured, false);
    await assert.rejects(provider.generateFrame(input), e => e.details.code === 'COMIC_IMAGE_PROVIDER_UNAVAILABLE');
  }
});

test('Cicadas maps only explicit authentication and rate rejections; upstream 5xx stays unknown without retry', async () => {
  for (const [status, code, unknown] of [[401, 'COMIC_IMAGE_PROVIDER_AUTH_FAILED', false], [403, 'COMIC_IMAGE_PROVIDER_AUTH_FAILED', false],
    [429, 'COMIC_IMAGE_PROVIDER_RATE_LIMITED', false], [400, 'COMIC_IMAGE_PROVIDER_REJECTED', false], [500, 'COMIC_IMAGE_PROVIDER_OUTCOME_UNKNOWN', true]]) {
    let calls = 0;
    const provider = createComicImageProvider({ config, fetchImpl: async () => { calls++; return response({ error: { message: config.apiKey } }, status); } });
    await assert.rejects(provider.generateFrame(input), e => {
      assert.equal(e.outcomeUnknown, unknown);
      assert.equal(JSON.stringify(e).includes(config.apiKey), false);
      return e.details.code === code;
    });
    assert.equal(calls, 1);
  }
});

test('malformed images, URLs, multiple outputs, redirects and oversized bodies are never accepted or downloaded', async () => {
  for (const makeResponse of [
    () => response({ data: [{ url: 'https://elsewhere.test/image?secret=1' }] }),
    () => response({ data: [{ b64_json: 'not base64' }] }),
    () => response({ data: [{ b64_json: Buffer.from('not an image').toString('base64') }] }),
    () => response({ data: [{ b64_json: png.toString('base64') }, { b64_json: png.toString('base64') }] }),
    () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.test' } }),
    () => new Response('{}', { headers: { 'content-length': String(33 * 1024 * 1024) } }),
  ]) {
    let calls = 0;
    const provider = createComicImageProvider({ config, fetchImpl: async () => { calls++; return makeResponse(); } });
    await assert.rejects(provider.generateFrame(input), e => e.outcomeUnknown === true);
    assert.equal(calls, 1);
  }
});

test('unsupported dimensions fail before a remote request and unknown usage remains unknown', async () => {
  let calls = 0;
  const provider = createComicImageProvider({ config, fetchImpl: async () => { calls++; return response({ data: [{ b64_json: png.toString('base64') }] }); } });
  await assert.rejects(provider.generateFrame({ ...input, width: 100 }), e => e.details.code === 'COMIC_IMAGE_PROVIDER_REJECTED');
  assert.equal(calls, 0);
  assert.equal((await provider.generateFrame(input)).usage, null);
});

test('large valid base64 image responses stay within the advertised 16MiB image contract', async () => {
  const pixels = Buffer.alloc(1600 * 1600 * 3);
  let seed = 123456789;
  for (let i = 0; i < pixels.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; pixels[i] = seed & 255; }
  const largeImage = await sharp(pixels, { raw: { width: 1600, height: 1600, channels: 3 } }).png().toBuffer();
  assert.ok(largeImage.length > 6 * 1024 * 1024);
  const provider = createComicImageProvider({ config: { ...config, timeoutMs: 5000 }, fetchImpl: async () => response({ data: [{ b64_json: largeImage.toString('base64') }] }) });
  assert.equal((await provider.generateFrame(input)).bytes.length, largeImage.length);
});
