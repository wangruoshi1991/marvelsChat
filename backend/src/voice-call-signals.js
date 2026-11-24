import { createHash } from "node:crypto";
import { z } from "zod";
import { HttpError } from "./http-error.js";

const sdp = z.string().min(1).max(65_536).refine(value =>
  Buffer.byteLength(value, "utf8") <= 65_536 && !value.includes("\u0000") &&
  /^v=0\r?\n/.test(value) && /^m=audio /m.test(value) && !/^m=(?!audio )/m.test(value),
  "Only bounded audio SDP is supported.");
const description = type => z.object({ type: z.literal(type), sdp }).strict();
export const voiceCallSignalSchema = z.discriminatedUnion("kind", [
  z.object({ requestId: z.uuid(), kind: z.literal("offer"), payload: description("offer") }).strict(),
  z.object({ requestId: z.uuid(), kind: z.literal("answer"), payload: description("answer") }).strict(),
  z.object({ requestId: z.uuid(), kind: z.literal("ice"), payload: z.object({
    candidate: z.string().max(4096).refine(value => Buffer.byteLength(value, "utf8") <= 4096 &&
      !/[\r\n]/.test(value) && !value.includes("\u0000") && (value === "" || value.startsWith("candidate:"))),
    sdpMid: z.string().max(128).nullable().optional(),
    sdpMLineIndex: z.int().min(0).max(32).nullable().optional(),
    usernameFragment: z.string().max(256).nullable().optional(),
  }).strict() }).strict(),
]);
const conflict = code => new HttpError(409, "通话信令不可用，请重新发起通话。", { code });

export function createVoiceCallSignalBuffer({ now = Date.now, retentionMs = 90_000 } = {}) {
  const calls = new Map();
  const bucket = id => {
    if (!calls.has(id)) calls.set(id, { next: 0, records: [], requests: new Map(), expiredFor: new Map(),
      descriptions: new Set(), iceCount: 0, touchedAt: now() });
    return calls.get(id);
  };
  const prune = state => {
    const expired = state.records.filter(record => record.expiresAt <= now());
    for (const record of expired) state.expiredFor.set(record.recipient, Math.max(state.expiredFor.get(record.recipient) || 0, record.id));
    state.records = state.records.filter(record => record.expiresAt > now());
  };
  return {
    append({ callId, sender, recipient, role, requestId, kind, payload }) {
      const input = voiceCallSignalSchema.parse({ requestId, kind, payload });
      if ((kind === "offer" && role !== "caller") || (kind === "answer" && role !== "callee")) throw conflict("VOICE_CALL_SIGNAL_ROLE");
      const state = bucket(callId);
      prune(state);
      const key = `${sender}:${input.requestId.toLowerCase()}`;
      const fingerprint = createHash("sha256").update(JSON.stringify([kind, input.payload])).digest("hex");
      const previous = state.requests.get(key);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw conflict("VOICE_CALL_SIGNAL_CONFLICT");
        return { id: previous.id };
      }
      if ((kind === "offer" || kind === "answer") && state.descriptions.has(kind)) throw conflict("VOICE_CALL_RENEGOTIATION_UNSUPPORTED");
      if (kind === "answer" && !state.descriptions.has("offer")) throw conflict("VOICE_CALL_OFFER_REQUIRED");
      if (kind === "ice" && state.iceCount >= 256) throw conflict("VOICE_CALL_SIGNAL_LIMIT");
      const id = ++state.next;
      state.requests.set(key, { id, fingerprint });
      state.records.push({ id, kind, payload: input.payload, recipient, expiresAt: now() + retentionMs });
      if (kind === "ice") state.iceCount += 1;
      else state.descriptions.add(kind);
      state.touchedAt = now();
      return { id };
    },
    list({ callId, recipient, after }) {
      const state = bucket(callId);
      prune(state);
      if (after < (state.expiredFor.get(recipient) || 0)) throw conflict("VOICE_CALL_SIGNALS_EXPIRED");
      return { signals: state.records.filter(record => record.recipient === recipient && record.id > after)
        .slice(0, 100).map(({ id, kind, payload }) => ({ id, kind, payload })) };
    },
    remove(callId) { calls.delete(callId); },
    sweep() {
      for (const [id, state] of calls) {
        prune(state);
        if (now() - state.touchedAt > 11 * 60_000) calls.delete(id);
      }
    },
    clear() { calls.clear(); },
  };
}
