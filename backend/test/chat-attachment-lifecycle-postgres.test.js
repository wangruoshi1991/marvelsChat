import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { query, getPool, closeDatabase } from '../src/db.js';
import * as lifecycle from '../src/chat-attachment-service.js';
import { createSafeErrorResponse } from '../src/request-observability.js';
import { checkChatAttachmentOperations } from '../scripts/check-chat-attachment-operations.js';

const enabled = process.env.RUN_CHAT_ATTACHMENT_LIFECYCLE_POSTGRES === '1';
test('attachment retention, message references, concurrent sends and hard capacities use PostgreSQL', {
  skip: !enabled && 'RUN_CHAT_ATTACHMENT_LIFECYCLE_POSTGRES=1 requires a dedicated loopback *_migration_test database', timeout: 60000,
}, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.match(url.pathname, /_migration_test$/);
  const owners = [];
  const policy = { draftRetentionHours: 24, userMaxBytes: 100 * 1024 * 1024, userMaxCount: 1000, globalMaxBytes: 5 * 1024 ** 3, globalMaxCount: 100000, cleanupBatchSize: 200, maintenanceIntervalMs: 300000 };
  const fixture = async () => {
    const id = crypto.randomUUID(), threadId = crypto.randomUUID(); owners.push(id);
    await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES(?,?,'test',?,?)", [id, `${id}@example.invalid`, `Lifecycle ${id}`, String(crypto.randomInt(100000000000, 999999999999))]);
    await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES(?,'Lifecycle fixture','L')", [id]);
    await query("INSERT INTO chat_threads(id,user_id,title,kind) VALUES(?,?,'Lifecycle fixture','direct')", [threadId, id]);
    return { id, threadId };
  };
  const upload = (owner, { bytes = 'data', key = crypto.randomUUID(), limits = policy } = {}) => lifecycle.createChatAttachment({ userId: owner.id, threadId: owner.threadId, idempotencyKey: key,
    upload: { kind: 'file', filename: 'fixture.txt', mimeType: 'text/plain', bytes: Buffer.from(bytes) }, limits });
  const age = attachment => query("UPDATE chat_attachments SET created_at=clock_timestamp()-INTERVAL '25 hours' WHERE id=?", [attachment.id]);
  const insertMessage = async (q, owner, attachment) => {
    const id = crypto.randomUUID();
    await q("INSERT INTO chat_messages(id,thread_id,user_id,sender_type,sender_name,content,metadata) VALUES(?,?,?,'user','Fixture','Selected file',?::jsonb)", [id, owner.threadId, owner.id, JSON.stringify({ attachments: [attachment] })]);
    return id;
  };
  const exists = async attachment => Boolean((await query('SELECT id FROM chat_attachments WHERE id=?', [attachment.id])).length);
  try {
    const [owner, peer, third] = await Promise.all([fixture(), fixture(), fixture()]);
    await t.test('a pending upload expires only after 24h and returns a clear send error', async () => {
      const fresh = await upload(owner), stale = await upload(owner);
      await age(stale);
      await assert.rejects(lifecycle.resolveChatAttachmentsForMessage({ userId: owner.id, threadId: owner.threadId, attachmentIds: [stale.id] }), error => error.status === 410 && error.details.code === 'CHAT_ATTACHMENT_EXPIRED');
      const result = await lifecycle.collectExpiredChatAttachments({ limits: policy });
      assert.equal(result.deletedCount, 1);
      assert.equal(result.deletedBytes, 4);
      assert.equal(await exists(stale), false);
      assert.equal(await exists(fresh), true);
    });
    await t.test('any still-visible direct or group copy retains the asset, including after leaving a group', async () => {
      const groupId = crypto.randomUUID();
      await query('INSERT INTO chat_groups(id,creator_user_id,title,idempotency_key,request_fingerprint) VALUES(?,?,?,?,?)', [groupId,owner.id,'Lifecycle group',crypto.randomUUID(),'a'.repeat(64)]);
      for (const member of [owner,peer,third]) {
        await query("UPDATE chat_threads SET kind='group',group_id=? WHERE id=?", [groupId,member.threadId]);
        await query('INSERT INTO chat_group_members(group_id,user_id) VALUES(?,?)', [groupId,member.id]);
      }
      const attachment = await upload(owner); await age(attachment);
      const messages = await Promise.all([owner, peer, third].map(person => insertMessage(query, person, attachment)));
      assert.equal((await query('SELECT * FROM chat_attachment_references WHERE attachment_id=?', [attachment.id])).length, 3);
      await query('UPDATE chat_messages SET deleted_at=clock_timestamp() WHERE id=?', [messages[0]]);
      await query('UPDATE chat_messages SET recalled_at=clock_timestamp() WHERE id=?', [messages[1]]);
      await query('UPDATE chat_group_members SET left_at=clock_timestamp() WHERE group_id=? AND user_id=?', [groupId,third.id]);
      await lifecycle.collectExpiredChatAttachments({ limits: policy });
      assert.equal(await exists(attachment), true);
      assert.equal((await lifecycle.readChatAttachment({ userId: third.id, attachmentId: attachment.id })).content.toString(), 'data');
      await query('UPDATE chat_messages SET recalled_at=clock_timestamp() WHERE id=?', [messages[2]]);
      await lifecycle.collectExpiredChatAttachments({ limits: policy });
      assert.equal(await exists(attachment), false);
    });
    await t.test('a sending transaction holds the attachment until its reference commits and cleanup skips it', async () => {
      const attachment = await upload(owner); await age(attachment);
      const client = await (await getPool()).connect();
      try {
        await client.query('BEGIN');
        await insertMessage((sql, args) => { let index = 0; return client.query(sql.replace(/\?/g, () => `$${++index}`), args); }, owner, attachment);
        await lifecycle.collectExpiredChatAttachments({ limits: policy });
        assert.equal(await exists(attachment), true);
        await client.query('COMMIT');
        await lifecycle.collectExpiredChatAttachments({ limits: policy });
        assert.equal(await exists(attachment), true);
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
    await t.test('cleanup winning before a delayed send rejects the whole message instead of saving a broken reference', async () => {
      const attachment = await upload(owner); await age(attachment);
      const client = await (await getPool()).connect();
      const sender = await (await getPool()).connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM chat_attachments WHERE id=$1 FOR UPDATE', [attachment.id]);
        const { rows: [{ pid }] } = await sender.query('SELECT pg_backend_pid() AS pid');
        const pending = insertMessage((sql,args) => { let index=0; return sender.query(sql.replace(/\?/g,()=>`$${++index}`),args); }, peer, attachment);
        const rejected = assert.rejects(pending, error => {
          const safe = createSafeErrorResponse(error, { production: true });
          return safe.status === 410 && safe.body.error.details.code === 'CHAT_ATTACHMENT_EXPIRED';
        });
        let blocked=false;
        for(let poll=0;poll<100;poll++) {
          const [activity]=await query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=?',[pid]);
          if(activity?.wait_event_type==='Lock'){blocked=true;break;}
          await new Promise(resolve=>setTimeout(resolve,10));
        }
        assert.equal(blocked,true,'the send must be waiting on the cleanup transaction');
        await client.query('DELETE FROM chat_attachments WHERE id=$1', [attachment.id]);
        await client.query('COMMIT');
        await rejected;
        assert.equal((await query("SELECT id FROM chat_messages WHERE metadata->'attachments' @> ?::jsonb", [JSON.stringify([{ id: attachment.id }])])).length, 0);
      } finally { await client.query('ROLLBACK'); client.release(); sender.release(); }
    });
    await t.test('exact byte and record quotas are enforced under concurrent uploads while replay is free', async () => {
      const target = await fixture();
      const limits = { ...policy, userMaxBytes: 4, userMaxCount: 1 };
      const key = crypto.randomUUID();
      const first = await upload(target, { key, limits });
      assert.equal((await upload(target, { key, limits })).id, first.id);
      await assert.rejects(upload(target, { key, bytes: 'changed', limits }), error => error.status === 409 && error.details.code === 'CHAT_ATTACHMENT_IDEMPOTENCY_CONFLICT');
      await assert.rejects(upload(target, { limits }), error => error.status === 409 && error.details.code === 'CHAT_ATTACHMENT_USER_QUOTA');
      await assert.rejects(lifecycle.createChatAttachment({userId:target.id,threadId:target.threadId,idempotencyKey:crypto.randomUUID(),structured:{kind:'location',latitude:1,longitude:2},limits}), error=>error.status===409 && error.details.code==='CHAT_ATTACHMENT_USER_QUOTA');
      const concurrentOwner = await fixture();
      const results = await Promise.allSettled([upload(concurrentOwner, { limits }), upload(concurrentOwner, { limits })]);
      assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
      assert.equal(results.filter(item => item.status === 'rejected' && item.reason.details.code === 'CHAT_ATTACHMENT_USER_QUOTA').length, 1);
      const [usage] = await query('SELECT count(*)::int AS count, sum(byte_size)::int AS bytes FROM chat_attachments WHERE user_id=?', [concurrentOwner.id]);
      assert.deepEqual(usage, { count: 1, bytes: 4 });
    });
    await t.test('the global hard limit rejects a new account without deleting referenced history', async () => {
      const target = await fixture();
      const [{ bytes, count }] = await query('SELECT COALESCE(sum(byte_size),0)::bigint AS bytes,count(*)::int AS count FROM chat_attachments');
      await assert.rejects(upload(target, { limits: { ...policy, globalMaxBytes: Number(bytes) + 3, globalMaxCount: Number(count) + 1 } }), error => error.status === 409 && error.details.code === 'CHAT_ATTACHMENT_GLOBAL_CAPACITY');
      await assert.rejects(upload(target, { limits: { ...policy, globalMaxCount: Number(count) } }), error => error.status === 409 && error.details.code === 'CHAT_ATTACHMENT_GLOBAL_CAPACITY');
      assert.equal((await query('SELECT attachment_id FROM chat_attachment_references LIMIT 1')).length, 1);
    });
    await t.test('capacity operations are an actual read-only consistent database transaction',async()=>{
      const status=await checkChatAttachmentOperations({pool:await getPool()});
      assert.equal(status.ok,true);assert.ok(status.storedBytes>0);assert.ok(status.attachmentCount>0);
      assert.equal(status.limits.draftRetentionHours,24);
      await assert.rejects(checkChatAttachmentOperations({pool:await getPool(),inspect:async({queryFn})=>queryFn('DELETE FROM chat_attachments WHERE false')}),error=>error.code==='25006');
    });
    await t.test('migration replays preserve current references and deleting the owner still cascades bytes', async () => {
      const sql = await readFile(new URL('../database/054_chat_attachment_lifecycle.sql', import.meta.url), 'utf8');
      // Recreate the prior-schema condition: a canonical visible message exists
      // before the reference trigger/table backfill has tracked it.
      const legacy = await upload(peer); await age(legacy);
      await query('ALTER TABLE chat_messages DISABLE TRIGGER trg_chat_attachment_references');
      try { await insertMessage(query,third,legacy); }
      finally { await query('ALTER TABLE chat_messages ENABLE TRIGGER trg_chat_attachment_references'); }
      assert.equal((await query('SELECT * FROM chat_attachment_references WHERE attachment_id=?',[legacy.id])).length,0);
      await query(sql);
      assert.equal((await query('SELECT * FROM chat_attachment_references WHERE attachment_id=?',[legacy.id])).length,1);
      await lifecycle.collectExpiredChatAttachments({limits:policy});
      assert.equal(await exists(legacy),true);
      const before = await query('SELECT * FROM chat_attachment_references ORDER BY attachment_id,message_id');
      await query(sql); await query(sql);
      assert.deepEqual(await query('SELECT * FROM chat_attachment_references ORDER BY attachment_id,message_id'), before);
      const attachment = await upload(owner);
      await insertMessage(query, peer, attachment);
      await query('DELETE FROM users WHERE id=?', [owner.id]);
      assert.equal(await exists(attachment), false);
      assert.equal((await query('SELECT * FROM chat_attachment_references WHERE attachment_id=?', [attachment.id])).length, 0);
    });
  } finally {
    for (const id of owners) await query('DELETE FROM users WHERE id=?', [id]);
    await closeDatabase();
  }
});
