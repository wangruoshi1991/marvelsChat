import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { before, after } from 'node:test';
import express from 'express';
import { query, closeDatabase, withTransaction } from '../src/db.js';
import { authenticate, hashToken } from '../src/auth.js';
import { registerStationFileRoutes } from '../src/routes/station-file-routes.js';
import { createRequestErrorHandler } from '../src/request-observability.js';
import { resolveAIContextReferences } from '../src/ai-context.js';

import { seedPublishedAgentConsent, cleanupPublishedAgentConsent } from './helpers/agent-publishing-fixture.js';

let publicationFixture;
const enabled = process.env.RUN_FILE_SOURCE_INTEGRATION === '1';
const integration = (name, work) => test(name, { skip: !enabled && 'RUN_FILE_SOURCE_INTEGRATION=1 with migrated disposable loopback *_migration_test database' }, work);
const owner = crypto.randomUUID(), outsider = crypto.randomUUID();
const token = crypto.randomBytes(32).toString('hex'), otherToken = crypto.randomBytes(32).toString('hex');
let server, origin;
const code = expected => error => error.details?.code === expected;
const request = (method, path, body, auth = token, headers = {}) => fetch(`${origin}${path}`, { method, headers: { Authorization: `Bearer ${auth}`, ...headers }, ...(body === undefined ? {} : { body }) });
const upload = (content, key = crypto.randomUUID(), name = 'verification.txt', auth = token) => request('POST', '/api/station/file-assets/upload', content, auth, { 'Content-Type': 'application/octet-stream', 'X-Miaoxun-Filename': encodeURIComponent(name), 'X-Miaoxun-File-Mime': 'text/plain', 'X-Miaoxun-Idempotency-Key': key });
const resolve = (refs, scopes = ['files:read'], userId = owner) => resolveAIContextReferences({ userId, refs, grantedScopes: scopes });
before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname) && url.pathname.endsWith('_migration_test'));
  assert.equal(process.env.MIAOXUN_DOTENV_ENABLED, 'false');
  for (const [id, auth] of [[owner, token], [outsider, otherToken]]) {
    await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES(?,?,'isolated-only',?,?)", [id, `${id}@example.invalid`, `File ${id.slice(0,8)}`, String(crypto.randomInt(100000000000,999999999999))]);
    await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,CURRENT_TIMESTAMP+INTERVAL '1 hour')", [crypto.randomUUID(),id,hashToken(auth)]);
  }
  const { getAgent } = await import('../../agents/registry.js');
  const agent = await getAgent('file-preprocessor');
  await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES(?,'File verification','F')",[owner]);
  await query('INSERT INTO user_agents(user_id,agent_id,enabled,granted_scopes) VALUES(?,?,true,?::jsonb)',[owner,agent.key,JSON.stringify(agent.permissions)]);
  publicationFixture = await seedPublishedAgentConsent({ userId: owner, agentKeys: ['file-preprocessor'] });
  const app = express(); app.use(express.json());
  registerStationFileRoutes(app, { authenticate, asyncHandler: handler => (req,res,next) => Promise.resolve(handler(req,res,next)).catch(next) });
  app.use(createRequestErrorHandler({ production:true, logger:{ error() {} } }));
  server = await new Promise(done => { const s=app.listen(0,'127.0.0.1',()=>done(s)); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (!enabled) return;
  if (server) await new Promise(done=>server.close(done));
  await cleanupPublishedAgentConsent({ userIds: [owner, outsider] });
  await query('DELETE FROM users WHERE id IN (?,?)',[owner,outsider]);
  await publicationFixture?.cleanup(); await closeDatabase();
});
integration('raw upload persists full Unicode text, enforces ownership and concurrent idempotency', async () => {
  const content = `${'正文😀'.repeat(1800)}\nEND_OF_FILE_SENTINEL`;
  const key = crypto.randomUUID();
  const responses = await Promise.all([upload(content,key),upload(content,key)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);
  const assets = await Promise.all(responses.map(r=>r.json().then(x=>x.data)));
  assert.equal(assets[0].id,assets[1].id);
  const id = assets[0].id;
  assert.equal((await request('GET',`/api/station/file-assets/${id}`,undefined,otherToken)).status,404);
  assert.equal((await request('DELETE',`/api/station/file-assets/${id}`,undefined,otherToken)).status,404);
  const own = await request('GET',`/api/station/file-assets/${id}`);
  assert.equal((await own.json()).data.content,content);
  const resolved = await resolve([{kind:'station-file',id,title:'untrusted title'}]);
  assert.equal(resolved.context[0].content,content);
  assert.equal(resolved.references[0].title,'verification.txt');
  await assert.rejects(resolve([{kind:'station-file',id}],['station:read','messages:read']),code('AI_CONTEXT_SCOPE_REQUIRED'));
  await assert.rejects(resolve([{kind:'station-file',id}],['files:read'],outsider),code('AI_CONTEXT_NOT_FOUND'));
  assert.equal((await upload('different',key)).status,409);
  await query("UPDATE file_assets SET extracted_text=extracted_text||'changed' WHERE id=?",[id]);
  await assert.rejects(resolve(resolved.references),code('AI_CONTEXT_CHANGED'));
});
integration('soft deletion erases full text and preview, invalidates references and prevents key resurrection', async () => {
  const key=crypto.randomUUID(),content='A deletion verification document';
  const response=await upload(content,key);assert.equal(response.status,201);
  const {data}=await response.json(); const refs=(await resolve([{kind:'station-file',id:data.id}])).references;
  assert.equal((await request('DELETE',`/api/station/file-assets/${data.id}`)).status,204);
  assert.equal((await request('GET',`/api/station/file-assets/${data.id}`)).status,404);
  await assert.rejects(resolve(refs),code('AI_CONTEXT_NOT_FOUND'));
  const [row]=await query('SELECT extracted_text,parse_version,preprocessing_result,metadata FROM file_assets WHERE id=?',[data.id]);
  assert.equal(row.extracted_text,null);assert.equal(row.parse_version,null);assert.deepEqual(row.preprocessing_result,{});assert.deepEqual(row.metadata,{});
  assert.equal((await upload(content,key)).status,410);
});
integration('legacy preview and placeholder are never promoted to complete file references', async () => {
  for (const status of ['processed','pending_upload','unsupported']) {
    const id=crypto.randomUUID();
    await query("INSERT INTO file_assets(id,user_id,original_filename,mime_type,status,preprocessing_result) VALUES(?,?,'legacy.txt','text/plain',?,?::jsonb)",[id,owner,status,JSON.stringify({textPreview:'Legacy preview is incomplete'})]);
    await assert.rejects(resolve([{kind:'station-file',id}]),code('AI_CONTEXT_NOT_FOUND'));
  }
});
integration('aggregate 50000 Unicode boundary rejects whole request rather than truncating', async () => {
  const ids=[];
  for(const content of ['😀'.repeat(25000),'中'.repeat(25000),'x']) {
    const response=await upload(content);assert.equal(response.status,201);ids.push((await response.json()).data.id);
  }
  const refs=ids.map(id=>({kind:'station-file',id}));
  assert.equal((await resolve(refs.slice(0,2))).context.reduce((n,item)=>n+Array.from(item.content).length,0),50000);
  await assert.rejects(resolve(refs),code('FILE_CONTEXT_TOO_LARGE'));
  const { collectWorkspaceTextSources } = await import('../src/agent-workspace-capabilities.js');
  const completeRefs=[];
  for(const ref of refs)completeRefs.push(...(await resolve([ref])).references);
  await assert.rejects(withTransaction(connection=>collectWorkspaceTextSources(connection,owner,{
    sourceReferences:completeRefs.slice(0,1),dependencyResults:[{result:{kind:'text_result',title:'Prior summary',content:'A prior authorized result'},sourceReferences:completeRefs.slice(1)}],
  },['files:read','messages:read'])),code('FILE_CONTEXT_TOO_LARGE'));
});
integration('HTTP rejects unsupported, invalid UTF8, NUL and oversized bodies without persisting files', async () => {
  const before=(await query('SELECT count(*)::int AS count FROM file_assets WHERE user_id=?',[owner]))[0].count;
  for(const [body,name] of [[Buffer.from([0xc3,0x28]),'invalid.txt'],[Buffer.from('a\0b'),'nul.txt'],[Buffer.from('%PDF-1.7'),'binary.pdf'],[Buffer.alloc(262145,65),'large.txt'],['x'.repeat(50001),'chars.txt']]) {
    const response=await upload(body,crypto.randomUUID(),name);assert.ok([400,413,415,422].includes(response.status),`${name}: ${response.status}`);
  }
  assert.equal((await query('SELECT count(*)::int AS count FROM file_assets WHERE user_id=?',[owner]))[0].count,before);
});

integration('real file-summary executor preserves full source through same-task round two and blocks deleted-source results', async () => {
  const { getAgent } = await import('../../agents/registry.js');
  const { createWorkspaceCapabilityExecutor, listExecutableWorkspaceCapabilities } = await import('../src/agent-workspace-capabilities.js');
  const { createAgentWorkspaceService } = await import('../src/agent-workspace-service.js');
  const repository = await import('../src/agent-workspace-repository.js');
  const agent = await getAgent('file-preprocessor');
  const threadId=crypto.randomUUID(),inputMessageId=crypto.randomUUID();
  await query("INSERT INTO chat_threads(id,user_id,title,agent_id,kind) VALUES(?,?,'File verification',?,'agent')",[threadId,owner,agent.key]);
  await query("INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content) VALUES(?,?,?,'user','Fixture','请摘要所选文件')",[inputMessageId,owner,threadId]);
  const content='完整正文'.repeat(1600)+'TAIL_SENTINEL';
  const uploaded=await upload(content);assert.equal(uploaded.status,201);const file=(await uploaded.json()).data;
  const refs=(await resolve([{kind:'station-file',id:file.id}])).references;
  const calls=[];
  const executeCapability=createWorkspaceCapabilityExecutor({runAgentRuntime:async options=>{
    calls.push(options);const reservation=await options.beforeModelCall();
    const selected=options.appContext.workspaceContribution.selectedContext;
    assert.equal(selected.find(x=>x.kind==='station-file').content,content);
    const receipt={provider:'isolated-file-fixture',model:'no-network',servedModel:'no-network',tokenUsage:{prompt:1,completion:1,total:2},latencyMs:1};
    await options.afterModelCall({receipt:reservation,...receipt});return {reply:'完整文件摘要'+(calls.length>1?'，本轮补充重点':''),...receipt};
  }});
  const service=createAgentWorkspaceService({executeCapability,run:()=>assert.fail('No Butler coordination is authorized')});
  const authorityCeiling=listExecutableWorkspaceCapabilities({registeredAgents:[agent],grants:[{agentId:agent.key,enabled:true,grantedScopes:agent.permissions}]});
  const workspace=await service.submitDirectAgentWorkspace({user:{id:owner},threadId,inputMessageId,requestMessageIds:[inputMessageId],capability:'file.summary',contextRefs:refs,source:{page:'messages.agent',module:agent.key},idempotencyKey:crypto.randomUUID(),authorityCeiling});
  const execute=async()=>{const claim=await repository.claimWorkspaceNode();assert.ok(claim);assert.equal(claim.workspace.userId,owner);return service.executeWorkspaceNode(claim);};
  const first=await execute();assert.equal(first.status,'succeeded');assert.equal(first.id,workspace.id);
  assert.match((await service.getWorkspaceText({userId:owner,workspaceId:first.id,nodeId:first.result.id})).content,/完整文件摘要/);
  const continuation={userId:owner,workspaceId:first.id,operation:'continue',revision:first.revision,text:'保留原文依据，补充重点',idempotencyKey:crypto.randomUUID()};
  await service.decideAgentWorkspace(continuation);const second=await execute();
  assert.equal(second.id,first.id);assert.equal(second.currentRound,2);assert.equal(second.status,'succeeded');
  assert.match(calls[1].appContext.workspaceContribution.dependencies[0].content,/完整文件摘要/);
  assert.equal((await service.decideAgentWorkspace(continuation)).currentRound,2);assert.equal(calls.length,2);
  const assertRedacted = async () => {
    const detail = await repository.getAgentWorkspace({userId:owner,workspaceId:first.id});
    const listed = (await repository.listAgentWorkspaces({userId:owner})).find(item=>item.id===first.id);
    const replay = await service.decideAgentWorkspace(continuation);
    assert.equal(replay.currentRound,2);
    for (const item of [detail,listed,replay]) { assert.deepEqual(item.readAccess,{state:'unavailable',code:'WORKSPACE_FILE_SOURCE_UNAVAILABLE'}); assert.ok(item.rounds.every(round=>round.summary===item.summary)); assert.equal(item.result,null); assert.ok(!item.allowedActions.includes('continue')); assert.ok(item.steps.every(step=>step.result===null)); assert.ok(item.rounds.every(round=>round.result===null)); }
  };
  await query("UPDATE user_agents SET granted_scopes='[\"messages:read\"]'::jsonb WHERE user_id=? AND agent_id=?",[owner,agent.key]);
  await assert.rejects(service.getWorkspaceText({userId:owner,workspaceId:first.id,nodeId:first.result.id}));
  await assertRedacted();
  await query('UPDATE user_agents SET granted_scopes=?::jsonb WHERE user_id=? AND agent_id=?',[JSON.stringify(agent.permissions),owner,agent.key]);
  assert.equal((await request('DELETE',`/api/station/file-assets/${file.id}`)).status,204);
  await assert.rejects(service.getWorkspaceText({userId:owner,workspaceId:second.id,nodeId:second.result.id}));
  await assertRedacted();
  await assert.rejects(service.decideAgentWorkspace({...continuation,revision:second.revision,idempotencyKey:crypto.randomUUID()}));
  assert.equal(calls.length,2);
});

integration('file deletion, grant revocation and content change during model call prevent final delivery', async () => {
  const { getAgent } = await import('../../agents/registry.js');
  const { createWorkspaceCapabilityExecutor, listExecutableWorkspaceCapabilities } = await import('../src/agent-workspace-capabilities.js');
  const { createAgentWorkspaceService } = await import('../src/agent-workspace-service.js');
  const repository = await import('../src/agent-workspace-repository.js');
  const { deleteFileAssetForUser } = await import('../src/file-asset-repository.js');
  const agent = await getAgent('file-preprocessor');
  for (const mutation of ['delete','revoke','change']) {
    await query('UPDATE user_agents SET granted_scopes=?::jsonb WHERE user_id=? AND agent_id=?',[JSON.stringify(agent.permissions),owner,agent.key]);
    const response = await upload(`Inflight ${mutation} verification body`); assert.equal(response.status,201);
    const file = (await response.json()).data;
    const refs = (await resolve([{kind:'station-file',id:file.id}])).references;
    const threadId=crypto.randomUUID(),inputMessageId=crypto.randomUUID();
    await query("INSERT INTO chat_threads(id,user_id,title,agent_id,kind) VALUES(?,?,'Inflight verification',?,'agent')",[threadId,owner,agent.key]);
    await query("INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content) VALUES(?,?,?,'user','Fixture','请摘要所选文件')",[inputMessageId,owner,threadId]);
    let calls=0;
    const executeCapability=createWorkspaceCapabilityExecutor({runAgentRuntime:async options=>{
      calls++; const reservation=await options.beforeModelCall();
      if(mutation==='delete')await deleteFileAssetForUser(owner,file.id);
      else if(mutation==='revoke')await query("UPDATE user_agents SET granted_scopes='[\"messages:read\"]'::jsonb WHERE user_id=? AND agent_id=?",[owner,agent.key]);
      else await query("UPDATE file_assets SET extracted_text=extracted_text||' changed after request' WHERE id=?",[file.id]);
      const receipt={provider:'isolated-inflight-fixture',model:'no-network',servedModel:'no-network',tokenUsage:{prompt:1,completion:1,total:2},latencyMs:1};
      await options.afterModelCall({receipt:reservation,...receipt});
      return {reply:'THIS_INVALIDATED_RESPONSE_MUST_NOT_BE_DELIVERED',...receipt};
    }});
    const service=createAgentWorkspaceService({executeCapability,run:()=>assert.fail('No coordinator')});
    const authorityCeiling=listExecutableWorkspaceCapabilities({registeredAgents:[agent],grants:[{agentId:agent.key,enabled:true,grantedScopes:agent.permissions}]});
    const workspace=await service.submitDirectAgentWorkspace({user:{id:owner},threadId,inputMessageId,requestMessageIds:[inputMessageId],capability:'file.summary',contextRefs:refs,source:{page:'messages.agent',module:agent.key},idempotencyKey:crypto.randomUUID(),authorityCeiling});
    const { createAgentWorkspaceRunner } = await import('../src/agent-workspace-runner.js');
    const runner = createAgentWorkspaceRunner({execute:service.executeWorkspaceNode,repository,logger:{error(){}}});
    assert.equal(await runner.runOnce(),true);
    const finished=await repository.getAgentWorkspace({userId:owner,workspaceId:workspace.id});
    assert.ok(['failed','interrupted'].includes(finished.status),`${mutation}: ${finished.status}`);assert.equal(finished.result,null);assert.equal(calls,1);
    const detail=await repository.getAgentWorkspace({userId:owner,workspaceId:workspace.id});
    assert.doesNotMatch(JSON.stringify(detail),/THIS_INVALIDATED_RESPONSE_MUST_NOT_BE_DELIVERED/);
    await assert.rejects(service.getWorkspaceText({userId:owner,workspaceId:workspace.id,nodeId:finished.steps[0].id}));
  }
});

integration('Unicode filenames survive upload, references and professional message task admission; malformed JSON text never writes', async t => {
  const {getAgent}=await import('../../agents/registry.js');
  const {registerMessageRoutes}=await import('../src/routes/message-routes.js');
  const agent=await getAgent('file-preprocessor');
  await query('UPDATE user_agents SET granted_scopes=?::jsonb WHERE user_id=? AND agent_id=?',[JSON.stringify(agent.permissions),owner,agent.key]);
  const filename='a'.repeat(159)+'😀.md';
  const response=await upload('Unicode filename verification body',crypto.randomUUID(),filename);
  assert.equal(response.status,201);const file=(await response.json()).data;
  assert.equal(file.originalFilename,filename);assert.equal(file.reference.title,'a'.repeat(159));
  assert.ok(file.reference.title.length<=160);assert.equal(Buffer.from(file.reference.title).toString('utf8'),file.reference.title);
  const refs=(await resolve([file.reference])).references;assert.equal(refs[0].title,file.reference.title);
  const threadId=crypto.randomUUID();
  await query("INSERT INTO chat_threads(id,user_id,title,agent_id,kind) VALUES(?,?,'Unicode verification',?,'agent')",[threadId,owner,agent.key]);
  const app=express();app.use(express.json());
  registerMessageRoutes(app,{authenticate,asyncHandler:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next),getOnlineUserIds:()=>[],sendRealtimeToUser(){},runAgentRuntime:async options=>{
    assert.equal(options.mode,'dispatch');await options.beforeModelCall();return {reply:JSON.stringify({type:'workspace',capability:'file.summary'}),provider:'isolated-unicode-fixture',latencyMs:1,tokenUsage:{prompt:1,completion:1,total:2}};
  }});
  app.use(createRequestErrorHandler({production:true,logger:{error(){}}}));
  const localServer=await new Promise(done=>{const s=app.listen(0,'127.0.0.1',()=>done(s));});
  t.after(()=>new Promise(done=>localServer.close(done)));
  const result=await fetch(`http://127.0.0.1:${localServer.address().port}/api/threads/${threadId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Miaoxun-AI-Contract':'1','X-Miaoxun-Agent-Workspace':'6'},body:JSON.stringify({content:'请摘要明确选中的文件',clientMessageId:crypto.randomUUID(),contextRefs:refs})});
  const data=await result.json();assert.equal(result.status,201,JSON.stringify(data));
  const workspaceId=data.data.messages.at(-1).metadata.agentWorkspace.id;
  const [workspace]=await query('SELECT context_refs FROM agent_workspaces WHERE id=? AND user_id=?',[workspaceId,owner]);
  assert.equal(workspace.context_refs[0].title,'a'.repeat(159));
  const before=(await query('SELECT count(*)::int AS n FROM file_assets WHERE user_id=?',[owner]))[0].n;
  for(const content of ['\ud800','\udc00']) {
    const invalid=await request('POST','/api/station/file-assets',JSON.stringify({originalFilename:'invalid.txt',content}),token,{'Content-Type':'application/json'});
    assert.equal(invalid.status,400);assert.equal((await invalid.json()).error.details.code,'FILE_UTF8_INVALID');
  }
  assert.equal((await query('SELECT count(*)::int AS n FROM file_assets WHERE user_id=?',[owner]))[0].n,before);
});

integration('file-source discussion denies deleted history and rechecks source before dispatch and final reply', async () => {
  const {getAgent}=await import('../../agents/registry.js');
  const {createWorkspaceDiscussionService}=await import('../src/workspace-discussion-service.js');
  const {createWorkspaceInTransaction}=await import('../src/agent-workspace-repository.js');
  const {deleteFileAssetForUser}=await import('../src/file-asset-repository.js');
  const agent=await getAgent('file-preprocessor'),butler=await getAgent('miaoxun-butler');
  await query('UPDATE user_agents SET granted_scopes=?::jsonb WHERE user_id=? AND agent_id=?',[JSON.stringify(agent.permissions),owner,agent.key]);
  await query("INSERT INTO user_agents(user_id,agent_id,enabled,granted_scopes) VALUES(?,'miaoxun-butler',true,?::jsonb)",[owner,JSON.stringify(butler.permissions)]);
  const threadId=crypto.randomUUID();await query("INSERT INTO chat_threads(id,user_id,title,agent_id,kind) VALUES(?,?,'File discussion verification','miaoxun-butler','agent')",[threadId,owner]);
  for(const phase of ['history','before','after']) {
    const response=await upload('Discussion source '+phase);assert.equal(response.status,201);const file=(await response.json()).data;
    const refs=(await resolve([{kind:'station-file',id:file.id}])).references;
    const workspace=await withTransaction(async connection=>{
      const result=await createWorkspaceInTransaction(connection,{userId:owner,goal:'Discuss exact file summary',source:{page:'miao',module:null},contextRefs:refs,authority:{},input:{},coordinatorVersion:butler.version,limits:{deadlineSeconds:600},idempotencyKey:crypto.randomUUID(),requestHash:'a'.repeat(64)});
      await connection.query("UPDATE agent_workspace_nodes SET status='succeeded' WHERE workspace_id=?",[result.workspace.id]);
      await connection.query("UPDATE agent_workspaces SET status='succeeded',summary='PRIVATE_FILE_SUMMARY_SENTINEL',result=?::jsonb WHERE id=?",[JSON.stringify({artifact:{kind:'text_result',title:'PRIVATE_FILE_TITLE_SENTINEL',content:'PRIVATE_FILE_BODY_SENTINEL'}}),result.workspace.id]);return result.workspace;
    });
    let invocations=0,dispatched=0;
    const service=createWorkspaceDiscussionService({runAgentRuntime:async options=>{
      invocations++;
      if(phase==='before')await deleteFileAssetForUser(owner,file.id);
      await options.beforeModelCall();dispatched++;
      if(phase==='after')await deleteFileAssetForUser(owner,file.id);
      return {reply:'PRIVATE_DISCUSSION_REPLY_SENTINEL',provider:'isolated-discussion-source',latencyMs:1,tokenUsage:{prompt:1,completion:1,total:2}};
    }});
    const body=()=>({content:'只讨论原成果，不修改',clientMessageId:crypto.randomUUID(),workspaceContext:{id:workspace.id,revision:workspace.revision,currentRound:1}});
    if(phase==='history') {
      await service({userId:owner,threadId,body:body()});assert.equal(dispatched,1);
      await deleteFileAssetForUser(owner,file.id);invocations=0;dispatched=0;
    }
    await assert.rejects(service({userId:owner,threadId,body:body()}),code('WORKSPACE_FILE_SOURCE_UNAVAILABLE'));
    assert.equal(invocations,phase==='history'?0:1);assert.equal(dispatched,phase==='after'?1:0);
    const rows=await query("SELECT content,metadata FROM chat_messages WHERE user_id=? AND thread_id=? AND metadata->'workspaceContext'->>'id'=? ORDER BY created_at,id",[owner,threadId,workspace.id]);
    const successes=rows.filter(row=>row.content==='PRIVATE_DISCUSSION_REPLY_SENTINEL');assert.equal(successes.length,phase==='history'?1:0);
  }
});
