# Foreground direct-friend audio calls

This slice supports isolated local/LAN QA on one API process. It does not provide push notifications, background ringing, CallKit/ConnectionService, authenticated TURN allocation, reconnect/renegotiation, conferencing, or production rollout. The backend transports signaling; it does not carry or record media. Without an explicit ICE configuration and successful service startup, bootstrap/sync omit `chatVoiceCalls` and every call operation fails closed.

## Configuration and startup

`CHAT_VOICE_CALLS_ENABLED=false` is the default. Enabling requires `CHAT_VOICE_CALLS_ENABLED=true` and an explicit `CHAT_VOICE_CALLS_ICE_SERVERS_JSON`. `[]` permits same-LAN host-candidate testing. Each ICE entry accepts exactly `{urls:string|string[]}` with `stun:`, `stuns:`, `turn:` or `turns:` URLs. No fallback server, URL user info, extra JSON properties, usernames or credentials are accepted. Static TURN secrets cannot be configured or returned in this first slice. A bare TURN URL alone does not establish authenticated public-network relay service.

Apply migration 074 before enabling. Startup acquires a dedicated PostgreSQL advisory session lock, so a second enabled API process using the same database fails startup. The pool must have spare connections beyond this one held lease. Startup marks persisted non-ended calls `ended/server_restart` and clears active account slots; it does not claim recovery of lost signaling. If the lease connection fails, capability is withdrawn and new operations stop. Graceful shutdown ends this instance's calls, drops its signal buffers and releases the lease before the pool closes.

Deploying or enabling the service outside the isolated QA environment requires separate authorization. No production environment files or deployed services were changed by this implementation.

## Client contract

Bootstrap and sync expose `chatVoiceCalls:{enabled:true,iceServers:[{urls:...}]}` only while the configured service is running. No availability field is emitted when disabled. Every operation requires a current authenticated session and returns the normal `{data:...}` envelope:

| Method/path | Input | data |
|---|---|---|
| POST `/api/voice-calls` | `{threadId,requestId}` UUIDs | `{call}` |
| GET `/api/voice-calls/incoming` | none | `{call:null\|call}` |
| GET `/api/voice-calls/:id` | none | `{call}` |
| POST `/api/voice-calls/:id/action` | `{action:'accept'\|'decline'\|'cancel'\|'hangup'}` | `{call}` |
| GET `/api/voice-calls/:id/signals?after=0` | nonnegative integer cursor | `{signals:[{id,kind,payload}]}` |
| POST `/api/voice-calls/:id/signals` | `{requestId,kind,payload}` | `{id:number}` |

`call` is `{id,callerUserId,calleeUserId,peerUserId,peerName,state,createdAt,acceptedAt?,endReason?}`; `state` is `ringing|accepted|ended`. Names are current account display names. Timestamps are server ISO strings. Session IDs, tokens, ICE candidates and SDP never appear in call state. `endReason` is one of `declined`, `cancelled`, `hangup`, `ring_timeout`, `duration_limit`, `disconnected`, `session_ended`, `friendship_ended`, `server_restart`, `server_shutdown`.

The caller session that created a call owns it. Ringing is discoverable to any valid session of the callee account; the first successful accept/decline binds that handling session. After accept, only the bound caller and callee sessions can read/control/signaling; another device receives `409 VOICE_CALL_OTHER_DEVICE`. Same-account sessions cannot silently take over. A caller may cancel only while ringing, and either bound party may hang up only after accept. One active call per account is enforced by the participant table's user primary key, covering both roles and opposite-direction races.

Create retries with the same caller account/request ID and same thread/session return the same call, including its terminal state. A changed thread returns `VOICE_CALL_REQUEST_CONFLICT`; another device cannot replay the ownership. Caller and peer must be active ordinary direct friends, with active relationships in both directions. Group, Agent, system, cross-user and missing threads fail. Every active read/action/signaling checks current accounts, friendship and bound sessions again. Ending or revoking a session or friendship causes a terminal call; the other participant can fetch that terminal state.

## Signal and deadline rules

Only `accepted` calls exchange signals. Caller posts one `{kind:'offer',payload:{type:'offer',sdp}}`; callee posts one `{kind:'answer',payload:{type:'answer',sdp}}` after the offer exists. SDP is at most 64 KiB and accepts audio media sections only. No video/data-channel sections or renegotiation are accepted. ICE is `{candidate,sdpMid?:string|null,sdpMLineIndex?:number|null,usernameFragment?:string|null}`; candidate is at most 4096 UTF-8 bytes, no newline/NUL, and empty candidate denotes end-of-candidates. ICE may arrive before the remote description; clients must queue it until `setRemoteDescription` succeeds.

Signal IDs increase across both directions; GET returns only the opposite device's signals after the cursor, at most 100. Repeating a signal request ID and identical body returns the original ID; changed content conflicts. Maximum one offer, one answer and 256 total candidates per call. Raw signals live only in process memory for 90 seconds (maintenance runs every 5 seconds); they are dropped at call end. Missing an expired signal returns `409 VOICE_CALL_SIGNALS_EXPIRED`, requiring an explicit new call. Request fingerprints are hashes held only for the call's in-memory lifetime.

Ring deadline is 45 seconds. After accept, GET call or GET signals from the bound session updates that party's heartbeat. The client checks for incoming calls every 2.5 seconds while idle in the foreground. It checks call state and accepted-call signals roughly once a second during a call. A party silent for 45 seconds ends the call as `disconnected`. Accepted calls have a 10-minute QA maximum. On background or disposal, the client releases local media immediately and attempts the relevant cancel or hang-up. The server ends an active call after its deadline if it does not receive the action. The backend does not claim OS background call support.

## Storage, limits and verification

Migration 074 stores only call metadata and active account slots. Both reference accounts/sessions and clean up through existing deletion semantics. Ended metadata is retained up to 24 hours and removed by maintenance while enabled. No raw SDP, ICE, audio or tokens are in SQL, ordinary request logs or error details. PostgreSQL call-row locks serialize accept, end and signal authorization; process-exclusive signaling is intentional. Default global capacity is 64 active calls. Creation is limited to 12 requests/user/minute; other operations to 360/user/minute. Responses use `Cache-Control: private, no-store`.

Migration is additive with no historical backfill. Application rollback should disable calls and retain 074; no table dropping is required. Operators must separately verify backups, lock acquisition and restart behavior before any deployment. The implementation has focused configuration/signal tests and an opt-in real PostgreSQL/HTTP suite:

```sh
MIAOXUN_DOTENV_ENABLED=false NODE_ENV=test DEFAULT_ADMIN_ENABLED=false node --test test/voice-calls.test.js
RUN_VOICE_CALLS_POSTGRES=1 MIAOXUN_DOTENV_ENABLED=false NODE_ENV=test DEFAULT_ADMIN_ENABLED=false DATABASE_URL=postgresql://<isolated-local-user>@127.0.0.1:<isolated-port>/<name>_migration_test node --test test/voice-calls-postgres.test.js
```

The PostgreSQL suite must use a fresh isolated database without another running enabled voice-call API holding its process lease. It exercises concurrency, multi-session ownership, role checks, lifecycle deadlines, revoked friendship/session, real HTTP validation/logging and restart cleanup. Simulator/browser media and two physical devices remain separate evidence; passing backend tests does not establish audio connectivity or production readiness.
