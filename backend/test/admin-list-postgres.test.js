import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createConnectionAdapter } from '../src/db.js';
import { createAdminListRepository } from '../src/admin-list-repository.js';

const enabled = process.env.RUN_ADMIN_LIST_POSTGRES === '1';
const backendDir = fileURLToPath(new URL('..', import.meta.url));
const project = `admin-list-${process.pid}`;
let client;
let list;
function compose(...args) {
  return execFileSync('docker', ['compose', '-p', project, '-f', 'docker-compose.test.yml', ...args], { cwd: backendDir, encoding: 'utf8' }).trim();
}
before(async () => {
  if (!enabled) return;
  compose('up', '-d', '--wait');
  const port = compose('port', 'postgres', '5432').split(':').at(-1);
  const database = `postgres://postgres:postgres@127.0.0.1:${port}/marvels_chat_test`;
  execFileSync('npm', ['run', 'db:migrate'], { cwd: backendDir, env: { ...process.env, NODE_ENV: 'test', DEFAULT_ADMIN_ENABLED: 'false', DATABASE_URL: database }, stdio: 'pipe' });
  client = new pg.Client({ connectionString: database });
  await client.connect();
  list = createAdminListRepository(createConnectionAdapter(client).query);
});
after(async () => {
  if (!enabled) return;
  await client?.end();
  compose('down', '--volumes');
});

test('PostgreSQL admin pages search and paginate all resources', { skip: !enabled && 'set RUN_ADMIN_LIST_POSTGRES=1 for disposable PostgreSQL' }, async () => {
  for (let i = 0; i < 3; i += 1) {
    const userId = randomUUID();
    const agent = `pagination-agent-${i}`;
    const releaseId = randomUUID();
    const productId = randomUUID();
    await client.query(`INSERT INTO users (id,email,password_hash,display_name,ai_id) VALUES ($1,$2,'hash',$3,$4)`, [userId, `pagination-${i}@example.invalid`, `Pagination User ${i}`, `900000000${String(i).padStart(3, '0')}`]);
    await client.query(`INSERT INTO usage_events (id,user_id,event_type,payload) VALUES ($1,$2,$3,$4)`, [randomUUID(), userId, `pagination.event.${i}`, JSON.stringify({requestId: `pagination-request-${i}`})]);
    await client.query(`INSERT INTO agent_runs (id,user_id,agent_id,status) VALUES ($1,$2,$3,'success')`, [randomUUID(), userId, agent]);
    await client.query(`INSERT INTO agent_registry (agent_key,version,contract_hash) VALUES ($1,'1.0',repeat('a',64))`, [agent]);
    await client.query(`INSERT INTO agent_releases (id,agent_key,version,contract_hash,declared_scopes,readiness,identity_snapshot) VALUES ($1,$2,'1.0',repeat('a',64),'[]','{}',$3)`, [releaseId, agent, JSON.stringify({displayName: `Pagination Release ${i}`})]);
    await client.query(`INSERT INTO products (id,product_key,display_name,identity_snapshot) VALUES ($1,$2,$3,'{}')`, [productId, `pagination-product-${i}`, `Pagination Product ${i}`]);
    await client.query(`INSERT INTO product_versions (id,product_id,version,supported_platforms,display_name,description,identity_snapshot) VALUES ($1,$2,'1.0','["ios"]',$3,'','{}')`, [randomUUID(), productId, `Pagination Product ${i}`]);
  }
  for (const kind of ['users', 'events', 'runs', 'releases', 'products']) {
    const first = await list(kind, {page: 1, pageSize: 2, query: 'pagination'});
    const second = await list(kind, {page: 2, pageSize: 2, query: 'pagination'});
    assert.equal(first.total, 3, kind);
    assert.equal(second.total, 3, kind);
    assert.equal(first.items.length, 2, kind);
    assert.equal(second.items.length, 1, kind);
    assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 3, kind);
    const exact = await list(kind, {page: 1, pageSize: 10, query: kind === 'events' ? 'pagination-request-1' : kind === 'releases' ? 'Pagination Release 1' : kind === 'products' ? 'Pagination Product 1' : 'pagination-1'});
    assert.equal(exact.total, 1, kind);
    const wildcard = await list(kind, {page: 1, pageSize: 10, query: '%'});
    assert.equal(wildcard.total, 0, `${kind} should search literal percent`);
  }
});

test('product page returns and searches the selected draft presentation without overwriting its published parent', { skip: !enabled && 'set RUN_ADMIN_LIST_POSTGRES=1 for disposable PostgreSQL' }, async () => {
  const productId = randomUUID();
  const draftId = randomUUID();
  const draftIdentity = { displayName: 'DraftBrandBeta' };
  await client.query(`INSERT INTO products (id,product_key,display_name,description,identity_snapshot,status)
    VALUES ($1,$2,'OriginalBrandAlpha','Published description','{}','published')`, [productId, `version-brand-${productId}`]);
  await client.query(`INSERT INTO product_versions (id,product_id,version,supported_platforms,status,display_name,description,identity_snapshot,created_at)
    VALUES ($1,$2,'1.0.0','["ios"]','published','OriginalBrandAlpha','Published description','{}',CURRENT_TIMESTAMP - INTERVAL '1 hour')`, [randomUUID(), productId]);
  await client.query(`INSERT INTO product_versions (id,product_id,version,supported_platforms,status,display_name,description,identity_snapshot)
    VALUES ($1,$2,'2.0.0','["ios"]','draft','DraftBrandBeta','Draft description',$3)`, [draftId, productId, JSON.stringify(draftIdentity)]);
  const page = await list('products', { page: 1, pageSize: 10, query: 'DraftBrandBeta', sortBy: 'displayName', sortOrder: 'asc' });
  assert.equal(page.total, 1);
  assert.equal(page.items[0].productVersionId, draftId);
  assert.equal(page.items[0].version, '2.0.0');
  assert.equal(page.items[0].displayName, 'DraftBrandBeta');
  assert.equal(page.items[0].description, 'Draft description');
  assert.deepEqual(page.items[0].identity, draftIdentity);
  assert.equal((await client.query('SELECT display_name FROM products WHERE id = $1', [productId])).rows[0].display_name, 'OriginalBrandAlpha');
});
