import { getAgent } from '../../agents/registry.js';
import { agentScopesMatchDeclaration, assertAgentProductEntitlement } from './ai-agent-access.js';
import { fileReference } from './file-content.js';
import crypto from "node:crypto";
import { z } from "zod";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { workspaceInputRequest } from "./agent-workspace-input-request.js";
import { workspaceRejectionError } from "./agent-workspace-submission.js";

const id = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/);
const sourceSchema = z.object({ page: z.string().min(1).max(80), module: z.string().min(1).max(120).nullable() }).strict();
export const workspaceOriginSchema = z.object({
  kind: z.literal("agent_conversation"), threadId: id, inputMessageId: id,
  agentId: z.string().min(1).max(120), agentVersion: z.string().min(1).max(80),
  capability: z.string().min(1).max(120),
}).strict();
const executionModeSchema = z.enum(["coordinated", "direct"]);
const referenceSchema = z.object({
  kind: z.enum(["chat-message", "station-album", "station-diary", "station-photo", "station-file"]),
  id, version: hash, title: z.string().max(160),
}).strict();
const limitsSchema = z.object({
  deadlineSeconds: z.number().int().min(30).max(86400),
}).strict();
const usageSchema = z.object({ modelCalls: z.number().int().min(0), coordinatorTurns: z.number().int().min(0) }).strict();
const nullableToken = z.number().int().min(0).nullable();
const receiptSchema = z.object({ provider: z.string().min(1).max(120), model: z.string().max(200).optional(),
  servedModel: z.string().min(1).max(200).nullable().optional(),
  tokenUsage: z.object({ prompt: nullableToken, completion: nullableToken, total: nullableToken }).strict().nullable(),
  latencyMs: z.number().finite().min(0).optional() }).strict();
const errorSchema = z.object({ code: z.string().regex(/^[A-Za-z][A-Za-z0-9._-]{0,99}$/), message: z.string().min(1).max(500) }).strict();
const artifactSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text_result"), title: z.string().trim().min(1).max(160),
    content: z.string().trim().min(1).max(16000) }).strict(),
  z.object({ kind: z.literal("site_draft"), id, title: z.string().min(1).max(160) }).strict(),
  z.object({ kind: z.literal("media_selection"), title: z.string().min(1).max(160),
    assets: z.array(z.object({ id, version: z.string().min(1).max(160), kind: z.enum(["image", "video"]),
      matchedFrameTimestampMs: z.number().int().min(0).nullable() }).strict()).max(20),
    retrievalRunIds: z.array(id).max(20),
  }).strict(),
]);
const approvalSchema = z.object({ id, draftId: id, draftHash: hash, profileHash: hash, resourcesHash: hash,
  expiresAt: z.string().datetime({ offset: true }) }).strict();
const createSchema = z.object({
  userId: id, goal: z.string().min(1).max(2000), source: sourceSchema,
  contextRefs: z.array(referenceSchema).max(6), authority: z.record(z.unknown()),
  input: z.record(z.unknown()).optional().default({}), coordinatorVersion: z.string().min(1).max(80).nullable(),
  executionMode: executionModeSchema.default("coordinated"), origin: workspaceOriginSchema.nullable().default(null),
  limits: limitsSchema, idempotencyKey: z.string().min(8).max(160), requestHash: hash,
}).strict().superRefine((value, context) => {
  if (value.executionMode === "direct" ? !value.origin || value.coordinatorVersion !== null : value.origin !== null || value.coordinatorVersion === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Workspace execution identity is inconsistent" });
  }
});
const nodeSchema = z.object({
  key, agentId: z.string().min(1).max(120), agentVersion: z.string().min(1).max(80),
  capability: z.string().min(1).max(120), goal: z.string().min(1).max(2000),
  dependencies: z.array(key).max(40), contextRefIndexes: z.array(z.number().int().min(0).max(5)).max(6),
}).strict();
const patchSchema = z.object({
  status: z.enum(["running", "waiting_input", "awaiting_confirmation", "succeeded"]).optional(),
  summary: z.string().max(2000).optional(), question: z.string().min(1).max(2000).nullable().optional(),
  result: z.record(z.unknown()).nullable().optional(), approval: approvalSchema.nullable().optional(),
  nodeResult: z.record(z.unknown()).nullable().optional(),
}).strict();
const json = JSON.stringify;
const nullableJson = value => value == null ? null : json(value);
const iso = value => value instanceof Date ? value.toISOString() : value;
const roundTime = value => value == null ? null : new Date(value).toISOString();
const activeStates = ["queued", "running", "waiting_input"];
const rowFields = `*, clock_timestamp() AS database_now,
  (SELECT jsonb_agg(round_record ORDER BY round_record.round_number)
   FROM agent_workspace_rounds round_record WHERE round_record.workspace_id = agent_workspaces.id) AS workspace_rounds`;
const missing = () => new HttpError(404, "Agent workspace not found.", { code: "WORKSPACE_NOT_FOUND" });
const conflict = (code, message) => new HttpError(409, message, { code });
const stoppedError = { code: "WORKSPACE_INTERRUPTED", message: "协作执行中断，可能已发生模型调用；不会自动重新执行。" };
const expiredError = { code: "WORKSPACE_DEADLINE_EXCEEDED", message: "协作任务已超过执行时限，未继续派发后续步骤。" };
const bounds = (value, max = 128 * 1024) => {
  if (Buffer.byteLength(json(value), "utf8") > max) throw new HttpError(400, "Agent workspace data is too large.", { code: "WORKSPACE_INPUT_TOO_LARGE" });
};
const validateResult = result => {
  if (result != null) {
    z.record(z.unknown()).parse(result);
    if (result.artifact != null) artifactSchema.parse(result.artifact);
    bounds(result, 256 * 1024);
  }
  return result;
};
const artifactOf = result => result?.artifact == null ? null : artifactSchema.parse(result.artifact);
const publicArtifact = (result, nodeId) => {
  const artifact = artifactOf(result);
  if (artifact?.kind !== "text_result") return artifact;
  if (!id.safeParse(nodeId).success) throw new TypeError("Text delivery is missing its originating node");
  return { kind: "text_result", id: nodeId, title: artifact.title };
};
const uncertainReceipts = (receipts, now) => receipts.map(receipt => receipt.status === "dispatched"
  ? { ...receipt, status: "unknown", finishedAt: iso(now) } : receipt);

function nodeRecord(row) {
  return { id: row.id, workspaceId: row.workspace_id, userId: row.user_id, key: row.node_key,
    round: z.number().int().positive().parse(row.round_number),
    agentId: row.agent_id, agentVersion: row.agent_version, capability: row.capability, goal: row.goal,
    dependencies: z.array(key).parse(row.dependencies), contextRefIndexes: z.array(z.number().int()).parse(row.context_ref_indexes),
    status: row.status, summary: row.summary, result: row.result, error: row.error ? errorSchema.parse(row.error) : null,
    modelCalls: row.model_calls, modelReceipts: row.model_receipts, claimToken: row.claim_token, leaseUntil: iso(row.lease_until),
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}

function nodeDTO(row) {
  const record = nodeRecord(row);
  return { id: record.id, key: record.key, round: record.round, agentId: record.agentId, agentVersion: record.agentVersion,
    capability: record.capability, goal: record.goal, dependencies: record.dependencies, status: record.status,
    summary: record.summary, error: record.error, result: publicArtifact(record.result, record.id),
    createdAt: record.createdAt, updatedAt: record.updatedAt };
}

const currentSummary = row => ({ cancelling: "正在停止协作任务，已发出的调用仍可能完成", cancelled: "协作任务已取消",
  failed: "协作任务未完成，请查看失败原因", interrupted: "协作任务已中断，不会自动重新执行" })[row.status] ?? row.summary;

function workspaceRounds(row, nodes, publicView = false) {
  const currentRound = z.number().int().positive().parse(row.current_round);
  if (!Array.isArray(row.workspace_rounds) || row.workspace_rounds.length !== currentRound) {
    throw new TypeError("Workspace has no complete persisted round history");
  }
  return row.workspace_rounds.map((stored, index) => {
    if (stored.round_number !== index + 1) throw new TypeError("Workspace round history is not contiguous");
    const current = stored.round_number === currentRound;
    const result = current ? row.result : stored.result;
    const resultNodeId = current ? nodes.find(node => node.node_key === result?.resultKey)?.id ?? null : stored.result_node_id;
    return { number: stored.round_number, instruction: stored.instruction, baseResultNodeId: stored.base_result_node_id,
      resultNodeId, status: current ? row.status : stored.status,
      summary: current ? currentSummary(row) : currentSummary(stored),
      result: publicView ? publicArtifact(result, resultNodeId) : result,
      ...(!publicView && { approval: current ? row.approval ?? stored.approval : stored.approval }),
      createdAt: roundTime(stored.created_at), completedAt: current
        ? (["succeeded", "failed", "interrupted", "cancelled"].includes(row.status) ? roundTime(row.updated_at) : null)
        : roundTime(stored.completed_at) };
  });
}

function workspaceDTO(row, nodes) {
  const executionMode = executionModeSchema.parse(row.execution_mode);
  const origin = workspaceOriginSchema.nullable().parse(row.origin);
  if (executionMode === "direct" ? !origin || row.coordinator_version !== null : origin !== null || !row.coordinator_version) {
    throw new TypeError("Workspace execution identity is inconsistent");
  }
  const approval = row.approval == null ? null : approvalSchema.parse(row.approval);
  const inputRequest = workspaceInputRequest(row, nodes);
  const now = new Date(row.database_now).getTime();
  const beforeDeadline = new Date(row.deadline_at).getTime() > now;
  const continuation = canContinueWorkspace(row) ? ["continue"] : [];
  const allowedActions = row.status === "awaiting_confirmation"
    ? ["cancel", ...(approval && Date.parse(approval.expiresAt) > now ? ["confirm"] : []), "reject", ...continuation]
    : row.status === "waiting_input" ? ["cancel", ...(beforeDeadline && inputRequest.kind === "clarification" ? ["reply"] : [])]
      : ["queued", "running"].includes(row.status) ? ["cancel"] : row.status === "succeeded" ? continuation : [];
  return { id: row.id, goal: row.goal, status: row.status, revision: row.revision,
    executionMode, origin,
    currentRound: row.current_round, rounds: workspaceRounds(row, nodes, true),
    source: sourceSchema.parse(row.source), contextRefs: z.array(referenceSchema).max(6).parse(row.context_refs),
    followups: z.array(z.object({ text: z.string().min(1).max(2000) }).passthrough()).parse(row.followups).map(item => item.text),
    summary: currentSummary(row), question: inputRequest?.question ?? null, inputRequest,
    error: row.error == null ? null : errorSchema.parse(row.error),
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), allowedActions,
    limits: limitsSchema.parse(row.limits), usage: usageSchema.parse(row.usage), steps: nodes.map(nodeDTO),
    result: publicArtifact(row.result, nodes.find(node => node.node_key === row.result?.resultKey)?.id), approval };
}

// A button never grants permission. This static capability check avoids
// offering a continuation that the immutable task boundary cannot consume;
// the service additionally rechecks the current registry, grants and sources.
function canContinueWorkspace(row) {
  if (row.execution_mode !== "direct") return true;
  const origin = workspaceOriginSchema.parse(row.origin);
  const entry = row.authority?.capabilities?.find(item => item.agentId === origin.agentId &&
    item.agentVersion === origin.agentVersion && item.capability === origin.capability);
  return Boolean(entry?.dependencyKinds?.includes(row.result?.artifact?.kind));
}

function workspaceRecord(row, nodes) {
  return { ...workspaceDTO(row, nodes), userId: row.user_id, input: row.input, authority: row.authority,
    rounds: workspaceRounds(row, nodes),
    followups: row.followups, coordinatorVersion: row.coordinator_version, deadlineAt: iso(row.deadline_at),
    databaseNow: iso(row.database_now), result: row.result, nodes: nodes.map(nodeRecord) };
}

async function readNodes(connection, workspaceId) {
  return connection.query("SELECT * FROM agent_workspace_nodes WHERE workspace_id = ? ORDER BY created_at, id", [workspaceId]);
}

async function refreshLockedRounds(connection, rows) {
  if (!rows.length) return;
  // SELECT ... FOR UPDATE/SHARE may wait for a continuation transaction. Its
  // correlated subquery can retain the statement's older MVCC snapshot while
  // the locked workspace row advances. Read the history after the lock, using
  // a fresh statement snapshot, and batch list responses rather than N+1 reads.
  const rounds = await connection.query(`SELECT * FROM agent_workspace_rounds
    WHERE workspace_id = ANY(?::text[]) ORDER BY workspace_id,round_number`, [rows.map(row => row.id)]);
  for (const row of rows) row.workspace_rounds = rounds.filter(round => round.workspace_id === row.id);
}

async function lockWorkspace(connection, workspaceId, userId) {
  const rows = await connection.query(`SELECT ${rowFields} FROM agent_workspaces WHERE id = ?${userId === undefined ? "" : " AND user_id = ?"} FOR UPDATE`,
    userId === undefined ? [workspaceId] : [workspaceId, userId]);
  if (!rows[0]) throw missing();
  await refreshLockedRounds(connection, rows);
  return rows[0];
}

async function lockClaim(connection, nodeId, claimToken) {
  const locator = (await connection.query("SELECT workspace_id FROM agent_workspace_nodes WHERE id = ?", [nodeId]))[0];
  if (!locator) throw missing();
  const workspace = await lockWorkspace(connection, locator.workspace_id);
  const node = (await connection.query("SELECT *, clock_timestamp() AS database_now FROM agent_workspace_nodes WHERE id = ? FOR UPDATE", [nodeId]))[0];
  if (!node || node.status !== "running" || node.claim_token !== claimToken ||
    new Date(node.lease_until) <= new Date(node.database_now)) {
    throw conflict("WORKSPACE_LEASE_LOST", "This workspace step no longer owns its execution lease.");
  }
  return { workspace, node };
}

// Only the persisted claim supplies execution goals, authority and deliveries.
// Caller-provided node/workspace snapshots are identifiers, never trusted input.
export async function readActiveWorkspaceClaim(connection, { nodeId, claimToken }) {
  id.parse(nodeId); id.parse(claimToken);
  const { workspace: row, node } = await lockClaim(connection, nodeId, claimToken);
  if (row.status !== "running") throw conflict("WORKSPACE_STATE_CHANGED", "Workspace is no longer dispatching model calls.");
  if (new Date(row.deadline_at) <= new Date(row.database_now)) throw conflict("WORKSPACE_DEADLINE_EXCEEDED", expiredError.message);
  return { workspace: workspaceRecord(row, await readNodes(connection, row.id)), node: nodeRecord(node) };
}

export async function readOwnedWorkspaceRecord(connection, { userId, workspaceId }) {
  id.parse(userId); id.parse(workspaceId);
  const [row] = await connection.query(`SELECT ${rowFields} FROM agent_workspaces WHERE id = ? AND user_id = ? FOR SHARE`, [workspaceId, userId]);
  if (!row) throw missing();
  await refreshLockedRounds(connection, [row]);
  const nodes = await connection.query("SELECT * FROM agent_workspace_nodes WHERE workspace_id = ? ORDER BY created_at, id FOR SHARE", [workspaceId]);
  return workspaceRecord(row, nodes);
}

async function bumpWorkspace(connection, workspaceId) {
  return (await connection.query(`UPDATE agent_workspaces SET revision = revision + 1, updated_at = clock_timestamp()
    WHERE id = ? RETURNING ${rowFields}`, [workspaceId]))[0];
}

async function cancelQueued(connection, workspaceId) {
  await connection.query(`UPDATE agent_workspace_nodes SET status = 'cancelled', updated_at = clock_timestamp()
    WHERE workspace_id = ? AND status = 'queued'`, [workspaceId]);
}

async function applyPatch(connection, row, rawPatch = {}, leaseUntil) {
  const patch = patchSchema.parse(rawPatch || {});
  const next = { status: patch.status ?? row.status, summary: patch.summary ?? row.summary,
    question: patch.question === undefined ? row.question : patch.question,
    result: patch.result === undefined ? row.result : validateResult(patch.result),
    approval: patch.approval === undefined ? row.approval : patch.approval };
  if (next.status === "waiting_input" && !next.question) throw new TypeError("Workspace clarification requires a question");
  if (next.status === "awaiting_confirmation" && (!next.approval || artifactOf(next.result)?.kind !== "site_draft")) {
    throw new TypeError("Workspace confirmation requires a site artifact and approval");
  }
  if (next.status === "succeeded" && !artifactOf(next.result)) throw new TypeError("Workspace completion requires a verified artifact");
  if (["waiting_input", "awaiting_confirmation", "succeeded"].includes(next.status)) {
    const pending = await connection.query("SELECT id FROM agent_workspace_nodes WHERE workspace_id = ? AND status IN ('queued','running') LIMIT 1", [row.id]);
    if (pending.length) throw conflict("WORKSPACE_STEPS_PENDING", "Workspace has unfinished execution steps.");
  }
  const rows = await connection.query(`UPDATE agent_workspaces SET status = ?, summary = ?, question = ?, result = ?::jsonb,
    approval = ?::jsonb, revision = revision + 1, updated_at = clock_timestamp()
    WHERE id = ? AND deadline_at > clock_timestamp() AND ?::timestamptz > clock_timestamp() RETURNING ${rowFields}`,
  [next.status, next.summary, next.question, nullableJson(next.result), nullableJson(next.approval), row.id, leaseUntil]);
  if (!rows[0]) throw conflict("WORKSPACE_LEASE_LOST", "Workspace execution lease or time limit expired before completion.");
  return rows[0];
}

async function insertNodes(connection, workspace, definitions, coordinator = false) {
  const nodes = z.array(nodeSchema).min(1).max(20).parse(definitions);
  const row = await lockWorkspace(connection, workspace.id, workspace.userId);
  if (!["queued", "running", "waiting_input"].includes(row.status)) throw conflict("WORKSPACE_STATE_CHANGED", "Workspace is not accepting new steps.");
  if (new Date(row.deadline_at) <= new Date(row.database_now)) throw conflict("WORKSPACE_DEADLINE_EXCEEDED", expiredError.message);
  const existing = await readNodes(connection, workspace.id);
  if (row.execution_mode === "direct") {
    const origin = workspaceOriginSchema.parse(row.origin);
    const round = workspaceRounds(row, existing).find(item => item.number === row.current_round);
    const base = existing.find(item => item.id === round.baseResultNodeId);
    const node = nodes[0];
    if (coordinator || nodes.length !== 1 || existing.some(item => item.round_number === row.current_round) ||
      node.agentId !== origin.agentId || node.agentVersion !== origin.agentVersion || node.capability !== origin.capability ||
      node.goal !== round.instruction || JSON.stringify(node.dependencies) !== JSON.stringify(base ? [base.node_key] : []) ||
      JSON.stringify(node.contextRefIndexes) !== JSON.stringify(row.context_refs.map((_ref, index) => index))) {
      throw conflict("WORKSPACE_CONTEXT_INVALID", "Direct execution cannot replace its specialist, inputs or result lineage.");
    }
  }
  const existingByKey = new Map(existing.map(item => [item.node_key, item]));
  const newByKey = new Map(nodes.map(item => [item.key, item]));
  if (newByKey.size !== nodes.length || nodes.some(item => existingByKey.has(item.key))) {
    throw conflict("WORKSPACE_STEP_KEY_CONFLICT", "Workspace step keys must be unique and cannot be reused.");
  }
  for (const node of nodes) {
    const isCoordinator = node.capability === "workspace.coordinate";
    if (isCoordinator !== coordinator || (coordinator ? node.agentId !== "miaoxun-butler" || !/^coordinate-\d+$/.test(node.key) : /^coordinate-/.test(node.key))) {
      throw conflict("WORKSPACE_INVALID_STEP", "Invalid coordinator or specialist identity.");
    }
    if (new Set(node.dependencies).size !== node.dependencies.length || new Set(node.contextRefIndexes).size !== node.contextRefIndexes.length ||
      node.contextRefIndexes.some(index => index >= row.context_refs.length)) throw conflict("WORKSPACE_INVALID_STEP", "Invalid dependency or context reference selection.");
    for (const dependency of node.dependencies) {
      const stored = existingByKey.get(dependency);
      if ((!stored && !newByKey.has(dependency)) || dependency === node.key ||
        (stored && (coordinator ? !["queued", "running", "succeeded"].includes(stored.status) : stored.status !== "succeeded"))) {
        throw conflict("WORKSPACE_INVALID_DEPENDENCY", "Workspace dependency is missing or cannot deliver an artifact.");
      }
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = nodeKey => {
    if (visiting.has(nodeKey)) throw conflict("WORKSPACE_DEPENDENCY_CYCLE", "Workspace dependencies must be acyclic.");
    if (visited.has(nodeKey) || !newByKey.has(nodeKey)) return;
    visiting.add(nodeKey);
    for (const dependency of newByKey.get(nodeKey).dependencies) visit(dependency);
    visiting.delete(nodeKey); visited.add(nodeKey);
  };
  for (const node of nodes) visit(node.key);
  const inserted = [];
  for (const node of nodes) {
    const rows = await connection.query(`INSERT INTO agent_workspace_nodes
      (id,workspace_id,user_id,round_number,node_key,agent_id,agent_version,capability,goal,dependencies,context_ref_indexes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb) RETURNING *`,
    [crypto.randomUUID(), row.id, row.user_id, row.current_round, node.key, node.agentId, node.agentVersion, node.capability,
      node.goal, json(node.dependencies), json(node.contextRefIndexes)]);
    inserted.push(nodeRecord(rows[0]));
  }
  return inserted;
}

export const insertWorkspaceNodes = (connection, workspace, nodes) => insertNodes(connection, workspace, nodes);

export async function queueWorkspaceCoordinator(connection, workspace, { dependencies = [] } = {}) {
  const row = await lockWorkspace(connection, workspace.id, workspace.userId);
  if (row.execution_mode !== "coordinated") throw new TypeError("A direct workspace cannot dispatch a coordinator");
  const existing = await readNodes(connection, workspace.id);
  if (existing.some(item => item.capability === "workspace.coordinate" && ["queued", "running"].includes(item.status))) {
    throw conflict("WORKSPACE_COORDINATOR_PENDING", "A coordinator turn is already pending.");
  }
  const count = existing.filter(item => item.capability === "workspace.coordinate").length;
  const round = workspaceRounds(row, existing).find(item => item.number === row.current_round);
  const [node] = await insertNodes(connection, workspace, [{ key: `coordinate-${count + 1}`, agentId: "miaoxun-butler",
    agentVersion: row.coordinator_version, capability: "workspace.coordinate", goal: round.instruction,
    dependencies, contextRefIndexes: [] }], true);
  return node;
}

async function queueDirectWorkspaceNode(connection, workspace) {
  const row = await lockWorkspace(connection, workspace.id, workspace.userId);
  if (row.execution_mode !== "direct") throw new TypeError("A coordinated workspace cannot dispatch a fixed specialist");
  const origin = workspaceOriginSchema.parse(row.origin);
  const nodes = await readNodes(connection, row.id);
  if (nodes.some(node => node.round_number === row.current_round)) throw conflict("WORKSPACE_STEPS_PENDING", "This direct round already has an execution node.");
  const round = workspaceRounds(row, nodes).find(item => item.number === row.current_round);
  const base = round.baseResultNodeId ? nodes.find(node => node.id === round.baseResultNodeId) : null;
  if (round.baseResultNodeId && !base) throw conflict("WORKSPACE_RESULT_UNAVAILABLE", "The previous direct result is unavailable.");
  const [node] = await insertNodes(connection, workspace, [{ key: `direct-${row.current_round}`,
    agentId: origin.agentId, agentVersion: origin.agentVersion, capability: origin.capability,
    goal: round.instruction, dependencies: base ? [base.node_key] : [],
    contextRefIndexes: row.context_refs.map((_ref, index) => index) }]);
  return node;
}

const queueWorkspaceRound = (connection, workspace, executionMode) => executionMode === "direct"
  ? queueDirectWorkspaceNode(connection, workspace) : queueWorkspaceCoordinator(connection, workspace);

export async function createWorkspaceInTransaction(connection, args) {
  const input = createSchema.parse(args);
  bounds(input);
  const previous = await findWorkspaceSubmission(connection, input);
  if (previous) return { workspace: previous, reused: true };
  const rows = await connection.query(`INSERT INTO agent_workspaces
    (id,user_id,goal,coordinator_version,execution_mode,origin,source,context_refs,authority,input,limits,deadline_at,idempotency_key,request_hash)
    VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb,
      clock_timestamp() + (?::integer * INTERVAL '1 second'), ?, ?)
    RETURNING ${rowFields}`,
  [crypto.randomUUID(), input.userId, input.goal, input.coordinatorVersion, input.executionMode, nullableJson(input.origin), json(input.source), json(input.contextRefs),
    json(input.authority), json(input.input), json(input.limits), input.limits.deadlineSeconds, input.idempotencyKey, input.requestHash]);
  await connection.query(`INSERT INTO agent_workspace_rounds
    (workspace_id,user_id,round_number,instruction,status) VALUES (?,?,1,?,'queued')`, [rows[0].id, input.userId, input.goal]);
  await queueWorkspaceRound(connection, { id: rows[0].id, userId: input.userId }, input.executionMode);
  await connection.query(`INSERT INTO agent_workspace_submissions
    (user_id,idempotency_key,request_hash,outcome,workspace_id) VALUES (?,?,?,'accepted',?)`,
  [input.userId, input.idempotencyKey, input.requestHash, rows[0].id]);
  return { workspace: workspaceDTO(await lockWorkspace(connection, rows[0].id, input.userId), await readNodes(connection, rows[0].id)), reused: false };
}

// Submission replay is resolved before reading changed resources or acquiring
// user/grant locks. It returns the original accepted task, never a new attempt.
export async function findWorkspaceSubmission(connection, { userId, idempotencyKey, requestHash }) {
  id.parse(userId); z.string().min(8).max(160).parse(idempotencyKey); hash.parse(requestHash);
  // A missing row cannot be locked with FOR UPDATE. This lock also serializes
  // the first acceptance against a deterministic rejection for the same key.
  await connection.query("SELECT pg_advisory_xact_lock(hashtextextended(?::text, 0))", [`workspace-submission:${userId}:${idempotencyKey}`]);
  const [outcome] = await connection.query(`SELECT * FROM agent_workspace_submissions
    WHERE user_id = ? AND idempotency_key = ? FOR UPDATE`, [userId, idempotencyKey]);
  if (!outcome) return null;
  if (outcome.request_hash !== requestHash) throw conflict("WORKSPACE_IDEMPOTENCY_CONFLICT", "This workspace key already belongs to different input.");
  if (outcome.outcome === "rejected") throw workspaceRejectionError({ code: outcome.rejection_code, status: outcome.rejection_status, idempotencyKey });
  const [stored] = await connection.query(`SELECT ${rowFields} FROM agent_workspaces
    WHERE id = ? AND user_id = ? AND idempotency_key = ? AND request_hash = ? FOR UPDATE`,
  [outcome.workspace_id, userId, idempotencyKey, requestHash]);
  if (!stored) throw new TypeError("Accepted workspace submission is missing its matching workspace");
  await refreshLockedRounds(connection, [stored]);
  return workspaceDTO(stored, await readNodes(connection, stored.id));
}

export async function rejectWorkspaceSubmission(connection, { userId, idempotencyKey, requestHash, code, status }) {
  id.parse(userId); z.string().min(8).max(160).parse(idempotencyKey); hash.parse(requestHash);
  const error = workspaceRejectionError({ code, status, idempotencyKey });
  await connection.query(`INSERT INTO agent_workspace_submissions
    (user_id,idempotency_key,request_hash,outcome,rejection_code,rejection_status)
    VALUES (?,?,?,'rejected',?,?)`, [userId, idempotencyKey, requestHash, code, status]);
  return error;
}

// File outputs remain in task history, but unavailable source data must never
// expose derived delivery titles or continuation actions. Batch metadata reads;
// full source bodies are only resolved by the guarded text endpoint.
export async function unavailableWorkspaceFileSources(connection, userId, references, { lock = false } = {}) {
  if (!references.length) return new Set();
  const ids = [...new Set(references.map(ref => ref.id))];
  const files = await connection.query(`SELECT id,original_filename,mime_type,checksum_sha256,parse_version,status,
    encode(sha256(convert_to(extracted_text,'UTF8')),'hex') AS content_hash FROM file_assets
    WHERE user_id=? AND id=ANY(?::text[]) AND deleted_at IS NULL AND extracted_text IS NOT NULL ORDER BY id${lock ? " FOR SHARE" : ""}`, [userId, ids]);
  const [grant] = await connection.query(`SELECT enabled,granted_scopes FROM user_agents WHERE user_id=? AND agent_id='file-preprocessor'${lock ? " FOR SHARE" : ""}`, [userId]);
  const fileAgent = await getAgent('file-preprocessor');
  let permitted = grant?.enabled && agentScopesMatchDeclaration(fileAgent, grant.granted_scopes);
  if (permitted) {
    try { await assertAgentProductEntitlement({ userId, agent: fileAgent, queryFn: connection.query.bind(connection) }); }
    catch (error) {
      if (error.details?.code !== "AGENT_PRODUCT_ENTITLEMENT_REQUIRED") throw error;
      permitted = false;
    }
  }
  const versions = new Map(files.map(file => [file.id, fileReference(file)?.version]));
  return new Set(references.filter(ref => !permitted || versions.get(ref.id) !== ref.version).map(ref => `${ref.id}:${ref.version}`));
}

async function protectFileDeliveries(connection, userId, rows, nodes) {
  const references = rows.flatMap(row => row.context_refs).filter(ref => ref.kind === 'station-file');
  const unavailable = await unavailableWorkspaceFileSources(connection, userId, references);
  return rows.map(row => {
    const dto = workspaceDTO(row, nodes.filter(node => node.workspace_id === row.id));
    if (!row.context_refs.some(ref => ref.kind === 'station-file' && unavailable.has(`${ref.id}:${ref.version}`))) return dto;
    const explanation = '引用文件已删除、变化或授权不可用，成果无法打开，请重新选择文件创建任务。';
    return { ...dto, readAccess: { state: 'unavailable', code: 'WORKSPACE_FILE_SOURCE_UNAVAILABLE' }, result: null, summary: explanation, allowedActions: dto.allowedActions.filter(action => action !== 'continue'),
      steps: dto.steps.map(node => ({ ...node, result: null, summary: explanation })),
      rounds: dto.rounds.map(round => ({ ...round, result: null, summary: explanation })) };
  });
}

export function createAgentWorkspaceRepository({ query: runQuery = query, withTransaction: transaction = withTransaction } = {}) {
  const getAgentWorkspace = async ({ userId, workspaceId }) => transaction(async connection => {
    id.parse(userId); id.parse(workspaceId);
    const rows = await connection.query(`SELECT ${rowFields} FROM agent_workspaces WHERE id = ? AND user_id = ? FOR SHARE`, [workspaceId, userId]);
    await refreshLockedRounds(connection, rows);
    return rows[0] ? (await protectFileDeliveries(connection, userId, rows, await readNodes(connection, workspaceId)))[0] : null;
  });
  const listAgentWorkspaces = async ({ userId, limit = 30 }) => transaction(async connection => {
    id.parse(userId); z.number().int().min(1).max(100).parse(limit);
    const rows = await connection.query(`SELECT ${rowFields} FROM agent_workspaces WHERE user_id = ? ORDER BY updated_at DESC,id DESC LIMIT ? FOR SHARE`, [userId, limit]);
    if (!rows.length) return [];
    await refreshLockedRounds(connection, rows);
    const nodes = await connection.query("SELECT * FROM agent_workspace_nodes WHERE user_id = ? AND workspace_id = ANY(?::text[]) ORDER BY created_at,id", [userId, rows.map(row => row.id)]);
    return protectFileDeliveries(connection, userId, rows, nodes);
  });
  const claimWorkspaceNode = async () => transaction(async connection => {
    // Lock the aggregate before a node everywhere. The short aggregate lock
    // serializes decisions while claimed independent nodes execute concurrently.
    const rows = await connection.query(`SELECT w.*, clock_timestamp() AS database_now FROM agent_workspaces w
      WHERE w.status IN ('queued','running') AND w.deadline_at > clock_timestamp() AND EXISTS (
        SELECT 1 FROM agent_workspace_nodes n WHERE n.workspace_id = w.id AND n.status = 'queued'
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(n.dependencies) d(dependency_key)
          LEFT JOIN agent_workspace_nodes dep ON dep.workspace_id = n.workspace_id AND dep.node_key = d.dependency_key
          WHERE dep.id IS NULL OR dep.status <> 'succeeded'))
      ORDER BY w.created_at,w.id LIMIT 1 FOR UPDATE OF w SKIP LOCKED`);
    if (!rows[0]) return null;
    const row = rows[0];
    const candidates = await connection.query(`SELECT n.* FROM agent_workspace_nodes n WHERE n.workspace_id = ? AND n.status = 'queued'
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(n.dependencies) d(dependency_key)
        LEFT JOIN agent_workspace_nodes dep ON dep.workspace_id = n.workspace_id AND dep.node_key = d.dependency_key
        WHERE dep.id IS NULL OR dep.status <> 'succeeded') ORDER BY n.created_at,n.id LIMIT 1 FOR UPDATE OF n`, [row.id]);
    if (!candidates[0]) return null;
    const candidate = candidates[0];
    const coordinator = candidate.capability === "workspace.coordinate";
    const claimed = (await connection.query(`UPDATE agent_workspace_nodes SET status = 'running',claim_token = ?,
      lease_until = clock_timestamp() + INTERVAL '5 minutes',updated_at = clock_timestamp()
      WHERE id = ? AND status = 'queued' RETURNING *`, [crypto.randomUUID(), candidate.id]))[0];
    const usage = { ...row.usage, coordinatorTurns: row.usage.coordinatorTurns + Number(coordinator) };
    const updated = (await connection.query(`UPDATE agent_workspaces SET status = 'running',usage = ?::jsonb,
      revision = revision + 1,updated_at = clock_timestamp() WHERE id = ? RETURNING ${rowFields}`, [json(usage), row.id]))[0];
    return { workspace: workspaceRecord(updated, await readNodes(connection, row.id)), node: nodeRecord(claimed) };
  });
  const heartbeatWorkspaceNode = async ({ nodeId, claimToken }) => {
    id.parse(nodeId); id.parse(claimToken);
    const rows = await runQuery(`UPDATE agent_workspace_nodes n SET lease_until = clock_timestamp() + INTERVAL '5 minutes'
      WHERE n.id = ? AND n.claim_token = ? AND n.status = 'running' AND n.lease_until > clock_timestamp()
      AND EXISTS (SELECT 1 FROM agent_workspaces w WHERE w.id = n.workspace_id
        AND w.status IN ('running','cancelling') AND w.deadline_at > clock_timestamp()) RETURNING n.id`, [nodeId, claimToken]);
    return Boolean(rows[0]);
  };
  const reserveWorkspaceModelCall = async ({ nodeId, claimToken, authorize }) => transaction(async connection => {
    id.parse(nodeId); id.parse(claimToken);
    const { workspace: row, node } = await lockClaim(connection, nodeId, claimToken);
    if (row.status !== "running") throw conflict("WORKSPACE_STATE_CHANGED", "Workspace is no longer dispatching model calls.");
    if (new Date(row.deadline_at) <= new Date(row.database_now)) throw conflict("WORKSPACE_DEADLINE_EXCEEDED", expiredError.message);
    if (authorize) await authorize(connection, { workspace: workspaceRecord(row, await readNodes(connection, row.id)), node: nodeRecord(node) });
    const [clock] = await connection.query("SELECT clock_timestamp() AS now");
    if (new Date(node.lease_until) <= new Date(clock.now)) throw conflict("WORKSPACE_LEASE_LOST", "Workspace step lease expired before model dispatch.");
    if (new Date(row.deadline_at) <= new Date(clock.now)) throw conflict("WORKSPACE_DEADLINE_EXCEEDED", expiredError.message);
    const usage = { ...row.usage, modelCalls: row.usage.modelCalls + 1 };
    const receipts = [...node.model_receipts, { callNumber: node.model_calls + 1, status: "dispatched", startedAt: iso(node.database_now) }];
    await connection.query("UPDATE agent_workspace_nodes SET model_calls = model_calls + 1, model_receipts = ?::jsonb, updated_at = clock_timestamp() WHERE id = ?", [json(receipts), node.id]);
    await connection.query("UPDATE agent_workspaces SET usage = ?::jsonb, revision = revision + 1, updated_at = clock_timestamp() WHERE id = ?", [json(usage), row.id]);
    return { modelCalls: usage.modelCalls, nodeModelCalls: node.model_calls + 1 };
  });
  const recordWorkspaceModelCall = async ({ nodeId, claimToken, callNumber, receipt }) => transaction(async connection => {
    id.parse(nodeId); id.parse(claimToken); z.number().int().min(1).parse(callNumber);
    const metadata = receiptSchema.parse(receipt);
    const { node } = await lockClaim(connection, nodeId, claimToken);
    const stored = node.model_receipts.find(item => item.callNumber === callNumber);
    if (!stored) throw conflict("WORKSPACE_MODEL_RECEIPT_MISSING", "No dispatch reservation exists for this model call.");
    const receiptHash = crypto.createHash("sha256").update(json(metadata)).digest("hex");
    if (stored.status === "received" && stored.receiptHash === receiptHash) return stored;
    if (stored.status !== "dispatched") throw conflict("WORKSPACE_MODEL_RECEIPT_CONFLICT", "Model receipt already has a different or unknown result.");
    const received = { ...stored, status: "received", receivedAt: iso(node.database_now), ...metadata, receiptHash };
    const receipts = node.model_receipts.map(item => item.callNumber === callNumber ? received : item);
    await connection.query("UPDATE agent_workspace_nodes SET model_receipts = ?::jsonb, updated_at = clock_timestamp() WHERE id = ?", [json(receipts), node.id]);
    return received;
  });
  const finishWorkspaceNode = async ({ nodeId, claimToken, result = null, summary = "", complete }) => transaction(async connection => {
    id.parse(nodeId); id.parse(claimToken); z.string().max(2000).parse(summary); validateResult(result);
    let { workspace: row, node } = await lockClaim(connection, nodeId, claimToken);
    if (row.status !== "running") {
      // Cancelling/failed siblings have no authority to publish a late result or
      // schedule further work, although the already sent provider call may finish.
      await connection.query("UPDATE agent_workspace_nodes SET status = 'cancelled',model_receipts = ?::jsonb,claim_token = NULL,lease_until = NULL,updated_at = clock_timestamp() WHERE id = ?",
        [json(uncertainReceipts(node.model_receipts, node.database_now)), node.id]);
      if (row.status === "cancelling") {
        const remaining = await connection.query("SELECT id FROM agent_workspace_nodes WHERE workspace_id = ? AND status = 'running' LIMIT 1", [row.id]);
        if (!remaining.length) row = (await connection.query(`UPDATE agent_workspaces SET status = 'cancelled',question = NULL,approval = NULL WHERE id = ? RETURNING ${rowFields}`, [row.id]))[0];
      }
      row = await bumpWorkspace(connection, row.id);
      return workspaceDTO(row, await readNodes(connection, row.id));
    }
    if (new Date(row.deadline_at) <= new Date(row.database_now)) throw conflict("WORKSPACE_DEADLINE_EXCEEDED", expiredError.message);
    if (node.model_receipts.some(receipt => receipt.status !== "received")) throw conflict("WORKSPACE_MODEL_RESULT_UNKNOWN", "A dispatched model call has no confirmed response.");
    // Mark success before the callback inside this same transaction so newly
    // queued coordinator dependencies can reference the current completed step.
    await connection.query(`UPDATE agent_workspace_nodes SET status = 'succeeded',summary = ?,result = ?::jsonb,
      claim_token = NULL,lease_until = NULL,updated_at = clock_timestamp() WHERE id = ?`, [summary, nullableJson(result), node.id]);
    const nodes = await readNodes(connection, row.id);
    const record = workspaceRecord(row, nodes);
    const finished = record.nodes.find(item => item.id === node.id);
    const patch = patchSchema.parse((complete ? await complete(connection, { workspace: record, node: finished }) : {}) || {});
    if (patch.nodeResult !== undefined) {
      validateResult(patch.nodeResult);
      await connection.query("UPDATE agent_workspace_nodes SET result = ?::jsonb WHERE id = ?", [nullableJson(patch.nodeResult), node.id]);
    }
    const [clock] = await connection.query("SELECT clock_timestamp() AS now");
    if (new Date(node.lease_until) <= new Date(clock.now)) throw conflict("WORKSPACE_LEASE_LOST", "Workspace step lease expired before completion.");
    if (new Date(row.deadline_at) <= new Date(clock.now)) throw conflict("WORKSPACE_DEADLINE_EXCEEDED", expiredError.message);
    row = await applyPatch(connection, row, patch, node.lease_until);
    return workspaceDTO(row, await readNodes(connection, row.id));
  });
  const failWorkspaceNode = async ({ nodeId, claimToken, error, interrupted = false }) => transaction(async connection => {
    id.parse(nodeId); id.parse(claimToken); errorSchema.parse(error);
    let { workspace: row, node } = await lockClaim(connection, nodeId, claimToken);
    // A thrown implementation error is not evidence that an already dispatched
    // provider operation did nothing. Outstanding receipts force uncertainty.
    const outstanding = node.model_receipts.some(receipt => receipt.status === "dispatched");
    if (outstanding && !interrupted) error = { code: "WORKSPACE_MODEL_RESULT_UNKNOWN",
      message: "已派发的模型调用尚未确认结果，可能已产生费用；不会自动重新执行。" };
    interrupted = interrupted || outstanding;
    await connection.query(`UPDATE agent_workspace_nodes SET status = ?,error = ?::jsonb,model_receipts = ?::jsonb,claim_token = NULL,lease_until = NULL,
      updated_at = clock_timestamp() WHERE id = ?`, [interrupted ? "interrupted" : "failed", json(error), json(uncertainReceipts(node.model_receipts, node.database_now)), node.id]);
    await cancelQueued(connection, row.id);
    if (row.status === "cancelling") {
      const running = await connection.query("SELECT id FROM agent_workspace_nodes WHERE workspace_id = ? AND status = 'running' LIMIT 1", [row.id]);
      row = (await connection.query(`UPDATE agent_workspaces SET status = ?, error = ?::jsonb, revision = revision + 1,
        updated_at = clock_timestamp() WHERE id = ? RETURNING ${rowFields}`, [running.length ? "cancelling" : "cancelled", json(error), row.id]))[0];
    } else if (["running", "queued"].includes(row.status)) {
      row = (await connection.query(`UPDATE agent_workspaces SET status = ?,error = ?::jsonb,approval = NULL,question = NULL,
        revision = revision + 1,updated_at = clock_timestamp() WHERE id = ? RETURNING ${rowFields}`,
      [interrupted ? "interrupted" : "failed", json(error), row.id]))[0];
    } else row = await bumpWorkspace(connection, row.id);
    return workspaceDTO(row, await readNodes(connection, row.id));
  });
  const recoverInterruptedWorkspaceNodes = async () => transaction(async connection => {
    const rows = await connection.query(`SELECT w.*,clock_timestamp() AS database_now FROM agent_workspaces w
      WHERE (w.status IN ('queued','running','waiting_input','cancelling') AND w.deadline_at <= clock_timestamp())
        OR EXISTS (SELECT 1 FROM agent_workspace_nodes n WHERE n.workspace_id = w.id AND n.status = 'running' AND n.lease_until <= clock_timestamp())
      ORDER BY w.updated_at,w.id LIMIT 100 FOR UPDATE OF w SKIP LOCKED`);
    let recovered = 0;
    for (const row of rows) {
      const expired = new Date(row.deadline_at) <= new Date(row.database_now);
      const error = expired ? expiredError : stoppedError;
      const interrupted = await connection.query(`SELECT *,clock_timestamp() AS database_now FROM agent_workspace_nodes
        WHERE workspace_id = ? AND status = 'running' AND (?::boolean OR lease_until <= clock_timestamp()) FOR UPDATE`, [row.id, expired]);
      for (const node of interrupted) await connection.query(`UPDATE agent_workspace_nodes SET status = 'interrupted',error = ?::jsonb,
        model_receipts = ?::jsonb,claim_token = NULL,lease_until = NULL,updated_at = clock_timestamp() WHERE id = ?`,
      [json(error), json(uncertainReceipts(node.model_receipts, node.database_now)), node.id]);
      recovered += interrupted.length;
      await cancelQueued(connection, row.id);
      const pending = await connection.query("SELECT id FROM agent_workspace_nodes WHERE workspace_id = ? AND status = 'running' LIMIT 1", [row.id]);
      const status = row.status === "cancelling" ? (pending.length ? "cancelling" : "cancelled")
        : activeStates.includes(row.status) ? (interrupted.length ? "interrupted" : "failed") : row.status;
      const workspaceError = activeStates.includes(row.status) || row.status === "cancelling" ? error : row.error || error;
      await connection.query(`UPDATE agent_workspaces SET status = ?,error = ?::jsonb,question = NULL,approval = NULL,
        revision = revision + 1,updated_at = clock_timestamp() WHERE id = ?`, [status, json(workspaceError), row.id]);
    }
    return recovered;
  });
  const mutateAgentWorkspace = async ({ userId, workspaceId, revision, operation, approvalId, text, idempotencyKey, mutate, authorizeReplay }) => {
    id.parse(userId); id.parse(workspaceId); z.number().int().min(1).parse(revision);
    z.enum(["cancel", "confirm", "reject", "reply", "continue"]).parse(operation);
    if (operation === "confirm") {
      id.parse(approvalId);
      if (typeof mutate !== "function") throw new TypeError("Confirmation requires an apply handler");
    }
    if (["reply", "continue"].includes(operation)) text = z.string().trim().min(1).max(2000).parse(text);
    if (operation === "continue") {
      z.string().min(8).max(160).parse(idempotencyKey);
      if (typeof mutate !== "function") throw new TypeError("Continuation requires an authorization handler");
    }
    if ((operation !== "confirm" && approvalId !== undefined) || (!["reply", "continue"].includes(operation) && text !== undefined) ||
      (operation !== "continue" && idempotencyKey !== undefined)) {
      throw new HttpError(400, "Decision contains fields for a different operation.", { code: "WORKSPACE_DECISION_INVALID" });
    }
    const decisionHash = crypto.createHash("sha256").update(json({ operation, approvalId: approvalId ?? null, text: text ?? null })).digest("hex");
    return transaction(async connection => {
      let row = await lockWorkspace(connection, workspaceId, userId);
      if (operation === "continue") {
        const requestHash = crypto.createHash("sha256").update(json({ revision, text })).digest("hex");
        const [previous] = await connection.query(`SELECT request_hash FROM agent_workspace_continuations
          WHERE workspace_id = ? AND user_id = ? AND idempotency_key = ?`, [workspaceId, userId, idempotencyKey]);
        const nodes = await readNodes(connection, row.id);
        const record = workspaceRecord(row, nodes);
        if (previous) {
          if (authorizeReplay) await authorizeReplay(connection, record);
          if (previous.request_hash !== requestHash) throw conflict("WORKSPACE_IDEMPOTENCY_CONFLICT", "This continuation key belongs to a different request.");
          return (await protectFileDeliveries(connection, userId, [row], nodes))[0];
        }
        if (row.revision !== revision) throw conflict("WORKSPACE_REVISION_CONFLICT", "Workspace has changed; refresh before deciding.");
        if (!["succeeded", "awaiting_confirmation"].includes(row.status)) {
          throw conflict("WORKSPACE_STATE_CHANGED", "Only a completed delivery can start a new revision round.");
        }
        if (!canContinueWorkspace(row)) throw conflict("WORKSPACE_CONTINUATION_UNAVAILABLE", "当前专业能力不能接续此成果，请明确发起新的需求。");
        const base = nodes.find(node => node.node_key === row.result?.resultKey);
        if (!base || base.status !== "succeeded" || base.capability === "workspace.coordinate" || base.round_number !== row.current_round ||
          !artifactOf(base.result) || json(artifactOf(base.result)) !== json(artifactOf(row.result))) {
          throw conflict("WORKSPACE_RESULT_UNAVAILABLE", "The current delivery has no verified originating step.");
        }
        if (nodes.some(node => ["queued", "running"].includes(node.status))) {
          throw conflict("WORKSPACE_STEPS_PENDING", "Workspace has unfinished execution steps.");
        }
        const patch = patchSchema.parse(await mutate(connection, record) || {});
        if (Object.keys(patch).some(field => field !== "summary")) throw new TypeError("Continuation may not replace the previous delivery or its state");
        await connection.query(`UPDATE agent_workspace_rounds SET status = ?,summary = ?,result = ?::jsonb,approval = ?::jsonb,
          result_node_id = ?,completed_at = ? WHERE workspace_id = ? AND round_number = ?`,
        [row.status, row.summary, nullableJson(row.result), nullableJson(record.rounds.at(-1).approval), base.id,
          row.status === "succeeded" ? row.updated_at : row.database_now, row.id, row.current_round]);
        const nextRound = row.current_round + 1;
        await connection.query(`INSERT INTO agent_workspace_rounds
          (workspace_id,user_id,round_number,instruction,base_result_node_id,status,summary)
          VALUES (?,?,?,?,?,'queued',?)`, [row.id, userId, nextRound, text, base.id, patch.summary ?? "已收到修改，等待继续协作"]);
        await connection.query(`UPDATE agent_workspaces SET current_round = ?,status = 'queued',summary = ?,question = NULL,
          result = NULL,approval = NULL,error = NULL,deadline_at = clock_timestamp() + ((limits->>'deadlineSeconds')::integer * INTERVAL '1 second'),
          revision = revision + 1,last_operation = 'continue',last_operation_revision = ?,last_decision_hash = ?,updated_at = clock_timestamp()
          WHERE id = ?`, [nextRound, patch.summary ?? "已收到修改，等待继续协作", revision, decisionHash, row.id]);
        await queueWorkspaceRound(connection, { id: row.id, userId }, row.execution_mode);
        await connection.query(`INSERT INTO agent_workspace_continuations
          (workspace_id,user_id,idempotency_key,request_hash,round_number) VALUES (?,?,?,?,?)`,
        [row.id, userId, idempotencyKey, requestHash, nextRound]);
        row = await lockWorkspace(connection, row.id, userId);
        return (await protectFileDeliveries(connection, userId, [row], await readNodes(connection, row.id)))[0];
      }
      if (row.last_operation === operation && row.last_operation_revision === revision && row.last_decision_hash === decisionHash) {
        return (await protectFileDeliveries(connection, userId, [row], await readNodes(connection, row.id)))[0];
      }
      if (row.revision !== revision) throw conflict("WORKSPACE_REVISION_CONFLICT", "Workspace has changed; refresh before deciding.");
      const permitted = operation === "cancel" ? ["queued", "running", "waiting_input", "awaiting_confirmation"]
        : operation === "reply" ? ["waiting_input"] : ["awaiting_confirmation"];
      if (!permitted.includes(row.status)) throw conflict("WORKSPACE_STATE_CHANGED", "This decision is not available in the current workspace state.");
      if (operation === "confirm" && row.approval?.id !== approvalId) throw conflict("WORKSPACE_APPROVAL_MISMATCH", "Workspace approval does not match.");
      if (operation === "confirm" && (!row.approval || Date.parse(row.approval.expiresAt) <= new Date(row.database_now).getTime())) {
        throw conflict("WORKSPACE_APPROVAL_EXPIRED", "Workspace approval has expired.");
      }
      if (operation === "reply" && new Date(row.deadline_at) <= new Date(row.database_now)) throw conflict("WORKSPACE_DEADLINE_EXCEEDED", expiredError.message);
      const nodes = await readNodes(connection, row.id);
      const record = workspaceRecord(row, nodes);
      if (operation === "reply" && record.inputRequest?.kind !== "clarification") {
        throw conflict("WORKSPACE_NEW_TASK_REQUIRED", "当前任务需要确认 Agent 授权后重新发起，不能通过补充回复扩大权限。");
      }
      const patch = patchSchema.parse((mutate ? await mutate(connection, record) : {}) || {});
      if (patch.nodeResult !== undefined) throw new TypeError("Only step completion may replace a node result");
      let status;
      let followups = row.followups;
      if (operation === "reply") {
        followups = [...row.followups, { text, round: row.current_round, createdAt: iso(row.database_now) }];
        bounds(followups);
        await queueWorkspaceCoordinator(connection, record);
        status = "queued";
      } else if (operation === "confirm") status = "succeeded";
      else {
        await cancelQueued(connection, row.id);
        status = nodes.some(node => node.status === "running") ? "cancelling" : "cancelled";
      }
      const nextResult = patch.result === undefined ? row.result : validateResult(patch.result);
      if (operation === "confirm" && !artifactOf(nextResult)) throw new TypeError("Workspace confirmation requires an artifact");
      if (row.approval) await connection.query(`UPDATE agent_workspace_rounds SET approval = ?::jsonb
        WHERE workspace_id = ? AND round_number = ?`, [json(row.approval), row.id, row.current_round]);
      const updated = await connection.query(`UPDATE agent_workspaces SET status = ?,summary = ?,question = NULL,
        result = ?::jsonb,approval = NULL,followups = ?::jsonb,revision = revision + 1,
        last_operation = ?,last_operation_revision = ?,last_decision_hash = ?,updated_at = clock_timestamp()
        WHERE id = ? AND (? <> 'confirm' OR (approval->>'expiresAt')::timestamptz > clock_timestamp()) RETURNING ${rowFields}`,
      [status, patch.summary ?? (operation === "reply" ? "已收到补充，等待继续协作" : operation === "confirm" ? row.summary
        : status === "cancelling" ? "正在停止协作任务，已发出的调用仍可能完成" : "协作任务已取消"),
      nullableJson(nextResult), json(followups), operation, revision, decisionHash, row.id, operation]);
      if (!updated[0]) throw conflict("WORKSPACE_APPROVAL_EXPIRED", "Workspace approval expired before completion.");
      row = updated[0];
      return (await protectFileDeliveries(connection, userId, [row], await readNodes(connection, row.id)))[0];
    });
  };
  return { getAgentWorkspace, listAgentWorkspaces, claimWorkspaceNode, heartbeatWorkspaceNode, reserveWorkspaceModelCall, recordWorkspaceModelCall,
    finishWorkspaceNode, failWorkspaceNode, recoverInterruptedWorkspaceNodes, mutateAgentWorkspace };
}

export const { getAgentWorkspace, listAgentWorkspaces, claimWorkspaceNode, heartbeatWorkspaceNode, reserveWorkspaceModelCall, recordWorkspaceModelCall,
  finishWorkspaceNode, failWorkspaceNode, recoverInterruptedWorkspaceNodes, mutateAgentWorkspace } = createAgentWorkspaceRepository();
