import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test,{before,after} from 'node:test';
import { query,withTransaction,closeDatabase } from '../src/db.js';
import { getAgent } from '../../agents/registry.js';
import { hashSiteDocumentValue } from '../src/site-document-repository.js';
import { createSpecialistMessageService } from '../src/specialist-message-service.js';
import { deleteMessageForUser } from '../src/message-repository.js';
import { messageSchema } from '../src/schemas.js';
import { createComicRenderRepository } from '../src/comic-render-repository.js';
import { createAITaskRepository } from '../src/ai-task-repository.js';
import { createComicRenderExecutor } from '../src/comic-render-executor.js';
import { createComicRenderStorage } from '../src/comic-render-storage.js';
import { resolveAIContextReferences } from '../src/ai-context.js';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import express from 'express';
import { registerMessageRoutes } from '../src/routes/message-routes.js';
import { createProductCatalogRepository } from '../src/product-catalog-repository.js';
import { seedPublishedAgentConsent,cleanupPublishedAgentConsent } from './helpers/agent-publishing-fixture.js';

const module = await import('../src/chat-content-preview-service.js').catch(()=>({}));
test('content preview service supplies a transaction-bound persistent confirmation contract',()=>assert.equal(typeof module.createChatContentPreviewService,'function'));
const enabled=process.env.RUN_CHAT_CONTENT_INTEGRATION==='1';
const integration=(name,work)=>test(name,{skip:!enabled&&'Requires dedicated loopback migrated PG'},work);
const owners=[],publications=[];
let service;
before(async()=>{if(!enabled)return;assert.match(process.env.DATABASE_URL,/127\.0\.0\.1.*_migration_test$/);service=module.createChatContentPreviewService({assertReady:async()=>{}});});
after(async()=>{if(!enabled)return;await cleanupPublishedAgentConsent({userIds:owners});await query('DELETE FROM users WHERE id=ANY(?::text[])',[owners]);for(const p of publications.reverse())await p.cleanup();await closeDatabase();});
async function fixture(kind='comic',options={}){
  const userId=crypto.randomUUID(),threadId=crypto.randomUUID(),inputMessageId=crypto.randomUUID(),outputMessageId=crypto.randomUUID();owners.push(userId);
  await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES (?,?,'fixture',?,?)",[userId,`${userId}@example.invalid`,`Creator ${userId}`,String(crypto.randomInt(100000000000,999999999999))]);
  publications.push(await seedPublishedAgentConsent({userId,agentKeys:['comic-diary']}));
  await query("INSERT INTO chat_threads(id,user_id,agent_id,title,kind) VALUES (?,?,'comic-diary','Comic','agent')",[threadId,userId]);
  await query("INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content) VALUES (?,?,?,'user','User','Paper boat')",[inputMessageId,userId,threadId]);
  await query("INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content) VALUES (?,?,?,'agent','Comic','Preview')",[outputMessageId,userId,threadId]);
  const frames=Array.from({length:4},(_,i)=>({index:i+1,title:`Frame ${i+1}`,scene:'Cat and dog',caption:'',dialogue:'',mood:'',camera:'',mediaAssetIds:[]}));
  const decision={type:'content_preview',kind,reply:'Preview',snapshot:kind==='comic'?{title:'Boat',summary:'Paper boat',style:'cute',frameCount:4,frames}:{title:'Boat',body:'We launched a paper boat.',mood:'happy'}};
  const agent=await getAgent('comic-diary');
  const id=await withTransaction(connection=>service.persistPreparedInTransaction({connection,userId,threadId,inputMessageId,outputMessageId,decision,
    sourceSnapshots:[{id:inputMessageId,hash:hashSiteDocumentValue(['user','Paper boat'])}],contextRefs:[],authority:{agentId:agent.key,agentVersion:agent.version},...options}));
  const preview=await service.getPreview({userId,previewId:id.id});
  return {userId,threadId,inputMessageId,outputMessageId,preview,confirm:{userId,previewId:id.id,revision:preview.revision,snapshotHash:preview.snapshotHash,idempotencyKey:crypto.randomUUID()}};
}
integration('concurrent and changed-key confirmations consume one immutable comic without another model',async()=>{
  const f=await fixture();const [a,b]=await Promise.all([service.confirm(f.confirm),service.confirm({...f.confirm,idempotencyKey:crypto.randomUUID()})]);
  assert.deepEqual(a.result,b.result);assert.equal(a.status,'confirmed');
  assert.equal((await query("SELECT id FROM ai_tasks WHERE user_id=? AND kind='comic_render'",[f.userId])).length,1);
  assert.equal((await query('SELECT id FROM station_comic_diaries WHERE user_id=?',[f.userId])).length,1);
  assert.equal((await query('SELECT id FROM station_diary_entries WHERE user_id=?',[f.userId])).length,0);
  await assert.rejects(createComicRenderRepository().createComicRenderTask({userId:f.userId,comicDiaryId:a.result.comicDiaryId,
    idempotencyKey:crypto.randomUUID(),assertReady:async()=>{}}),e=>e.status===409);
  await query("UPDATE chat_content_previews SET expires_at=clock_timestamp()-INTERVAL '1 day' WHERE id=?",[a.id]);
  await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='comic-diary'",[f.userId]);
  assert.equal((await service.getPreview({userId:f.userId,previewId:f.preview.id})).status,'confirmed');
  assert.deepEqual((await service.confirm(f.confirm)).result,a.result);
  await assert.rejects(service.confirm({...f.confirm,snapshotHash:'b'.repeat(64)}),e=>e.status===409);
});
integration('diary confirmation writes only private diary and replays after source recall',async()=>{
  const f=await fixture('diary'),result=await service.confirm(f.confirm);
  const [diary]=await query('SELECT * FROM station_diary_entries WHERE id=?',[result.result.diaryEntryId]);assert.equal(diary.visibility,'private');assert.equal(diary.source,'agent');
  assert.equal((await query('SELECT id FROM ai_tasks WHERE user_id=?',[f.userId])).length,0);
  await query("UPDATE chat_messages SET recalled_at=clock_timestamp(),content='' WHERE id=?",[f.inputMessageId]);
  assert.deepEqual((await service.confirm(f.confirm)).result,result.result);
  await assert.rejects(service.getPreview({userId:f.userId,previewId:f.preview.id}),e=>e.status===404);
});
integration('source changes, owner mismatch and transactional audit failure never create a target',async()=>{
  const f=await fixture();await query("UPDATE chat_messages SET content='Changed story' WHERE id=?",[f.inputMessageId]);
  await assert.rejects(service.confirm(f.confirm),e=>e.status===409);
  await assert.rejects(service.getPreview({userId:crypto.randomUUID(),previewId:f.preview.id}),e=>e.status===404);
  const g=await fixture();const broken=module.createChatContentPreviewService({assertReady:async()=>{},audit:async()=>{throw Error('audit unavailable');}});
  await assert.rejects(broken.confirm(g.confirm),/audit unavailable/);
  assert.equal((await query('SELECT id FROM station_comic_diaries WHERE user_id=?',[g.userId])).length,0);
  assert.equal((await query('SELECT id FROM ai_tasks WHERE user_id=?',[g.userId])).length,0);
  assert.equal((await service.getPreview({userId:g.userId,previewId:g.preview.id})).status,'pending');
});
integration('dispatch commits one proposal with its real reply and history, continuation supersedes before provider',async()=>{
  const f=await fixture(),[existing]=await query('SELECT snapshot FROM chat_content_previews WHERE id=?',[f.preview.id]);
  let calls=0;
  const send=createSpecialistMessageService({runAgentRuntime:async options=>{
    await options.beforeModelCall();calls++;
    if(options.appContext.contentPreviewContext){
      assert.equal((await query('SELECT status FROM chat_content_previews WHERE id=?',[f.preview.id]))[0].status,'superseded');
    }
    return {reply:JSON.stringify({type:'content_preview',kind:'comic',reply:'请确认生成漫画',snapshot:existing.snapshot}),provider:'fixture',latencyMs:1};
  }});
  const input=messageSchema.parse({content:'请按刚才的故事生成漫画',clientMessageId:crypto.randomUUID(),contentPreviewContext:{id:f.preview.id,revision:1}});
  const result=await send({userId:f.userId,threadId:f.threadId,body:input});
  assert.equal(result.messages.at(-1).metadata.contentPreview.version,1);
  assert.equal((await send({userId:f.userId,threadId:f.threadId,body:input})).messages.at(-1).id,result.messages.at(-1).id);assert.equal(calls,1);
  const [preview]=await query('SELECT * FROM chat_content_previews WHERE id=?',[result.messages.at(-1).metadata.contentPreview.id]);
  assert.equal(preview.output_message_id,result.messages.at(-1).id);assert.ok(preview.source_snapshots.some(s=>s.id===f.outputMessageId));
  assert.equal((await service.getPreview({userId:f.userId,previewId:preview.id})).status,'pending');
});
integration('every newly admitted comic message supersedes all same-thread pending proposals before the model',async()=>{
  const first=await fixture(),latest=await withSelectedPhoto(first),other=await fixture();
  let calls=0,enter,release;
  const entered=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{release=resolve;});
  const send=createSpecialistMessageService({runAgentRuntime:async options=>{
    await options.beforeModelCall();calls++;enter();await held;
    return {reply:JSON.stringify({type:'reply',reply:'我们可以先讨论新故事。'}),provider:'fixture',latencyMs:1};
  }});
  // Ordinary discussion also expires the old confirmation: admission never
  // guesses from keywords whether this message changes the proposal.
  const sending=send({userId:first.userId,threadId:first.threadId,body:messageSchema.parse({content:'我们先讨论故事的下一步。',clientMessageId:crypto.randomUUID()})});
  await entered;
  try{
    for(const previous of [first,latest]){
      const [row]=await query('SELECT status,revision FROM chat_content_previews WHERE id=?',[previous.preview.id]);
      assert.equal(row.status,'superseded');assert.equal(row.revision,previous.preview.revision+1);
      await assert.rejects(service.confirm(previous.confirm),error=>error.status===409&&error.details.code==='CHAT_CONTENT_CHANGED');
    }
    assert.equal((await service.getPreview({userId:other.userId,previewId:other.preview.id})).status,'pending');
    assert.equal((await query("SELECT id FROM ai_tasks WHERE user_id=? AND kind='comic_render'",[first.userId])).length,0);
  }finally{release();await sending;}
  assert.equal(calls,1);
});
integration('confirmed continuation keeps its original work and snapshot while superseding other pending proposals',async()=>{
  const f=await fixture(),saved=await service.confirm(f.confirm),pending=await withSelectedPhoto(f);
  const send=createSpecialistMessageService({runAgentRuntime:async options=>{
    await options.beforeModelCall();
    assert.deepEqual(options.appContext.contentPreviewContext,{kind:saved.kind,snapshot:saved.snapshot});
    assert.equal((await service.getPreview({userId:f.userId,previewId:f.preview.id})).status,'confirmed');
    assert.equal((await service.getPreview({userId:f.userId,previewId:pending.preview.id})).status,'superseded');
    assert.deepEqual((await service.confirm(f.confirm)).result,saved.result);
    return {reply:JSON.stringify({type:'content_preview',kind:'comic',reply:'请确认新的漫画提案',snapshot:saved.snapshot}),provider:'fixture',latencyMs:1};
  }});
  const result=await send({userId:f.userId,threadId:f.threadId,body:messageSchema.parse({content:'再做一个夜晚版本',clientMessageId:crypto.randomUUID(),contentPreviewContext:{id:f.preview.id,revision:saved.revision}})});
  const [preview]=await query('SELECT status,base_preview_id FROM chat_content_previews WHERE id=?',[result.messages.at(-1).metadata.contentPreview.id]);
  assert.equal(preview.status,'pending');assert.equal(preview.base_preview_id,f.preview.id);
  assert.equal((await query("SELECT id FROM ai_tasks WHERE user_id=? AND kind='comic_render'",[f.userId])).length,1);
});
integration('continuation uses the complete current selection and never reads removed photo bytes',async()=>{
  const f=await withSelectedPhoto(await fixture());
  await query("UPDATE station_media_assets SET deleted_at=clock_timestamp(),status='deleted' WHERE id=?",[f.mediaId]);
  let modelCalls=0;
  const send=createSpecialistMessageService({runAgentRuntime:async options=>{
    await options.beforeModelCall();modelCalls++;
    assert.deepEqual(options.appContext.resolvedReferences,[]);
    const snapshot=options.appContext.contentPreviewContext.snapshot;
    assert.ok(snapshot.frames.every(frame=>frame.mediaAssetIds.length===0));
    return {reply:JSON.stringify({type:'content_preview',kind:'comic',reply:'已移除图片，请确认文字漫画',snapshot}),provider:'fixture',latencyMs:1};
  }});
  const result=await send({userId:f.userId,threadId:f.threadId,body:messageSchema.parse({content:'移除素材，按原文字故事重新创作',clientMessageId:crypto.randomUUID(),contextRefs:[],contentPreviewContext:{id:f.preview.id,revision:f.preview.revision}})});
  assert.equal(modelCalls,1);
  const id=result.messages.at(-1).metadata.contentPreview.id,preview=await service.getPreview({userId:f.userId,previewId:id});
  assert.deepEqual(preview.sources,[]);assert.ok(preview.snapshot.frames.every(frame=>!frame.mediaAssetIds.length));
  const saved=await service.confirm({userId:f.userId,previewId:id,revision:preview.revision,snapshotHash:preview.snapshotHash,idempotencyKey:crypto.randomUUID()});
  const repository=createComicRenderRepository(),token=crypto.randomUUID();
  await query("UPDATE ai_tasks SET status='running',claim_token=?,lease_until=clock_timestamp()+INTERVAL '1 minute' WHERE id=?",[token,saved.result.comicRenderTaskId]);
  let byteReads=0,imageCalls=0;
  const storage=createComicRenderStorage({fetchObject:async()=>{byteReads++;throw Error('Removed image must never be fetched');}});
  await createComicRenderExecutor({repository,storage,provider:{generateFrame:async({selectedImages})=>{imageCalls++;assert.deepEqual(selectedImages,[]);throw new TypeError('fixture ambiguous result');}}})({id:saved.result.comicRenderTaskId,userId:f.userId,claimToken:token});
  assert.equal(imageCalls,1);assert.equal(byteReads,0);
});
integration('continuation preserves retained versioned sources and excludes removed recalled chat content from the model',async()=>{
  const f=await withSelectedPhoto(await fixture()),agent=await getAgent('comic-diary'),removedId=crypto.randomUUID(),oldHistoryId=crypto.randomUUID(),aliveId=crypto.randomUUID(),diaryId=crypto.randomUUID();
  const secret='REMOVED_EXPLICIT_CHAT_SOURCE';
  await query("INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content) VALUES(?,?,?,'user','User',?)",[removedId,f.userId,f.threadId,secret]);
  await query("INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content) VALUES(?,?,?,'agent','Comic','Former history')",[oldHistoryId,f.userId,f.threadId]);
  await query("INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content) VALUES(?,?,?,'user','User',?)",[aliveId,f.userId,f.threadId,`${secret}_STILL_VISIBLE`]);
  await query("INSERT INTO station_diary_entries(id,user_id,title,body) VALUES(?,?,'Removed diary','REMOVED_DIARY_BODY')",[diaryId,f.userId]);
  const selected=await resolveAIContextReferences({userId:f.userId,refs:[{kind:'station-photo',id:f.mediaId},{kind:'chat-message',id:removedId},{kind:'chat-message',id:aliveId},{kind:'station-diary',id:diaryId}],grantedScopes:agent.permissions});
  const inputMessageId=crypto.randomUUID(),outputMessageId=crypto.randomUUID();
  await query("INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content) VALUES(?,?,?,'user','User','Use chosen sources'),(?,?,?,'agent','Comic','Proposal')",[inputMessageId,f.userId,f.threadId,outputMessageId,f.userId,f.threadId]);
  const {id}=await withTransaction(connection=>service.persistPreparedInTransaction({connection,userId:f.userId,threadId:f.threadId,inputMessageId,outputMessageId,decision:{type:'content_preview',kind:'comic',reply:'Preview',snapshot:f.preview.snapshot},
    sourceSnapshots:[{id:inputMessageId,hash:hashSiteDocumentValue(['user','Use chosen sources'])},{id:removedId,hash:hashSiteDocumentValue(['user',secret])},{id:oldHistoryId,hash:hashSiteDocumentValue(['agent','Former history'])}],contextRefs:selected.references,authority:{agentId:agent.key,agentVersion:agent.version}}));
  await query("UPDATE chat_messages SET recalled_at=clock_timestamp(),content='' WHERE id=?",[removedId]);
  await query("UPDATE chat_messages SET deleted_at=clock_timestamp(),content='' WHERE id=?",[oldHistoryId]);
  let calls=0;
  const send=createSpecialistMessageService({runAgentRuntime:async options=>{
    await options.beforeModelCall();calls++;
    assert.deepEqual(options.appContext.resolvedReferences.map(ref=>ref.id),[f.mediaId]);
    assert.ok(options.appContext.contentPreviewContext.snapshot.frames.every(frame=>frame.mediaAssetIds.includes(f.mediaId)));
    assert.doesNotMatch(JSON.stringify(options.messages),new RegExp(secret));
    assert.doesNotMatch(JSON.stringify(options.appContext),/REMOVED_DIARY_BODY/);
    return {reply:JSON.stringify({type:'content_preview',kind:'comic',reply:'Preview',snapshot:options.appContext.contentPreviewContext.snapshot}),provider:'fixture',latencyMs:1};
  }});
  const result=await send({userId:f.userId,threadId:f.threadId,body:messageSchema.parse({content:'只保留所选图片',clientMessageId:crypto.randomUUID(),contextRefs:[{kind:'station-photo',id:f.mediaId}],contentPreviewContext:{id,revision:1}})});
  const [created]=await query('SELECT context_refs,source_snapshots FROM chat_content_previews WHERE id=?',[result.messages.at(-1).metadata.contentPreview.id]);
  assert.equal(calls,1);assert.deepEqual(created.context_refs,selected.references.filter(ref=>ref.kind==='station-photo'));
  assert.ok(!created.source_snapshots.some(source=>[removedId,oldHistoryId,aliveId].includes(source.id)));
  await query("UPDATE station_media_assets SET byte_size=9 WHERE id=?",[f.mediaId]);
  let changedCalls=0;
  const blocked=createSpecialistMessageService({runAgentRuntime:async()=>{changedCalls++;throw Error('must not reach model');}});
  await assert.rejects(blocked({userId:f.userId,threadId:f.threadId,body:messageSchema.parse({content:'保留图片但不重新选择',clientMessageId:crypto.randomUUID(),contextRefs:[{kind:'station-photo',id:f.mediaId}],contentPreviewContext:{id:result.messages.at(-1).metadata.contentPreview.id,revision:1}})}),error=>error.status===409&&error.details.code==='AI_CONTEXT_CHANGED');
  assert.equal(changedCalls,0);
});
integration('expired preview, foreign-thread continuation and old HTTP client reject without provider calls',async()=>{
  const f=await fixture();await query("UPDATE chat_content_previews SET expires_at=clock_timestamp()-INTERVAL '1 day' WHERE id=?",[f.preview.id]);
  await assert.rejects(service.confirm(f.confirm),e=>e.details.code==='CHAT_CONTENT_EXPIRED');
  const g=await fixture();
  await assert.rejects(withTransaction(connection=>service.continuationInTransaction({connection,userId:g.userId,threadId:crypto.randomUUID(),context:{id:g.preview.id,revision:1},agent:null})),e=>e.status===409);
  let calls=0;const app=express();app.use(express.json());
  registerMessageRoutes(app,{authenticate:(req,_res,next)=>{req.user={id:g.userId};next();},asyncHandler:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next),getOnlineUserIds:()=>[],sendRealtimeToUser(){},runAgentRuntime:async()=>{calls++;throw Error('must not call');}});
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.details?.code}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/threads/${g.threadId}/messages`,{method:'POST',headers:{'Content-Type':'application/json','X-Miaoxun-AI-Contract':'1','X-Miaoxun-Agent-Workspace':'6'},body:JSON.stringify({content:'Create comic',clientMessageId:crypto.randomUUID()})});
    assert.equal(response.status,426);assert.equal(calls,0);
    const history=await fetch(`http://127.0.0.1:${server.address().port}/api/threads/${g.threadId}/messages`);
    assert.equal(history.status,200);assert.ok((await history.json()).data.length>=2);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
async function withSelectedPhoto(f) {
  const mediaId=crypto.randomUUID();await query("INSERT INTO station_media_assets(id,user_id,kind,status,caption) VALUES (?,?,'image','uploaded','Selected photo')",[mediaId,f.userId]);
  const agent=await getAgent('comic-diary');
  const selected=await resolveAIContextReferences({userId:f.userId,refs:[{kind:'station-photo',id:mediaId}],grantedScopes:agent.permissions});
  const inputMessageId=crypto.randomUUID(),outputMessageId=crypto.randomUUID();
  await query("INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content) VALUES (?,?,?,'user','User','Selected image story'),(?,?,?,'agent','Comic','Selected preview')",[inputMessageId,f.userId,f.threadId,outputMessageId,f.userId,f.threadId]);
  const [old]=await query('SELECT snapshot FROM chat_content_previews WHERE id=?',[f.preview.id]);
  const decision={type:'content_preview',kind:'comic',reply:'Please confirm',snapshot:{...old.snapshot,frames:old.snapshot.frames.map(frame=>({...frame,mediaAssetIds:[mediaId]}))}};
  const {id}=await withTransaction(connection=>service.persistPreparedInTransaction({connection,userId:f.userId,threadId:f.threadId,inputMessageId,outputMessageId,decision,
    sourceSnapshots:[{id:inputMessageId,hash:hashSiteDocumentValue(['user','Selected image story'])}],contextRefs:selected.references,authority:{agentId:agent.key,agentVersion:agent.version}}));
  const preview=await service.getPreview({userId:f.userId,previewId:id});
  return {...f,mediaId,inputMessageId,outputMessageId,preview,confirm:{userId:f.userId,previewId:id,revision:preview.revision,snapshotHash:preview.snapshotHash,idempotencyKey:crypto.randomUUID()}};
}
integration('selected image content revision is bound before confirm and on every worker checkpoint',async()=>{
  const f=await withSelectedPhoto(await fixture());await query("UPDATE station_media_assets SET byte_size=7 WHERE id=?",[f.mediaId]);
  await assert.rejects(service.confirm(f.confirm),e=>e.status===409);
  const g=await withSelectedPhoto(await fixture()),confirmed=await service.confirm(g.confirm),repository=createComicRenderRepository();
  const claim=await createAITaskRepository().claimAITask({kinds:['comic_render']});
  // Earlier tests leave queued tasks; claim the intended one directly with a finite lease.
  if(claim.id!==confirmed.result.comicRenderTaskId)await query("UPDATE ai_tasks SET status='cancelled',claim_token=NULL,lease_until=NULL WHERE id=?",[claim.id]);
  const token=crypto.randomUUID();await query("UPDATE ai_tasks SET status='running',claim_token=?,lease_until=clock_timestamp()+INTERVAL '1 minute' WHERE id=?",[token,confirmed.result.comicRenderTaskId]);
  const identity={taskId:confirmed.result.comicRenderTaskId,claimToken:token};
  await repository.revalidateComicRenderTask(identity);await query("UPDATE station_media_assets SET byte_size=9 WHERE id=?",[g.mediaId]);
  await assert.rejects(repository.revalidateComicRenderTask(identity),e=>e.status===409);
  await assert.rejects(service.getPreview({userId:g.userId,previewId:g.preview.id}),e=>e.status===404);
  assert.ok(await repository.getComicRenderTask({userId:g.userId,taskId:confirmed.result.comicRenderTaskId}));
});
integration('worker source recall stops dispatch and confirmed history recall hides preview while preserving owner work',async()=>{
  const f=await fixture(),confirmed=await service.confirm(f.confirm),repository=createComicRenderRepository(),token=crypto.randomUUID();
  await query("UPDATE ai_tasks SET status='running',claim_token=?,lease_until=clock_timestamp()+INTERVAL '1 minute' WHERE id=?",[token,confirmed.result.comicRenderTaskId]);
  await query("UPDATE chat_messages SET recalled_at=clock_timestamp(),content='' WHERE id=?",[f.inputMessageId]);
  let calls=0;const executor=createComicRenderExecutor({repository,storage:{},provider:{generateFrame:async()=>{calls++;}}});
  await executor({id:confirmed.result.comicRenderTaskId,userId:f.userId,claimToken:token});assert.equal(calls,0);
  await assert.rejects(service.getPreview({userId:f.userId,previewId:f.preview.id}),e=>e.status===404);
  await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='comic-diary'",[f.userId]);
  assert.equal((await repository.getComicRenderTask({userId:f.userId,taskId:confirmed.result.comicRenderTaskId})).status,'failed');
  const g=await fixture();let send;
  send=createSpecialistMessageService({runAgentRuntime:async options=>{await options.beforeModelCall();const [p]=await query('SELECT snapshot FROM chat_content_previews WHERE id=?',[g.preview.id]);return {reply:JSON.stringify({type:'content_preview',kind:'comic',reply:'Preview',snapshot:p.snapshot}),provider:'fixture',latencyMs:1};}});
  const result=await send({userId:g.userId,threadId:g.threadId,body:messageSchema.parse({content:'Create new story',clientMessageId:crypto.randomUUID()})});
  const id=result.messages.at(-1).metadata.contentPreview.id,preview=await service.getPreview({userId:g.userId,previewId:id});
  const saved=await service.confirm({userId:g.userId,previewId:id,revision:preview.revision,snapshotHash:preview.snapshotHash,idempotencyKey:crypto.randomUUID()});
  await query("UPDATE chat_messages SET recalled_at=clock_timestamp(),content='' WHERE id=?",[g.outputMessageId]);
  await assert.rejects(service.getPreview({userId:g.userId,previewId:id}),e=>e.status===404);
  assert.ok(await repository.getComicRenderTask({userId:g.userId,taskId:saved.result.comicRenderTaskId}));
});
integration('deleting the proposal output stops worker dispatch and prevents a late image from being bound',async()=>{
  const f=await fixture(),saved=await service.confirm(f.confirm),repository=createComicRenderRepository(),token=crypto.randomUUID();
  const identity={taskId:saved.result.comicRenderTaskId,claimToken:token};
  await query("UPDATE ai_tasks SET status='running',claim_token=?,lease_until=clock_timestamp()+INTERVAL '1 minute' WHERE id=?",[token,identity.taskId]);
  await repository.revalidateComicRenderTask(identity);
  await deleteMessageForUser({userId:f.userId,threadId:f.threadId,messageId:f.outputMessageId});
  await assert.rejects(repository.revalidateComicRenderTask(identity),error=>error.status===409&&error.details.code==='CHAT_CONTENT_SOURCE_CHANGED');
  let calls=0;
  await createComicRenderExecutor({repository,storage:{},provider:{generateFrame:async()=>{calls++;}}})({id:identity.taskId,userId:f.userId,claimToken:token});
  assert.equal(calls,0);
  assert.equal((await repository.getComicRenderTask({userId:f.userId,taskId:identity.taskId})).status,'failed');
  assert.deepEqual((await service.confirm(f.confirm)).result,saved.result);

  const g=await fixture(),later=await service.confirm(g.confirm),lateToken=crypto.randomUUID(),objects=new Map();
  await query("UPDATE ai_tasks SET status='running',claim_token=?,lease_until=clock_timestamp()+INTERVAL '1 minute' WHERE id=?",[lateToken,later.result.comicRenderTaskId]);
  const bytes=await sharp({create:{width:4,height:4,channels:3,background:'#123456'}}).png().toBuffer();
  const storage=createComicRenderStorage({bucket:'fixture-output-delete',query,transaction:withTransaction,
    putObject:async({objectKey,body})=>objects.set(objectKey,body),
    inspectObject:async({objectKey})=>({contentType:'image/webp',contentLength:objects.get(objectKey).length}),
    deleteObject:async({objectKey})=>objects.delete(objectKey),bindAsset:repository.bindComicFrameAssetInTransaction});
  let lateCalls=0;
  await createComicRenderExecutor({repository,storage,provider:{generateFrame:async()=>{
    lateCalls++;await deleteMessageForUser({userId:g.userId,threadId:g.threadId,messageId:g.outputMessageId});
    return {bytes,mimeType:'image/png'};
  }}})({id:later.result.comicRenderTaskId,userId:g.userId,claimToken:lateToken});
  assert.equal(lateCalls,1);assert.equal(objects.size,0);
  const task=await repository.getComicRenderTask({userId:g.userId,taskId:later.result.comicRenderTaskId});
  assert.equal(task.status,'failed');assert.ok(task.frames.every(frame=>frame.mediaAssetId===null));
  assert.equal((await query("SELECT id FROM station_media_assets WHERE user_id=? AND status='uploaded' AND deleted_at IS NULL",[g.userId])).length,0);
});
integration('confirmation replay versus worker and recall versus confirm finish without reverse lock waits',async()=>{
  const f=await fixture(),saved=await service.confirm(f.confirm),repository=createComicRenderRepository(),token=crypto.randomUUID();
  await query("UPDATE ai_tasks SET status='running',claim_token=?,lease_until=clock_timestamp()+INTERVAL '1 minute' WHERE id=?",[token,saved.result.comicRenderTaskId]);
  const identity={taskId:saved.result.comicRenderTaskId,claimToken:token};
  const both=await Promise.all([service.confirm({...f.confirm,idempotencyKey:crypto.randomUUID()}),repository.revalidateComicRenderTask(identity)]);
  assert.equal(both[0].result.comicRenderTaskId,both[1].id);
  const g=await fixture();const results=await Promise.allSettled([service.confirm(g.confirm),query("UPDATE chat_messages SET recalled_at=clock_timestamp(),content='' WHERE id=?",[g.inputMessageId])]);
  assert.ok(results.every(r=>r.status==='fulfilled'||[404,409].includes(r.reason.status)));
  const [count]=await query("SELECT count(*)::integer AS total FROM ai_tasks WHERE user_id=? AND kind='comic_render'",[g.userId]);assert.ok(count.total<=1);
});
integration('media deletion concurrent with output storage leaves no dangling delivered image or deadlock',async()=>{
  const f=await withSelectedPhoto(await fixture()),saved=await service.confirm(f.confirm),repository=createComicRenderRepository(),token=crypto.randomUUID();
  await query("UPDATE ai_tasks SET status='running',claim_token=?,lease_until=clock_timestamp()+INTERVAL '1 minute' WHERE id=?",[token,saved.result.comicRenderTaskId]);
  await repository.markComicFrameRunning({taskId:saved.result.comicRenderTaskId,claimToken:token,frameIndex:1});
  const bytes=await sharp({create:{width:4,height:4,channels:3,background:'#123456'}}).png().toBuffer(),objects=new Map();
  const storage=createComicRenderStorage({bucket:'fixture-chat',query,transaction:withTransaction,putObject:async({objectKey,body})=>objects.set(objectKey,body),
    inspectObject:async({objectKey})=>({contentType:'image/webp',contentLength:objects.get(objectKey).length}),deleteObject:async({objectKey})=>objects.delete(objectKey),
    fetchObject:async()=>({body:Readable.from([bytes])}),bindAsset:repository.bindComicFrameAssetInTransaction});
  const results=await Promise.allSettled([storage.storeComicFrame({userId:f.userId,taskId:saved.result.comicRenderTaskId,claimToken:token,frameIndex:1,bytes,mimeType:'image/png'}),
    query("UPDATE station_media_assets SET deleted_at=clock_timestamp(),status='deleted' WHERE id=?",[f.mediaId])]);
  for(const result of results)if(result.status==='rejected')assert.ok(result.reason.status>=400&&result.reason.status<600);
  const [output]=await query('SELECT status,media_asset_id FROM comic_task_outputs WHERE task_id=? AND frame_index=1',[saved.result.comicRenderTaskId]);
  if(output.media_asset_id)assert.equal((await query("SELECT id FROM station_media_assets WHERE id=? AND status='uploaded' AND deleted_at IS NULL",[output.media_asset_id])).length,1);
});
integration('dispatch rejects an otherwise valid replacement product grant selected while model is pending',async()=>{
  const f=await fixture(),catalog=createProductCatalogRepository(),agent=await getAgent('comic-diary');
  const [old]=await query('SELECT * FROM user_entitlements WHERE user_id=?',[f.userId]);
  const [dep]=await query("SELECT * FROM product_agent_dependencies WHERE product_version_id=? AND agent_key='comic-diary'",[old.product_version_id]);
  const key=`comic-alternate-${crypto.randomUUID()}`;
  let alternate=await catalog.createProduct({productKey:key,version:'1.0.0',displayName:'Alternate Comic',description:'Explicit fixture',
    identity:{key,avatarKind:'agent-mark',displayName:'Alternate Comic',description:'Explicit fixture',mark:'漫',shape:'rounded',colors:agent.identity.colors,published:false,source:'admin',updatedAt:'2026-11-11T00:00:00.000Z'},
    supportedPlatforms:['ios'],createdBy:f.userId,dependencies:[{agentKey:agent.key,agentReleaseId:dep.agent_release_id,version:agent.version,scopes:agent.permissions}]});
  await catalog.transitionProduct({productId:alternate.id,productVersionId:alternate.productVersionId,toStatus:'review',actorUserId:f.userId,reason:'fixture'});
  alternate=await catalog.transitionProduct({productId:alternate.id,productVersionId:alternate.productVersionId,toStatus:'published',actorUserId:f.userId,reason:'fixture'});
  publications.push({cleanup:async()=>{await query('DELETE FROM product_status_history WHERE product_id=?',[alternate.id]);await query('DELETE FROM products WHERE id=?',[alternate.id]);}});
  const alternative=await catalog.createEntitlement({userId:f.userId,productId:alternate.id,productVersionId:alternate.productVersionId,grantedScopes:agent.permissions,consentVersion:'fixture',idempotencyKey:crypto.randomUUID()});
  await query("UPDATE user_entitlements SET status='disabled' WHERE id=?",[alternative.id]);
  const send=createSpecialistMessageService({runAgentRuntime:async options=>{await options.beforeModelCall();
    await query("UPDATE user_entitlements SET status=CASE WHEN id=? THEN 'disabled' ELSE 'enabled' END WHERE user_id=?",[old.id,f.userId]);
    return {reply:JSON.stringify({type:'content_preview',kind:'diary',reply:'Please save',snapshot:{title:'Boat',body:'A story',mood:''}}),provider:'fixture',latencyMs:1};}});
  const input=messageSchema.parse({content:'Save this diary',clientMessageId:crypto.randomUUID()});
  await assert.rejects(send({userId:f.userId,threadId:f.threadId,body:input}),e=>e.status===409);
  const [count]=await query('SELECT count(*)::integer AS total FROM chat_content_previews WHERE user_id=?',[f.userId]);assert.equal(count.total,1);
});
