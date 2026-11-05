import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { query, closeDatabase } from '../src/db.js';
import { authenticate, hashToken } from '../src/auth.js';
import { registerChatAttachmentRoutes } from '../src/routes/chat-attachment-routes.js';
import { registerMessageRoutes } from '../src/routes/message-routes.js';
import { registerGroupChatRoutes } from '../src/routes/group-chat-routes.js';
import { createRequestErrorHandler } from '../src/request-observability.js';
const enabled=process.env.RUN_CHAT_ATTACHMENTS_POSTGRES==='1';
test('chat attachment HTTP upload, message/sync projection, peer/group access and recall use real PostgreSQL',{
 skip:!enabled&&'RUN_CHAT_ATTACHMENTS_POSTGRES=1 requires a dedicated loopback *_migration_test database',timeout:60000,
},async t=>{
 const url=new URL(process.env.DATABASE_URL);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.match(url.pathname,/_migration_test$/);
 const owners=[];let server;
 const asyncHandler=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
 const fixture=async()=>{
  const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('hex'),threadId=crypto.randomUUID();owners.push(id);
  await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES(?,?,'test',?,?)",[id,`${id}@example.invalid`,`Attachment ${id}`,String(crypto.randomInt(100000000000,999999999999))]);
  await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES(?,'Canonical Contact','C')",[id]);
  await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,CURRENT_TIMESTAMP+INTERVAL '1 hour')",[crypto.randomUUID(),id,hashToken(token)]);
  await query("INSERT INTO chat_threads(id,user_id,title,kind) VALUES(?,?,'private conversation','direct')",[threadId,id]);
  return{id,token,threadId};
 };
 let origin;
 const call=async(path,{owner,method='GET',body,headers={},status=200,binary=false}={})=>{
  const response=await fetch(`${origin}${path}`,{method,headers:{...(owner?{Authorization:`Bearer ${owner.token}`} : {}),...(body&&!(body instanceof Buffer)?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:body instanceof Buffer?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
  const payload=binary?Buffer.from(await response.arrayBuffer()):await response.json();
  assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(binary?response.status:payload)}`);
  return binary?payload:payload.data||payload;
 };
 const upload=(owner,threadId,bytes,key=crypto.randomUUID(),status=201)=>call(`/api/threads/${threadId}/attachments/upload`,{owner,method:'POST',status,body:bytes,headers:{'Content-Type':'application/octet-stream','Idempotency-Key':key,'X-Miaoxun-Filename':'note.txt','X-Miaoxun-Attachment-Kind':'file','X-Miaoxun-Attachment-Mime':'text/plain'}});
 const send=(owner,threadId,attachmentIds,status=201)=>call(`/api/threads/${threadId}/messages`,{owner,method:'POST',status,body:{content:'Here is the selected file',attachmentIds,clientMessageId:crypto.randomUUID()}});
 try{
  const app=express();app.use(express.json());
  registerChatAttachmentRoutes(app,{authenticate,asyncHandler});
  registerMessageRoutes(app,{authenticate,asyncHandler,getOnlineUserIds:()=>[],sendRealtimeToUser(){}});
  registerGroupChatRoutes(app,{authenticate,asyncHandler,sendRealtimeToUser(){}});
  app.use(createRequestErrorHandler({production:true,logger:{error(){}}}));
  await new Promise(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;
  const [owner,peer,third,stranger]=await Promise.all([fixture(),fixture(),fixture(),fixture()]);
  for(const other of [peer,third])for(const [from,to] of [[owner,other],[other,owner]])await query("INSERT INTO social_relationships(id,follower_user_id,followed_user_id,relation_type,status) VALUES(?,?,?,'friend','active')",[crypto.randomUUID(),from.id,to.id]);
  await query('UPDATE chat_threads SET peer_user_id=? WHERE id=?',[peer.id,owner.threadId]);
  await query('UPDATE chat_threads SET peer_user_id=? WHERE id=?',[owner.id,peer.threadId]);
  let file,message;
  await t.test('authentication, concurrent upload retry and filename/MIME validation',async()=>{
   await call(`/api/threads/${owner.threadId}/attachments`,{method:'POST',body:{kind:'location',latitude:1,longitude:2},status:401});
   const key=crypto.randomUUID();const results=await Promise.all([upload(owner,owner.threadId,Buffer.from('private selected content'),key),upload(owner,owner.threadId,Buffer.from('private selected content'),key)]);
   assert.equal(results[0].id,results[1].id);file=results[0];
   assert.equal(file.downloadPath,`/api/chat-attachments/${file.id}/content`);
   await upload(owner,owner.threadId,Buffer.from('changed'),key,409);
   await call(file.downloadPath,{owner,status:404});
   await upload(stranger,owner.threadId,Buffer.from('cannot upload to other owner'),crypto.randomUUID(),404);
  });
  await t.test('message response and GET carry canonical attachment; peer reads actual bytes; stranger cannot',async()=>{
   const result=await send(owner,owner.threadId,[file.id]);message=result.messages[0];
   assert.equal(message.metadata.attachments[0].id,file.id);
   assert.equal(message.metadata.attachments[0].filename,'note.txt');
   const peerMessages=await call(`/api/threads/${peer.threadId}/messages`,{owner:peer});
   assert.equal(peerMessages.at(-1).metadata.attachments[0].id,file.id);
   assert.equal((await call(file.downloadPath,{owner:peer,binary:true})).toString(),'private selected content');
   await call(file.downloadPath,{owner:stranger,status:404});
   await send(stranger,stranger.threadId,[file.id],404);
   await send(owner,owner.threadId,[file.id,file.id],400);
  });
  await t.test('recall removes public metadata from both copies and denies byte access',async()=>{
   await call(`/api/threads/${owner.threadId}/messages/${message.id}/recall`,{owner,method:'POST'});
   const ownMessages=await call(`/api/threads/${owner.threadId}/messages`,{owner});
   assert.equal(ownMessages.at(-1).metadata.attachments,undefined);
   await call(file.downloadPath,{owner,status:404});await call(file.downloadPath,{owner:peer,status:404});
  });
  await t.test('structured contact uses canonical current friend record and rejects forged/unrelated data',async()=>{
   const path=`/api/threads/${owner.threadId}/attachments`;
   const created=await call(path,{owner,method:'POST',status:201,headers:{'Idempotency-Key':crypto.randomUUID()},body:{kind:'contact',userId:peer.id}});
   assert.equal(created.title,'Canonical Contact');assert.equal(created.data.userId,peer.id);assert.ok(created.data.aiId);
   await call(path,{owner,method:'POST',status:400,headers:{'Idempotency-Key':crypto.randomUUID()},body:{kind:'contact',userId:peer.id,name:'spoofed'}});
   await call(path,{owner,method:'POST',status:404,headers:{'Idempotency-Key':crypto.randomUUID()},body:{kind:'contact',userId:stranger.id}});
   await call(path,{owner,method:'POST',status:400,headers:{'Idempotency-Key':crypto.randomUUID()},body:{kind:'location',latitude:91,longitude:1}});
  });
  await t.test('group mirrors share one protected asset; sender recall closes access for all members',async()=>{
   const group=await call('/api/chat-groups',{owner,method:'POST',status:201,body:{title:'Attachment group',memberUserIds:[peer.id,third.id],idempotencyKey:crypto.randomUUID()}});
   const attachment=await upload(owner,group.thread.id,Buffer.from('group content'));
   const sent=await send(owner,group.thread.id,[attachment.id]);
   for(const recipient of [owner,peer,third])assert.equal((await call(attachment.downloadPath,{owner:recipient,binary:true})).toString(),'group content');
   await call(attachment.downloadPath,{owner:stranger,status:404});
   await call(`/api/threads/${group.thread.id}/messages/${sent.messages[0].id}/recall`,{owner,method:'POST'});
   for(const recipient of [owner,peer,third])await call(attachment.downloadPath,{owner:recipient,status:404});
  });
  await t.test('migration replay is nondestructive and account deletion cascades actual blob rows',async()=>{
   const attachment=await upload(stranger,stranger.threadId,Buffer.from('delete with owner'));
   const sql=await readFile(new URL('../database/053_chat_attachments.sql',import.meta.url),'utf8');await query(sql);await query(sql);
   assert.equal((await query('SELECT id FROM chat_attachments WHERE id=?',[attachment.id])).length,1);
   await query('DELETE FROM users WHERE id=?',[stranger.id]);
   assert.equal((await query('SELECT id FROM chat_attachments WHERE id=?',[attachment.id])).length,0);
  });
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const id of owners)await query('DELETE FROM users WHERE id=?',[id]);
  await closeDatabase();
 }
});
