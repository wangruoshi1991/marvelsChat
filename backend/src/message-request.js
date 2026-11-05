import crypto from "node:crypto";
import { HttpError } from "./http-error.js";

export function assertMatchingMessageRetry(message, fingerprint) {
  if (message.metadata?.source !== "app" || message.metadata?.requestFingerprint !== fingerprint) {
    throw new HttpError(409, "Client message ID already belongs to a different request");
  }
}

export function messageRequestFingerprint(body) {
  const semanticInput = [body.content, body.replyToMessageId || null];
  // Preserve historical fingerprints when no explicit workflow context exists.
  if (body.contextRefs.length) semanticInput.push(body.contextRefs.map(({ kind, id, version }) => ({ kind, id, version })));
  if (body.attachmentIds?.length) semanticInput.push({ attachmentIds: body.attachmentIds });
  if (body.butlerContextReset === true) semanticInput.push({ butlerContextReset: true });
  if (body.agentContextReset === true) semanticInput.push({ agentContextReset: true });
  if (body.workspaceContext) {
    const { id, revision, currentRound } = body.workspaceContext;
    semanticInput.push({ workspaceContext: { id, revision, currentRound } });
  }
  return crypto.createHash("sha256").update(JSON.stringify(semanticInput)).digest("hex");
}
