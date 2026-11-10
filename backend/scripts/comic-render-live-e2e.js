#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'dotenv';
import pg from 'pg';
import sharp from 'sharp';

process.env.MIAOXUN_DOTENV_ENABLED = 'false';
const failure = code => Object.assign(new Error('Comic live verification stopped; inspect its safe code.'), { code });
const safeKeys = new Set(['PATH', 'HOME', 'TMPDIR', 'USERPROFILE', 'SYSTEMROOT']);
const required = ['DATABASE_URL', 'NEW_API_BASE_URL', 'NEW_API_KEY', 'NEW_API_MODEL',
  'MEDIA_GENERATION_ENABLED', 'MEDIA_GENERATION_PROVIDER', 'MEDIA_GENERATION_API_BASE_URL', 'MEDIA_GENERATION_API_KEY', 'MEDIA_GENERATION_IMAGE_MODEL',
  'OSS_BUCKET', 'OSS_ENDPOINT', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET'];
const optional = ['NEW_API_PLANNING_MODEL', 'NEW_API_TIMEOUT_MS', 'NEW_API_WORKSPACE_TIMEOUT_MS', 'MEDIA_GENERATION_TIMEOUT_MS', 'OSS_REGION', 'OSS_INTERNAL_ENDPOINT', 'OSS_TIMEOUT_MS'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const apiCodes = new Set(['PRODUCT_IDENTITY_MISMATCH', 'PRODUCT_IDENTITY_INCOMPLETE', 'IDENTITY_INCOMPLETE', 'IDENTITY_KEY_MISMATCH',
  'PRODUCT_CONTRACT_STALE', 'PRODUCT_DEPENDENCIES_REQUIRED', 'PRODUCT_NOT_FOUND', 'PRODUCT_CONSENT_REQUIRED', 'SCOPES_MISMATCH',
  'AGENT_NOT_READY', 'AGENT_DEPENDENCY_NOT_READY', 'AGENT_DEPENDENCY_REGISTRY_STALE', 'AGENT_DEPENDENCY_UNAVAILABLE', 'REGISTRY_VERSION_STALE',
  'REGISTRY_SCOPES_STALE', 'RELEASE_CONTRACT_EXISTS', 'RELEASE_CONTRACT_STALE', 'AI_ACCESS_REVOKED', 'AGENT_PRODUCT_ENTITLEMENT_REQUIRED',
  'COMIC_RENDER_NOT_READY', 'COMIC_RENDER_SOURCE_CHANGED', 'COMIC_DIARY_SOURCE_CHANGED', 'COMIC_DIARY_SCOPE_REQUIRED',
  'COMIC_RENDER_CLIENT_UPDATE_REQUIRED', 'COMIC_RENDER_IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'SCOPES_INCOMPLETE', 'IDENTITY_INCOMPLETE']);
const routeTemplate = route => route.split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');
async function readSafeApiCode(response) {
  if (Number(response.headers.get('content-length')) > 65536) { await response.body?.cancel().catch(() => {}); return null; }
  const reader = response.body?.getReader();
  if (!reader) return null;
  try {
    const chunks = []; let size = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 65536) return null; chunks.push(Buffer.from(value));
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const candidate = payload?.error?.details?.code || payload?.error?.code;
    return apiCodes.has(candidate) ? candidate : null;
  } catch { return null; }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function parseComicLiveArguments(args) {
  const result = {}, names = { '--config-file': 'configFile', '--output-dir': 'outputDir' };
  for (let index = 0; index < args.length; index += 2) {
    const name = names[args[index]], value = args[index + 1];
    if (!name || Object.hasOwn(result, name) || !value || value.startsWith('--')) throw failure('COMIC_E2E_ARGUMENTS_INVALID');
    result[name] = value;
  }
  if (!result.configFile || !result.outputDir) throw failure('COMIC_E2E_ARGUMENTS_INVALID');
  return result;
}

export async function loadComicLiveEnvironment(filename) {
  let handle, values;
  try {
    handle = await fs.open(path.resolve(filename), constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await handle.stat();
    if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600 || metadata.size > 65536 || metadata.size < 1
      || (typeof process.getuid === 'function' && metadata.uid !== process.getuid())) throw failure('COMIC_E2E_SECRET_FILE_INVALID');
    values = parse(await handle.readFile());
  } catch { throw failure('COMIC_E2E_SECRET_FILE_INVALID'); }
  finally { await handle?.close(); }
  try {
    if (required.some(key => !values[key]?.trim())) throw failure('COMIC_E2E_CONFIGURATION_INVALID');
    const url = new URL(values.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || !/^\/[a-zA-Z0-9_]+_migration_test$/.test(url.pathname) || url.search || url.hash) throw failure('COMIC_E2E_CONFIGURATION_INVALID');
    if (values.MEDIA_GENERATION_ENABLED !== 'true' || values.MEDIA_GENERATION_PROVIDER !== 'cicadas-openai-images'
      || values.MEDIA_GENERATION_API_BASE_URL !== 'https://api.cicadas.top/v1' || values.MEDIA_GENERATION_IMAGE_MODEL !== 'gpt-image-2') throw failure('COMIC_E2E_CONFIGURATION_INVALID');
    const text = new URL(values.NEW_API_BASE_URL);
    if (text.protocol !== 'https:' || text.username || text.password || text.search || text.hash) throw failure('COMIC_E2E_CONFIGURATION_INVALID');
  } catch { throw failure('COMIC_E2E_CONFIGURATION_INVALID'); }
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => safeKeys.has(key))),
    ...Object.fromEntries([...required, ...optional].filter(key => values[key] !== undefined).map(key => [key, values[key]])),
    MIAOXUN_DOTENV_ENABLED: 'false', NODE_ENV: 'test', HOST: '127.0.0.1', DEFAULT_ADMIN_ENABLED: 'false',
    CREATE_FIRST_USER_AS_ADMIN: 'false', ADMIN_EMAILS: '', MEDIA_RETRIEVAL_ENABLED: 'false', MEDIA_RETRIEVAL_PROVIDER_CALLS_ENABLED: 'false',
    AVATAR_3D_ENABLED: 'false', AVATAR_3D_PROVIDER_CALLS_ENABLED: 'false',
    NEW_API_TIMEOUT_MS: values.NEW_API_TIMEOUT_MS || '180000', MEDIA_GENERATION_TIMEOUT_MS: values.MEDIA_GENERATION_TIMEOUT_MS || '300000',
  };
}

export function createComicLiveRequester(baseUrl, fetchImpl = fetch) {
  let origin;
  try {
    origin = new URL(baseUrl);
    if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
      || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw failure('COMIC_E2E_CONFIGURATION_INVALID');
  } catch { throw failure('COMIC_E2E_CONFIGURATION_INVALID'); }
  return async (route, { method = 'GET', token, body, status = 200, headers = {}, timeoutMs = 20000, binary = false } = {}) => {
    if (!route.startsWith('/api/') || route.startsWith('//')) throw failure('COMIC_E2E_ARGUMENTS_INVALID');
    let response;
    try {
      response = await fetchImpl(`${origin.origin}${route}`, { method, redirect: 'manual',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(timeoutMs) });
      if (response.status !== status) {
        const apiCode = await readSafeApiCode(response);
        throw Object.assign(failure(response.status >= 500 && method !== 'GET' ? 'COMIC_E2E_HTTP_OUTCOME_UNKNOWN' : 'COMIC_E2E_HTTP_UNEXPECTED'), {
          diagnostic: { method, route: routeTemplate(route), httpStatus: response.status, apiCode },
        });
      }
      if (status === 204) return null;
      if (binary) {
        if (Number(response.headers.get('content-length')) > 16 * 1024 * 1024) throw failure('COMIC_E2E_IMAGE_INVALID');
        const chunks = []; let size = 0;
        for await (const chunk of response.body) { size += chunk.length; if (size > 16 * 1024 * 1024) throw failure('COMIC_E2E_IMAGE_INVALID'); chunks.push(chunk); }
        return { bytes: Buffer.concat(chunks), mimeType: response.headers.get('content-type'), cacheControl: response.headers.get('cache-control') };
      }
      const payload = await response.json(); return payload?.data ?? payload;
    } catch (error) {
      const safe = failure(error?.code?.startsWith('COMIC_E2E_') ? error.code : 'COMIC_E2E_HTTP_OUTCOME_UNKNOWN');
      if (error?.diagnostic) safe.diagnostic = error.diagnostic;
      throw safe;
    }
  };
}

export function comicLiveProductBody({ suffix, identity, release }) {
  const displayName = '隔离漫画验收产品', description = '仅本机隔离测试使用', productKey = `comic-live-${suffix}`;
  return { productKey, version: '0.1.4', displayName, description,
    identity: { ...identity, key: productKey, displayName, description }, supportedPlatforms: ['ios', 'android'],
    dependencies: [{ agentKey: release.agentKey, agentReleaseId: release.id, version: release.version, scopes: release.declaredScopes }], status: 'draft' };
}

async function freePort() {
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); return port;
}

function childProcess(args, env) {
  const child = spawn(process.execPath, args, { cwd: fileURLToPath(new URL('..', import.meta.url)), env, stdio: ['ignore', 'pipe', 'pipe'] });
  // Raw logs can contain external error text. Drain, do not print or persist.
  for (const stream of [child.stdout, child.stderr]) stream.on('data', () => {});
  child.on('error', () => {});
  return child;
}
async function waitExit(child, milliseconds = 90000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  let timeout;
  try { await Promise.race([once(child, 'exit'), new Promise(resolve => { timeout = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, milliseconds); })]); }
  finally { clearTimeout(timeout); }
}
async function stop(child) { if (child && child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await waitExit(child); } }

export async function runComicRenderLiveE2E({ configFile, outputDir }) {
  const environment = await loadComicLiveEnvironment(configFile);
  const database = new pg.Client({ connectionString: environment.DATABASE_URL });
  await database.connect();
  let directory, receipt, backend, worker, request, account, peer, admin, product, release;
  let phase = 'database_preflight', outcome, cleanupComplete;
  const password = `Comic-${crypto.randomBytes(24).toString('hex')}-9a`;
  const suffix = crypto.randomBytes(8).toString('hex');
  const login = `comic-live-admin-${suffix}`;
  const record = async value => { await receipt.writeFile(`${JSON.stringify({ at: new Date().toISOString(), ...value })}\n`); await receipt.sync(); };
  try {
    const state = (await database.query('SELECT current_database() AS name, (SELECT count(*)::int FROM users) AS users')).rows[0];
    if (!state.name.endsWith('_migration_test') || state.users !== 0) throw failure('COMIC_E2E_DATABASE_NOT_EMPTY');
    const migration = (await database.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0];
    if (migration.count !== 58) throw failure('COMIC_E2E_MIGRATIONS_REQUIRED');
    directory = path.resolve(outputDir); await fs.mkdir(directory, { mode: 0o700 });
    receipt = await fs.open(path.join(directory, 'receipt.jsonl'), 'wx', 0o600);
    await record({ type: 'run_start', version: 1, syntheticOnly: true, realProvider: true, plannedFrames: 2, retries: 0 });
    const env = { ...environment, PORT: String(await freePort()), MIAOXUN_AGENT_AVATAR_ROOT: path.join(directory, 'avatars'), MIAOXUN_LOCAL_MEDIA_ROOT: path.join(directory, 'local-media') };
    phase = 'admin_bootstrap';
    const bootstrap = childProcess(['scripts/admin-bootstrap.js'], { ...env, DEFAULT_ADMIN_ENABLED: 'true', DEFAULT_ADMIN_LOGIN: login,
      DEFAULT_ADMIN_EMAIL: `${login}@example.invalid`, DEFAULT_ADMIN_DISPLAY_NAME: '隔离漫画验收管理员', DEFAULT_ADMIN_PASSWORD: password });
    await waitExit(bootstrap, 30000); if (bootstrap.exitCode !== 0) throw failure('COMIC_E2E_BOOTSTRAP_FAILED');
    backend = childProcess(['src/server.js'], env); worker = childProcess(['src/ai-task-worker.js'], env);
    request = createComicLiveRequester(`http://127.0.0.1:${env.PORT}`);
    phase = 'runtime_readiness';
    let healthy = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (backend.exitCode !== null || worker.exitCode !== null) throw failure('COMIC_E2E_PROCESS_FAILED');
      try { healthy = (await request('/api/ready')).ok === true; } catch { /* listener startup only */ }
      if (healthy) break; await pause(100);
    }
    if (!healthy) throw failure('COMIC_E2E_RUNTIME_NOT_READY');
    admin = await request('/api/auth/login', { method: 'POST', body: { identifier: login, password } });
    const token = admin.session.token;
    let code;
    for (let attempt = 0; attempt < 45; attempt++) {
      code = (await request('/api/admin/agent-registry', { token })).agents.find(agent => agent.key === 'comic-diary');
      if (code?.readiness?.ready) break; await pause(1000);
    }
    if (!code?.readiness?.ready || code.version !== '0.1.4') throw failure('COMIC_E2E_RUNTIME_NOT_READY');
    phase = 'publication';
    const identity = { ...code.identity, displayName: '隔离漫画验收Agent', published: false, source: 'comic-live-verification', updatedAt: new Date().toISOString() };
    const mutate = (route, body, key, status = 200) => request(route, { method: 'POST', token, body, headers: { 'Idempotency-Key': `comic-live-${suffix}-${key}` }, status });
    release = await mutate('/api/admin/agent-releases', { agentKey: 'comic-diary', identity }, 'release-create', 201);
    await mutate(`/api/admin/agent-releases/${release.id}/review`, undefined, 'release-review');
    await mutate(`/api/admin/agent-releases/${release.id}/publish`, undefined, 'release-publish');
    product = await mutate('/api/admin/products', comicLiveProductBody({ suffix, identity, release }), 'product-create', 201);
    await mutate(`/api/admin/products/${product.id}/submit`, { productVersionId: product.productVersionId }, 'product-review');
    await mutate(`/api/admin/products/${product.id}/publish`, { productVersionId: product.productVersionId }, 'product-publish');
    await record({ type: 'publication_verified', releaseId: release.id, productId: product.id, scopes: release.declaredScopes });
    phase = 'test_user_consent';
    const register = name => request('/api/auth/register', { method: 'POST', status: 201,
      body: { contactType: 'email', email: `${name}-${suffix}@example.invalid`, displayName: `${name}-${suffix}`, password } });
    account = await register('comic-live-owner'); peer = await register('comic-live-peer');
    await request(`/api/me/products/${product.id}/enable`, { method: 'POST', token: account.session.token, status: 201,
      headers: { 'Idempotency-Key': `comic-live-${suffix}-consent` }, body: { consent: true, consentVersion: 'comic-live-v1', productVersionId: product.productVersionId, grantedScopes: release.declaredScopes } });
    const bootstrapUser = await request('/api/app/bootstrap', { token: account.session.token });
    assert.equal(bootstrapUser.contracts?.comicRenders, 1);
    phase = 'storyboard_generation';
    // This intent is persisted before a real text-model call. Do not retry.
    await record({ type: 'dispatch', operation: 'storyboard', requestedFrames: 2, retryCount: 0 });
    const diary = await request('/api/station/comic-diaries', { method: 'POST', token: account.session.token, status: 201, timeoutMs: 200000,
      body: { prompt: '虚构公开故事：一只戴蓝围巾的橘猫在晴天窗台发现种子，种进陶土盆；第二格它欣赏长成的向日葵。保持同一角色和暖色水彩风格，不要文字或气泡。', frameCount: 2, style: 'cute', mediaAssetIds: [], fileAssetIds: [] } });
    assert.equal(diary.frames.length, 2);
    await record({ type: 'storyboard_saved', comicDiaryId: diary.id, frames: diary.frames.length });
    phase = 'image_generation';
    const comicHeaders = { 'X-Miaoxun-Comic-Renders': '1' };
    await record({ type: 'dispatch', operation: 'comic_render', requestedFrames: 2, retryCount: 0 });
    const submission = await request(`/api/station/comic-diaries/${diary.id}/render-tasks`, { method: 'POST', token: account.session.token,
      status: 201, headers: comicHeaders, body: { idempotencyKey: `comic-live-${suffix}-render` } });
    let task = submission;
    for (let attempt = 0; attempt < 320; attempt++) {
      task = await request(`/api/station/comic-render-tasks/${submission.id}`, { token: account.session.token, headers: comicHeaders });
      if (!['queued', 'running'].includes(task.status)) break; await pause(2000);
    }
    await record({ type: 'task_terminal', taskId: task.id, status: task.status, progress: task.progress });
    if (task.status !== 'succeeded' || task.progress.succeeded !== 2) throw failure('COMIC_E2E_IMAGE_TASK_FAILED');
    const serializedTask = JSON.stringify(task);
    for (const secret of [environment.NEW_API_KEY, environment.MEDIA_GENERATION_API_KEY, environment.OSS_ACCESS_KEY_ID, environment.OSS_ACCESS_KEY_SECRET]) {
      assert.equal(serializedTask.includes(secret), false);
    }
    for (const field of ['providerMetadata', 'providerRequestId', 'storageKey', 'storage_key']) assert.equal(serializedTask.includes(field), false);
    const events = await request(`/api/station/comic-render-tasks/${submission.id}/events`, { token: account.session.token, headers: comicHeaders });
    assert.equal(events.events.at(-1).status, 'succeeded');
    phase = 'private_media_read';
    const images = [];
    for (const frame of task.frames) {
      const mediaRoute = `/api/station/media-assets/${frame.mediaAssetId}/file`;
      await request(mediaRoute, { token: peer.session.token, status: 404 });
      await request(mediaRoute, { status: 401 });
      const image = await request(mediaRoute, { token: account.session.token, binary: true });
      const metadata = await sharp(image.bytes, { failOn: 'warning', limitInputPixels: 16000000 }).metadata();
      assert.equal(metadata.format, 'webp'); assert.equal(image.mimeType, 'image/webp'); assert.equal(image.cacheControl, 'private, no-store');
      const filename = `frame-${frame.frameIndex}.webp`;
      await fs.writeFile(path.join(directory, filename), image.bytes, { mode: 0o600, flag: 'wx' });
      images.push({ filename, width: metadata.width, height: metadata.height, byteLength: image.bytes.length, sha256: hash(image.bytes) });
    }
    const rows = (await database.query('SELECT count(*)::int AS count FROM station_media_assets WHERE user_id=$1 AND storage_provider=$2 AND status=$3', [account.user.id, 'oss', 'uploaded'])).rows[0];
    assert.equal(rows.count, 2);
    outcome = { status: 'succeeded', realProvider: true, realOss: true, normalPublicationAndConsent: true, privateReadAndCrossOwnerDenial: true, images };
    await record({ type: 'verified', ...outcome });
  } catch (error) {
    outcome = { status: 'failed', phase, code: error?.code?.startsWith('COMIC_E2E_') ? error.code : 'COMIC_E2E_CHECK_FAILED',
      outcomeUnknown: error?.code === 'COMIC_E2E_HTTP_OUTCOME_UNKNOWN', ...(error?.diagnostic ? { diagnostic: error.diagnostic } : {}) };
    if (receipt) await record({ type: 'failure', ...outcome });
  } finally {
    await stop(worker);
    let cleanupStage = 'worker_stopped', cleanupDiagnostic = null;
    try {
      if (request) {
        cleanupStage = 'owner_revoke';
        if (account && product) await request(`/api/me/products/${product.id}/enable`, { method: 'DELETE', token: account.session.token, headers: { 'Idempotency-Key': `comic-live-${suffix}-revoke` } });
        cleanupStage = 'test_users_delete';
        for (const user of [account, peer].filter(Boolean)) await request('/api/account', { method: 'DELETE', token: user.session.token, body: { password, confirmation: 'DELETE' } });
        cleanupStage = 'product_pause';
        if (admin && product) await request(`/api/admin/products/${product.id}/pause`, { method: 'POST', token: admin.session.token,
          headers: { 'Idempotency-Key': `comic-live-${suffix}-pause` }, body: { productVersionId: product.productVersionId } });
        cleanupStage = 'admin_delete';
        if (admin) await request('/api/account', { method: 'DELETE', token: admin.session.token, body: { password, confirmation: 'DELETE' } });
      }
      // Only known IDs created in this initially empty disposable database.
      cleanupStage = 'local_catalog_delete';
      if (product) {
        await database.query('DELETE FROM product_status_history WHERE product_id=$1', [product.id]);
        await database.query('DELETE FROM products WHERE id=$1 AND product_key=$2', [product.id, `comic-live-${suffix}`]);
      }
      if (release) { await database.query('DELETE FROM agent_release_status_history WHERE release_id=$1', [release.id]); await database.query('DELETE FROM agent_releases WHERE id=$1', [release.id]); }
      if (account) await database.query("DELETE FROM comic_render_cleanup_journal WHERE user_id=$1 AND state='stored'", [account.user.id]);
      const remaining = (await database.query('SELECT count(*)::int AS count FROM users')).rows[0];
      cleanupComplete = remaining.count === 0;
      cleanupStage = cleanupComplete ? 'complete' : 'users_remaining';
    } catch (error) { cleanupComplete = false; cleanupDiagnostic = error?.diagnostic || { code: error?.code?.startsWith('COMIC_E2E_') ? error.code : 'COMIC_E2E_CLEANUP_FAILED' }; }
    await stop(backend);
    if (receipt) { await record({ type: 'cleanup', complete: cleanupComplete, stage: cleanupStage, diagnostic: cleanupDiagnostic }); await receipt.close(); }
    await database.end();
  }
  return { ...outcome, cleanupComplete };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const result = await runComicRenderLiveE2E(parseComicLiveArguments(process.argv.slice(2))); console.log(JSON.stringify(result)); if (result.status !== 'succeeded' || !result.cleanupComplete) process.exitCode = 1; }
  catch (error) { console.error(JSON.stringify({ status: 'failed', code: error?.code?.startsWith('COMIC_E2E_') ? error.code : 'COMIC_E2E_SETUP_FAILED' })); process.exitCode = 1; }
}
