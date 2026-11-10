import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadComicLiveEnvironment, createComicLiveRequester, parseComicLiveArguments, comicLiveProductBody } from '../scripts/comic-render-live-e2e.js';

const settings = {
  DATABASE_URL: 'postgresql://test:private@127.0.0.1:5432/comic_live_migration_test',
  NEW_API_BASE_URL: 'https://text.example.test/v1', NEW_API_KEY: 'private-text', NEW_API_MODEL: 'test-text-model',
  MEDIA_GENERATION_ENABLED: 'true', MEDIA_GENERATION_PROVIDER: 'cicadas-openai-images', MEDIA_GENERATION_API_BASE_URL: 'https://api.cicadas.top/v1',
  MEDIA_GENERATION_API_KEY: 'private-image', MEDIA_GENERATION_IMAGE_MODEL: 'gpt-image-2',
  OSS_BUCKET: 'isolated-test', OSS_ENDPOINT: 'oss.example.test', OSS_ACCESS_KEY_ID: 'private-oss-id', OSS_ACCESS_KEY_SECRET: 'private-oss-secret',
};
const withFile = async (body, work) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-live-safety-'));
  const file = path.join(dir, 'test.env');
  await fs.writeFile(file, Object.entries(body).map(([key, value]) => `${key}=${value}`).join('\n'), { mode: 0o600 });
  try { await work(file, dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
};

test('live comic harness accepts only an explicit restricted config and loopback disposable database', async () => {
  await withFile(settings, async file => {
    const environment = await loadComicLiveEnvironment(file);
    assert.equal(environment.DATABASE_URL, settings.DATABASE_URL);
    assert.equal(environment.MEDIA_GENERATION_API_KEY, settings.MEDIA_GENERATION_API_KEY);
    assert.equal(environment.MIAOXUN_DOTENV_ENABLED, 'false');
    assert.equal(environment.CREATE_FIRST_USER_AS_ADMIN, 'false');
    assert.equal(environment.MEDIA_RETRIEVAL_ENABLED, 'false');
  });
});

test('live comic harness refuses production names, remote hosts and incomplete credentials before network', async () => {
  for (const change of [{ DATABASE_URL: 'postgresql://test@127.0.0.1/marvels_chat' },
    { DATABASE_URL: 'postgresql://test@8.153.167.11/comic_migration_test' },
    { MEDIA_GENERATION_API_KEY: '' }, { OSS_ACCESS_KEY_SECRET: '' }, { MEDIA_GENERATION_ENABLED: 'false' }]) {
    await withFile({ ...settings, ...change }, file => assert.rejects(loadComicLiveEnvironment(file), error => {
      assert.equal(String(error).includes('private-'), false);
      return error.code === 'COMIC_E2E_CONFIGURATION_INVALID';
    }));
  }
});

test('secret permissions and symlinks are rejected without echoing contents', async () => {
  await withFile(settings, async (file, dir) => {
    await fs.chmod(file, 0o644);
    await assert.rejects(loadComicLiveEnvironment(file), { code: 'COMIC_E2E_SECRET_FILE_INVALID' });
    await fs.chmod(file, 0o600);
    const link = path.join(dir, 'linked.env'); await fs.symlink(file, link);
    await assert.rejects(loadComicLiveEnvironment(link), { code: 'COMIC_E2E_SECRET_FILE_INVALID' });
  });
});

test('CLI rejects inline credentials, unknown flags and missing required arguments', () => {
  assert.deepEqual(parseComicLiveArguments(['--config-file', '/private/test.env', '--output-dir', '/new/output']), { configFile: '/private/test.env', outputDir: '/new/output' });
  for (const args of [[], ['--key', 'private-key'], ['--config-file', '/test.env'], ['--config-file', '/test.env', '--output-dir', '/out', '--key', 'private-key']]) {
    assert.throws(() => parseComicLiveArguments(args), { code: 'COMIC_E2E_ARGUMENTS_INVALID' });
  }
});

test('HTTP helper refuses external destinations and never retries or leaks error bodies', async () => {
  assert.throws(() => createComicLiveRequester('https://external.example.test'), { code: 'COMIC_E2E_CONFIGURATION_INVALID' });
  let calls = 0;
  const request = createComicLiveRequester('http://127.0.0.1:43123', async (_url, options) => {
    calls++; assert.equal(options.redirect, 'manual');
    return new Response(JSON.stringify({ error: { message: 'private-key private-password' } }), { status: 503 });
  });
  await assert.rejects(request('/api/station/comic-diaries', { method: 'POST', body: { prompt: 'public' }, status: 201 }), error => {
    assert.equal(String(error).includes('private-'), false);
    return error.code === 'COMIC_E2E_HTTP_OUTCOME_UNKNOWN';
  });
  assert.equal(calls, 1);
  await assert.rejects(request('https://external.example.test'), { code: 'COMIC_E2E_ARGUMENTS_INVALID' });
  assert.equal(calls, 1);
});

test('timed out mutation responses remain unknown and are never replayed', async () => {
  let calls = 0;
  const request = createComicLiveRequester('http://127.0.0.1:43123', async () => { calls++; throw new Error('private-transport-error'); });
  await assert.rejects(request('/api/station/comic-diaries', { method: 'POST', body: { prompt: 'public' } }), { code: 'COMIC_E2E_HTTP_OUTCOME_UNKNOWN' });
  assert.equal(calls, 1);
});

test('successful authenticated helper returns only data and honors expected rejection status', async () => {
  const request = createComicLiveRequester('http://localhost:43123', async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer private-test-token');
    return new Response(JSON.stringify({ data: { accepted: true } }), { status: 404 });
  });
  assert.deepEqual(await request('/api/example', { token: 'private-test-token', status: 404 }), { accepted: true });
});

test('product presentation is consistent with its exact identity contract', () => {
  const body = comicLiveProductBody({ suffix: 'safe123', identity: { displayName: 'Agent name', description: 'Agent description' },
    release: { agentKey: 'comic-diary', id: 'release-id', version: '0.1.4', declaredScopes: ['media:image:generate'] } });
  assert.equal(body.identity.displayName, body.displayName);
  assert.equal(body.identity.description, body.description);
  assert.equal(body.identity.key, body.productKey);
});

test('unexpected HTTP response diagnostics expose only method, route template, status and allowlisted API code', async () => {
  const request = createComicLiveRequester('http://127.0.0.1:43123', async () => new Response(JSON.stringify({ error: {
    message: 'private-key private-password', code: 'PRODUCT_IDENTITY_MISMATCH', details: { secret: 'private-key' },
  } }), { status: 422 }));
  await assert.rejects(request('/api/admin/products/00112233-4455-6677-8899-aabbccddeeff/publish', { method: 'POST', status: 200 }), error => {
    assert.deepEqual(error.diagnostic, { method: 'POST', route: '/api/admin/products/:id/publish', httpStatus: 422, apiCode: 'PRODUCT_IDENTITY_MISMATCH' });
    assert.equal(JSON.stringify(error).includes('private-'), false);
    return true;
  });
});
