import crypto from "node:crypto";
import { z } from "zod";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";

const idSchema = z.string().uuid();
const legacyKindSchema = z.enum(["agent_message", "site_draft"]);
const legacyPredicate = "contract_version = 1 AND kind IN ('agent_message', 'site_draft')";
const phaseSchema = z.enum(["queued", "validating", "generating", "searching", "rendering", "awaiting_confirmation", "completed", "failed", "cancelled", "interrupted"]);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const artifactSchema = z.object({
  kind: z.enum(["message", "site_draft"]),
  id: idSchema,
  threadId: idSchema.optional(),
  title: z.string().max(160),
}).strict();
const artifactsSchema = z.array(artifactSchema).max(20);
const approvalSchema = z.object({
  id: idSchema,
  draftId: idSchema,
  draftHash: hashSchema,
  profileHash: hashSchema,
  resourcesHash: hashSchema.optional(),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();
const errorSchema = z.object({
  code: z.string().regex(/^[A-Za-z][A-Za-z0-9._-]{0,99}$/),
  message: z.string().min(1).max(500),
}).strict();
const contextRefsSchema = z.array(z.object({
  kind: z.enum(["chat-message", "station-album", "station-diary", "station-photo"]),
  id: idSchema,
  version: z.string().min(1).max(160),
  title: z.string().max(160),
}).strict()).max(20);
const createSchema = z.object({
  userId: idSchema,
  kind: z.enum(["agent_message", "site_draft"]),
  agentId: z.string().min(1).max(120),
  agentVersion: z.string().min(1).max(80),
  threadId: idSchema.nullable().optional().default(null),
  inputMessageId: idSchema.nullable().optional().default(null),
  phase: z.literal("queued").optional().default("queued"),
  contextRefs: contextRefsSchema.optional().default([]),
  input: z.record(z.unknown()),
  idempotencyKey: z.string().min(8).max(160),
  requestHash: hashSchema,
}).superRefine((value, context) => {
  const validSource = value.kind === "agent_message"
    ? value.threadId !== null && value.inputMessageId !== null
    : value.threadId === null && value.inputMessageId === null;
  if (!validSource) context.addIssue({ code: z.ZodIssueCode.custom, path: ["kind"], message: "AI task source does not match its kind" });
});
const iso = value => value instanceof Date ? value.toISOString() : value;
const conflict = (code, message) => {
  const error = new HttpError(409, message, { code });
  error.code = code;
  return error;
};
const missing = () => new HttpError(404, "AI task not found", { code: "AI_TASK_NOT_FOUND" });
const json = value => JSON.stringify(value);
const nullableJson = value => value == null ? null : json(value);
const readFields = `*, clock_timestamp() AS database_now,
  CASE WHEN kind = 'agent_message' THEN
    (SELECT m.content FROM chat_messages m WHERE m.id = ai_tasks.input_message_id
      AND m.user_id = ai_tasks.user_id AND m.deleted_at IS NULL AND m.recalled_at IS NULL)
    ELSE input ->> 'prompt' END AS display_goal`;

function toDTO(row) {
  const approval = row.approval ? approvalSchema.parse(row.approval) : null;
  const canConfirm = row.status === "awaiting_confirmation" && approval &&
    Date.parse(approval.expiresAt) > new Date(row.database_now).getTime();
  return {
    id: row.id,
    contractVersion: row.contract_version,
    kind: row.kind,
    agentId: row.agent_id,
    agentVersion: row.agent_version,
    goal: String(row.display_goal ?? "").slice(0, 2000),
    threadId: row.thread_id,
    inputMessageId: row.input_message_id,
    status: row.status,
    revision: row.revision,
    phase: row.phase,
    contextRefs: contextRefsSchema.parse(row.context_refs),
    artifacts: artifactsSchema.parse(row.artifacts),
    approval,
    error: row.error ? errorSchema.parse(row.error) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    allowedActions: row.status === "queued" ? ["cancel"]
      : row.status === "awaiting_confirmation" ? ["cancel", ...(canConfirm ? ["confirm"] : []), "reject"] : [],
  };
}

const toRecord = row => ({
  ...(row.kind === "comic_render" ? {
    id: row.id, kind: row.kind, contractVersion: row.contract_version,
    agentId: row.agent_id, agentVersion: row.agent_version, comicDiaryId: row.comic_diary_id,
    status: row.status, phase: row.phase, revision: row.revision, error: row.error,
  } : toDTO(row)), userId: row.user_id, input: row.input,
  claimToken: row.claim_token, leaseUntil: iso(row.lease_until),
});
const executionProjection = row => row.kind === "comic_render" ? toRecord(row) : toDTO(row);

async function appendEvent(connection, row) {
  let counters = {};
  if (row.kind === "comic_render") {
    const [counts] = await connection.query(`SELECT COUNT(*)::integer AS total,
      COUNT(*) FILTER (WHERE status='succeeded')::integer AS succeeded,
      COUNT(*) FILTER (WHERE status='failed')::integer AS failed,
      COUNT(*) FILTER (WHERE status='unknown')::integer AS unknown FROM comic_task_outputs WHERE task_id=?`, [row.id]);
    counters = counts;
  }
  await connection.query(`INSERT INTO ai_task_events (task_id, user_id, sequence, payload)
    VALUES (?, ?, ?, ?::jsonb)`, [row.id, row.user_id, row.revision, json({
    status: row.status, phase: row.phase, ...counters,
    ...(row.error ? { errorCode: row.error.code } : {}),
  })]);
}

// The caller owns this transaction so the input message and queued task can
// commit together. ON CONFLICT preserves the caller's transaction on replay.
export async function createAITaskInTransaction(connection, args) {
  const input = createSchema.parse(args);
  if (Buffer.byteLength(json(input.input), "utf8") > 128 * 1024) {
    throw new HttpError(400, "AI task input is too large", { code: "AI_TASK_INPUT_TOO_LARGE" });
  }
  if (input.threadId) {
    const threads = await connection.query("SELECT id FROM chat_threads WHERE id = ? AND user_id = ? FOR KEY SHARE", [input.threadId, input.userId]);
    if (!threads[0]) throw missing();
  }
  if (input.inputMessageId) {
    const messages = await connection.query("SELECT id FROM chat_messages WHERE id = ? AND user_id = ? AND thread_id = ? FOR KEY SHARE", [input.inputMessageId, input.userId, input.threadId]);
    if (!messages[0]) throw missing();
  }
  const rows = await connection.query(`INSERT INTO ai_tasks
    (id, user_id, kind, agent_id, agent_version, thread_id, input_message_id, phase, context_refs, input, idempotency_key, request_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?)
    ON CONFLICT (user_id, kind, agent_id, idempotency_key) DO NOTHING
    RETURNING ${readFields}`, [crypto.randomUUID(), input.userId, input.kind, input.agentId, input.agentVersion,
    input.threadId, input.inputMessageId, input.phase, json(input.contextRefs), json(input.input), input.idempotencyKey, input.requestHash]);
  if (rows[0]) {
    await appendEvent(connection, rows[0]);
    return { task: toDTO(rows[0]), reused: false };
  }
  const existing = await connection.query(`SELECT ${readFields} FROM ai_tasks
    WHERE user_id = ? AND kind = ? AND agent_id = ? AND idempotency_key = ? FOR UPDATE`,
  [input.userId, input.kind, input.agentId, input.idempotencyKey]);
  if (!existing[0] || existing[0].request_hash !== input.requestHash) {
    throw conflict("AI_TASK_IDEMPOTENCY_CONFLICT", "AI task key was already used with different input");
  }
  return { task: toDTO(existing[0]), reused: true };
}

export function createAITaskRepository({ query: runQuery = query, withTransaction: transaction = withTransaction } = {}) {
  const getAITask = async ({ userId, taskId }) => {
    const rows = await runQuery(`SELECT ${readFields} FROM ai_tasks WHERE id = ? AND user_id = ? AND ${legacyPredicate}`, [taskId, userId]);
    return rows[0] ? toDTO(rows[0]) : null;
  };
  const getAITaskByKey = async ({ userId, idempotencyKey, kind, agentId }) => {
    legacyKindSchema.parse(kind);
    const rows = await runQuery(`SELECT ${readFields} FROM ai_tasks WHERE user_id = ? AND kind = ? AND agent_id = ? AND idempotency_key = ? AND ${legacyPredicate}`,
      [userId, kind, agentId, idempotencyKey]);
    return rows[0] ? toDTO(rows[0]) : null;
  };
  const listAITasks = async ({ userId, threadId, kind, limit = 30 }) => {
    const safeLimit = z.number().int().min(1).max(100).parse(limit);
    const predicates = ["user_id = ?", legacyPredicate];
    const params = [userId];
    if (threadId !== undefined) { predicates.push("thread_id = ?"); params.push(threadId); }
    if (kind !== undefined) { legacyKindSchema.parse(kind); predicates.push("kind = ?"); params.push(kind); }
    params.push(safeLimit);
    const rows = await runQuery(`SELECT ${readFields} FROM ai_tasks WHERE ${predicates.join(" AND ")}
      ORDER BY CASE WHEN status IN ('queued', 'running', 'awaiting_confirmation') THEN 0 ELSE 1 END,
        updated_at DESC, id DESC LIMIT ?`, params);
    return rows.map(toDTO);
  };
  const claimAITask = async ({ kinds } = {}) => {
    if (kinds !== undefined) z.array(z.enum(["agent_message", "site_draft", "comic_render"])).max(3).parse(kinds);
    if (kinds?.length === 0) return null;
    return transaction(async connection => {
    const rows = await connection.query(`SELECT id FROM ai_tasks WHERE status = 'queued'
      ${kinds ? "AND kind = ANY(?::text[])" : ""}
      ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`, kinds ? [kinds] : []);
    if (!rows[0]) return null;
    const claimed = await connection.query(`UPDATE ai_tasks SET status = 'running', phase = 'validating',
      revision = revision + 1, claim_token = ?, lease_until = clock_timestamp() + INTERVAL '5 minutes', updated_at = clock_timestamp()
      WHERE id = ? AND status = 'queued' RETURNING ${readFields}`, [crypto.randomUUID(), rows[0].id]);
    if (!claimed[0]) throw conflict("AI_TASK_STATE_CHANGED", "AI task state changed");
    await appendEvent(connection, claimed[0]);
    return toRecord(claimed[0]);
    });
  };
  const heartbeatAITask = async ({ taskId, claimToken }) => {
    const rows = await runQuery(`UPDATE ai_tasks SET lease_until = clock_timestamp() + INTERVAL '5 minutes'
      WHERE id = ? AND claim_token = ? AND status = 'running' AND lease_until > clock_timestamp() RETURNING id`, [taskId, claimToken]);
    return Boolean(rows[0]);
  };
  const advanceAITask = async ({ taskId, claimToken, phase, expectedPhase }) => {
    z.enum(["generating", "searching", "rendering"]).parse(phase);
    if (expectedPhase !== undefined) z.enum(["validating", "generating", "searching", "rendering"]).parse(expectedPhase);
    return transaction(async connection => {
      const current = (await connection.query(`SELECT ${readFields} FROM ai_tasks WHERE id = ? FOR UPDATE`, [taskId]))[0];
      if (!current || current.status !== "running" || current.claim_token !== claimToken ||
        new Date(current.lease_until) <= new Date(current.database_now)) {
        throw conflict("AI_TASK_LEASE_LOST", "AI task lease is no longer valid");
      }
      if (expectedPhase !== undefined && current.phase !== expectedPhase) {
        throw conflict("AI_TASK_PHASE_CHANGED", "AI task execution phase has changed");
      }
      if (current.phase === phase) return executionProjection(current);
      const rows = await connection.query(`UPDATE ai_tasks SET phase = ?, revision = revision + 1, updated_at = clock_timestamp()
        WHERE id = ? AND claim_token = ? AND status = 'running' AND lease_until > clock_timestamp() RETURNING ${readFields}`,
      [phase, taskId, claimToken]);
      if (!rows[0]) throw conflict("AI_TASK_LEASE_LOST", "AI task lease is no longer valid");
      await appendEvent(connection, rows[0]);
      return executionProjection(rows[0]);
    });
  };
  const finishAITask = async ({ taskId, claimToken, status, phase, artifacts, approval, error, complete }) => {
    z.enum(["awaiting_confirmation", "succeeded", "partially_succeeded", "failed", "interrupted"]).parse(status);
    phaseSchema.parse(phase);
    return transaction(async connection => {
      const rows = await connection.query(`SELECT ${readFields} FROM ai_tasks WHERE id = ? FOR UPDATE`, [taskId]);
      const row = rows[0];
      if (!row || row.status !== "running" || row.claim_token !== claimToken ||
        new Date(row.lease_until) <= new Date(row.database_now)) {
        throw conflict("AI_TASK_LEASE_LOST", "AI task lease is no longer valid");
      }
      const result = complete ? await complete(connection, toRecord(row)) : null;
      if (row.kind === "comic_render") {
        await connection.query(`UPDATE comic_task_outputs SET
          status = CASE WHEN status='running' THEN 'unknown' ELSE 'skipped' END,
          safe_error_code = CASE WHEN status='running' THEN 'COMIC_RENDER_OUTCOME_UNKNOWN' ELSE NULL END,
          updated_at=clock_timestamp() WHERE task_id=? AND status IN ('running','queued')`, [taskId]);
        const [counts] = await connection.query(`SELECT COUNT(*)::integer AS total,
          COUNT(*) FILTER(WHERE status='succeeded')::integer AS succeeded,
          COUNT(*) FILTER(WHERE status='unknown')::integer AS unknown FROM comic_task_outputs WHERE task_id=?`, [taskId]);
        if (counts.unknown) {
          status="interrupted"; phase="interrupted";
          error={code:"COMIC_RENDER_OUTCOME_UNKNOWN",message:"画面生成已中断，部分请求结果尚未确认，后续画面已停止且不会自动重试。"};
        }
        else if (counts.succeeded===counts.total) {status="succeeded";phase="completed";}
        else if (counts.succeeded) {status="partially_succeeded";phase="completed";}
        else {status="failed";phase="failed";}
      }
      const nextArtifacts = artifactsSchema.parse(row.kind === "comic_render" ? [] : result?.artifacts ?? artifacts ?? row.artifacts);
      const nextApproval = approvalSchema.nullable().parse(row.kind === "comic_render" ? null : result?.approval === undefined ? approval ?? null : result.approval);
      const nextError = errorSchema.nullable().parse(error ?? null);
      if (status === "awaiting_confirmation" && !nextApproval) throw new TypeError("Confirmation requires an approval");
      const updated = await connection.query(`UPDATE ai_tasks SET status = ?, phase = ?, artifacts = ?::jsonb,
        approval = ?::jsonb, error = ?::jsonb, revision = revision + 1, claim_token = NULL, lease_until = NULL, updated_at = clock_timestamp()
        WHERE id = ? AND status = 'running' AND claim_token = ? AND lease_until > clock_timestamp() RETURNING ${readFields}`,
      [status, phase, json(nextArtifacts), nullableJson(nextApproval), nullableJson(nextError), taskId, claimToken]);
      if (!updated[0]) throw conflict("AI_TASK_LEASE_LOST", "AI task lease expired before completion");
      await appendEvent(connection, updated[0]);
      return executionProjection(updated[0]);
    });
  };
  const mutateAITask = async ({ userId, taskId, revision, operation, approvalId, mutate }) => {
    z.number().int().min(1).parse(revision);
    z.enum(["cancel", "confirm", "reject"]).parse(operation);
    if (operation === "confirm") idSchema.parse(approvalId);
    if (operation === "confirm" && typeof mutate !== "function") throw new TypeError("Confirmation requires an apply handler");
    return transaction(async connection => {
      const rows = await connection.query(`SELECT ${readFields} FROM ai_tasks WHERE id = ? AND user_id = ? AND ${legacyPredicate} FOR UPDATE`, [taskId, userId]);
      const row = rows[0];
      if (!row) throw missing();
      if (row.last_operation === operation && row.last_operation_revision === revision &&
        (operation !== "confirm" || row.last_approval_id === approvalId)) return toDTO(row);
      if (row.revision !== revision) throw conflict("AI_TASK_REVISION_CONFLICT", "AI task has changed; refresh its state");
      const permitted = operation === "cancel" ? ["queued", "awaiting_confirmation"] : ["awaiting_confirmation"];
      if (!permitted.includes(row.status)) throw conflict("AI_TASK_STATE_CHANGED", "This action is not available for the current AI task state");
      if (operation === "confirm" && row.approval?.id !== approvalId) {
        throw conflict("AI_TASK_APPROVAL_MISMATCH", "AI task approval does not match this confirmation");
      }
      if (operation === "confirm" && (!row.approval || Date.parse(row.approval.expiresAt) <= new Date(row.database_now).getTime())) {
        throw conflict("AI_TASK_APPROVAL_EXPIRED", "AI task confirmation has expired");
      }
      const result = mutate ? await mutate(connection, toRecord(row)) : null;
      const nextArtifacts = artifactsSchema.parse(result?.artifacts ?? row.artifacts);
      const nextApproval = approvalSchema.nullable().parse(result?.approval === undefined ? row.approval : result.approval);
      const status = operation === "confirm" ? "succeeded" : "cancelled";
      const phase = operation === "confirm" ? "completed" : "cancelled";
      const updated = await connection.query(`UPDATE ai_tasks SET status = ?, phase = ?, artifacts = ?::jsonb, approval = ?::jsonb,
        revision = revision + 1, last_operation = ?, last_operation_revision = ?, last_approval_id = ?, updated_at = clock_timestamp()
        WHERE id = ? AND revision = ?
          AND (? <> 'confirm' OR (approval ->> 'expiresAt')::timestamptz > clock_timestamp())
        RETURNING ${readFields}`, [status, phase, json(nextArtifacts), nullableJson(nextApproval), operation, revision,
        operation === "confirm" ? approvalId : null, taskId, revision, operation]);
      if (!updated[0]) throw conflict("AI_TASK_APPROVAL_EXPIRED", "AI task confirmation expired before completion");
      await appendEvent(connection, updated[0]);
      return toDTO(updated[0]);
    });
  };
  const recoverInterruptedAITasks = async () => transaction(async connection => {
    const rows = await connection.query(`SELECT id FROM ai_tasks WHERE status = 'running' AND lease_until <= clock_timestamp()
      ORDER BY lease_until, id LIMIT 100 FOR UPDATE SKIP LOCKED`);
    if (!rows.length) return 0;
    const interrupted = await connection.query(`UPDATE ai_tasks SET status = 'interrupted', phase = 'interrupted',
      error = ?::jsonb, claim_token = NULL, lease_until = NULL, revision = revision + 1, updated_at = clock_timestamp()
      WHERE id = ANY(?::text[]) AND status = 'running' AND lease_until <= clock_timestamp() RETURNING ${readFields}`,
    [json({ code: "AI_TASK_INTERRUPTED", message: "任务执行中断，可能已发生模型调用，请检查结果后再决定下一步。" }), rows.map(row => row.id)]);
    for (const row of interrupted) {
      if (row.kind === "comic_render") await connection.query(`UPDATE comic_task_outputs
        SET status = CASE WHEN status = 'running' THEN 'unknown' ELSE 'skipped' END,
          safe_error_code = CASE WHEN status = 'running' THEN 'COMIC_RENDER_OUTCOME_UNKNOWN' ELSE NULL END,
          updated_at = clock_timestamp() WHERE task_id = ? AND status IN ('queued','running')`, [row.id]);
      await appendEvent(connection, row);
    }
    return interrupted.length;
  });
  const listAITaskEvents = async ({ userId, taskId, afterSequence = 0, limit = 100 }) => {
    z.number().int().min(0).parse(afterSequence);
    z.number().int().min(1).max(100).parse(limit);
    return transaction(async connection => {
      const tasks = await connection.query(`SELECT ${readFields} FROM ai_tasks WHERE id = ? AND user_id = ? AND ${legacyPredicate} FOR SHARE`, [taskId, userId]);
      if (!tasks[0]) throw missing();
      const rows = await connection.query(`SELECT sequence, payload, created_at FROM ai_task_events
        WHERE task_id = ? AND user_id = ? AND sequence > ? ORDER BY sequence LIMIT ?`, [taskId, userId, afterSequence, limit + 1]);
      const events = rows.slice(0, limit).map(row => ({ sequence: row.sequence, ...row.payload, createdAt: iso(row.created_at) }));
      return { task: toDTO(tasks[0]), events, hasMore: rows.length > limit, nextSequence: events.at(-1)?.sequence ?? afterSequence };
    });
  };
  return { getAITask, getAITaskByKey, listAITasks, claimAITask, heartbeatAITask, advanceAITask, finishAITask, mutateAITask, recoverInterruptedAITasks, listAITaskEvents };
}

export const {
  getAITask, getAITaskByKey, listAITasks, claimAITask, heartbeatAITask, advanceAITask,
  finishAITask, mutateAITask, recoverInterruptedAITasks, listAITaskEvents,
} = createAITaskRepository();
