import { MEDIA_RETRIEVAL_RUNTIME_LIMITS } from "./media-retrieval-constants.js";
import { mapRun, toInteger, toNonNegativeInteger } from "./media-retrieval-repository-shared.js";
import { toIso } from "./repository-mappers.js";
import { MediaRetrievalRepositoryError } from "./media-retrieval-errors.js";

const lifecycleValues = new Set([
  "draft",
  "review",
  "sandbox",
  "limited_release",
  "available",
  "suspended",
  "deprecated",
  "removed",
]);

export function createMediaRetrievalBudgetAdminRepository({
  query,
  withTransaction,
  now = () => new Date(),
  idFactory,
  getMediaRetrievalProfile,
} = {}) {
  if (typeof query !== "function" || typeof withTransaction !== "function") {
    throw new TypeError("Media retrieval budget/admin repository requires query and withTransaction functions.");
  }
  if (typeof idFactory !== "function" || typeof getMediaRetrievalProfile !== "function") {
    throw new TypeError("Media retrieval budget/admin repository requires profile and ID dependencies.");
  }

  const getMediaRetrievalStatusForUser = async ({ userId }) => {
    const [profile, runRows, jobRows, dailyQuotaRows, monthlyQuotaRows, controlRows] = await Promise.all([
      getMediaRetrievalProfile({ userId }),
      query(
        `SELECT *
        FROM agent_runs
        WHERE user_id = ? AND agent_id = 'media-retrieval'
        ORDER BY created_at DESC
        LIMIT 12`,
        [userId],
      ),
      query(
        `SELECT status, COUNT(*) AS total
        FROM media_retrieval_jobs
        WHERE user_id = ?
        GROUP BY status`,
        [userId],
      ),
      query(
        `SELECT action_count, reserved_fen, estimated_fen, unknown_fen
        FROM media_retrieval_cost_daily_rollups
        WHERE utc_day = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
          AND scope = 'user'
          AND user_id = ?
        LIMIT 1`,
        [userId],
      ),
      query(
        `SELECT COALESCE(SUM(amount_fen), 0) AS committed_fen
        FROM media_retrieval_cost_ledger
        WHERE user_id = ?
          AND disposition IN ('reserved', 'estimated', 'unknown')
          AND created_at >= (
            date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
          )`,
        [userId],
      ),
      query(
        `SELECT user_daily_request_limit, user_monthly_budget_fen
        FROM media_retrieval_operator_controls
        WHERE id = TRUE
        LIMIT 1`,
      ),
    ]);
    return {
      profile,
      recentRuns: runRows.map(mapRun),
      jobs: jobRows.reduce((result, row) => ({ ...result, [row.status]: toNonNegativeInteger(row.total) }), {}),
      quota: {
        ...(dailyQuotaRows[0] || { action_count: 0, reserved_fen: 0, estimated_fen: 0, unknown_fen: 0 }),
        monthly_committed_fen: toNonNegativeInteger(monthlyQuotaRows[0]?.committed_fen),
      },
      limits: {
        userDailyRequestLimit: toNonNegativeInteger(controlRows[0]?.user_daily_request_limit),
        userMonthlyBudgetFen: toNonNegativeInteger(controlRows[0]?.user_monthly_budget_fen),
      },
    };
  };

  const reserveProviderBudget = async ({ userId, agentRunId, jobId = null, operation, reserveFen, countUserAction = false }) =>
    withTransaction(async (connection) => {
      const controlsRows = await connection.query(
        `SELECT *
        FROM media_retrieval_operator_controls
        WHERE id = TRUE
        FOR UPDATE`,
      );
      const controls = controlsRows[0];
      if (!controls?.agent_enabled || !controls?.provider_calls_enabled || !controls?.index_requests_enabled) {
        return { reserved: false, reasonCode: "retrieval_not_enabled" };
      }
      const defaultReserveFen = String(operation || "").includes("embedding")
        ? toNonNegativeInteger(controls.embedding_reserve_fen)
        : toNonNegativeInteger(controls.caption_reserve_fen);
      const requestedFen = reserveFen === undefined
        ? defaultReserveFen
        : toNonNegativeInteger(reserveFen);
      if (!requestedFen || !toNonNegativeInteger(controls.global_daily_budget_fen)) {
        return { reserved: false, reasonCode: "retrieval_budget_exhausted" };
      }
      const runRows = countUserAction && agentRunId
        ? await connection.query(
          `SELECT provider_action_counted
          FROM agent_runs
          WHERE id = ? AND user_id = ? AND agent_id = 'media-retrieval'
          LIMIT 1
          FOR UPDATE`,
          [agentRunId, userId],
        )
        : [];
      const shouldCountAction = Boolean(countUserAction && agentRunId && !runRows[0]?.provider_action_counted);
      const userRollupRows = await connection.query(
        `SELECT action_count, reserved_fen, estimated_fen, unknown_fen
        FROM media_retrieval_cost_daily_rollups
        WHERE utc_day = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
          AND scope = 'user'
          AND user_id = ?
        FOR UPDATE`,
        [userId],
      );
      const globalRollupRows = await connection.query(
        `SELECT action_count, reserved_fen, estimated_fen, unknown_fen
        FROM media_retrieval_cost_daily_rollups
        WHERE utc_day = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
          AND scope = 'global'
        FOR UPDATE`,
      );
      await connection.query(
        `SELECT user_id
        FROM media_retrieval_profiles
        WHERE user_id = ?
        FOR UPDATE`,
        [userId],
      );
      const monthlyRows = await connection.query(
        `SELECT COALESCE(SUM(amount_fen), 0) AS committed_fen
        FROM media_retrieval_cost_ledger
        WHERE user_id = ?
          AND disposition IN ('reserved', 'estimated', 'unknown')
          AND created_at >= (
            date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
          )`,
        [userId],
      );
      const userRollup = userRollupRows[0] || {};
      const globalRollup = globalRollupRows[0] || {};
      const userActionCount = toNonNegativeInteger(userRollup.action_count);
      const globalCommitted =
        toNonNegativeInteger(globalRollup.reserved_fen) +
        toNonNegativeInteger(globalRollup.estimated_fen) +
        toNonNegativeInteger(globalRollup.unknown_fen);
      const userCommitted = toNonNegativeInteger(monthlyRows[0]?.committed_fen);
      if (
        (shouldCountAction && userActionCount >= toNonNegativeInteger(controls.user_daily_request_limit)) ||
        globalCommitted + requestedFen > toNonNegativeInteger(controls.global_daily_budget_fen) ||
        userCommitted + requestedFen > toNonNegativeInteger(controls.user_monthly_budget_fen)
      ) {
        return { reserved: false, reasonCode: "retrieval_budget_exhausted" };
      }
      await connection.query(
        `INSERT INTO media_retrieval_cost_daily_rollups
          (utc_day, scope, user_id, action_count, reserved_fen)
        VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 'user', ?, ?, ?)
        ON CONFLICT (utc_day, user_id) WHERE scope = 'user'
        DO UPDATE SET
          action_count = media_retrieval_cost_daily_rollups.action_count + EXCLUDED.action_count,
          reserved_fen = media_retrieval_cost_daily_rollups.reserved_fen + EXCLUDED.reserved_fen`,
        [userId, shouldCountAction ? 1 : 0, requestedFen],
      );
      await connection.query(
        `INSERT INTO media_retrieval_cost_daily_rollups
          (utc_day, scope, user_id, action_count, reserved_fen)
        VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 'global', NULL, 0, ?)
        ON CONFLICT (utc_day) WHERE scope = 'global'
        DO UPDATE SET reserved_fen = media_retrieval_cost_daily_rollups.reserved_fen + EXCLUDED.reserved_fen`,
        [requestedFen],
      );
      const reservationId = idFactory();
      await connection.query(
        `INSERT INTO media_retrieval_cost_ledger
          (id, user_id, agent_run_id, job_id, operation, disposition, amount_fen)
        VALUES (?, ?, ?, ?, ?, 'reserved', ?)`,
        [reservationId, userId, agentRunId, jobId, operation, requestedFen],
      );
      if (shouldCountAction) {
        await connection.query(
          `UPDATE agent_runs
          SET provider_action_counted = TRUE
          WHERE id = ? AND user_id = ? AND agent_id = 'media-retrieval'`,
          [agentRunId, userId],
        );
      }
      return { reserved: true, reservationId, amountFen: requestedFen };
    });

  const settleProviderBudget = async ({ reservationId, disposition, amountFen }) =>
    withTransaction(async (connection) => {
      const rows = await connection.query(
        `SELECT *
        FROM media_retrieval_cost_ledger
        WHERE id = ? AND disposition = 'reserved'
        LIMIT 1
        FOR UPDATE`,
        [reservationId],
      );
      const reservation = rows[0];
      if (!reservation) return null;
      const finalDisposition = ["estimated", "unknown", "released"].includes(disposition)
        ? disposition
        : "unknown";
      const reservedFen = toNonNegativeInteger(reservation.amount_fen);
      const settledFen = finalDisposition === "released" ? 0 : toNonNegativeInteger(amountFen, reservedFen);
      await connection.query(
        `UPDATE media_retrieval_cost_ledger
        SET disposition = ?, amount_fen = ?, settled_at = CURRENT_TIMESTAMP
        WHERE id = ? AND disposition = 'reserved'`,
        [finalDisposition, settledFen, reservationId],
      );
      const settlementColumn = finalDisposition === "estimated" ? "estimated_fen" : finalDisposition === "unknown" ? "unknown_fen" : null;
      for (const scope of ["user", "global"]) {
        const scopeParams = scope === "user" ? [reservation.user_id] : [];
        const scopeWhere = scope === "user" ? "scope = 'user' AND user_id = ?" : "scope = 'global' AND user_id IS NULL";
        const update = settlementColumn
          ? `reserved_fen = GREATEST(0, reserved_fen - ?), ${settlementColumn} = ${settlementColumn} + ?`
          : "reserved_fen = GREATEST(0, reserved_fen - ?)";
        await connection.query(
          `UPDATE media_retrieval_cost_daily_rollups
          SET ${update}
          WHERE utc_day = (?::timestamptz AT TIME ZONE 'UTC')::date
            AND ${scopeWhere}`,
          settlementColumn
            ? [reservedFen, settledFen, reservation.created_at, ...scopeParams]
            : [reservedFen, reservation.created_at, ...scopeParams],
        );
      }
      return { reservationId, disposition: finalDisposition, amountFen: settledFen };
    });

  const runMediaRetrievalRetentionSweep = async ({ now: retentionNow = now() } = {}) =>
    withTransaction(async (connection) => {
      const cutoffRuns = new Date(retentionNow.getTime() - 180 * 24 * 60 * 60 * 1000);
      const cutoffRollups = new Date(retentionNow.getTime() - 730 * 24 * 60 * 60 * 1000);
      await connection.query(
        `INSERT INTO media_retrieval_cost_daily_rollups
          (utc_day, scope, user_id, action_count, reserved_fen, estimated_fen, unknown_fen)
        SELECT
          (created_at AT TIME ZONE 'UTC')::date,
          'user',
          user_id,
          0,
          SUM(CASE WHEN disposition = 'reserved' THEN amount_fen ELSE 0 END),
          SUM(CASE WHEN disposition = 'estimated' THEN amount_fen ELSE 0 END),
          SUM(CASE WHEN disposition = 'unknown' THEN amount_fen ELSE 0 END)
        FROM media_retrieval_cost_ledger
        WHERE created_at < ?
        GROUP BY (created_at AT TIME ZONE 'UTC')::date, user_id
        ON CONFLICT (utc_day, user_id) WHERE scope = 'user' DO NOTHING`,
        [cutoffRuns],
      );
      await connection.query(
        `INSERT INTO media_retrieval_cost_daily_rollups
          (utc_day, scope, user_id, action_count, reserved_fen, estimated_fen, unknown_fen)
        SELECT
          (created_at AT TIME ZONE 'UTC')::date,
          'global',
          NULL,
          0,
          SUM(CASE WHEN disposition = 'reserved' THEN amount_fen ELSE 0 END),
          SUM(CASE WHEN disposition = 'estimated' THEN amount_fen ELSE 0 END),
          SUM(CASE WHEN disposition = 'unknown' THEN amount_fen ELSE 0 END)
        FROM media_retrieval_cost_ledger
        WHERE created_at < ?
        GROUP BY (created_at AT TIME ZONE 'UTC')::date
        ON CONFLICT (utc_day) WHERE scope = 'global' DO NOTHING`,
        [cutoffRuns],
      );
      await connection.query(
        `DELETE FROM agent_run_events AS event
        USING agent_runs AS run
        WHERE event.agent_run_id = run.id
          AND run.agent_id = 'media-retrieval'
          AND event.created_at < ?`,
        [cutoffRuns],
      );
      await connection.query(
        `DELETE FROM agent_runs
        WHERE agent_id = 'media-retrieval'
          AND lifecycle_status IN ('succeeded', 'failed', 'cancelled', 'blocked')
          AND finished_at < ?`,
        [cutoffRuns],
      );
      await connection.query(
        `DELETE FROM media_retrieval_cost_ledger
        WHERE created_at < ?`,
        [cutoffRuns],
      );
      await connection.query(
        `DELETE FROM media_retrieval_cost_daily_rollups
        WHERE utc_day < ?::date`,
        [cutoffRollups.toISOString().slice(0, 10)],
      );
      return { sweptAt: retentionNow.toISOString() };
    });

  const getMediaRetrievalAdminOverview = async () => {
    const [controlsRows, healthRows, queueRows, segmentRows, costRows, runRows] = await Promise.all([
      query("SELECT * FROM media_retrieval_operator_controls WHERE id = TRUE LIMIT 1"),
      query("SELECT MAX(last_seen_at) AS last_seen_at FROM media_retrieval_worker_heartbeats"),
      query(`SELECT status, COUNT(*) AS total FROM media_retrieval_jobs GROUP BY status`),
      query(`SELECT COUNT(*) AS total FROM media_retrieval_segments WHERE state = 'ready'`),
      query(`SELECT reserved_fen, estimated_fen, unknown_fen
        FROM media_retrieval_cost_daily_rollups
        WHERE utc_day = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
          AND scope = 'global'
        LIMIT 1`),
      query(
        `SELECT id, user_id, run_type, lifecycle_status, failure_code, created_at, finished_at
        FROM agent_runs
        WHERE agent_id = 'media-retrieval'
        ORDER BY created_at DESC
        LIMIT 20`,
      ),
    ]);
    return {
      controls: controlsRows[0] || null,
      workerLastSeenAt: toIso(healthRows[0]?.last_seen_at),
      queue: queueRows.reduce((result, row) => ({ ...result, [row.status]: toNonNegativeInteger(row.total) }), {}),
      readySegments: toNonNegativeInteger(segmentRows[0]?.total),
      globalCost: costRows[0] || { reserved_fen: 0, estimated_fen: 0, unknown_fen: 0 },
      recentRuns: runRows.map(mapRun),
    };
  };

  const listMediaRetrievalAdminRuns = async ({ limit = 80 } = {}) => {
    const rows = await query(
      `SELECT id, run_type, lifecycle_status, failure_code, created_at, finished_at
      FROM agent_runs
      WHERE agent_id = 'media-retrieval'
      ORDER BY created_at DESC
      LIMIT ?`,
      [Math.min(200, Math.max(1, toInteger(limit, 80)))],
    );
    return rows.map(mapRun);
  };

  const updateMediaRetrievalOperatorControls = async (input) => {
    const currentRows = await query(
      "SELECT * FROM media_retrieval_operator_controls WHERE id = TRUE LIMIT 1",
    );
    const current = currentRows[0] || {};
    const requested = (key, fallback) =>
      Object.hasOwn(input, key) && input[key] !== undefined ? input[key] : fallback;
    const allowed = {
      agentEnabled: Boolean(requested("agentEnabled", current.agent_enabled)),
      providerCallsEnabled: Boolean(requested("providerCallsEnabled", current.provider_calls_enabled)),
      indexRequestsEnabled: Boolean(requested("indexRequestsEnabled", current.index_requests_enabled)),
      userDailyRequestLimit: Math.min(MEDIA_RETRIEVAL_RUNTIME_LIMITS.maxUserDailyRequestLimit, toNonNegativeInteger(requested("userDailyRequestLimit", current.user_daily_request_limit))),
      userMonthlyBudgetFen: Math.min(MEDIA_RETRIEVAL_RUNTIME_LIMITS.maxUserMonthlyBudgetFen, toNonNegativeInteger(requested("userMonthlyBudgetFen", current.user_monthly_budget_fen))),
      globalDailyBudgetFen: Math.min(MEDIA_RETRIEVAL_RUNTIME_LIMITS.maxGlobalDailyBudgetFen, toNonNegativeInteger(requested("globalDailyBudgetFen", current.global_daily_budget_fen))),
      captionReserveFen: Math.min(MEDIA_RETRIEVAL_RUNTIME_LIMITS.maxProviderCallReservationFen, toNonNegativeInteger(requested("captionReserveFen", current.caption_reserve_fen))),
      embeddingReserveFen: Math.min(MEDIA_RETRIEVAL_RUNTIME_LIMITS.maxProviderCallReservationFen, toNonNegativeInteger(requested("embeddingReserveFen", current.embedding_reserve_fen))),
      lifecycle: lifecycleValues.has(requested("lifecycle", current.lifecycle))
        ? requested("lifecycle", current.lifecycle)
        : "draft",
    };
    const rows = await query(
      `UPDATE media_retrieval_operator_controls
      SET agent_enabled = ?,
          provider_calls_enabled = ?,
          index_requests_enabled = ?,
          user_daily_request_limit = ?,
          user_monthly_budget_fen = ?,
          global_daily_budget_fen = ?,
          caption_reserve_fen = ?,
          embedding_reserve_fen = ?,
          lifecycle = ?
      WHERE id = TRUE
      RETURNING *`,
      [
        allowed.agentEnabled,
        allowed.providerCallsEnabled,
        allowed.indexRequestsEnabled,
        allowed.userDailyRequestLimit,
        allowed.userMonthlyBudgetFen,
        allowed.globalDailyBudgetFen,
        allowed.captionReserveFen,
        allowed.embeddingReserveFen,
        allowed.lifecycle,
      ],
    );
    if (!rows[0]) throw new MediaRetrievalRepositoryError("retrieval_repository_write_failed");
    return rows[0];
  };

  return {
    getMediaRetrievalStatusForUser,
    reserveProviderBudget,
    settleProviderBudget,
    runMediaRetrievalRetentionSweep,
    getMediaRetrievalAdminOverview,
    listMediaRetrievalAdminRuns,
    updateMediaRetrievalOperatorControls,
  };
}
