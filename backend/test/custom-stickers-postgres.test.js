import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import express from 'express';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { query, closeDatabase } from '../src/db.js';
import { authenticate, hashToken } from '../src/auth.js';
import { registerCustomStickerRoutes } from '../src/routes/custom-sticker-routes.js';
import { registerMessageRoutes } from '../src/routes/message-routes.js';
import { registerGroupChatRoutes } from '../src/routes/group-chat-routes.js';
import { createRequestErrorHandler } from '../src/request-observability.js';
const enabled=process.env.RUN_CUSTOM_STICKERS_POSTGRES==='1';
test('custom stickers HTTP, authorization, message references and migration use isolated PostgreSQL',{skip:!enabled&&'RUN_CUSTOM_STICKERS_POSTGRES=1 requires loopback *_migration_test database',timeout:60000},async t=>{
 const url=new URL(process.env.DATABASE_URL);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.match(url.pathname,/_migration_test$/);
 const owners=[];let server,origin;
 const asyncHandler=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
 const fixture=async()=>{
  const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('hex'),threadId=crypto.randomUUID();owners.push(id);
  await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES(?,?,'test',?,?)",[id,`${id}@example.invalid`,`Sticker ${id}`,String(crypto.randomInt(100000000000,999999999999))]);
  await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES(?,'Sticker test','S')",[id]);
  await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,CURRENT_TIMESTAMP+INTERVAL '1 hour')",[crypto.randomUUID(),id,hashToken(token)]);
  await query("INSERT INTO chat_threads(id,user_id,title,kind) VALUES(?,?,'Sticker test','direct')",[threadId,id]);
  return{id,token,threadId};
 };
 const call=async(path,{owner,method='GET',body,headers={},status=200,binary=false}={})=>{
  const response=await fetch(`${origin}${path}`,{method,headers:{...(owner?{Authorization:`Bearer ${owner.token}`} : {}),...(body&&!(body instanceof Buffer)?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:body instanceof Buffer?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
  const payload=binary?Buffer.from(await response.arrayBuffer()):await response.json();
  assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(binary?response.status:payload)}`);return binary?payload:payload.data||payload;
 };
 const source=await sharp({create:{width:32,height:24,channels:4,background:{r:20,g:40,b:60,alpha:0.5}}}).png().toBuffer();
 const upload=(owner,key=crypto.randomUUID(),bytes=source,status=201)=>call('/api/custom-stickers/upload',{owner,method:'POST',status,body:bytes,headers:{'Content-Type':'application/octet-stream','Idempotency-Key':key,'X-Miaoxun-Sticker-Mime':'image/png'}});
 const send=(owner,threadId,stickerId,key=crypto.randomUUID(),status=201,extra={})=>call(`/api/threads/${threadId}/messages`,{owner,method:'POST',status,body:{content:'',stickerId,clientMessageId:key,...extra}});
 try{
  const app=express();app.use(express.json());registerCustomStickerRoutes(app,{authenticate,asyncHandler});
  registerMessageRoutes(app,{authenticate,asyncHandler,getOnlineUserIds:()=>[],sendRealtimeToUser(){}});
  registerGroupChatRoutes(app,{authenticate,asyncHandler,sendRealtimeToUser(){}});
  app.use(createRequestErrorHandler({production:true,logger:{error(){}}}));
  await new Promise(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;
  const [owner,peer,third,stranger]=await Promise.all([fixture(),fixture(),fixture(),fixture()]);
  for(const other of [peer,third])for(const [from,to] of [[owner,other],[other,owner]]) await query("INSERT INTO social_relationships(id,follower_user_id,followed_user_id,relation_type,status) VALUES(?,?,?,'friend','active')",[crypto.randomUUID(),from.id,to.id]);
  await query('UPDATE chat_threads SET peer_user_id=? WHERE id=?',[peer.id,owner.threadId]);await query('UPDATE chat_threads SET peer_user_id=? WHERE id=?',[owner.id,peer.threadId]);
  let sticker,message,key,group,groupMessage,secondThread,secondMessage;
  await t.test('authenticated concurrent collection is idempotent, private, and strips transport metadata',async()=>{
   await call('/api/custom-stickers',{status:401});
   const uploadKey=crypto.randomUUID();const results=await Promise.all([upload(owner,uploadKey),upload(owner,uploadKey)]);sticker=results[0];assert.equal(results[1].id,sticker.id);
   await upload(owner,uploadKey,await sharp(source).negate().png().toBuffer(),409);
   assert.equal((await call('/api/custom-stickers',{owner})).length,1);assert.deepEqual(await call('/api/custom-stickers',{owner:peer}),[]);
   await call(sticker.downloadPath,{owner:stranger,status:404});assert.ok((await call(sticker.downloadPath,{owner,binary:true})).length);
   await call(`/api/custom-stickers/${sticker.id}`,{owner:peer,method:'DELETE',status:404});
  });
  await t.test('canonical direct message mirror and stable retry refuse theft, mixed text, contexts and Agent calls',async()=>{
   key=crypto.randomUUID();const sent=await send(owner,owner.threadId,sticker.id,key);message=sent.messages[0];assert.equal(message.metadata.sticker.id,sticker.id);
   assert.equal((await send(owner,owner.threadId,sticker.id,key,200)).messages[0].id,message.id);
   const peerMessages=await call(`/api/threads/${peer.threadId}/messages`,{owner:peer});assert.equal(peerMessages.at(-1).metadata.sticker.id,sticker.id);
   assert.ok((await call(sticker.downloadPath,{owner:peer,binary:true})).length);
   await send(peer,peer.threadId,sticker.id,crypto.randomUUID(),404);
   for(const extra of [{content:'hello'},{attachmentIds:[crypto.randomUUID()]},{clientContext:{currentPage:'messages'}},{agentContextReset:true},{replyToMessageId:crypto.randomUUID()}]) await send(owner,owner.threadId,sticker.id,crypto.randomUUID(),400,extra);
   const agentThread=crypto.randomUUID();await query("INSERT INTO chat_threads(id,user_id,title,kind,agent_id) VALUES(?,?,'Agent','agent','ui-agent')",[agentThread,owner.id]);
   await send(owner,agentThread,sticker.id,crypto.randomUUID(),400);
   await send(owner,owner.threadId,crypto.randomUUID(),key,409);
  });
  await t.test('one favorite sends across direct conversations and to current group members',async()=>{
   secondThread=crypto.randomUUID();await query("INSERT INTO chat_threads(id,user_id,title,kind) VALUES(?,?,'Second conversation','direct')",[secondThread,owner.id]);
   secondMessage=(await send(owner,secondThread,sticker.id)).messages[0];assert.equal(secondMessage.metadata.sticker.id,sticker.id);
   group=await call('/api/chat-groups',{owner,method:'POST',status:201,body:{title:'Sticker group',memberUserIds:[peer.id,third.id],idempotencyKey:crypto.randomUUID()}});
   groupMessage=(await send(owner,group.thread.id,sticker.id)).messages[0];
   for(const member of [owner,peer,third])assert.ok((await call(sticker.downloadPath,{owner:member,binary:true})).length);
   await call(sticker.downloadPath,{owner:stranger,status:404});
   await query('UPDATE chat_group_members SET left_at=CURRENT_TIMESTAMP WHERE group_id=? AND user_id=?',[group.thread.groupId,third.id]);
   await call(sticker.downloadPath,{owner:third,status:404});
  });
  await t.test('delete favorite is idempotent, preserves sent references and exact retries, but rejects new sends',async()=>{
   await call(`/api/custom-stickers/${sticker.id}`,{owner,method:'DELETE'});await call(`/api/custom-stickers/${sticker.id}`,{owner,method:'DELETE'});
   assert.deepEqual(await call('/api/custom-stickers',{owner}),[]);await send(owner,owner.threadId,sticker.id,crypto.randomUUID(),404);
   await send(owner,owner.threadId,sticker.id,key,200);
   for(const member of [owner,peer]) assert.ok((await call(sticker.downloadPath,{owner:member,binary:true})).length);
   const [audit]=await query("SELECT count(*)::int AS count FROM usage_events WHERE user_id=? AND event_type='custom_sticker.delete'",[owner.id]);assert.equal(audit.count,1);
  });
  await t.test('local delete denies that reader and recall closes every remaining sent reference',async()=>{
   const peerMessages=await call(`/api/threads/${peer.threadId}/messages`,{owner:peer});await call(`/api/threads/${peer.threadId}/messages/${peerMessages.at(-1).id}`,{owner:peer,method:'DELETE'});
   // Group copy still authorizes the peer until its group recall.
   await call(`/api/threads/${group.thread.id}/messages/${groupMessage.id}/recall`,{owner,method:'POST'});
   await call(sticker.downloadPath,{owner:peer,status:404});
   await call(`/api/threads/${owner.threadId}/messages/${message.id}/recall`,{owner,method:'POST'});
   await call(`/api/threads/${secondThread}/messages/${secondMessage.id}/recall`,{owner,method:'POST'});
   for(const member of [owner,peer,third,stranger])await call(sticker.downloadPath,{owner:member,status:404});
   const messages=await call(`/api/threads/${owner.threadId}/messages`,{owner});assert.equal(messages.at(-1).metadata.sticker,undefined);
  });
  await t.test('migration replay preserves data and owner deletion cascades private assets',async()=>{
   const sql=await readFile(new URL('../database/061_custom_stickers.sql',import.meta.url),'utf8');await query(sql);await query(sql);
   assert.equal((await query('SELECT id FROM custom_stickers WHERE id=?',[sticker.id])).length,1);
   const own=await upload(stranger);await query('DELETE FROM users WHERE id=?',[stranger.id]);assert.equal((await query('SELECT id FROM custom_stickers WHERE id=?',[own.id])).length,0);
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));for(const id of owners)await query('DELETE FROM users WHERE id=?',[id]);await closeDatabase();}
});
