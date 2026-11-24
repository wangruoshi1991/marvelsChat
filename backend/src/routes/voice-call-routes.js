import { z } from "zod";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { voiceCallSignalSchema } from "../voice-call-signals.js";

const id = z.uuid().transform(value => value.toLowerCase());
const createBody = z.object({ threadId: id, requestId: id }).strict();
const actionBody = z.object({ action: z.enum(["accept", "decline", "cancel", "hangup"]) }).strict();
const cursor = z.object({ after: z.string().regex(/^\d{1,9}$/).transform(Number).default(0) }).strict();

export function registerVoiceCallRoutes(app, { authenticate, asyncHandler, service }) {
  const frequent = createRateLimitMiddleware({ action: "voice.calls", limit: 360, windowMs: 60_000 });
  const initiating = createRateLimitMiddleware({ action: "voice.calls.create", limit: 12, windowMs: 60_000 });
  const actor = req => ({ userId: req.user.id, sessionId: req.sessionId });
  const route = (method, path, work, limit = frequent) => app[method](path,
    (_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); },
    authenticate, limit, asyncHandler(async (req, res) => { res.json({ data: await work(req) }); }));
  route("post", "/api/voice-calls", req => service.create(actor(req), createBody.parse(req.body)), initiating);
  route("get", "/api/voice-calls/incoming", req => service.incoming(actor(req)));
  route("get", "/api/voice-calls/:id", req => service.get(actor(req), id.parse(req.params.id)));
  route("post", "/api/voice-calls/:id/action", req => service.action(actor(req), id.parse(req.params.id), actionBody.parse(req.body).action));
  route("get", "/api/voice-calls/:id/signals", req => service.listSignals(actor(req), id.parse(req.params.id), cursor.parse(req.query).after));
  route("post", "/api/voice-calls/:id/signals", req => service.sendSignal(actor(req), id.parse(req.params.id), voiceCallSignalSchema.parse(req.body)));
}
