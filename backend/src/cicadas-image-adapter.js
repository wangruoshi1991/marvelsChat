import sharp from 'sharp';
import { ComicImageProviderRejection } from './comic-image-provider-errors.js';

const maximumBytes = 16 * 1024 * 1024;
const maximumResponseBytes = 24 * 1024 * 1024;
// Only this model and these two paths have been exercised with the intended
// media credential. Catalog aliases are not assumed to share their contract.
const baseUrl = 'https://api.cicadas.top/v1';
const model = 'gpt-image-2';
const malformed = () => new Error('Unverified image response.');

async function readResponse(response) {
  if (Number(response.headers.get('content-length')) > maximumResponseBytes
    || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    await response.body?.cancel().catch(() => {});
    throw malformed();
  }
  const reader = response.body?.getReader();
  if (!reader) throw malformed();
  const chunks = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumResponseBytes) throw malformed();
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function parseUsage(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw malformed();
  const usage = { images: 1 };
  let reported = false;
  for (const [source, target] of [['input_tokens', 'inputTokens'], ['output_tokens', 'outputTokens'], ['total_tokens', 'totalTokens']]) {
    if (!Object.hasOwn(value, source)) continue;
    if (!Number.isSafeInteger(value[source]) || value[source] < 0) throw malformed();
    usage[target] = value[source]; reported = true;
  }
  return reported ? usage : null;
}

export const cicadasImageAdapter = Object.freeze({
  contractVerified: true,
  allowedHosts: Object.freeze(['api.cicadas.top']),
  configurationIssues(config) {
    return [config.apiBaseUrl !== baseUrl && 'MEDIA_GENERATION_API_BASE_URL', config.imageModel !== model && 'MEDIA_GENERATION_IMAGE_MODEL'].filter(Boolean);
  },
  async generateFrame(input, { config, fetchImpl }) {
    // Other aspect ratios have not been verified; reject before dispatch.
    if (input.width !== 1024 || input.height !== 1024) throw new ComicImageProviderRejection('COMIC_IMAGE_PROVIDER_REJECTED');
    let body;
    const headers = { Authorization: `Bearer ${config.apiKey}` };
    let endpoint = '/images/generations';
    if (input.selectedImages.length) {
      endpoint = '/images/edits';
      body = new FormData();
      for (const [key, value] of Object.entries({ model, prompt: input.prompt, size: '1024x1024', n: '1', response_format: 'b64_json' })) body.set(key, value);
      for (const [index, image] of input.selectedImages.entries()) {
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[image.mimeType];
        body.append('image[]', new Blob([image.bytes], { type: image.mimeType }), `reference-${index + 1}.${extension}`);
      }
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ model, prompt: input.prompt, size: '1024x1024', n: 1, response_format: 'b64_json' });
    }
    // No retry or undocumented idempotency guarantee. Task claims prevent
    // automatic replay; the caller's request id is local bookkeeping only.
    const response = await fetchImpl(`${config.apiBaseUrl}${endpoint}`, { method: 'POST', headers, body });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if ([401, 403].includes(response.status)) throw new ComicImageProviderRejection('COMIC_IMAGE_PROVIDER_AUTH_FAILED');
      if (response.status === 429) throw new ComicImageProviderRejection('COMIC_IMAGE_PROVIDER_RATE_LIMITED');
      if ([400, 422].includes(response.status)) throw new ComicImageProviderRejection('COMIC_IMAGE_PROVIDER_REJECTED');
      throw malformed();
    }
    const payload = await readResponse(response);
    if (!Array.isArray(payload?.data) || payload.data.length !== 1) throw malformed();
    const encoded = payload.data[0]?.b64_json;
    if (typeof encoded !== 'string' || encoded.length > 4 * Math.ceil(maximumBytes / 3)
      || !encoded.length || encoded.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(encoded)) throw malformed();
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length || bytes.length > maximumBytes || bytes.toString('base64') !== encoded) throw malformed();
    const metadata = await sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' }).metadata();
    const mimeType = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[metadata.format];
    if (!mimeType || (metadata.pages || 1) !== 1) throw malformed();
    return { bytes, mimeType, width: metadata.width, height: metadata.height,
      providerRequestId: response.headers.get('x-request-id') || null, model, usage: parseUsage(payload.usage) };
  },
});
