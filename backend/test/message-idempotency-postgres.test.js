import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { messageSchema, relationshipPageSchema } from '../src/schemas.js';

const enabled = process.env.RUN_MESSAGE_IDEMPOTENCY_INTEGRATION === '1';
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const composeFile = path.join(backendDir, 'docker-compose.test.yml');
const project = `message-idempotency-${process.pid}`;
let client;
let database;
let route;

function compose(...args) {
  return execFileSync('docker', ['compose', '-p', project, '-f', composeFile, ...args], {
    cwd: backendDir,
    encoding: 'utf8',
  }).trim();
}

before(async () => {
  if (!enabled) return;
  compose('up', '-d', '--wait');
  const port = compose('port', 'postgres', '5432').split(':').at(-1);
  database = `postgres://postgres:postgres@127.0.0.1:${port}/marvels_chat_test`;
  execFileSync('npm', ['run', 'db:migrate'], {
    cwd: backendDir,
    env: { ...process.env, NODE_ENV: 'test', DEFAULT_ADMIN_ENABLED: 'false', DATABASE_URL: database },
    stdio: 'pipe',
  });
  process.env.DATABASE_URL = database;
  const { registerMessageRoutes } = await import('../src/routes/message-routes.js');
  const app = { get() {}, patch() {}, delete() {}, post(pathname, ...handlers) {
    if (pathname === '/api/threads/:threadId/messages') route = handlers.at(-1);
  } };
  registerMessageRoutes(app, {
    authenticate: () => undefined,
    asyncHandler: handler => handler,
    getOnlineUserIds: () => [],
    sendRealtimeToUser: () => undefined,
  });
  client = new pg.Client({ connectionString: database });
  await client.connect();
});

after(async () => {
  if (!enabled) return;
  await client?.end();
  const { closeDatabase } = await import('../src/db.js');
  await closeDatabase();
  compose('down', '--volumes');
});

test('message and relationship cursors require valid paired identifiers', () => {
  assert.equal(messageSchema.safeParse({ content: 'hello', clientMessageId: crypto.randomUUID() }).success, true);
  assert.equal(messageSchema.safeParse({ content: 'hello', clientMessageId: 'local-1' }).success, false);
  assert.equal(relationshipPageSchema.safeParse({ beforeCreatedAt: new Date().toISOString() }).success, false);
});

test('concurrent retries create one message and one usage event', {
  skip: enabled ? false : 'set RUN_MESSAGE_IDEMPOTENCY_INTEGRATION=1 for disposable PostgreSQL',
}, async () => {
  const userId = crypto.randomUUID();
  const threadId = crypto.randomUUID();
  const clientMessageId = crypto.randomUUID();
  await client.query(
    `INSERT INTO users (id, email, password_hash, display_name, ai_id)
     VALUES ($1, 'retry@example.com', 'test-hash', 'Retry Tester', '900000000001')`, [userId],
  );
  await client.query(
    `INSERT INTO chat_threads (id, user_id, title, kind) VALUES ($1, $2, 'Retry', 'system')`,
    [threadId, userId],
  );
  const invoke = async (content, targetThreadId = threadId, messageKey = clientMessageId) => {
    const req = {
      user: { id: userId, displayName: 'Retry Tester' },
      params: { threadId: targetThreadId },
      body: { content, clientMessageId: messageKey },
      ip: '127.0.0.1',
      get: () => '',
    };
    const res = { code: 200, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; } };
    await route(req, res);
    return res;
  };
  const results = await Promise.all([invoke('hello'), invoke('hello')]);
  assert.deepEqual(results.map(result => result.code).sort(), [200, 201]);
  assert.equal(results[0].payload.data.messages[0].id, results[1].payload.data.messages[0].id);
  const count = await client.query('SELECT COUNT(*)::int AS total FROM chat_messages WHERE thread_id = $1', [threadId]);
  assert.equal(count.rows[0].total, 1);
  const events = await client.query("SELECT COUNT(*)::int AS total FROM usage_events WHERE user_id = $1 AND event_type = 'message.send'", [userId]);
  assert.equal(events.rows[0].total, 1);
  await assert.rejects(invoke('different text'), error => error.status === 409);
  const otherThreadId = crypto.randomUUID();
  await client.query(
    `INSERT INTO chat_threads (id, user_id, title, kind) VALUES ($1, $2, 'Other', 'system')`,
    [otherThreadId, userId],
  );
  await assert.rejects(invoke('hello', otherThreadId), error => error.status === 409);

  const agentThreadId = crypto.randomUUID();
  const agentInputId = crypto.randomUUID();
  const agentOutputId = crypto.randomUUID();
  const agentClientId = crypto.randomUUID();
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(['agent question', null])).digest('hex');
  await client.query(
    `INSERT INTO chat_threads (id, user_id, title, kind, agent_id)
     VALUES ($1, $2, 'Agent', 'agent', 'miaoxun-butler')`,
    [agentThreadId, userId],
  );
  await client.query(
    `INSERT INTO chat_messages
      (id, thread_id, user_id, sender_type, sender_name, content, metadata, client_message_id)
     VALUES ($1, $2, $3, 'user', 'Retry Tester', 'agent question', $4, $5)`,
    [agentInputId, agentThreadId, userId, JSON.stringify({ source: 'app', requestFingerprint: fingerprint }), agentClientId],
  );
  await client.query(
    `INSERT INTO chat_messages
      (id, thread_id, user_id, sender_type, sender_name, content, metadata)
     VALUES ($1, $2, $3, 'agent', 'Agent', 'agent answer', '{}'::jsonb)`,
    [agentOutputId, agentThreadId, userId],
  );
  await client.query(
    `INSERT INTO agent_runs
      (id, user_id, agent_id, thread_id, input_message_id, output_message_id, status, provider)
     VALUES ($1, $2, 'miaoxun-butler', $3, $4, $5, 'success', 'test')`,
    [crypto.randomUUID(), userId, agentThreadId, agentInputId, agentOutputId],
  );
  const agentReplay = await invoke('agent question', agentThreadId, agentClientId);
  assert.equal(agentReplay.code, 200);
  assert.deepEqual(agentReplay.payload.data.messages.map(message => message.id), [agentInputId, agentOutputId]);
});

test('relationship keyset paging preserves equal-timestamp rows', {
  skip: enabled ? false : 'set RUN_MESSAGE_IDEMPOTENCY_INTEGRATION=1 for disposable PostgreSQL',
}, async () => {
  const ownerId = crypto.randomUUID();
  const { listRelationshipProfiles } = await import('../src/social-repository.js');
  await client.query(
    `INSERT INTO users (id, email, password_hash, display_name, ai_id)
     VALUES ($1, 'owner@example.com', 'test-hash', 'Paging Owner', '900000000002')`, [ownerId],
  );
  for (let index = 0; index < 5; index += 1) {
    const userId = crypto.randomUUID();
    await client.query(
      `INSERT INTO users (id, email, password_hash, display_name, ai_id)
       VALUES ($1, $2, 'test-hash', $3, $4)`, [userId, `paging-${index}@example.com`, `Paging ${index}`, `9000000000${String(index + 3).padStart(2, '0')}`],
    );
    await client.query(
      `INSERT INTO user_profiles (user_id, nickname, avatar_text) VALUES ($1, $2, 'P')`,
      [userId, `Paging ${index}`],
    );
    await client.query(
      `INSERT INTO social_relationships
        (id, follower_user_id, followed_user_id, relation_type, created_at)
       VALUES ($1, $2, $3, 'follow', '2026-09-29T00:00:00.123456Z')`,
      [crypto.randomUUID(), ownerId, userId],
    );
  }
  const seen = [];
  let before = null;
  do {
    const page = await listRelationshipProfiles(ownerId, 'following', 2, [], before);
    seen.push(...page.map(profile => profile.user.id));
    before = page.length === 2 ? page.at(-1).cursor : null;
  } while (before);
  assert.equal(seen.length, 5);
  assert.equal(new Set(seen).size, 5);
});
