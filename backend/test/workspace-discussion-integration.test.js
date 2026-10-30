import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after, beforeEach } from "node:test";
import express from "express";
import { query, withTransaction, closeDatabase } from "../src/db.js";
import { authenticate, hashToken } from "../src/auth.js";
import { getAgent } from "../../agents/registry.js";
import { computeAgentReleaseContractHash } from "../../shared/agent-catalog.js";
import { createWorkspaceInTransaction } from "../src/agent-workspace-repository.js";
import { createWorkspaceDiscussionService } from "../src/workspace-discussion-service.js";
import { registerMessageRoutes } from "../src/routes/message-routes.js";
import { createRequestErrorHandler } from "../src/request-observability.js";

const enabled = process.env.RUN_WORKSPACE_DISCUSSION_INTEGRATION === "1";
const integration = (name, run) => test(name, { skip: !enabled && "Requires a migrated disposable loopback *_migration_test PostgreSQL database" }, run);
const owners = [];
const butler = await getAgent("miaoxun-butler");
let server, origin, fixture, runtime, invocations, modelCalls;
const modelResult = () => ({ reply: "这里只讨论修改建议。请到原任务预览并确认后执行。", provider: "isolated-discussion-test", latencyMs: 1,
  tokenUsage: { prompt: 2, completion: 3, total: 5 } });
const invokeRuntime = async options => { invocations++; return runtime(options); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };

before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.match(decodeURIComponent(url.pathname), /_migration_test$/);
  assert.match((await query("SELECT current_database() AS name"))[0].name, /_migration_test$/);
  // A direct user_agents fixture is only the access projection. The current
  // execution gate also requires a published, version-matched catalog
  // identity, so make that release contract explicit for this isolated suite.
  const identity = {
    key: butler.key,
    avatarKind: "agent-mark",
    displayName: butler.name,
    description: butler.description,
    mark: butler.identity.mark,
    shape: butler.identity.shape,
    colors: butler.identity.colors,
    published: true,
    source: "integration-test",
    updatedAt: "2026-10-30T00:00:00.000Z",
  };
  const contractHash = computeAgentReleaseContractHash({
    key: butler.key,
    version: butler.version,
    permissions: butler.permissions,
    identity,
  });
  await query(`INSERT INTO agent_catalog
      (agent_id, display_name, description, identity_mark, identity_shape,
       identity_colors, status, release_version, contract_hash, source)
    VALUES (?, ?, ?, ?, ?, ?::jsonb, 'published', ?, ?, 'integration-test')
    ON CONFLICT (agent_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      identity_mark = EXCLUDED.identity_mark,
      identity_shape = EXCLUDED.identity_shape,
      identity_colors = EXCLUDED.identity_colors,
      status = 'published',
      release_version = EXCLUDED.release_version,
      contract_hash = EXCLUDED.contract_hash,
      source = EXCLUDED.source`,
    [butler.key, identity.displayName, identity.description, identity.mark,
      identity.shape, JSON.stringify(identity.colors), butler.version, contractHash]);
  const app = express();
  app.use(express.json());
  registerMessageRoutes(app, { authenticate, asyncHandler: fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next),
    getOnlineUserIds: () => [], sendRealtimeToUser() {}, runAgentRuntime: invokeRuntime });
  app.use(createRequestErrorHandler({ production: true, logger: { error() {} } }));
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (!enabled) return;
  await new Promise(resolve => server.close(resolve));
  await query("DELETE FROM users WHERE id = ANY(?::text[])", [owners]);
  await closeDatabase();
});
async function makeOwner() {
  const userId = crypto.randomUUID(), token = crypto.randomBytes(32).toString("hex"), threadId = crypto.randomUUID();
  owners.push(userId);
  await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES (?,?,'test-only',?,?)",
    [userId, `${userId}@example.invalid`, `Discussion ${userId}`, String(crypto.randomInt(100000000000,999999999999))]);
  await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES (?,'private-profile-not-model','Q')", [userId]);
  await query("INSERT INTO user_agents(user_id,agent_id,enabled,granted_scopes) VALUES (?,'miaoxun-butler',true,?::jsonb)", [userId, JSON.stringify(butler.permissions)]);
  await query("INSERT INTO chat_threads(id,user_id,title,agent_id,kind) VALUES (?,?,'Discussion fixture','miaoxun-butler','agent')", [threadId,userId]);
  await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,clock_timestamp()+INTERVAL '1 hour')", [crypto.randomUUID(),userId,hashToken(token)]);
  return { userId, token, threadId };
}
async function makeWorkspace(owner) {
  return withTransaction(async connection => {
    const {workspace} = await createWorkspaceInTransaction(connection, { userId: owner.userId, goal: "Server-owned original goal", source: {page:"miao",module:null},
      contextRefs:[{kind:"chat-message",id:crypto.randomUUID(),version:"a".repeat(64),title:"private-original-source-not-model"}],
      authority:{privateAuthority:"private-authority-not-model"},input:{privateInput:"private-input-not-model"},coordinatorVersion:butler.version,
      limits:{deadlineSeconds:600},idempotencyKey:crypto.randomUUID(),requestHash:"b".repeat(64) });
    const nodeId=crypto.randomUUID();
    const result={resultKey:"text-result",artifact:{kind:"text_result",title:"Result title",content:"private-full-result-not-model"}};
    await connection.query("UPDATE agent_workspace_nodes SET status='succeeded' WHERE workspace_id=?",[workspace.id]);
    await connection.query(`INSERT INTO agent_workspace_nodes(id,workspace_id,user_id,round_number,node_key,agent_id,agent_version,capability,goal,status,result)
      VALUES (?,?,?,1,'text-result','comic-diary','0.1.0','comic.script','fixture','succeeded',?::jsonb)`,[nodeId,workspace.id,owner.userId,JSON.stringify(result)]);
    await connection.query("UPDATE agent_workspaces SET status='succeeded',summary='Task completed',result=?::jsonb WHERE id=?",[JSON.stringify(result),workspace.id]);
    return {id:workspace.id,revision:workspace.revision,currentRound:1,nodeId};
  });
}
beforeEach(async () => {
  if (!enabled) return;
  fixture=await makeOwner();fixture.workspace=await makeWorkspace(fixture);
  invocations=0;modelCalls=0;
  runtime=async options=>{assert.equal(options.mode,"discussWorkspace");await options.beforeModelCall();modelCalls++;return modelResult();};
});
const selector = workspace => ({id:workspace.id,revision:workspace.revision,currentRound:workspace.currentRound});
const body = (workspace=fixture.workspace,content="建议调整标题，暂不执行") => ({content,clientMessageId:crypto.randomUUID(),workspaceContext:selector(workspace)});
async function send(input,owner=fixture,threadId=owner.threadId,contract="6") {
  const response=await fetch(`${origin}/api/threads/${threadId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${owner.token}`,"Content-Type":"application/json",
    "X-Miaoxun-AI-Contract":"1","X-Miaoxun-Agent-Workspace":contract},body:JSON.stringify(input)});
  return {status:response.status,...await response.json()};
}
const code = response => response.error?.details?.code;
const inputRows = () => query("SELECT * FROM chat_messages WHERE user_id=? AND sender_type='user' ORDER BY created_at,id",[fixture.userId]);
async function advance(workspace=fixture.workspace) {
  await withTransaction(async connection=>{
    await connection.query("SELECT id FROM agent_workspaces WHERE id=? FOR UPDATE",[workspace.id]);
    await connection.query("INSERT INTO agent_workspace_rounds(workspace_id,user_id,round_number,instruction,base_result_node_id,status) VALUES (?,?,?,'test-only next round',?,'queued')",
      [workspace.id,fixture.userId,workspace.currentRound+1,workspace.nodeId]);
    await connection.query("UPDATE agent_workspaces SET current_round=current_round+1,revision=revision+1,goal='Changed goal after original receipt' WHERE id=?",[workspace.id]);
  });
  workspace.currentRound++;workspace.revision++;
}

integration("HTTP linked discussion exposes server metadata only and never creates or continues a task; old receipts retain their original selector",async()=>{
  const input=body();
  runtime=async options=>{
    assert.equal(options.mode,"discussWorkspace");assert.equal(options.tools,undefined);assert.deepEqual(options.messages,[]);
    assert.equal(options.user,null);assert.equal(options.thread,null);
    assert.equal(options.appContext.workspaceDiscussion.resultContentRead,false);
    assert.equal(options.appContext.workspaceDiscussion.workspace.goal,"Server-owned original goal");
    assert.doesNotMatch(JSON.stringify(options.appContext),/private-|requestHash|authority|contextRefs/);
    assert.ok(!JSON.stringify(options.appContext).includes(fixture.userId));
    assert.ok(!JSON.stringify(options.appContext).includes(fixture.workspace.id));
    await options.beforeModelCall();modelCalls++;return modelResult();
  };
  const result=await send({...input,clientContext:{profileSnapshot:{nickname:"private-client-snapshot"},currentPage:"private-client-origin"}});
  assert.equal(result.status,201,JSON.stringify(result));
  for(const message of result.data.messages){assert.deepEqual(message.metadata.workspaceContext,{...input.workspaceContext,goal:"Server-owned original goal"});assert.equal(message.metadata.butlerClarification,undefined);}
  assert.equal((await query("SELECT count(*)::int AS n FROM agent_workspaces WHERE user_id=?",[fixture.userId]))[0].n,1);
  assert.equal((await query("SELECT count(*)::int AS n FROM agent_workspace_continuations WHERE user_id=?",[fixture.userId]))[0].n,0);
  assert.equal((await query("SELECT count(*)::int AS n FROM ai_tasks WHERE user_id=?",[fixture.userId]))[0].n,0);
  await advance();
  const replay=await send(input);assert.equal(replay.status,200);assert.deepEqual(replay.data.messages,result.data.messages);assert.equal(modelCalls,1);
  await query("UPDATE user_agents SET enabled=false WHERE user_id=?",[fixture.userId]);
  assert.equal((await send(input)).status,403);assert.equal(modelCalls,1);
  await query("UPDATE user_agents SET enabled=true WHERE user_id=?",[fixture.userId]);
  await query("UPDATE users SET status='disabled' WHERE id=?",[fixture.userId]);
  const service=createWorkspaceDiscussionService({runAgentRuntime:invokeRuntime});
  await assert.rejects(service({userId:fixture.userId,threadId:fixture.threadId,body:input}),error=>error.status===403);
});

integration("strict selectors, account ownership, thread kind and contract reject before persistence or model dispatch",async()=>{
  const input=body();
  for(const extra of [{workspaceContext:{...input.workspaceContext,goal:"Forged"}},{replyToMessageId:crypto.randomUUID()},{butlerContextReset:false},{contextRefs:[{kind:"chat-message",id:crypto.randomUUID()}]}]){
    assert.equal((await send({...input,...extra})).status,400);
  }
  for(const contract of ["3","5"]) assert.equal((await send(input,fixture,fixture.threadId,contract)).status,426);
  const outsider=await makeOwner();
  assert.equal((await send(input,outsider)).status,404);
  const threadId=crypto.randomUUID();await query("INSERT INTO chat_threads(id,user_id,title,kind) VALUES (?,?,'Other','system')",[threadId,fixture.userId]);
  assert.equal((await send(input,fixture,threadId)).status,400);
  assert.equal((await inputRows()).length,0);assert.equal(invocations,0);
});

integration("stale revision and round fail explicitly before admitting any message",async()=>{
  for(const workspaceContext of [{...selector(fixture.workspace),revision:2},{...selector(fixture.workspace),currentRound:2}]){
    const result=await send({...body(),workspaceContext});assert.equal(result.status,409);assert.equal(code(result),"WORKSPACE_DISCUSSION_STALE");
  }
  assert.equal((await inputRows()).length,0);assert.equal(invocations,0);
});

integration("concurrent retries admit one input and one provider call while pending requests never redispatch",async()=>{
  const started=deferred(),release=deferred(),input=body();
  runtime=async options=>{await options.beforeModelCall();modelCalls++;started.resolve();await release.promise;return modelResult();};
  const first=send(input);await started.promise;
  const pending=await send(input);assert.equal(pending.status,409);assert.equal(code(pending),"WORKSPACE_DISCUSSION_PENDING");
  assert.equal((await inputRows()).length,1);assert.equal(invocations,1);
  release.resolve();const result=await first;assert.equal(result.status,201);
  const replay=await send(input);assert.equal(replay.status,200);assert.deepEqual(replay.data.messages,result.data.messages);assert.equal(modelCalls,1);
  assert.equal((await send({...input,content:"Changed request"})).status,409);
  assert.equal((await send({...input,workspaceContext:{...input.workspaceContext,revision:2}})).status,409);
  const {workspaceContext: _omitted,...unlinked}=input;
  assert.equal((await send(unlinked)).status,409);
  assert.equal(invocations,1);
  assert.equal((await inputRows())[0].metadata.butlerClarification,undefined);
});

integration("an unknown result has a durable timeout receipt and late provider output cannot replace it",async()=>{
  let timestamp=Date.now();const started=deferred(),release=deferred(),input=body();
  runtime=async options=>{await options.beforeModelCall();modelCalls++;started.resolve();await release.promise;return modelResult();};
  const service=createWorkspaceDiscussionService({runAgentRuntime:invokeRuntime,now:()=>timestamp,processingTimeoutMs:1000});
  const args={userId:fixture.userId,threadId:fixture.threadId,body:input};
  const first=service(args);const firstRejected=assert.rejects(first,error=>error.details.code==="WORKSPACE_DISCUSSION_INTERRUPTED");
  await started.promise;timestamp+=10000;
  await assert.rejects(service(args),error=>error.details.code==="WORKSPACE_DISCUSSION_INTERRUPTED");
  release.resolve();await firstRejected;
  await assert.rejects(service(args),error=>error.details.code==="WORKSPACE_DISCUSSION_INTERRUPTED");
  const runs=await query("SELECT status,error_message FROM agent_runs WHERE user_id=?",[fixture.userId]);
  assert.deepEqual(runs,[{status:"error",error_message:"WORKSPACE_DISCUSSION_INTERRUPTED"}]);
  assert.equal((await inputRows()).length,1);assert.equal(modelCalls,1);assert.equal(invocations,1);
  const [stored]=await inputRows();assert.deepEqual(stored.metadata.workspaceContext,{...input.workspaceContext,goal:"Server-owned original goal"});
  assert.equal(stored.metadata.butlerClarification,undefined);
});

for(const stage of ["before","after"]){
  integration(`task changes ${stage} the model gate preserve original selector and return stale without any task action`,async()=>{
    const input=body();runtime=async options=>{
      if(stage==="before")await query("UPDATE agent_workspaces SET revision=revision+1 WHERE id=?",[fixture.workspace.id]);
      await options.beforeModelCall();modelCalls++;
      if(stage==="after")await advance();
      return modelResult();
    };
    const result=await send(input);assert.equal(result.status,409);assert.equal(code(result),"WORKSPACE_DISCUSSION_STALE");
    const replay=await send(input);assert.equal(code(replay),"WORKSPACE_DISCUSSION_STALE");
    assert.equal(modelCalls,stage==="before"?0:1);assert.equal(invocations,1);
    const [stored]=await inputRows();assert.deepEqual(stored.metadata.workspaceContext,{...input.workspaceContext,goal:"Server-owned original goal"});
    assert.equal((await query("SELECT count(*)::int AS n FROM agent_runs WHERE user_id=? AND status='success'",[fixture.userId]))[0].n,0);
  });
  integration(`grant revocation ${stage} model dispatch prevents delivery and never retries after restoration`,async()=>{
    const input=body();runtime=async options=>{
      if(stage==="before")await query("UPDATE user_agents SET enabled=false WHERE user_id=?",[fixture.userId]);
      await options.beforeModelCall();modelCalls++;
      if(stage==="after")await query("UPDATE user_agents SET granted_scopes='[]'::jsonb WHERE user_id=?",[fixture.userId]);
      return modelResult();
    };
    const result=await send(input);assert.equal(result.status,403);assert.equal(code(result),"AI_ACCESS_REVOKED");
    await query("UPDATE user_agents SET enabled=true,granted_scopes=?::jsonb WHERE user_id=?",[JSON.stringify(butler.permissions),fixture.userId]);
    assert.equal((await send(input)).status,403);assert.equal(invocations,1);assert.equal(modelCalls,stage==="before"?0:1);
  });
  integration(`account suspension ${stage} model dispatch prevents output and retains the failed receipt`,async()=>{
    const input=body();runtime=async options=>{
      if(stage==="before")await query("UPDATE users SET status='disabled' WHERE id=?",[fixture.userId]);
      await options.beforeModelCall();modelCalls++;
      if(stage==="after")await query("UPDATE users SET status='disabled' WHERE id=?",[fixture.userId]);
      return modelResult();
    };
    const result=await send(input);assert.equal(result.status,403);assert.equal(code(result),"AI_ACCESS_REVOKED");
    await query("UPDATE users SET status='active' WHERE id=?",[fixture.userId]);
    assert.equal(code(await send(input)),"AI_ACCESS_REVOKED");assert.equal(invocations,1);assert.equal(modelCalls,stage==="before"?0:1);
    assert.equal((await query("SELECT count(*)::int AS n FROM agent_runs WHERE user_id=? AND status='success'",[fixture.userId]))[0].n,0);
  });
}

for(const stage of ["before","after"]){
  integration(`input deletion ${stage} model dispatch blocks output and same-key replay`,async()=>{
    const input=body();runtime=async options=>{
      if(stage==="before")await query("UPDATE chat_messages SET deleted_at=clock_timestamp() WHERE user_id=? AND client_message_id=?",[fixture.userId,input.clientMessageId]);
      await options.beforeModelCall();modelCalls++;
      if(stage==="after")await query("UPDATE chat_messages SET recalled_at=clock_timestamp(),content='' WHERE user_id=? AND client_message_id=?",[fixture.userId,input.clientMessageId]);
      return modelResult();
    };
    const result=await send(input);assert.equal(result.status,409);assert.equal(code(result),"WORKSPACE_DISCUSSION_INPUT_CHANGED");
    assert.equal((await send(input)).status,409);assert.equal(invocations,1);
    assert.equal((await query("SELECT count(*)::int AS n FROM agent_runs WHERE user_id=?",[fixture.userId]))[0].n,0);
  });
}

integration("history contains only completed same-owner/thread/workspace/round discussion and never generic clarification or source text",async()=>{
  const first=body(undefined,"Original selected task discussion");assert.equal((await send(first)).status,201);
  const other=await makeWorkspace(fixture);assert.equal((await send(body(other,"Other task private discussion"))).status,201);
  const otherThread=crypto.randomUUID();await query("INSERT INTO chat_threads(id,user_id,title,kind,agent_id) VALUES (?,?,'Other discussion','agent','miaoxun-butler')",[otherThread,fixture.userId]);
  assert.equal((await send(body(undefined,"Other thread private discussion"),fixture,otherThread)).status,201);
  await query("INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content,metadata) VALUES (?,?,?,'agent','Fixture','Generic private clarification',?::jsonb)",
    [crypto.randomUUID(),fixture.userId,fixture.threadId,JSON.stringify({butlerClarification:{contextRefs:[],requestMessageIds:[crypto.randomUUID()],source:{currentPage:"private"}}})]);
  runtime=async options=>{
    assert.deepEqual(options.messages.map(message=>message.content),[first.content,modelResult().reply]);
    assert.doesNotMatch(JSON.stringify(options),/Other task|Other thread|Generic private|private-full|private-original/);
    await options.beforeModelCall();modelCalls++;return modelResult();
  };
  assert.equal((await send(body())).status,201);
  await advance();
  runtime=async options=>{assert.deepEqual(options.messages,[]);await options.beforeModelCall();modelCalls++;return modelResult();};
  assert.equal((await send(body())).status,201);
});

for(const stage of ["before","after"]){
  integration(`selected discussion history recalled ${stage} model gate blocks disclosure and persists a failed receipt`,async()=>{
    const prior=await send(body());const historicalId=prior.data.messages[0].id;
    const next=body();runtime=async options=>{
      assert.equal(options.messages.length,2);
      if(stage==="before")await query("UPDATE chat_messages SET recalled_at=clock_timestamp(),content='' WHERE id=?",[historicalId]);
      await options.beforeModelCall();modelCalls++;
      if(stage==="after")await query("UPDATE chat_messages SET deleted_at=clock_timestamp() WHERE id=?",[historicalId]);
      return modelResult();
    };
    const result=await send(next);assert.equal(result.status,409);assert.equal(code(result),"WORKSPACE_DISCUSSION_HISTORY_CHANGED");
    assert.equal(code(await send(next)),"WORKSPACE_DISCUSSION_HISTORY_CHANGED");
    assert.equal(modelCalls,stage==="before"?1:2);
  });
}

integration("structured model actions fail without dispatch and ordinary chat never inherits linked discussion history",async()=>{
  const linked=body(undefined,"Private linked discussion never dispatches");
  assert.equal((await send(linked)).status,201);
  const invalid=body();runtime=async options=>{await options.beforeModelCall();modelCalls++;return {...modelResult(),reply:'{"type":"workspace","capabilities":[]}'};};
  assert.equal(code(await send(invalid)),"WORKSPACE_DISCUSSION_FAILED");
  assert.equal(code(await send(invalid)),"WORKSPACE_DISCUSSION_FAILED");
  runtime=async options=>{
    assert.equal(options.mode,"dispatch");assert.ok(options.messages.every(message=>!message.metadata?.workspaceContext));
    assert.doesNotMatch(JSON.stringify(options.messages),/Private linked discussion/);
    await options.beforeModelCall();return {...modelResult(),reply:'{"type":"reply","reply":"普通问候"}'};
  };
  const plain=await send({content:"你好",clientMessageId:crypto.randomUUID()});assert.equal(plain.status,201);assert.equal(plain.data.messages.at(-1).content,"普通问候");
  assert.equal((await query("SELECT count(*)::int AS n FROM agent_workspaces WHERE user_id=?",[fixture.userId]))[0].n,1);
});

integration("registry upgrades isolate historical discussion while old receipts remain replayable and language is only a preference",async()=>{
  const original=body();const accepted=await send(original);assert.equal(accepted.status,201);
  let version=butler.version;
  const loadAgent=async id=>id==="miaoxun-butler"?{...butler,version}:getAgent(id);
  const service=createWorkspaceDiscussionService({loadAgent,runAgentRuntime:invokeRuntime});
  version="isolated-new-discussion-version";
  runtime=async options=>{
    assert.deepEqual(options.messages,[]);assert.equal(options.appContext.workspaceDiscussion.language,"en");
    assert.doesNotMatch(JSON.stringify(options.appContext),/private-client-profile/);
    await options.beforeModelCall();modelCalls++;return modelResult();
  };
  const replay=await service({userId:fixture.userId,threadId:fixture.threadId,body:original});
  assert.equal(replay.reused,true);assert.deepEqual(replay.messages.map(m=>m.id),accepted.data.messages.map(m=>m.id));
  const result=await service({userId:fixture.userId,threadId:fixture.threadId,body:{...body(),clientContext:{language:"en",profileSnapshot:{nickname:"private-client-profile"}}}});
  assert.equal(result.reused,false);assert.equal(modelCalls,2);
});

integration("a linked discussion is a hard clarification boundary when returning to ordinary chat with explicit reset",async()=>{
  runtime=async options=>{assert.equal(options.mode,"dispatch");await options.beforeModelCall();modelCalls++;return {...modelResult(),reply:JSON.stringify({type:"clarify",question:"Which format?"})};};
  const pending=await send({content:"Make a page from this album",clientMessageId:crypto.randomUUID()});
  assert.equal(pending.status,201);
  assert.ok(pending.data.messages.at(-1).metadata.butlerClarification);
  runtime=async options=>{assert.equal(options.mode,"discussWorkspace");assert.deepEqual(options.messages,[]);await options.beforeModelCall();modelCalls++;return modelResult();};
  const linked=body(undefined,"Discuss existing task only");
  assert.equal((await send(linked)).status,201);
  runtime=async options=>{
    assert.equal(options.mode,"dispatch");assert.deepEqual(options.messages,[]);
    assert.equal(options.appContext.dispatch.contextReset,true);
    assert.deepEqual(options.appContext.dispatch.requestMessages.map(item=>item.content),["Start a new request without old task sources"]);
    assert.equal(options.appContext.resolvedReferences.length,0);
    await options.beforeModelCall();modelCalls++;
    return {...modelResult(),reply:JSON.stringify({type:"reply",reply:"Please describe the new request."})};
  };
  const restarted=await send({content:"Start a new request without old task sources",clientMessageId:crypto.randomUUID(),butlerContextReset:true});
  assert.equal(restarted.status,201);assert.equal(restarted.data.messages.at(-1).content,"Please describe the new request.");
  assert.equal(restarted.data.messages.at(-1).metadata.workspaceContext,undefined);
  assert.equal(restarted.data.messages.at(-1).metadata.butlerClarification,undefined);
  assert.equal((await inputRows()).length,3);
});
