import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentsModule } from '../src/modules/agents.js';
import { createProductsModule } from '../src/modules/products.js';

const identity = {
  key: 'demo-agent', avatarKind: 'agent-mark', displayName: '演示 Agent', description: '真实描述', mark: '演', shape: 'circle',
  colors: { background: '#123456', foreground: '#ffffff', accent: '#facc15' }, source: 'registry',
  updatedAt: '2026-10-29T00:00:00.000Z',
};

test('Agent release module renders review/publish actions and calls the real endpoints', async () => {
  const calls = [];
  const client = async (path, options) => { calls.push({ path, options }); return [{ id: 'release-1', catalogStatus: 'review', identity }]; };
  const module = createAgentsModule(client);
  await module.load();
  const html = module.render();
  assert.match(html, /data-module-action="publish"/);
  await module.handleAction('publish', { releaseId: 'release-1' });
  assert.equal(calls[1].path, '/api/admin/agent-releases/release-1/publish');
  assert.equal(calls[1].options.method, 'POST');
  assert.match(calls[1].options.headers['Idempotency-Key'], /^admin-agent-release-publish-release-1-/);
});

test('Agent release module exposes the identity gate and sends a complete identity patch', async () => {
  const calls = [];
  const client = async (path, options) => { calls.push({ path, options }); return [{ id: 'release-1', catalogStatus: 'draft', identity }]; };
  const module = createAgentsModule(client);
  await module.load();
  assert.match(module.render(), /Agent 上线流程/);
  assert.match(module.render(), /编辑发布身份/);
  await module.handleAction('identity-save', { releaseId: 'release-1', identity: JSON.stringify(identity) });
  assert.equal(calls.at(-1).path, '/api/admin/agent-releases/release-1/identity');
  assert.equal(calls.at(-1).options.method, 'PATCH');
  assert.equal(JSON.parse(calls.at(-1).options.body).key, 'demo-agent');
});

test('product module renders status-specific actions and calls submit/publish/pause', async () => {
  const calls = [];
  const client = async (path, options) => { calls.push({ path, options }); return [{ id: 'product-1', status: 'draft' }]; };
  const module = createProductsModule(client);
  await module.load();
  assert.match(module.render(), /data-module-action="submit"/);
  await module.handleAction('submit', { productId: 'product-1' });
  assert.equal(calls[1].path, '/api/admin/products/product-1/submit');
  assert.equal(calls[1].options.method, 'POST');
});
