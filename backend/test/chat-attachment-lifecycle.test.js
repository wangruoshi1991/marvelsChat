import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatAttachmentConfig } from '../src/chat-attachment-config.js';
import { createChatAttachmentMaintenance, readChatAttachmentCapacity } from '../src/chat-attachment-lifecycle.js';
import { createSafeErrorResponse } from '../src/request-observability.js';
import { checkChatAttachmentOperations } from '../scripts/check-chat-attachment-operations.js';

test('chat attachment policy has bounded, explicit defaults and rejects malformed configuration', () => {
  assert.deepEqual(createChatAttachmentConfig({}), { draftRetentionHours:24,userMaxBytes:104857600,userMaxCount:1000,globalMaxBytes:5368709120,globalMaxCount:100000,cleanupBatchSize:200,maintenanceIntervalMs:300000 });
  for (const [name, values] of Object.entries({CHAT_ATTACHMENT_DRAFT_RETENTION_HOURS:['',0,169,'24.5'],CHAT_ATTACHMENT_USER_MAX_BYTES:[' ',0,-1,'one'],CHAT_ATTACHMENT_USER_MAX_COUNT:[0,100001],CHAT_ATTACHMENT_GLOBAL_MAX_BYTES:[0,1099511627777],CHAT_ATTACHMENT_GLOBAL_MAX_COUNT:[0,10000001],CHAT_ATTACHMENT_CLEANUP_BATCH_SIZE:[0,1001],CHAT_ATTACHMENT_MAINTENANCE_INTERVAL_MS:[999,3600001]}))
    for(const value of values)assert.throws(()=>createChatAttachmentConfig({[name]:String(value)}),new RegExp(name));
  assert.equal(createChatAttachmentConfig({CHAT_ATTACHMENT_USER_MAX_BYTES:'1'}).userMaxBytes,1);
});

test('only the lifecycle constraint becomes a safe public expired error', () => {
  const expired=createSafeErrorResponse({code:'23503',constraint:'chat_attachment_visible_reference',detail:'private SQL and attachment metadata'}, {production:true});
  assert.equal(expired.status,410);assert.equal(expired.body.error.details.code,'CHAT_ATTACHMENT_EXPIRED');
  assert.doesNotMatch(JSON.stringify(expired),/private SQL/);
  const other=createSafeErrorResponse({code:'23503',constraint:'another_foreign_key',message:'private SQL'}, {production:true});
  assert.equal(other.status,500);assert.equal(other.body.error.message,'Internal Server Error');
});

test('capacity diagnostics expose aggregate counts and the actual hard limits without account identities', async () => {
  const limits={...createChatAttachmentConfig({}),globalMaxBytes:100,globalMaxCount:10};
  let calls=0;
  const status=await readChatAttachmentCapacity({limits,queryFn:async()=>++calls===1?[{bytes:'80',count:'5',near_user_limit_count:2}]:[{bytes:'12',count:1}]});
  assert.deepEqual(status,{storedBytes:80,attachmentCount:5,expiredDraftBytes:12,expiredDraftCount:1,nearUserLimitCount:2,globalNearCapacity:true,limits});
});

test('maintenance failures are visible, private details stay hidden and the next tick can recover', async () => {
  const logs=[];let fail=true;
  const maintenance=createChatAttachmentMaintenance({collect:()=>{if(fail)throw new Error('private DB path or payload');return{deletedCount:1,deletedBytes:4};},inspect:async()=>({globalNearCapacity:true,nearUserLimitCount:0}),logger:{log:value=>logs.push(JSON.parse(value)),error:value=>logs.push(JSON.parse(value))}});
  assert.equal(await maintenance.runOnce(),false);assert.equal(logs[0].code,'CHAT_ATTACHMENT_MAINTENANCE_FAILED');
  fail=false;assert.equal(await maintenance.runOnce(),true);assert.equal(logs[1].capacityWarning,true);
  assert.doesNotMatch(JSON.stringify(logs),/private DB/);await maintenance.stop();
});

test('maintenance never overlaps and shutdown drains its active transaction before database close', async () => {
  let finish;let calls=0;const logs=[];
  const maintenance=createChatAttachmentMaintenance({collect:()=>{calls++;return new Promise(resolve=>{finish=resolve;});},inspect:async()=>({globalNearCapacity:false,nearUserLimitCount:0}),logger:{log:value=>logs.push(value),error:value=>logs.push(value)}});
  const pending=maintenance.runOnce();assert.equal(await maintenance.runOnce(),false);assert.equal(calls,1);
  let stopped=false;const stop=maintenance.stop().then(()=>{stopped=true;});await Promise.resolve();assert.equal(stopped,false);
  finish({deletedCount:0,deletedBytes:0});await pending;await stop;assert.equal(stopped,true);assert.deepEqual(logs,[]);assert.equal(await maintenance.runOnce(),false);
});

test('the operations command uses a read-only transaction and always releases its connection',async()=>{
  const commands=[];
  const pool={connect:async()=>({query:async sql=>{commands.push(sql);return{rows:[]};},release:()=>commands.push('release')})};
  const status=await checkChatAttachmentOperations({pool,inspect:async({queryFn})=>{await queryFn('SELECT 1');return{attachmentCount:0};}});
  assert.equal(status.ok,true);assert.match(commands[0],/REPEATABLE READ READ ONLY/);assert.deepEqual(commands.slice(-2),['ROLLBACK','release']);
  await assert.rejects(checkChatAttachmentOperations({pool,inspect:async()=>{throw new Error('failed');}}),/failed/);
  assert.deepEqual(commands.slice(-2),['ROLLBACK','release']);
});
