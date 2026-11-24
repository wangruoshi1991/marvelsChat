import { randomUUID } from "node:crypto";
import { getPool, query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { createVoiceCallSignalBuffer } from "./voice-call-signals.js";

const failure = (status, code, message = "语音通话不可用。") => new HttpError(status, message, { code });
const missing = () => failure(404, "VOICE_CALL_NOT_FOUND");
const selectCall = async (connection, id) => {
  const [call] = await connection.query(`SELECT call.*, caller.display_name AS caller_name, callee.display_name AS callee_name
    FROM chat_voice_calls call JOIN users caller ON caller.id=call.caller_user_id
    JOIN users callee ON callee.id=call.callee_user_id WHERE call.id=? FOR UPDATE OF call`, [id]);
  return call;
};

async function acquireProcessLease(onLost) {
  const client = await (await getPool()).connect();
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock(hashtextextended('miaoxun:voice-calls:single-process',0)) AS acquired");
    if (!rows[0]?.acquired) throw failure(503, "VOICE_CALL_PROCESS_CONFLICT", "语音通话需要单一后端进程。");
    client.on("error", onLost);
    return async () => {
      client.removeListener("error", onLost);
      try { await client.query("SELECT pg_advisory_unlock(hashtextextended('miaoxun:voice-calls:single-process',0))"); }
      finally { client.release(true); }
    };
  } catch (error) { client.release(true); throw error; }
}

export function createVoiceCallService({ settings, queryFn = query, transaction = withTransaction,
  acquireLease = acquireProcessLease, signals = createVoiceCallSignalBuffer(), logger = console } = {}) {
  const instanceId = randomUUID();
  let ready = false;
  let leaseValid = false;
  let releaseLease;
  let timer;
  let sweepPromise;
  const enabled = () => {
    if (!settings?.enabled || !ready) throw failure(503, "VOICE_CALLS_UNAVAILABLE", "语音通话尚未开放。");
  };
  const assertLease = () => {
    if (!leaseValid) throw failure(503, "VOICE_CALL_LEASE_LOST", "语音通话服务已中断。");
  };
  const ownedTransaction = work => transaction(async connection => {
    assertLease();
    const owned = {
      ...connection,
      query: async (...args) => {
        assertLease();
        const rows = await connection.query(...args);
        assertLease();
        return rows;
      },
    };
    const result = await work(owned);
    assertLease();
    return result;
  });
  const publicCall = (call, userId) => ({
    id: call.id, callerUserId: call.caller_user_id, calleeUserId: call.callee_user_id,
    peerUserId: userId === call.caller_user_id ? call.callee_user_id : call.caller_user_id,
    peerName: userId === call.caller_user_id ? call.callee_name : call.caller_name,
    state: call.state, createdAt: new Date(call.created_at).toISOString(),
    ...(call.accepted_at ? { acceptedAt: new Date(call.accepted_at).toISOString() } : {}),
    ...(call.end_reason ? { endReason: call.end_reason } : {}),
  });
  async function authenticateActor(connection, actor) {
    const [session] = await connection.query(`SELECT s.id FROM auth_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.id=? AND s.user_id=? AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP AND u.status='active'`,
    [actor.sessionId, actor.userId]);
    if (!session) throw failure(401, "VOICE_CALL_SESSION_INVALID");
  }
  function authorize(call, actor) {
    if (!call || ![call.caller_user_id, call.callee_user_id].includes(actor.userId)) throw missing();
    const caller = actor.userId === call.caller_user_id;
    const owner = caller ? call.caller_session_id : call.callee_session_id;
    if (owner && owner !== actor.sessionId) throw failure(409, "VOICE_CALL_OTHER_DEVICE", "通话已由另一台设备处理。");
    return caller ? "caller" : "callee";
  }
  async function areFriends(connection, left, right) {
    const rows = await connection.query(`SELECT r.id FROM social_relationships r
      JOIN users a ON a.id=? AND a.status='active' JOIN users b ON b.id=? AND b.status='active'
      WHERE r.relation_type='friend' AND r.status='active' AND
      ((r.follower_user_id=? AND r.followed_user_id=?) OR (r.follower_user_id=? AND r.followed_user_id=?))`,
    [left, right, left, right, right, left]);
    return rows.length === 2;
  }
  async function end(connection, call, reason, calleeSessionId = null) {
    if (call.state === "ended") return call;
    const [ended] = await connection.query(`UPDATE chat_voice_calls SET state='ended',end_reason=?,ended_at=CURRENT_TIMESTAMP,
      callee_session_id=COALESCE(?,callee_session_id) WHERE id=? RETURNING *`, [reason, calleeSessionId, call.id]);
    await connection.query("DELETE FROM chat_voice_call_participants WHERE call_id=?", [call.id]);
    signals.remove(call.id);
    return { ...call, ...ended };
  }
  async function refresh(connection, call) {
    if (call.state === "ended") return call;
    const [{ now }] = await connection.query("SELECT CURRENT_TIMESTAMP AS now");
    const stamp = new Date(now).getTime();
    if (call.instance_id !== instanceId) return end(connection, call, "server_restart");
    if (call.state === "ringing" && stamp >= new Date(call.ring_expires_at).getTime()) return end(connection, call, "ring_timeout");
    if (stamp >= new Date(call.hard_expires_at).getTime()) return end(connection, call, "duration_limit");
    if (call.state === "accepted" && [call.caller_seen_at, call.callee_seen_at].some(value => stamp - new Date(value).getTime() >= 45_000))
      return end(connection, call, "disconnected");
    const sessionIds = [call.caller_session_id, ...(call.callee_session_id ? [call.callee_session_id] : [])];
    const sessions = await connection.query(`SELECT s.id FROM auth_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.id=ANY(?::bpchar[]) AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP AND u.status='active'`, [sessionIds]);
    if (sessions.length !== sessionIds.length) return end(connection, call, "session_ended");
    if (!await areFriends(connection, call.caller_user_id, call.callee_user_id)) return end(connection, call, "friendship_ended");
    return call;
  }
  async function touch(connection, call, actor) {
    if (call.state === "ended") return;
    if (actor.userId === call.caller_user_id) {
      await connection.query("UPDATE chat_voice_calls SET caller_seen_at=CURRENT_TIMESTAMP WHERE id=?", [call.id]);
    } else if (call.callee_session_id === actor.sessionId) {
      await connection.query("UPDATE chat_voice_calls SET callee_seen_at=CURRENT_TIMESTAMP WHERE id=?", [call.id]);
    }
  }
  async function withCall(actor, id, operation, validateRole = () => {}) {
    enabled();
    return ownedTransaction(async connection => {
      await authenticateActor(connection, actor);
      let call = await selectCall(connection, id);
      const role = authorize(call, actor);
      // Reject an invalid caller/callee action before refresh can end a call
      // and remove its in-memory signals; throwing later would roll SQL back.
      validateRole(role);
      call = await refresh(connection, call);
      await touch(connection, call, actor);
      return operation(connection, call, role);
    });
  }
  async function maintenance() {
    signals.sweep();
    await ownedTransaction(async connection => {
      const calls = await connection.query("SELECT * FROM chat_voice_calls WHERE state<>'ended' ORDER BY id FOR UPDATE SKIP LOCKED");
      for (const call of calls) await refresh(connection, call);
      await connection.query("DELETE FROM chat_voice_calls WHERE state='ended' AND ended_at<CURRENT_TIMESTAMP-INTERVAL '24 hours'");
    });
  }
  const service = {
    get availability() { return settings?.enabled && ready ? { enabled: true, iceServers: settings.iceServers } : undefined; },
    async start() {
      if (!settings?.enabled || ready) return;
      leaseValid = true;
      try {
        releaseLease = await acquireLease(() => {
          leaseValid = false;
          ready = false;
          clearInterval(timer);
          signals.clear();
        });
        assertLease();
        await ownedTransaction(async connection => {
          await connection.query("UPDATE chat_voice_calls SET state='ended',end_reason='server_restart',ended_at=CURRENT_TIMESTAMP WHERE state<>'ended'");
          await connection.query("DELETE FROM chat_voice_call_participants");
        });
        assertLease();
        ready = true;
        timer = setInterval(() => {
          if (!ready || sweepPromise) return;
          sweepPromise = maintenance().catch(error => logger.error(JSON.stringify({ type: "voice_call_maintenance_failure", errorName: error?.name || "Error" })))
            .finally(() => { sweepPromise = undefined; });
        }, 5000);
        timer.unref?.();
      } catch (error) {
        leaseValid = false;
        if (releaseLease) await releaseLease().catch(() => {});
        releaseLease = undefined;
        throw error;
      }
    },
    async close() {
      ready = false;
      clearInterval(timer);
      await sweepPromise;
      signals.clear();
      if (!releaseLease) return;
      try {
        await queryFn("UPDATE chat_voice_calls SET state='ended',end_reason='server_shutdown',ended_at=CURRENT_TIMESTAMP WHERE instance_id=? AND state<>'ended'", [instanceId]);
        await queryFn("DELETE FROM chat_voice_call_participants WHERE call_id IN (SELECT id FROM chat_voice_calls WHERE instance_id=?)", [instanceId]);
      } finally { leaseValid = false; await releaseLease(); releaseLease = undefined; }
    },
    async create(actor, { threadId, requestId }) {
      enabled();
      return ownedTransaction(async connection => {
        await authenticateActor(connection, actor);
        // Serialize creation, bounded global capacity, request replay and the
        // two active participant slots in one transaction.
        await connection.query("SELECT pg_advisory_xact_lock(hashtextextended('miaoxun:voice-call:create',0))");
        const [previous] = await connection.query("SELECT id,thread_id,caller_session_id FROM chat_voice_calls WHERE caller_user_id=? AND request_id=?", [actor.userId, requestId]);
        if (previous) {
          if (previous.thread_id !== threadId) throw failure(409, "VOICE_CALL_REQUEST_CONFLICT");
          const call = await selectCall(connection, previous.id);
          authorize(call, actor);
          return { call: publicCall(await refresh(connection, call), actor.userId) };
        }
        const [thread] = await connection.query(`SELECT t.peer_user_id FROM chat_threads t WHERE t.id=? AND t.user_id=?
          AND t.kind='direct' AND t.agent_id IS NULL AND t.group_id IS NULL AND t.peer_user_id IS NOT NULL AND t.peer_user_id<>t.user_id`, [threadId, actor.userId]);
        if (!thread || !await areFriends(connection, actor.userId, thread.peer_user_id)) throw missing();
        const active = await connection.query("SELECT * FROM chat_voice_calls WHERE state<>'ended' ORDER BY id FOR UPDATE");
        for (const call of active) await refresh(connection, call);
        const slots = await connection.query("SELECT user_id FROM chat_voice_call_participants WHERE user_id=ANY(?::bpchar[])", [[actor.userId, thread.peer_user_id]]);
        if (slots.length) throw failure(409, "VOICE_CALL_BUSY", "你或对方正在通话。");
        const [{ total }] = await connection.query("SELECT count(*)::int AS total FROM chat_voice_calls WHERE state<>'ended'");
        if (total >= 64) throw failure(429, "VOICE_CALL_CAPACITY");
        const id = randomUUID();
        await connection.query(`INSERT INTO chat_voice_calls(id,caller_user_id,callee_user_id,thread_id,caller_session_id,request_id,instance_id,state,ring_expires_at,hard_expires_at)
          VALUES (?,?,?,?,?,?,?,'ringing',CURRENT_TIMESTAMP+INTERVAL '45 seconds',CURRENT_TIMESTAMP+INTERVAL '10 minutes')`,
        [id, actor.userId, thread.peer_user_id, threadId, actor.sessionId, requestId, instanceId]);
        await connection.query("INSERT INTO chat_voice_call_participants(user_id,call_id,role) VALUES (?,?,'caller'),(?,?,'callee')",
          [actor.userId, id, thread.peer_user_id, id]);
        return { call: publicCall(await selectCall(connection, id), actor.userId) };
      });
    },
    async incoming(actor) {
      enabled();
      return ownedTransaction(async connection => {
        await authenticateActor(connection, actor);
        const [row] = await connection.query(`SELECT c.id FROM chat_voice_call_participants p JOIN chat_voice_calls c ON c.id=p.call_id
          WHERE p.user_id=? AND p.role='callee' AND c.state='ringing'`, [actor.userId]);
        if (!row) return { call: null };
        const original = await selectCall(connection, row.id);
        if (!original) return { call: null };
        const call = await refresh(connection, original);
        return { call: call.state === "ringing" ? publicCall(call, actor.userId) : null };
      });
    },
    get(actor, id) { return withCall(actor, id, async (_connection, call) => ({ call: publicCall(call, actor.userId) })); },
    action(actor, id, action) {
      return withCall(actor, id, async (connection, call) => {
        if (call.state === "ended") return { call: publicCall(call, actor.userId) };
        if (action === "accept") {
          if (call.state === "ringing") {
            const [accepted] = await connection.query(`UPDATE chat_voice_calls SET state='accepted',callee_session_id=?,accepted_at=CURRENT_TIMESTAMP,
              callee_seen_at=CURRENT_TIMESTAMP,caller_seen_at=CURRENT_TIMESTAMP,hard_expires_at=CURRENT_TIMESTAMP+INTERVAL '10 minutes' WHERE id=? RETURNING *`, [actor.sessionId, id]);
            call = { ...call, ...accepted };
          }
        } else {
          if ((action === "hangup") !== (call.state === "accepted")) throw failure(409, "VOICE_CALL_ACTION_STATE");
          call = await end(connection, call, { decline: "declined", cancel: "cancelled", hangup: "hangup" }[action],
            action === "decline" ? actor.sessionId : null);
        }
        return { call: publicCall(call, actor.userId) };
      }, role => {
        if ((["accept", "decline"].includes(action) && role !== "callee") || (action === "cancel" && role !== "caller"))
          throw failure(403, "VOICE_CALL_ACTION_FORBIDDEN");
      });
    },
    async listSignals(actor, id, after) {
      return withCall(actor, id, async (_connection, call) => {
        if (call.state !== "accepted") return { ended: true };
        return signals.list({ callId: id, recipient: actor.sessionId, after });
      }).then(result => {
        if (result.ended) throw failure(409, "VOICE_CALL_NOT_ACCEPTED");
        return result;
      });
    },
    async sendSignal(actor, id, input) {
      return withCall(actor, id, async (_connection, call) => {
        if (call.state !== "accepted") return { ended: true };
        const caller = actor.userId === call.caller_user_id;
        return signals.append({ callId: id, sender: actor.sessionId,
          recipient: caller ? call.callee_session_id : call.caller_session_id,
          role: caller ? "caller" : "callee", ...input });
      }).then(result => {
        if (result.ended) throw failure(409, "VOICE_CALL_NOT_ACCEPTED");
        return result;
      });
    },
  };
  return service;
}
