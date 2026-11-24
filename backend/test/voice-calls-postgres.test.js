import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import { authenticate, createPlainToken, hashToken } from "../src/auth.js";
import { closeDatabase, query } from "../src/db.js";
import { createVoiceCallService } from "../src/voice-call-service.js";
import { registerVoiceCallRoutes } from "../src/routes/voice-call-routes.js";
import { createRequestErrorHandler, createRequestObservabilityMiddleware } from "../src/request-observability.js";

const enabled = process.env.RUN_VOICE_CALLS_POSTGRES === "1";
const settings = { enabled: true, iceServers: [] };
const code = value => error => error.details?.code === value;
const audio = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";

test("foreground voice calls enforce PostgreSQL ownership, deadlines and ephemeral signaling", {
  skip: !enabled && "RUN_VOICE_CALLS_POSTGRES=1 requires an isolated loopback *_migration_test database",
  timeout: 30000,
}, async t => {
  const database = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
  assert.match(database.pathname, /_migration_test$/);
  const users = [];
  const services = [];
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    for (const service of services) await service.close();
    try { await query("DELETE FROM users WHERE id=ANY(?::bpchar[])", [users.map(user => user.id)]); }
    finally { await closeDatabase(); }
  });
  async function createUser() {
    const id = randomUUID();
    const user = { id };
    users.push(user);
    await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES (?,?,'test',?,?)",
      [id, `${id}@call.example.invalid`, `Call ${id}`, String(randomInt(100000000000,999999999999))]);
    return user;
  }
  async function session(user) {
    const sessionId = randomUUID();
    const token = createPlainToken();
    await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,CURRENT_TIMESTAMP+INTERVAL '1 hour')", [sessionId,user.id,hashToken(token)]);
    return { userId: user.id, sessionId, token };
  }
  async function thread(owner, peer, kind = "direct", agent = null) {
    const id = randomUUID();
    await query("INSERT INTO chat_threads(id,user_id,title,kind,peer_user_id,agent_id) VALUES (?,?,'Voice QA',?,?,?)", [id,owner.id,kind,peer?.id || null,agent]);
    return id;
  }
  const [a,b,c] = await Promise.all([createUser(),createUser(),createUser()]);
  const [a1,a2,b1,b2,c1] = await Promise.all([session(a),session(a),session(b),session(b),session(c)]);
  const [ab,ba,ac,group,agent] = await Promise.all([thread(a,b),thread(b,a),thread(a,c),thread(a,null,"group"),thread(a,null,"agent","call-qa")]);
  for (const [left,right] of [[a,b],[b,a]]) await query("INSERT INTO social_relationships(id,follower_user_id,followed_user_id,relation_type) VALUES (?,?,?,'friend')", [randomUUID(),left.id,right.id]);
  let service = createVoiceCallService({ settings }); services.push(service);
  await service.start();
  const newCall = async () => (await service.create(a1,{threadId:ab,requestId:randomUUID()})).call;

  await t.test("single process lease, explicit capability and friend-only create", async () => {
    assert.deepEqual(service.availability, { enabled:true,iceServers:[] });
    const competing = createVoiceCallService({ settings });
    await assert.rejects(competing.start(), code("VOICE_CALL_PROCESS_CONFLICT"));
    for (const threadId of [ac,group,agent,randomUUID()]) await assert.rejects(service.create(a1,{threadId,requestId:randomUUID()}), { status:404 });
    await assert.rejects(service.create(c1,{threadId:ab,requestId:randomUUID()}), { status:404 });
  });
  await t.test("create is idempotent and opposite-direction calls share account slots", async () => {
    const requestId=randomUUID();
    const calls=await Promise.all(Array.from({length:4},()=>service.create(a1,{threadId:ab,requestId})));
    assert.equal(new Set(calls.map(result=>result.call.id)).size,1);
    const call=calls[0].call;
    assert.equal(call.state,"ringing"); assert.equal(call.peerUserId,b.id);
    assert.equal(Object.hasOwn(call,"callerSessionId"),false);
    await assert.rejects(service.create(a2,{threadId:ab,requestId}),code("VOICE_CALL_OTHER_DEVICE"));
    await assert.rejects(service.create(a1,{threadId:ac,requestId}),code("VOICE_CALL_REQUEST_CONFLICT"));
    await assert.rejects(service.create(b1,{threadId:ba,requestId:randomUUID()}),code("VOICE_CALL_BUSY"));
    await assert.rejects(service.get(c1,call.id),{status:404});
    assert.equal((await service.incoming(b1)).call.id,call.id);
    assert.equal((await service.incoming(b2)).call.id,call.id);
    assert.equal((await service.action(a1,call.id,"cancel")).call.endReason,"cancelled");
    assert.equal((await service.create(a1,{threadId:ab,requestId})).call.state,"ended");
  });
  await t.test("one receiving device wins accept and no other device controls or reads signals", async () => {
    const call=await newCall();
    await assert.rejects(service.action(a1,call.id,"accept"),code("VOICE_CALL_ACTION_FORBIDDEN"));
    await assert.rejects(service.sendSignal(a1,call.id,{requestId:randomUUID(),kind:"offer",payload:{type:"offer",sdp:audio}}),code("VOICE_CALL_NOT_ACCEPTED"));
    const outcomes=await Promise.allSettled([service.action(b1,call.id,"accept"),service.action(b2,call.id,"accept")]);
    assert.equal(outcomes.filter(result=>result.status==="fulfilled").length,1);
    const winner=outcomes[0].status==="fulfilled"?b1:b2;
    const loser=winner===b1?b2:b1;
    assert.equal((await service.action(winner,call.id,"accept")).call.state,"accepted");
    await assert.rejects(service.get(loser,call.id),code("VOICE_CALL_OTHER_DEVICE"));
    await assert.rejects(service.listSignals(loser,call.id,0),code("VOICE_CALL_OTHER_DEVICE"));
    await assert.rejects(service.action(a2,call.id,"hangup"),code("VOICE_CALL_OTHER_DEVICE"));
    const requestId=randomUUID();
    const offer={requestId,kind:"offer",payload:{type:"offer",sdp:audio}};
    const first=await service.sendSignal(a1,call.id,offer);
    assert.deepEqual(await service.sendSignal(a1,call.id,offer),first);
    assert.deepEqual((await service.listSignals(a1,call.id,0)).signals,[]);
    assert.deepEqual((await service.listSignals(winner,call.id,0)).signals,[{id:first.id,kind:"offer",payload:offer.payload}]);
    await service.sendSignal(winner,call.id,{requestId:randomUUID(),kind:"answer",payload:{type:"answer",sdp:audio}});
    assert.equal((await service.listSignals(a1,call.id,0)).signals[0].kind,"answer");
    await assert.rejects(service.action(a1,call.id,"cancel"),code("VOICE_CALL_ACTION_STATE"));
    assert.equal((await service.action(winner,call.id,"hangup")).call.endReason,"hangup");
    await assert.rejects(service.listSignals(a1,call.id,0),code("VOICE_CALL_NOT_ACCEPTED"));
  });
  await t.test("decline binds the handling device and releases both account slots", async () => {
    const call=await newCall();
    assert.equal((await service.action(b1,call.id,"decline")).call.endReason,"declined");
    await assert.rejects(service.action(b2,call.id,"accept"),code("VOICE_CALL_OTHER_DEVICE"));
    assert.deepEqual(await query("SELECT * FROM chat_voice_call_participants WHERE call_id=?",[call.id]),[]);
  });
  await t.test("ringing, disconnected and duration deadlines end calls durably", async () => {
    let call=await newCall();
    await query("UPDATE chat_voice_calls SET created_at=CURRENT_TIMESTAMP-INTERVAL '60 seconds',ring_expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=?",[call.id]);
    assert.equal((await service.get(a1,call.id)).call.endReason,"ring_timeout");
    call=await newCall(); await service.action(b1,call.id,"accept");
    await query("UPDATE chat_voice_calls SET caller_seen_at=CURRENT_TIMESTAMP-INTERVAL '46 seconds' WHERE id=?",[call.id]);
    await assert.rejects(service.listSignals(b1,call.id,0),code("VOICE_CALL_NOT_ACCEPTED"));
    assert.equal((await service.get(a1,call.id)).call.endReason,"disconnected");
    call=await newCall(); await service.action(b1,call.id,"accept");
    await query("UPDATE chat_voice_calls SET created_at=CURRENT_TIMESTAMP-INTERVAL '11 minutes',hard_expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=?",[call.id]);
    assert.equal((await service.get(a1,call.id)).call.endReason,"duration_limit");
  });
  await t.test("friend removal and owner-session revocation end accepted calls", async () => {
    let call=await newCall(); await service.action(b1,call.id,"accept");
    await query("UPDATE social_relationships SET status='blocked' WHERE follower_user_id=? AND followed_user_id=? AND relation_type='friend'",[a.id,b.id]);
    assert.equal((await service.get(a1,call.id)).call.endReason,"friendship_ended");
    await query("UPDATE social_relationships SET status='active' WHERE follower_user_id=? AND followed_user_id=? AND relation_type='friend'",[a.id,b.id]);
    call=await newCall(); await service.action(b1,call.id,"accept");
    await query("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?",[b1.sessionId]);
    assert.equal((await service.get(a1,call.id)).call.endReason,"session_ended");
    await query("UPDATE auth_sessions SET revoked_at=NULL WHERE id=?",[b1.sessionId]);
  });
  await t.test("HTTP routes authenticate, validate payloads and never log raw SDP/ICE", async () => {
    const logs=[];
    const app=express();app.use(express.json());
    app.use(createRequestObservabilityMiddleware({logger:{info:value=>logs.push(value)}}));
    registerVoiceCallRoutes(app,{authenticate,asyncHandler:handler=>(req,res,next)=>Promise.resolve(handler(req,res)).catch(next),service});
    app.use(createRequestErrorHandler({production:true,logger:{error:value=>logs.push(value)}}));
    await new Promise(resolve=>{server=app.listen(0,"127.0.0.1",resolve);});
    const http=async(path,owner=a1,body,method=body?"POST":"GET")=>fetch(`http://127.0.0.1:${server.address().port}/api/voice-calls${path}`,{
      method,headers:{"Content-Type":"application/json",...(owner?{Authorization:`Bearer ${owner.token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
    assert.equal((await http("/incoming",null)).status,401);
    assert.equal((await http("",a1,{threadId:ab,requestId:randomUUID(),video:true})).status,400);
    const response=await http("",a1,{threadId:ab,requestId:randomUUID()});
    assert.equal(response.status,200); assert.equal(response.headers.get("cache-control"),"private, no-store");
    const {data:{call}}=await response.json();
    assert.equal((await http(`/${call.id}/action`,b1,{action:"accept"})).status,200);
    assert.equal((await http(`/${call.id}/signals?after=-1`,a1)).status,400);
    assert.equal((await http(`/${call.id}/signals`,a1,{requestId:randomUUID(),kind:"offer",payload:{type:"offer",sdp:audio}})).status,200);
    assert.equal((await http(`/${call.id}/signals`,b1)).status,200);
    assert.equal((await http(`/${call.id}/signals`,a1,{requestId:randomUUID(),kind:"ice",payload:{candidate:"candidate:secret 1 udp 1 127.0.0.1 99 typ host"}})).status,200);
    assert.equal(JSON.stringify(logs).includes("candidate:secret"),false);
    assert.equal(JSON.stringify(logs).includes("UDP/TLS/RTP"),false);
    assert.equal((await http(`/${call.id}/action`,a1,{action:"hangup"})).status,200);
  });
  await t.test("process restart ends stale state rather than claiming signal recovery", async () => {
    await service.close();
    // Simulate a persisted active call left by a crashed old instance.
    const old=randomUUID();
    await query(`INSERT INTO chat_voice_calls(id,caller_user_id,callee_user_id,thread_id,caller_session_id,request_id,instance_id,state,ring_expires_at,hard_expires_at)
      VALUES (?,?,?,?,?,?,?,'ringing',CURRENT_TIMESTAMP+INTERVAL '45 seconds',CURRENT_TIMESTAMP+INTERVAL '10 minutes')`,[old,a.id,b.id,ab,a1.sessionId,randomUUID(),randomUUID()]);
    await query("INSERT INTO chat_voice_call_participants(user_id,call_id,role) VALUES (?,?,'caller'),(?,?,'callee')",[a.id,old,b.id,old]);
    service=createVoiceCallService({settings});services.push(service);await service.start();
    assert.equal((await service.get(a1,old)).call.endReason,"server_restart");
    assert.deepEqual(await query("SELECT * FROM chat_voice_call_participants WHERE call_id=?",[old]),[]);
    const call=await newCall();await service.action(a1,call.id,"cancel");
  });
});
