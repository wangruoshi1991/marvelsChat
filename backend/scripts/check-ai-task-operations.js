import { getPool, closeDatabase } from "../src/db.js";
import { loadMigrationFiles } from "../src/migration-files.js";
import { checkMigrationStatus } from "../src/migration-ledger.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A read-only operations summary. API readiness and database access alone do
// not establish that the separate worker is alive or advancing its queue.
export async function checkAITaskOperations({
  pool, migrations: migrationFiles, now = () => new Date(),
} = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5s'");
    const migrations = await checkMigrationStatus({ client, migrations: migrationFiles });
    if (!migrations.current) {
      return { ok: false, code: "DATABASE_MIGRATIONS_REQUIRED",
        appliedCount: migrations.appliedCount, expectedCount: migrations.expectedCount };
    } else {
      const { rows: [summary] } = await client.query(`SELECT
        count(*) FILTER (WHERE status = 'queued')::integer AS queued,
        count(*) FILTER (WHERE status = 'running')::integer AS running,
        count(*) FILTER (WHERE status = 'awaiting_confirmation')::integer AS awaiting_confirmation,
        count(*) FILTER (WHERE status = 'running' AND lease_until <= CURRENT_TIMESTAMP)::integer AS expired_leases,
        count(*) FILTER (WHERE status = 'awaiting_confirmation'
          AND (approval->>'expiresAt')::timestamptz <= CURRENT_TIMESTAMP)::integer AS expired_approvals,
        count(*) FILTER (WHERE status = 'failed' AND updated_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours')::integer AS failed_last_24h,
        count(*) FILTER (WHERE status = 'interrupted' AND updated_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours')::integer AS interrupted_last_24h,
        floor(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - min(created_at) FILTER (WHERE status = 'queued')))::integer AS oldest_queued_seconds
        FROM ai_tasks`);
      const { rows: [workspaces] } = await client.query(`SELECT
        count(*) FILTER (WHERE status = 'queued')::integer AS queued,
        count(*) FILTER (WHERE status = 'running')::integer AS running,
        count(*) FILTER (WHERE status = 'waiting_input')::integer AS waiting_input,
        count(*) FILTER (WHERE status = 'awaiting_confirmation')::integer AS awaiting_confirmation,
        count(*) FILTER (WHERE status = 'cancelling')::integer AS cancelling,
        count(*) FILTER (WHERE status = 'failed' AND updated_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours')::integer AS failed_last_24h,
        count(*) FILTER (WHERE status = 'interrupted' AND updated_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours')::integer AS interrupted_last_24h,
        count(*) FILTER (WHERE status IN ('queued','running','waiting_input','cancelling') AND deadline_at <= CURRENT_TIMESTAMP)::integer AS expired_deadlines,
        count(*) FILTER (WHERE status = 'awaiting_confirmation' AND (approval->>'expiresAt')::timestamptz <= CURRENT_TIMESTAMP)::integer AS expired_approvals,
        floor(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - min(created_at) FILTER (WHERE status = 'queued')))::integer AS oldest_queued_seconds
        FROM agent_workspaces`);
      const { rows: [workspaceNodes] } = await client.query(`WITH node_state AS (
        SELECT n.*, w.status IN ('queued','running') AND w.deadline_at > CURRENT_TIMESTAMP AS active_parent,
          NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(n.dependencies) d(dependency_key)
            LEFT JOIN agent_workspace_nodes dep ON dep.workspace_id = n.workspace_id AND dep.node_key = d.dependency_key
            WHERE dep.id IS NULL OR dep.status <> 'succeeded') AS dependencies_ready
        FROM agent_workspace_nodes n JOIN agent_workspaces w ON w.id = n.workspace_id
      ) SELECT
        count(*) FILTER (WHERE status = 'queued')::integer AS queued,
        count(*) FILTER (WHERE status = 'queued' AND active_parent AND dependencies_ready)::integer AS ready,
        count(*) FILTER (WHERE status = 'queued' AND active_parent AND NOT dependencies_ready)::integer AS waiting_dependencies,
        count(*) FILTER (WHERE status = 'queued' AND NOT active_parent)::integer AS inactive_parent,
        count(*) FILTER (WHERE status = 'running')::integer AS running,
        count(*) FILTER (WHERE status = 'running' AND lease_until <= CURRENT_TIMESTAMP)::integer AS expired_leases,
        count(*) FILTER (WHERE status = 'interrupted' AND updated_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours')::integer AS interrupted_last_24h,
        count(*) FILTER (WHERE status = 'failed' AND updated_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours')::integer AS failed_last_24h,
        floor(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - min(created_at) FILTER (WHERE status = 'queued')))::integer AS oldest_queued_seconds,
        floor(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - min(created_at)
          FILTER (WHERE status = 'queued' AND active_parent AND dependencies_ready)))::integer AS oldest_ready_seconds
        FROM node_state`);
      const { rows: [workspaceCalls] } = await client.query(`SELECT
        count(*) FILTER (WHERE receipt->>'status' = 'dispatched')::integer AS dispatched,
        count(*) FILTER (WHERE receipt->>'status' = 'unknown')::integer AS unknown,
        count(*) FILTER (WHERE receipt->>'status' = 'unknown'
          AND (receipt->>'finishedAt')::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '24 hours')::integer AS unknown_last_24h,
        count(*) FILTER (WHERE receipt->>'status' = 'dispatched' AND n.status <> 'running')::integer AS dispatched_without_running_node
        FROM agent_workspace_nodes n CROSS JOIN LATERAL jsonb_array_elements(n.model_receipts) receipt`);
      const { rows: [workspaceSubmissions] } = await client.query(`SELECT
        count(*) FILTER (WHERE s.outcome = 'accepted')::integer AS accepted,
        count(*) FILTER (WHERE s.outcome = 'rejected')::integer AS rejected,
        count(*) FILTER (WHERE s.outcome = 'rejected' AND s.created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours')::integer AS rejected_last_24h,
        count(*) FILTER (WHERE s.outcome = 'accepted' AND (w.id IS NULL OR w.user_id <> s.user_id
          OR w.idempotency_key <> s.idempotency_key OR w.request_hash <> s.request_hash))::integer AS mismatched_workspaces,
        (SELECT count(*)::integer FROM agent_workspaces candidate WHERE NOT EXISTS (
          SELECT 1 FROM agent_workspace_submissions receipt WHERE receipt.outcome = 'accepted'
            AND receipt.workspace_id = candidate.id AND receipt.user_id = candidate.user_id)) AS untracked_workspaces
        FROM agent_workspace_submissions s LEFT JOIN agent_workspaces w ON w.id = s.workspace_id`);
      return { ok: true, checkedAt: now().toISOString(),
        migrations: migrations.appliedCount, workerLiveness: "not_checked", queue: summary, workspaces, workspaceNodes, workspaceCalls, workspaceSubmissions };
    }
  } finally {
    try { await client.query("ROLLBACK"); }
    finally { client.release(); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const summary = await checkAITaskOperations({ pool: await getPool(), migrations: await loadMigrationFiles() });
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.ok) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ ok: false, code: "AI_TASK_OPERATIONS_CHECK_FAILED" }));
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}
