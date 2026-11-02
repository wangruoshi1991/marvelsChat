import { z } from "zod";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { createUsageEvent } from "./repositories.js";

const daysSchema = z.coerce.number().int().refine(value => [7, 30, 90].includes(value), "Window must be 7, 30 or 90 days").default(30);
const idSchema = z.string().uuid();
const taskStatusSchema = z.enum([
  "queued", "running", "waiting_input", "awaiting_confirmation", "succeeded", "failed", "interrupted", "cancelling", "cancelled",
]);
const taskFilterSchema = z.object({
  agentId: z.string().trim().min(1).max(120).optional(),
  userId: idSchema.optional(),
  status: taskStatusSchema.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();
const mutationSchema = z.object({ idempotencyKey: z.string().trim().min(8).max(160) }).strict();
const eventLimit = 200;

const number = value => value == null ? 0 : Number(value);
const nullableNumber = value => value == null ? null : Number(value);
const iso = value => value instanceof Date ? value.toISOString() : value == null ? null : new Date(value).toISOString();
const json = value => JSON.stringify(value);
const error = (status, code, message) => {
  const issue = new HttpError(status, message, { code });
  issue.code = code;
  return issue;
};

function normalizeWindow(days) {
  const parsed = daysSchema.parse(days);
  const from = new Date(Date.now() - parsed * 86400000).toISOString();
  return { days: parsed, from };
}

function mapMetricRow(row) {
  return {
    agentId: row.agent_id || null,
    runs: number(row.runs),
    succeeded: number(row.succeeded),
    failed: number(row.failed),
    tokenTotal: nullableNumber(row.token_total),
    costCents: nullableNumber(row.cost_cents),
    averageLatencyMs: row.avg_latency_ms == null ? null : Math.round(Number(row.avg_latency_ms)),
  };
}

const operationalCode = value => typeof value === "string" && /^[A-Za-z][A-Za-z0-9._-]{0,99}$/.test(value) ? value : null;

function allowedTaskOperations(type, status) {
  if (type === "ai_task") {
    if (status === "failed") return ["retry"];
    return ["queued", "awaiting_confirmation"].includes(status) ? ["cancel"] : [];
  }
  return type === "agent_workspace" && ["queued", "running", "waiting_input", "awaiting_confirmation", "cancelling"].includes(status) ? ["cancel"] : [];
}

// The admin boundary exposes operational metadata, never task input, user
// content, approval payloads, or raw provider error messages.
function mapAdminTask(row) {
  return {
    id: row.id, type: row.task_type, userId: row.user_id, kind: row.kind, agentId: row.agent_id || null,
    agentVersion: row.agent_version || null, status: row.status, phase: row.phase || null, revision: Number(row.revision || 0),
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), threadId: row.thread_id || null,
    failureCode: operationalCode(row.failure_code), allowedOperations: allowedTaskOperations(row.task_type, row.status),
  };
}

export function createAdminOperationsRepository({ runQuery = query, transaction = withTransaction } = {}) {
  const adminOverview = async ({ days = 30 } = {}) => {
    const window = normalizeWindow(days);
    const [summaryRows, dailyRows] = await Promise.all([
      runQuery(`SELECT
          (SELECT COUNT(*) FROM users) AS users_total,
          (SELECT COUNT(*) FROM users WHERE last_login_at >= ?::timestamptz) AS active_users,
          (SELECT COUNT(*) FROM chat_threads) AS threads_total,
          (SELECT COUNT(*) FROM chat_messages WHERE created_at >= ?::timestamptz) AS messages,
          (SELECT COUNT(*) FROM agent_runs WHERE created_at >= ?::timestamptz) AS runs,
          (SELECT COUNT(*) FROM ai_tasks WHERE created_at >= ?::timestamptz) AS ai_tasks,
          (SELECT COUNT(*) FROM ai_tasks WHERE status IN ('queued','running','awaiting_confirmation')) AS ai_tasks_active,
          (SELECT COUNT(*) FROM agent_workspaces WHERE created_at >= ?::timestamptz) AS workspaces,
          (SELECT COUNT(*) FROM agent_workspaces WHERE status IN ('queued','running','waiting_input','awaiting_confirmation','cancelling')) AS workspaces_active,
          (SELECT COUNT(*) FILTER (WHERE lifecycle_status = 'succeeded' OR (lifecycle_status IS NULL AND status = 'success')) FROM agent_runs WHERE created_at >= ?::timestamptz) AS succeeded,
          (SELECT COUNT(*) FILTER (WHERE lifecycle_status IN ('failed','cancelled','blocked') OR (lifecycle_status IS NULL AND status = 'error')) FROM agent_runs WHERE created_at >= ?::timestamptz) AS failed`,
        [window.from, window.from, window.from, window.from, window.from, window.from, window.from]),
      runQuery(`SELECT day, SUM(runs)::bigint AS runs, SUM(succeeded)::bigint AS succeeded,
          SUM(failed)::bigint AS failed, SUM(tasks)::bigint AS tasks
        FROM (
          SELECT created_at::date AS day, COUNT(*)::bigint AS runs,
            COUNT(*) FILTER (WHERE lifecycle_status = 'succeeded' OR (lifecycle_status IS NULL AND status = 'success'))::bigint AS succeeded,
            COUNT(*) FILTER (WHERE lifecycle_status IN ('failed','cancelled','blocked') OR (lifecycle_status IS NULL AND status = 'error'))::bigint AS failed,
            0::bigint AS tasks FROM agent_runs WHERE created_at >= ?::timestamptz GROUP BY created_at::date
          UNION ALL
          SELECT created_at::date AS day, 0::bigint, 0::bigint, 0::bigint, COUNT(*)::bigint
            FROM ai_tasks WHERE created_at >= ?::timestamptz GROUP BY created_at::date
        ) grouped GROUP BY day ORDER BY day ASC`, [window.from, window.from]),
    ]);
    const row = summaryRows[0] || {};
    const metrics = {
      usersTotal: number(row.users_total), activeUsers: number(row.active_users), threadsTotal: number(row.threads_total),
      messages: number(row.messages), agentRuns: number(row.runs), aiTasks: number(row.ai_tasks), aiTasksActive: number(row.ai_tasks_active),
      workspaces: number(row.workspaces), workspacesActive: number(row.workspaces_active), succeeded: number(row.succeeded), failed: number(row.failed),
    };
    return {
      window: { days: window.days, from: window.from, to: new Date().toISOString() }, metrics,
      daily: dailyRows.map(item => ({ day: item.day instanceof Date ? item.day.toISOString().slice(0, 10) : String(item.day), runs: number(item.runs), succeeded: number(item.succeeded), failed: number(item.failed), tasks: number(item.tasks) })),
      freshness: { generatedAt: new Date().toISOString(), source: "postgresql" },
      empty: { daily: dailyRows.length === 0, metrics: Object.values(metrics).every(value => value === 0) },
    };
  };

  const listAdminTasks = async (filters = {}) => {
    const parsed = taskFilterSchema.parse(filters);
    const predicates = [];
    const params = [];
    const add = (sql, value) => { predicates.push(sql); params.push(value); };
    if (parsed.userId) add("user_id = ?", parsed.userId);
    if (parsed.status) add("status = ?", parsed.status);
    if (parsed.from) add("created_at >= ?::timestamptz", parsed.from);
    if (parsed.to) add("created_at <= ?::timestamptz", parsed.to);
    if (parsed.agentId) add("agent_id = ?", parsed.agentId);
    const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
    const common = `SELECT id, user_id, kind, agent_id, agent_version, status, phase, revision,
      error->>'code' AS failure_code, created_at, updated_at, 'ai_task' AS task_type, thread_id FROM ai_tasks ${where}`;
    // Workspaces have no single Agent identity; expose their first persisted node as the task Agent.
    const workspacePredicates = [];
    const workspaceParams = [];
    const addWorkspace = (sql, value) => { workspacePredicates.push(sql); workspaceParams.push(value); };
    if (parsed.userId) addWorkspace("w.user_id = ?", parsed.userId);
    if (parsed.status) addWorkspace("w.status = ?", parsed.status);
    if (parsed.from) addWorkspace("w.created_at >= ?::timestamptz", parsed.from);
    if (parsed.to) addWorkspace("w.created_at <= ?::timestamptz", parsed.to);
    if (parsed.agentId) addWorkspace("first_node.agent_id = ?", parsed.agentId);
    const workspaceWhere = workspacePredicates.length ? `WHERE ${workspacePredicates.join(" AND ")}` : "";
    const workspaceSql = `SELECT w.id, w.user_id, 'agent_workspace' AS kind, first_node.agent_id, first_node.agent_version,
      w.status, NULL AS phase, w.revision, w.error->>'code' AS failure_code,
      w.created_at, w.updated_at, 'agent_workspace' AS task_type, NULL AS thread_id
      FROM agent_workspaces w LEFT JOIN LATERAL (SELECT agent_id, agent_version FROM agent_workspace_nodes n WHERE n.workspace_id = w.id ORDER BY n.created_at,n.id LIMIT 1) first_node ON TRUE ${workspaceWhere}`;
    const rows = await runQuery(`SELECT * FROM (${common} UNION ALL ${workspaceSql}) tasks ORDER BY created_at DESC, id DESC LIMIT ?`, [...params, ...workspaceParams, parsed.limit]);
    return rows.map(mapAdminTask);
  };

  const adminMonitoring = async ({ days = 30 } = {}) => {
    const window = normalizeWindow(days);
    const [agents, products, users, statuses] = await Promise.all([
      runQuery(`SELECT agent_id, COUNT(*) AS runs,
        COUNT(*) FILTER (WHERE lifecycle_status = 'succeeded' OR (lifecycle_status IS NULL AND status = 'success')) AS succeeded,
        COUNT(*) FILTER (WHERE lifecycle_status IN ('failed','cancelled','blocked') OR (lifecycle_status IS NULL AND status = 'error')) AS failed,
        SUM(token_total) AS token_total, SUM(cost_cents) AS cost_cents, AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS avg_latency_ms
        FROM agent_runs WHERE created_at >= ?::timestamptz GROUP BY agent_id ORDER BY runs DESC, agent_id ASC`, [window.from]),
      runQuery(`SELECT p.product_key, p.display_name, COUNT(e.id) AS entitlements,
          COUNT(e.id) FILTER (WHERE e.status = 'enabled') AS enabled_entitlements
        FROM products p LEFT JOIN user_entitlements e ON e.product_id = p.id
        GROUP BY p.id, p.product_key, p.display_name ORDER BY p.product_key ASC`),
      runQuery(`SELECT user_id, COUNT(*) AS runs,
        COUNT(*) FILTER (WHERE lifecycle_status = 'succeeded' OR (lifecycle_status IS NULL AND status = 'success')) AS succeeded,
        COUNT(*) FILTER (WHERE lifecycle_status IN ('failed','cancelled','blocked') OR (lifecycle_status IS NULL AND status = 'error')) AS failed,
        SUM(token_total) AS token_total, SUM(cost_cents) AS cost_cents
        FROM agent_runs WHERE created_at >= ?::timestamptz GROUP BY user_id ORDER BY runs DESC LIMIT 200`, [window.from]),
      runQuery(`SELECT status, COUNT(*) AS count FROM ai_tasks WHERE created_at >= ?::timestamptz GROUP BY status ORDER BY status`, [window.from]),
    ]);
    return {
      days: window.days, from: window.from, generatedAt: new Date().toISOString(),
      agents: agents.map(mapMetricRow),
      products: products.map(row => ({ productKey: row.product_key, displayName: row.display_name, entitlementCount: number(row.entitlements), enabledEntitlementCount: number(row.enabled_entitlements) })),
      users: users.map(row => ({ userId: row.user_id, runs: number(row.runs), succeeded: number(row.succeeded), failed: number(row.failed), tokenTotal: nullableNumber(row.token_total), costCents: nullableNumber(row.cost_cents) })),
      taskStatuses: statuses.map(row => ({ status: row.status, count: number(row.count) })),
      empty: { agents: agents.length === 0, products: products.length === 0, users: users.length === 0, taskStatuses: statuses.length === 0 },
    };
  };

  const getAdminTaskDetail = async (taskId) => {
    const id = idSchema.parse(taskId);
    const taskRows = await runQuery(`SELECT id, user_id, kind, agent_id, agent_version, status, phase, revision,
      error->>'code' AS failure_code, created_at, updated_at, 'ai_task' AS task_type, thread_id FROM ai_tasks WHERE id = ? LIMIT 1`, [id]);
    if (taskRows[0]) {
      const row = taskRows[0];
      const events = await runQuery(`SELECT sequence, payload, created_at FROM ai_task_events WHERE task_id = ? ORDER BY sequence ASC LIMIT ?`, [id, eventLimit + 1]);
      return { ...mapAdminTask(row), eventKind: "status_events", eventsTruncated: events.length > eventLimit,
        events: events.slice(0, eventLimit).map((event) => ({ sequence: Number(event.sequence), status: event.payload?.status || null,
          phase: event.payload?.phase || null, errorCode: operationalCode(event.payload?.errorCode), createdAt: iso(event.created_at) })) };
    }
    const workspaceRows = await runQuery(`SELECT id, user_id, status, revision, error->>'code' AS failure_code, created_at, updated_at,
      'agent_workspace' AS kind, 'agent_workspace' AS task_type FROM agent_workspaces WHERE id = ? LIMIT 1`, [id]);
    if (!workspaceRows[0]) throw error(404, 'ADMIN_TASK_NOT_FOUND', 'Task not found');
    const workspace = workspaceRows[0];
    const nodes = await runQuery(`SELECT id, agent_id, agent_version, status, error->>'code' AS failure_code, created_at, updated_at FROM agent_workspace_nodes WHERE workspace_id = ? ORDER BY created_at ASC, id ASC LIMIT ?`, [id, eventLimit + 1]);
    return { ...mapAdminTask(workspace), eventKind: "workspace_nodes", eventsTruncated: nodes.length > eventLimit, events: nodes.slice(0, eventLimit).map((node) => ({
        id: node.id, agentId: node.agent_id || null, agentVersion: node.agent_version || null, status: node.status, errorCode: operationalCode(node.failure_code),
        createdAt: iso(node.created_at), updatedAt: iso(node.updated_at) })) };
  };

  const mutateAdminTask = async ({ taskId, operation, idempotencyKey, actor, requestId = null, ipHash = null, userAgent = "" }) => {
    idSchema.parse(taskId); mutationSchema.parse({ idempotencyKey });
    if (!['retry', 'cancel'].includes(operation)) throw new TypeError('Unsupported admin task operation');
    return transaction(async connection => {
      const replay = await connection.query(`SELECT payload FROM usage_events WHERE event_type = ? AND target_type = 'task' AND target_id = ? AND payload->>'idempotencyKey' = ? ORDER BY created_at DESC LIMIT 1`, [`admin.task.${operation}`, taskId, idempotencyKey]);
      if (replay[0]) return replay[0].payload?.result || { id: taskId, operation, replayed: true };
      const rows = await connection.query(`SELECT * FROM ai_tasks WHERE id = ? FOR UPDATE`, [taskId]);
      if (!rows[0]) {
        const workspaces = await connection.query(`SELECT * FROM agent_workspaces WHERE id = ? FOR UPDATE`, [taskId]);
        if (!workspaces[0]) throw error(404, 'ADMIN_TASK_NOT_FOUND', 'Task not found');
        if (operation === 'retry') throw error(409, 'ADMIN_TASK_RETRY_UNAVAILABLE', 'Workspace retry requires a new user-authorized submission');
        const row = workspaces[0];
        if (!['queued', 'running', 'waiting_input', 'awaiting_confirmation', 'cancelling'].includes(row.status)) throw error(409, 'ADMIN_TASK_STATE_CHANGED', 'Task cannot be cancelled in its current state');
        const runningNodes = await connection.query("SELECT id FROM agent_workspace_nodes WHERE workspace_id = ? AND status = 'running' FOR UPDATE", [taskId]);
        await connection.query("UPDATE agent_workspace_nodes SET status = 'cancelled', claim_token = NULL, lease_until = NULL, updated_at = clock_timestamp() WHERE workspace_id = ? AND status = 'queued'", [taskId]);
        const status = runningNodes.length ? 'cancelling' : 'cancelled';
        const updated = (await connection.query(`UPDATE agent_workspaces SET status = ?, summary = ?, question = NULL, approval = NULL, revision = revision + 1, last_operation = 'cancel', last_operation_revision = revision + 1, updated_at = clock_timestamp() WHERE id = ? RETURNING id,status,revision,updated_at`, [status, status === 'cancelling' ? '后台请求停止，正在等待运行步骤结束' : '后台已取消任务', taskId]))[0];
        const result = { id: updated.id, type: 'agent_workspace', status: updated.status, revision: Number(updated.revision), operation, replayed: false };
        await createUsageEvent({ userId: actor, eventType: `admin.task.${operation}`, targetType: "task", targetId: taskId,
          payload: { idempotencyKey, requestId, result }, ipHash, userAgent }, connection.query);
        return result;
      }
      const row = rows[0];
      if (operation === 'cancel') {
        if (!['queued', 'awaiting_confirmation'].includes(row.status)) throw error(409, 'ADMIN_TASK_STATE_CHANGED', 'Task cannot be cancelled in its current state');
        const updated = (await connection.query(`UPDATE ai_tasks SET status = 'cancelled', phase = 'cancelled', approval = NULL, revision = revision + 1, last_operation = 'cancel', last_operation_revision = revision + 1, last_approval_id = NULL, updated_at = clock_timestamp() WHERE id = ? RETURNING id,status,revision,updated_at`, [taskId]))[0];
        await connection.query(`INSERT INTO ai_task_events (task_id,user_id,sequence,payload) VALUES (?,?,?,?::jsonb)`, [updated.id, row.user_id, updated.revision, json({ status: updated.status, phase: 'cancelled' })]);
        const result = { id: updated.id, type: 'ai_task', status: updated.status, revision: Number(updated.revision), operation, replayed: false };
        await createUsageEvent({ userId: actor, eventType: `admin.task.${operation}`, targetType: "task", targetId: taskId,
          payload: { idempotencyKey, requestId, result }, ipHash, userAgent }, connection.query);
        return result;
      }
      if (row.status !== 'failed') throw error(409, 'ADMIN_TASK_RETRY_UNAVAILABLE', 'Only a failed task with a known terminal result can be retried');
      const updated = (await connection.query(`UPDATE ai_tasks SET status = 'queued', phase = 'queued', error = NULL, approval = NULL, claim_token = NULL, lease_until = NULL, revision = revision + 1, last_operation = NULL, last_operation_revision = NULL, last_approval_id = NULL, updated_at = clock_timestamp() WHERE id = ? RETURNING id,status,revision,updated_at`, [taskId]))[0];
      await connection.query(`INSERT INTO ai_task_events (task_id,user_id,sequence,payload) VALUES (?,?,?,?::jsonb)`, [updated.id, row.user_id, updated.revision, json({ status: updated.status, phase: 'queued' })]);
      const result = { id: updated.id, type: 'ai_task', status: updated.status, revision: Number(updated.revision), operation, replayed: false };
      await createUsageEvent({ userId: actor, eventType: `admin.task.${operation}`, targetType: "task", targetId: taskId,
        payload: { idempotencyKey, requestId, result }, ipHash, userAgent }, connection.query);
      return result;
    });
  };
  return { adminOverview, listAdminTasks, getAdminTaskDetail, adminMonitoring, mutateAdminTask };
}

export const { adminOverview: adminOperationsOverview, listAdminTasks, getAdminTaskDetail, adminMonitoring, mutateAdminTask } = createAdminOperationsRepository();
export { daysSchema, taskFilterSchema, mutationSchema };
