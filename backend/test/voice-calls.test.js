import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createVoiceCallConfig } from "../src/voice-call-config.js";
import { createVoiceCallSignalBuffer, voiceCallSignalSchema } from "../src/voice-call-signals.js";
import { createVoiceCallService } from "../src/voice-call-service.js";

const audio = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
const offer = { kind: "offer", payload: { type: "offer", sdp: audio } };
const answer = { kind: "answer", payload: { type: "answer", sdp: audio } };
const ice = { kind: "ice", payload: { candidate: "candidate:1 1 udp 1 127.0.0.1 9999 typ host", sdpMid: "0", sdpMLineIndex: 0 } };
const code = expected => error => error.details?.code === expected;

test("voice calling is off by default and explicit LAN ICE is allowed", () => {
  assert.deepEqual(createVoiceCallConfig({}), { enabled: false });
  assert.deepEqual(createVoiceCallConfig({ CHAT_VOICE_CALLS_ENABLED: "true", CHAT_VOICE_CALLS_ICE_SERVERS_JSON: "[]" }), { enabled: true, iceServers: [] });
  const config = createVoiceCallConfig({ CHAT_VOICE_CALLS_ENABLED: "true", CHAT_VOICE_CALLS_ICE_SERVERS_JSON: '[{"urls":["stun:localhost:3478","turn:[::1]:3478?transport=udp"]}]' });
  assert.equal(config.iceServers.length, 1);
  assert.ok(Object.isFrozen(config.iceServers));
});

test("ICE config fails closed without revealing supplied values or credentials", () => {
  for (const raw of [undefined, "", "{}", "bad-json-private-value", '[{"urls":"https://example.invalid"}]',
    '[{"urls":"turn:user:secret@relay.invalid"}]', '[{"urls":"turn:relay.invalid","username":"private-user","credential":"private-secret"}]',
    '[{"urls":"stun:relay.invalid:0"}]', '[{"urls":"stun:relay.invalid?password=secret"}]', '[{"urls":[]}]']) {
    assert.throws(() => createVoiceCallConfig({ CHAT_VOICE_CALLS_ENABLED: "true", CHAT_VOICE_CALLS_ICE_SERVERS_JSON: raw }), error =>
      !/private|secret|bad-json/.test(error.message) && error.message.includes("explicit array"));
  }
  assert.throws(() => createVoiceCallConfig({ CHAT_VOICE_CALLS_ENABLED: "yes" }), /true or false/);
});

test("SDP/ICE schema only accepts bounded audio payloads", () => {
  assert.equal(voiceCallSignalSchema.parse({ requestId: randomUUID(), ...offer }).kind, "offer");
  for (const payload of [audio + "m=video 9 UDP/TLS/RTP/SAVPF 96\r\n", audio + "m=application 9 DTLS/SCTP 5000\r\n", "x".repeat(70000), "v=0\r\n"]) {
    assert.throws(() => voiceCallSignalSchema.parse({ requestId: randomUUID(), kind: "offer", payload: { type: "offer", sdp: payload } }));
  }
  assert.throws(() => voiceCallSignalSchema.parse({ requestId: randomUUID(), kind: "ice", payload: { candidate: "candidate:bad\nline" } }));
  assert.throws(() => voiceCallSignalSchema.parse({ requestId: randomUUID(), kind: "ice", payload: { ...ice.payload, private: "not permitted" } }));
});

test("signal role, idempotency and recipient isolation are enforced", () => {
  const buffer = createVoiceCallSignalBuffer();
  const append = (input, extra = {}) => buffer.append({ callId: "call", sender: "caller-device", recipient: "callee-device", role: "caller", requestId: randomUUID(), ...input, ...extra });
  const requestId = randomUUID();
  assert.deepEqual(append(offer, { requestId }), { id: 1 });
  assert.deepEqual(append(offer, { requestId }), { id: 1 });
  assert.throws(() => append({ ...offer, payload: { type: "offer", sdp: audio + "a=sendrecv\r\n" } }, { requestId }), code("VOICE_CALL_SIGNAL_CONFLICT"));
  assert.throws(() => append(offer), code("VOICE_CALL_RENEGOTIATION_UNSUPPORTED"));
  assert.throws(() => append(answer), code("VOICE_CALL_SIGNAL_ROLE"));
  assert.deepEqual(append(answer, { sender: "callee-device", recipient: "caller-device", role: "callee" }), { id: 2 });
  assert.deepEqual(buffer.list({ callId: "call", recipient: "caller-device", after: 0 }), { signals: [{ id: 2, ...answer }] });
  assert.deepEqual(buffer.list({ callId: "call", recipient: "third-device", after: 0 }), { signals: [] });
  buffer.remove("call");
  assert.deepEqual(buffer.list({ callId: "call", recipient: "callee-device", after: 0 }), { signals: [] });
});

test("signal retention expires raw payloads and bounds candidates", () => {
  let now = 1000;
  const buffer = createVoiceCallSignalBuffer({ now: () => now });
  for (let i = 0; i < 256; i += 1) buffer.append({ callId: "call", sender: "a", recipient: "b", role: "caller", requestId: randomUUID(), ...ice });
  assert.throws(() => buffer.append({ callId: "call", sender: "a", recipient: "b", role: "caller", requestId: randomUUID(), ...ice }), code("VOICE_CALL_SIGNAL_LIMIT"));
  assert.equal(buffer.list({ callId: "call", recipient: "b", after: 0 }).signals.length, 100);
  now += 90_000;
  assert.throws(() => buffer.list({ callId: "call", recipient: "b", after: 0 }), code("VOICE_CALL_SIGNALS_EXPIRED"));
  assert.deepEqual(buffer.list({ callId: "call", recipient: "b", after: 256 }), { signals: [] });
});

test("disabled service does not acquire DB lease or expose a capability", async () => {
  const service = createVoiceCallService({ settings: { enabled: false }, acquireLease: () => { throw new Error("must not acquire"); } });
  await service.start();
  assert.equal(service.availability, undefined);
  await assert.rejects(service.create({}, {}), code("VOICE_CALLS_UNAVAILABLE"));
  await service.close();
});

test("a lease lost during startup cannot restore advertised availability", async () => {
  let lose;
  let released = 0;
  const service = createVoiceCallService({
    settings: { enabled: true, iceServers: [] },
    acquireLease: async onLost => { lose = onLost; return async () => { released += 1; }; },
    transaction: work => work({ query: async () => { lose(); return []; } }),
  });
  await assert.rejects(service.start(), code("VOICE_CALL_LEASE_LOST"));
  assert.equal(service.availability, undefined);
  assert.equal(released, 1);
});

test("an in-flight create rolls back before further SQL after losing its process lease", async () => {
  let lose;
  let started = false;
  let rolledBack = false;
  const statements = [];
  const service = createVoiceCallService({
    settings: { enabled: true, iceServers: [] },
    acquireLease: async onLost => { lose = onLost; return async () => {}; },
    queryFn: async () => [],
    transaction: async work => {
      try {
        return await work({ query: async sql => {
          statements.push(sql);
          if (started) { lose(); return [{ id: "session" }]; }
          return [];
        } });
      } catch (error) { rolledBack = true; throw error; }
    },
  });
  await service.start();
  started = true;
  statements.length = 0;
  await assert.rejects(service.create({ userId: "user", sessionId: "session" }, { threadId: randomUUID(), requestId: randomUUID() }), code("VOICE_CALL_LEASE_LOST"));
  assert.equal(rolledBack, true);
  assert.equal(statements.length, 1);
  assert.equal(service.availability, undefined);
  await service.close();
});
