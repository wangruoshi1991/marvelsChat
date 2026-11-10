import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before } from "node:test";
import { query, withTransaction, closeDatabase } from "../src/db.js";
import { createComicRenderRepository } from "../src/comic-render-repository.js";
import { createAITaskRepository } from "../src/ai-task-repository.js";
import { createComicRenderExecutor } from "../src/comic-render-executor.js";
import { createComicRenderStorage } from "../src/comic-render-storage.js";
import { createAITaskRunner } from "../src/ai-task-runner.js";
import { HttpError } from "../src/http-error.js";
import sharp from "sharp";
import { Readable } from "node:stream";
import { seedPublishedAgentConsent, cleanupPublishedAgentConsent } from "./helpers/agent-publishing-fixture.js";

const enabled = process.env.RUN_COMIC_RENDER_INTEGRATION === "1";
const integration = (name, work) => test(name, { skip: !enabled && "Set RUN_COMIC_RENDER_INTEGRATION=1 with migrated disposable loopback PostgreSQL" }, work);
const owners = [], publications = [];
const repository = createComicRenderRepository();
before(async () => {
  if (!enabled) return;
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname));
  assert.match((await query("SELECT current_database() AS name"))[0].name, /_migration_test$/);
});
after(async () => {
  if (!enabled) return;
  await cleanupPublishedAgentConsent({ userIds: owners });
  for (const id of owners) await query("DELETE FROM users WHERE id = ?", [id]);
  await query("DELETE FROM comic_render_cleanup_journal WHERE user_id=ANY(?::text[])",[owners]);
  for (const publication of publications.reverse()) await publication.cleanup();
  await closeDatabase();
});
async function fixture(frameCount=2) {
  const userId = crypto.randomUUID(), comicDiaryId = crypto.randomUUID(), mediaId = crypto.randomUUID();
  owners.push(userId);
  await query("INSERT INTO users (id,email,password_hash,display_name,ai_id) VALUES (?,?,'fixture-only',?,?)", [userId, `${userId}@example.invalid`, `Comic ${userId}`,String(crypto.randomInt(100000000000,999999999999))]);
  publications.push(await seedPublishedAgentConsent({ userId, agentKeys: ["comic-diary"] }));
  await query("INSERT INTO station_media_assets (id,user_id,kind,status) VALUES (?,?,'image','uploaded')", [mediaId,userId]);
  const frames = Array.from({length:frameCount},(_,i)=>i+1).map(index => ({ index,title:`Frame ${index}`,scene:"A quiet park",caption:"Walking",dialogue:"Hello",mood:"calm",camera:"wide",mediaAssetIds: [mediaId] }));
  await query("INSERT INTO station_comic_diaries (id,user_id,title,prompt,frames,source_media_asset_ids) VALUES (?,?,'Test','Selected story',?::jsonb,?::jsonb)", [comicDiaryId,userId,JSON.stringify(frames),JSON.stringify([mediaId])]);
  return { userId,comicDiaryId,mediaId,idempotencyKey:crypto.randomUUID(),assertReady:async()=>{} };
}
integration("comic task idempotency hashes current selections and remains invisible to legacy routes", async () => {
  const f = await fixture();
  const first = await repository.createComicRenderTask(f);
  const replay = await repository.createComicRenderTask(f);
  assert.equal(replay.reused,true);
  assert.equal(replay.task.id,first.task.id);
  assert.equal(first.task.frames.length,2);
  assert.equal(first.task.contractVersion,1);
  assert.deepEqual(first.task.progress,{total:2,succeeded:0,failed:0,unknown:0});
  const legacy = createAITaskRepository();
  assert.equal(await legacy.getAITask({userId:f.userId,taskId:first.task.id}),null);
  assert.deepEqual(await legacy.listAITasks({userId:f.userId}),[]);
  await assert.rejects(legacy.listAITaskEvents({userId:f.userId,taskId:first.task.id}),e=>e.status===404);
  await assert.rejects(legacy.mutateAITask({userId:f.userId,taskId:first.task.id,revision:1,operation:"cancel"}),e=>e.status===404);
  await query("UPDATE station_media_assets SET byte_size=2 WHERE id=?",[f.mediaId]);
  await assert.rejects(repository.createComicRenderTask(f),e=>e.details.code==="COMIC_RENDER_IDEMPOTENCY_CONFLICT");
  await repository.cancelQueuedComicRenderTask({userId:f.userId,taskId:first.task.id,revision:first.task.revision});
});
integration("comic reads enforce owner and current consent; cancellation is queued revision CAS", async () => {
  const f = await fixture(), other = await fixture();
  const { task } = await repository.createComicRenderTask(f);
  assert.equal(await repository.getComicRenderTask({userId:other.userId,taskId:task.id}),null);
  await assert.rejects(repository.cancelQueuedComicRenderTask({userId:f.userId,taskId:task.id,revision:9}),e=>e.status===409);
  const cancelled = await repository.cancelQueuedComicRenderTask({userId:f.userId,taskId:task.id,revision:1});
  assert.equal(cancelled.status,"cancelled");
  assert.ok(cancelled.frames.every(frame=>frame.status==="skipped"));
  await assert.rejects(repository.cancelQueuedComicRenderTask({userId:f.userId,taskId:task.id,revision:cancelled.revision}),e=>e.status===409);
  await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='comic-diary'",[f.userId]);
  await assert.rejects(repository.getComicRenderTask({userId:f.userId,taskId:task.id}),e=>e.status===403);
});
integration("worker revalidation stops changed sources and lost leases before another dispatch", async () => {
  const f = await fixture();
  const { task } = await repository.createComicRenderTask(f);
  const claim = await createAITaskRepository().claimAITask({kinds:["comic_render"]});
  assert.equal(claim.id,task.id);
  const args={taskId:task.id,claimToken:claim.claimToken};
  const record=await repository.revalidateComicRenderTask(args);
  assert.equal(record.input.selectedMedia[0].id,f.mediaId);
  await repository.markComicFrameRunning({...args,frameIndex:1});
  await query("UPDATE station_media_assets SET byte_size=2 WHERE id=?",[f.mediaId]);
  await assert.rejects(repository.revalidateComicRenderTask(args),e=>e.details.code==="COMIC_RENDER_SOURCE_CHANGED");
  await query("UPDATE ai_tasks SET lease_until=clock_timestamp()-INTERVAL '1 second' WHERE id=?",[task.id]);
  assert.equal(await createAITaskRepository().recoverInterruptedAITasks(),1);
  const result=await repository.getComicRenderTask({userId:f.userId,taskId:task.id});
  assert.equal(result.status,"interrupted");
  assert.deepEqual(result.frames.map(frame=>frame.status),["unknown","skipped"]);
  await assert.rejects(repository.markComicFrameRunning({...args,frameIndex:2}),e=>e.details.code==="AI_TASK_LEASE_LOST");
});
integration("migration rejects cross-owner media outputs and cleanup intents survive account deletion", async () => {
  const f=await fixture(),other=await fixture();
  const legacyTaskId=crypto.randomUUID();
  await query("INSERT INTO ai_tasks(id,user_id,kind,agent_id,agent_version,input,idempotency_key,request_hash) VALUES (?,?,'site_draft','site-builder','fixture','{}'::jsonb,?,?)",[legacyTaskId,f.userId,crypto.randomUUID(),"a".repeat(64)]);
  await assert.rejects(query("INSERT INTO comic_task_outputs(task_id,user_id,frame_index,status) VALUES (?,?,1,'queued')",[legacyTaskId,f.userId]),e=>e.code==="23503");
  const {task}=await repository.createComicRenderTask(f);
  await assert.rejects(query("UPDATE comic_task_outputs SET status='succeeded',media_asset_id=? WHERE task_id=? AND frame_index=1",[other.mediaId,task.id]),e=>e.code==="23503");
  await assert.rejects(query("INSERT INTO comic_task_outputs (task_id,user_id,frame_index,status) VALUES (?,?,9,'queued')",[task.id,f.userId]),e=>e.code==="23514");
  const journalId=crypto.randomUUID();
  await query("INSERT INTO comic_render_cleanup_journal (id,user_id,task_id,frame_index,bucket,object_key,state) VALUES (?,?,?,1,'fixture-bucket',?,'pending')",[journalId,f.userId,task.id,`fixture/${journalId}`]);
  await cleanupPublishedAgentConsent({userIds:[f.userId]});
  await query("DELETE FROM users WHERE id=?",[f.userId]);
  assert.equal((await query("SELECT id FROM comic_render_cleanup_journal WHERE id=?",[journalId])).length,1);
  await query("DELETE FROM comic_render_cleanup_journal WHERE id=?",[journalId]);
});

async function workerFixture(f,generateFrame) {
  const bucket=`fixture-${f.userId}`;
  const bytes=await sharp({create:{width:8,height:8,channels:3,background:"#345678"}}).png().toBuffer();
  await query("UPDATE station_media_assets SET mime_type='image/png',byte_size=?,storage_provider='oss',storage_key=? WHERE id=?",[bytes.length,`fixture-source/${f.mediaId}`,f.mediaId]);
  const objects=new Map();
  const storage=createComicRenderStorage({bucket,query,transaction:withTransaction,
    fetchObject:async()=>({body:Readable.from([bytes])}),
    putObject:async({objectKey,body,contentType})=>objects.set(objectKey,{body,contentType}),
    inspectObject:async({objectKey})=>({contentType:objects.get(objectKey).contentType,contentLength:objects.get(objectKey).body.length}),
    deleteObject:async({objectKey})=>objects.delete(objectKey),
    bindAsset:repository.bindComicFrameAssetInTransaction});
  const calls=[];
  const provider={generateFrame:async input=>{calls.push(input);if(generateFrame)await generateFrame(calls.length);return {bytes,mimeType:"image/png",providerRequestId:`fixture-private-request-${calls.length}`,model:"fixture-model",usage:null};}};
  const executor=createComicRenderExecutor({provider,repository,storage});
  const logs=[];
  const runner=createAITaskRunner({executors:{comic_render:executor},repository:createAITaskRepository(),logger:{error:line=>logs.push(line)}});
  return {storage,objects,calls,runner,logs,bucket};
}
integration("real queue executor stores multiple private image outputs and emits safe resumable event pages", async () => {
  const f=await fixture(),worker=await workerFixture(f);
  const {task}=await repository.createComicRenderTask(f);
  assert.equal(await worker.runner.runOnce(),true);
  assert.deepEqual(worker.logs,[]);
  assert.equal(await worker.runner.runOnce(),false);
  const result=await repository.getComicRenderTask({userId:f.userId,taskId:task.id});
  assert.equal(result.status,"succeeded");
  assert.equal(worker.calls.length,2);
  assert.equal(worker.objects.size,2);
  assert.ok(worker.calls.every(call=>call.selectedImages.length===1&&call.selectedImages[0].id===f.mediaId));
  const media=await query("SELECT * FROM station_media_assets WHERE id=ANY(?::text[])",[result.frames.map(frame=>frame.mediaAssetId)]);
  assert.ok(media.every(asset=>asset.user_id===f.userId&&asset.status==="uploaded"&&asset.mime_type==="image/webp"));
  const journal=await query("SELECT state FROM comic_render_cleanup_journal WHERE task_id=?",[task.id]);
  assert.deepEqual(journal.map(row=>row.state),["stored","stored"]);
  assert.deepEqual(await query("SELECT id FROM media_retrieval_jobs WHERE media_asset_id=ANY(?::text[])",[media.map(row=>row.id)]),[]);
  const page=await repository.listComicRenderEvents({userId:f.userId,taskId:task.id,limit:2});
  assert.equal(page.hasMore,true);
  const resumed=await repository.listComicRenderEvents({userId:f.userId,taskId:task.id,afterSequence:page.nextSequence});
  assert.equal(resumed.events.at(-1).sequence,result.revision);
  assert.deepEqual(resumed.events.at(-1).progress,result.progress);
  const serialized=JSON.stringify({result,page,resumed});
  for(const privateValue of ["fixture-private-request","fixture-model","storage_key","provider_metadata","snapshotHash","A quiet park"]){assert.equal(serialized.includes(privateValue),false);}
  await query("UPDATE station_media_assets SET deleted_at=clock_timestamp(),status='deleted' WHERE id=?",[media[0].id]);
  assert.equal((await repository.getComicRenderTask({userId:f.userId,taskId:task.id})).frames.find(frame=>frame.mediaAssetId===media[0].id),undefined);
});
integration("deterministic frame failure preserves delivered images as a partial result", async () => {
  const f=await fixture(),worker=await workerFixture(f,n=>{if(n===2)throw new HttpError(422,"fixture deterministic rejection");});
  const {task}=await repository.createComicRenderTask(f);await worker.runner.runOnce();
  assert.deepEqual(worker.logs,[]);
  const result=await repository.getComicRenderTask({userId:f.userId,taskId:task.id});
  assert.equal(result.status,"partially_succeeded");assert.deepEqual(result.frames.map(frame=>frame.status),["succeeded","failed"]);
  assert.equal(result.progress.succeeded,1);assert.equal(worker.objects.size,1);
});
integration("unknown provider outcome interrupts once and skips later frames without replay", async () => {
  const f=await fixture(3),worker=await workerFixture(f,n=>{if(n===2)throw Object.assign(new Error("fixture timeout"),{outcomeUnknown:true});});
  const {task}=await repository.createComicRenderTask(f);await worker.runner.runOnce();
  assert.deepEqual(worker.logs,[]);
  const result=await repository.getComicRenderTask({userId:f.userId,taskId:task.id});
  assert.equal(result.status,"interrupted");assert.deepEqual(result.frames.map(frame=>frame.status),["succeeded","unknown","skipped"]);
  assert.equal(await worker.runner.runOnce(),false);assert.equal(worker.calls.length,2);
});
integration("revocation after one delivered frame stops dispatch and keeps unattempted frames skipped", async () => {
  const f=await fixture(3),worker=await workerFixture(f);
  const original=repository.bindComicFrameAssetInTransaction;
  const guardedRepository=createComicRenderRepository();
  let bound=0;
  const storage=createComicRenderStorage({bucket:"fixture-bucket",query,transaction:withTransaction,
    fetchObject:async()=>({body:Readable.from([await sharp({create:{width:8,height:8,channels:3,background:"#345678"}}).png().toBuffer()])}),
    putObject:async({objectKey,body,contentType})=>worker.objects.set(objectKey,{body,contentType}),
    inspectObject:async({objectKey})=>({contentType:worker.objects.get(objectKey).contentType,contentLength:worker.objects.get(objectKey).body.length}),
    deleteObject:async({objectKey})=>worker.objects.delete(objectKey),
    bindAsset:async(connection,args)=>{await original(connection,args);bound++;}});
  const executor=createComicRenderExecutor({provider:{generateFrame:async()=>({bytes:await sharp({create:{width:8,height:8,channels:3,background:"#345678"}}).png().toBuffer(),mimeType:"image/png"})},
    repository:{...guardedRepository,revalidateComicRenderTask:async args=>{
      if(bound)await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='comic-diary'",[f.userId]);
      return guardedRepository.revalidateComicRenderTask(args);
    }},storage});
  const {task}=await repository.createComicRenderTask(f);
  const runner=createAITaskRunner({executors:{comic_render:executor},repository:createAITaskRepository(),logger:{error:line=>assert.fail(line)}});
  await runner.runOnce();
  await query("UPDATE user_agents SET enabled=true WHERE user_id=? AND agent_id='comic-diary'",[f.userId]);
  const result=await repository.getComicRenderTask({userId:f.userId,taskId:task.id});
  assert.equal(result.status,"partially_succeeded");assert.deepEqual(result.frames.map(frame=>frame.status),["succeeded","skipped","skipped"]);
});

for(const mode of ["lease recovery","generic worker exception"]){
  integration(`${mode} preserves a stored frame and emits accurate unknown progress`,async()=>{
    const f=await fixture(3),worker=await workerFixture(f),queue=createAITaskRepository();
    const {task}=await repository.createComicRenderTask(f);
    const claimed=await queue.claimAITask({kinds:["comic_render"]});
    const identity={taskId:task.id,claimToken:claimed.claimToken};
    await repository.markComicFrameRunning({...identity,frameIndex:1});
    const bytes=await sharp({create:{width:8,height:8,channels:3,background:"#345678"}}).png().toBuffer();
    await worker.storage.storeComicFrame({...identity,userId:f.userId,frameIndex:1,bytes,mimeType:"image/png"});
    await repository.markComicFrameRunning({...identity,frameIndex:2});
    if(mode==="lease recovery"){
      await query("UPDATE ai_tasks SET lease_until=clock_timestamp()-INTERVAL '1 second' WHERE id=?",[task.id]);
      assert.equal(await queue.recoverInterruptedAITasks(),1);
    }else{
      await queue.finishAITask({...identity,status:"failed",phase:"failed",error:{code:"AI_EXECUTION_FAILED",message:"Fixture worker exception"}});
    }
    const page=await repository.listComicRenderEvents({userId:f.userId,taskId:task.id});
    assert.equal(page.task.status,"interrupted");
    assert.deepEqual(page.task.frames.map(frame=>frame.status),["succeeded","unknown","skipped"]);
    assert.deepEqual(page.events.at(-1).progress,{total:3,succeeded:1,failed:0,unknown:1});
    assert.deepEqual(page.events.at(-1).progress,page.task.progress);
    assert.equal(await worker.runner.runOnce(),false);
  });
}

integration("unavailable readiness inserts no task or output",async()=>{
  const f=await fixture();
  await assert.rejects(repository.createComicRenderTask({...f,assertReady:async()=>{throw new HttpError(503,"Fixture unavailable",{code:"COMIC_RENDER_NOT_READY"});}}),e=>e.status===503);
  assert.deepEqual(await query("SELECT id FROM ai_tasks WHERE user_id=?",[f.userId]),[]);
  assert.deepEqual(await query("SELECT task_id FROM comic_task_outputs WHERE user_id=?",[f.userId]),[]);
});

integration("cleanup sweeper preserves live assets and active uploads then removes account orphans",async()=>{
  const f=await fixture(),worker=await workerFixture(f);
  const {task}=await repository.createComicRenderTask(f);await worker.runner.runOnce();
  assert.equal((await repository.getComicRenderTask({userId:f.userId,taskId:task.id})).status,"succeeded");
  assert.deepEqual(await worker.storage.collectCleanup(),{deleted:0});
  const next=await repository.createComicRenderTask({...f,idempotencyKey:crypto.randomUUID()});
  await createAITaskRepository().claimAITask({kinds:["comic_render"]});
  const mediaAssetId=crypto.randomUUID(),journalId=crypto.randomUUID(),objectKey=`fixture-pending/${journalId}`;
  await query("INSERT INTO station_media_assets(id,user_id,kind,status) VALUES (?,?,'image','pending_upload')",[mediaAssetId,f.userId]);
  await query("INSERT INTO comic_render_cleanup_journal(id,user_id,task_id,media_asset_id,frame_index,bucket,object_key,state,updated_at) VALUES (?,?,?,?,1,?,?,'pending',clock_timestamp()-INTERVAL '16 minutes')",[journalId,f.userId,next.task.id,mediaAssetId,worker.bucket,objectKey]);
  worker.objects.set(objectKey,{body:Buffer.from("fixture-pending"),contentType:"image/webp"});
  assert.deepEqual(await worker.storage.collectCleanup(),{deleted:0});
  assert.equal(worker.objects.size,3);
  await cleanupPublishedAgentConsent({userIds:[f.userId]});
  await query("DELETE FROM users WHERE id=?",[f.userId]);
  assert.deepEqual(await worker.storage.collectCleanup(),{deleted:3});
  assert.equal(worker.objects.size,0);
  assert.deepEqual(await query("SELECT id FROM comic_render_cleanup_journal WHERE user_id=?",[f.userId]),[]);
});

for(const contenders of [2,3]){
  integration(`${contenders} concurrent cancellations commit once and return revision conflicts without lock-upgrade deadlocks`,async()=>{
    const f=await fixture(),{task}=await repository.createComicRenderTask(f);
    let sharedReaders=0,releaseReaders;
    const readersReady=new Promise(resolve=>{releaseReaders=resolve;});
    const concurrentRepository=createComicRenderRepository({withTransaction:work=>withTransaction(connection=>work({
      query:async(sql,params)=>{
        const rows=await connection.query(sql,params);
        // When reproducing a shared-lock regression, hold each real database
        // reader until all contenders own the lock, making the upgrade race
        // deterministic. An exclusive task lock serializes at PostgreSQL.
        if(/FROM ai_tasks[\s\S]*FOR SHARE$/.test(sql)){
          sharedReaders++;
          if(sharedReaders===contenders)releaseReaders();
          await readersReady;
        }
        return rows;
      },
    }))});
    const results=await Promise.allSettled(Array.from({length:contenders},()=>concurrentRepository.cancelQueuedComicRenderTask({userId:f.userId,taskId:task.id,revision:task.revision})));
    assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
    for(const result of results.filter(result=>result.status==="rejected")){
      assert.equal(result.reason.status,409,`Expected a revision conflict, received ${result.reason.code??result.reason.details?.code}`);
      assert.equal(result.reason.details.code,"COMIC_RENDER_REVISION_CONFLICT");
    }
    const page=await repository.listComicRenderEvents({userId:f.userId,taskId:task.id});
    assert.equal(page.task.status,"cancelled");
    assert.equal(page.task.revision,2);
    assert.deepEqual(page.task.frames.map(frame=>frame.status),["skipped","skipped"]);
    assert.equal(page.events.filter(event=>event.status==="cancelled").length,1);
  });
}
