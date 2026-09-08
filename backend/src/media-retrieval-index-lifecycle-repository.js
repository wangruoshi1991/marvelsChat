import { MEDIA_RETRIEVAL_CONSENT_VERSION } from "./media-retrieval-constants.js";
import {
  fingerprintAsset,
  mapJob,
  mapProfile,
  toNonNegativeInteger,
  vectorLiteral,
} from "./media-retrieval-repository-shared.js";
import { toIso } from "./repository-mappers.js";
import { MediaRetrievalRepositoryError } from "./media-retrieval-errors.js";
import { assertIndexingProvenance } from "./media-retrieval-provenance.js";

const requireReturnedRow = (rows, operation) => {
  if (!rows?.[0]) {
    const error = new MediaRetrievalRepositoryError("retrieval_repository_write_failed");
    error.operation = operation;
    throw error;
  }
  return rows[0];
};

export function createMediaRetrievalIndexLifecycleRepository({
  query,
  withTransaction,
  idFactory,
  appendAgentRunEvent,
  appendEventWithConnection,
  insertMediaRetrievalRun,
  updateRunLifecycle,
} = {}) {
  if (typeof query !== "function" || typeof withTransaction !== "function") {
    throw new TypeError("Media retrieval index/lifecycle repository requires query and withTransaction functions.");
  }
  if (
    typeof idFactory !== "function" ||
    typeof appendAgentRunEvent !== "function" ||
    typeof appendEventWithConnection !== "function" ||
    typeof insertMediaRetrievalRun !== "function" ||
    typeof updateRunLifecycle !== "function"
  ) {
    throw new TypeError("Media retrieval index/lifecycle repository requires run/event dependencies.");
  }

  const getMediaRetrievalProfile = async ({ userId }) => {
    const rows = await query(
      `SELECT *
      FROM media_retrieval_profiles
      WHERE user_id = ?
      LIMIT 1`,
      [userId],
    );
    return rows[0] ? mapProfile(rows[0]) : null;
  };

  const enableMediaRetrievalProfile = async ({ userId, consentVersion, agentRunId }) => {
    const rows = await query(
      `INSERT INTO media_retrieval_profiles
        (user_id, consent_version, consent_granted_at, index_state, disabled_at, purge_requested_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, 'enabled', NULL, NULL)
      ON CONFLICT (user_id) DO UPDATE
      SET consent_version = EXCLUDED.consent_version,
          consent_granted_at = EXCLUDED.consent_granted_at,
          index_state = 'enabled',
          index_epoch = media_retrieval_profiles.index_epoch + 1,
          disabled_at = NULL,
          purge_requested_at = NULL
      RETURNING *`,
      [userId, consentVersion || MEDIA_RETRIEVAL_CONSENT_VERSION],
    );
    const profile = requireReturnedRow(rows, "enable-media-retrieval-profile");
    if (agentRunId) {
      await appendAgentRunEvent({
        userId,
        agentRunId,
        lifecycleStatus: "queued",
        eventType: "profile-enabled",
        deliveryKey: `profile-enabled:${agentRunId}`,
      });
    }
    return mapProfile(profile);
  };

  const findIndexableAsset = async (connection, { userId, mediaAssetId }) => {
    const rows = await connection.query(
      `SELECT id, user_id, storage_key, byte_size, updated_at, metadata
      FROM station_media_assets
      WHERE id = ?
        AND user_id = ?
        AND status = 'uploaded'
        AND deleted_at IS NULL
      LIMIT 1`,
      [mediaAssetId, userId],
    );
    return rows[0] || null;
  };

  const enqueueAssetIndexJob = async ({ userId, mediaAssetId, source = "user", agentRunId = null, processingVersion = "v1" }) =>
    withTransaction(async (connection) => {
      const profileRows = await connection.query(
        `SELECT index_state, consent_version, index_epoch
        FROM media_retrieval_profiles
        WHERE user_id = ?
        LIMIT 1
        FOR UPDATE`,
        [userId],
      );
      const profile = profileRows[0];
      if (
        !profile ||
        profile.index_state !== "enabled" ||
        profile.consent_version !== MEDIA_RETRIEVAL_CONSENT_VERSION
      ) {
        return null;
      }
      const asset = await findIndexableAsset(connection, { userId, mediaAssetId });
      if (!asset) return null;
      const contentFingerprint = fingerprintAsset(asset);
      const activeRows = await connection.query(
        `SELECT *
        FROM media_retrieval_jobs
        WHERE user_id = ?
          AND media_asset_id = ?
          AND content_fingerprint = ?
          AND processing_version = ?
          AND job_type = 'index'
          AND status IN ('queued', 'running')
        LIMIT 1`,
        [userId, mediaAssetId, contentFingerprint, processingVersion],
      );
      if (activeRows[0]) return { job: mapJob(activeRows[0]), reused: true };
      const id = idFactory();
      const rows = await connection.query(
        `INSERT INTO media_retrieval_jobs
          (id, user_id, agent_run_id, media_asset_id, job_type, status, source, content_fingerprint, processing_version, profile_epoch)
        VALUES (?, ?, ?, ?, 'index', 'queued', ?, ?, ?, ?)
        RETURNING *`,
        [id, userId, agentRunId, mediaAssetId, source, contentFingerprint, processingVersion, toNonNegativeInteger(profile.index_epoch, 1)],
      );
      return { job: mapJob(requireReturnedRow(rows, "enqueue-index-job")), reused: false };
    });

  const getIndexableMediaAsset = async ({ userId, mediaAssetId }) => {
    const rows = await query(
      `SELECT id, user_id, kind, storage_key, mime_type, byte_size, width, height, status, deleted_at, updated_at
      FROM station_media_assets
      WHERE id = ?
        AND user_id = ?
        AND status = 'uploaded'
        AND deleted_at IS NULL
      LIMIT 1`,
      [mediaAssetId, userId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      kind: row.kind,
      storageKey: row.storage_key,
      mimeType: row.mime_type,
      byteSize: toNonNegativeInteger(row.byte_size),
      width: toNonNegativeInteger(row.width),
      height: toNonNegativeInteger(row.height),
      status: row.status,
      deletedAt: toIso(row.deleted_at),
      updatedAt: toIso(row.updated_at),
    };
  };

  const transitionMediaRetrievalRun = async ({ userId, agentRunId, lifecycleStatus, failureCode = null, eventType = lifecycleStatus }) =>
    withTransaction(async (connection) => {
      const run = await updateRunLifecycle(connection, {
        agentRunId,
        lifecycleStatus,
        failureCode,
      });
      if (!run) return null;
      await appendEventWithConnection(connection, {
        userId,
        agentRunId,
        lifecycleStatus,
        eventType,
        deliveryKey: `${eventType}:${agentRunId}:${lifecycleStatus}`,
        payload: failureCode ? { reasonCode: failureCode } : {},
      });
      return run;
    });

  const getMediaRetrievalDispatchState = async ({ userId }) => {
    const rows = await query(
      `SELECT
        p.index_state,
        p.consent_version,
        c.agent_enabled,
        c.provider_calls_enabled,
        c.index_requests_enabled,
        c.user_daily_request_limit,
        c.user_monthly_budget_fen,
        c.global_daily_budget_fen
      FROM media_retrieval_profiles p
      CROSS JOIN media_retrieval_operator_controls c
      WHERE p.user_id = ? AND c.id = TRUE
      LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    if (!row || row.index_state !== "enabled" || row.consent_version !== MEDIA_RETRIEVAL_CONSENT_VERSION) {
      return { canDispatch: false, reasonCode: "retrieval_not_enabled" };
    }
    if (!row.agent_enabled || !row.provider_calls_enabled || !row.index_requests_enabled) {
      return { canDispatch: false, reasonCode: "retrieval_not_enabled" };
    }
    if (
      !toNonNegativeInteger(row.user_daily_request_limit) ||
      !toNonNegativeInteger(row.user_monthly_budget_fen) ||
      !toNonNegativeInteger(row.global_daily_budget_fen)
    ) {
      return { canDispatch: false, reasonCode: "retrieval_budget_exhausted" };
    }
    return { canDispatch: true, reasonCode: null };
  };

  const canEnqueueMediaRetrievalForUser = async ({ userId }) =>
    (await getMediaRetrievalDispatchState({ userId })).canDispatch;

  const enqueueBackfillJobs = async ({ userId, agentRunId }) => {
    const assets = await query(
      `SELECT id
      FROM station_media_assets
      WHERE user_id = ?
        AND status = 'uploaded'
        AND deleted_at IS NULL
      ORDER BY created_at ASC`,
      [userId],
    );
    let enqueued = 0;
    let reused = 0;
    for (const asset of assets) {
      const result = await enqueueAssetIndexJob({
        userId,
        mediaAssetId: asset.id,
        source: "backfill",
        agentRunId,
      });
      if (result?.reused) reused += 1;
      if (result && !result.reused) enqueued += 1;
    }
    return { totalAssets: assets.length, enqueued, reused };
  };

  const enqueueReindexJobs = async ({ userId, agentRunId, scope = "all", mediaAssetIds = [] }) => {
    const ids = Array.from(new Set(mediaAssetIds || [])).slice(0, 100);
    const assets = ids.length
      ? await query(
        `SELECT id
        FROM station_media_assets
        WHERE user_id = ?
          AND status = 'uploaded'
          AND deleted_at IS NULL
          AND id = ANY(?::text[])
        ORDER BY created_at ASC`,
        [userId, ids],
      )
      : await query(
        `SELECT a.id
        FROM station_media_assets a
        WHERE a.user_id = ?
          AND a.status = 'uploaded'
          AND a.deleted_at IS NULL
          AND (
            ? = 'all'
            OR NOT EXISTS (
              SELECT 1
              FROM media_retrieval_segments s
              WHERE s.user_id = a.user_id
                AND s.media_asset_id = a.id
                AND s.state = 'ready'
            )
          )
        ORDER BY a.created_at ASC`,
        [userId, scope],
      );
    const outcomes = await Promise.all(
      assets.map((asset) =>
        enqueueAssetIndexJob({
          userId,
          mediaAssetId: asset.id,
          source: "reindex",
          agentRunId,
        }),
      ),
    );
    return {
      totalAssets: assets.length,
      enqueued: outcomes.filter((outcome) => outcome && !outcome.reused).length,
      reused: outcomes.filter((outcome) => outcome?.reused).length,
    };
  };

  const beginIndexPurge = async ({ userId, agentRunId }) =>
    withTransaction(async (connection) => {
      await connection.query(
        `UPDATE media_retrieval_profiles
        SET index_state = 'purging',
            index_epoch = index_epoch + 1,
            disabled_at = CURRENT_TIMESTAMP,
            purge_requested_at = CURRENT_TIMESTAMP
        WHERE user_id = ?`,
        [userId],
      );
      await connection.query(
        `UPDATE media_retrieval_jobs
        SET status = 'cancelled',
            failure_code = 'retrieval_purge_requested',
            finished_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND job_type = 'index'
          AND status = 'queued'`,
        [userId],
      );
      const jobId = idFactory();
      const rows = await connection.query(
        `INSERT INTO media_retrieval_jobs
          (id, user_id, agent_run_id, job_type, status, source)
        VALUES (?, ?, ?, 'purge-user', 'queued', 'user')
        RETURNING *`,
        [jobId, userId, agentRunId],
      );
      return mapJob(requireReturnedRow(rows, "enqueue-user-purge-job"));
    });

  const claimMediaRetrievalLifecycleOutbox = async ({ workerId }) =>
    withTransaction(async (connection) => {
      const candidates = await connection.query(
        `SELECT *
        FROM media_retrieval_lifecycle_outbox
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
      );
      const outbox = candidates[0];
      if (!outbox) return null;
      const rows = await connection.query(
        `UPDATE media_retrieval_lifecycle_outbox
        SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP, claimed_by = ?
        WHERE id = ? AND status = 'queued'
        RETURNING *`,
        [workerId, outbox.id],
      );
      return rows[0] || null;
    });

  const createAssetPurgeRunAndJob = async ({ outboxId, workerId }) =>
    withTransaction(async (connection) => {
      const rows = await connection.query(
        `SELECT *
        FROM media_retrieval_lifecycle_outbox
        WHERE id = ? AND status = 'claimed' AND claimed_by = ?
        LIMIT 1
        FOR UPDATE`,
        [outboxId, workerId],
      );
      const outbox = rows[0];
      if (!outbox || outbox.event_type !== "asset-purge") return null;
      const run = await insertMediaRetrievalRun(connection, {
        userId: outbox.user_id,
        runType: "media-purge",
        inputSummary: { operation: "asset-purge" },
      });
      const jobId = idFactory();
      const jobRows = await connection.query(
        `INSERT INTO media_retrieval_jobs
          (id, user_id, agent_run_id, media_asset_id, job_type, status, source)
        VALUES (?, ?, ?, ?, 'purge-asset', 'queued', 'lifecycle-outbox')
        RETURNING *`,
        [jobId, outbox.user_id, run.id, outbox.media_asset_id],
      );
      await connection.query(
        `UPDATE media_retrieval_lifecycle_outbox
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'claimed' AND claimed_by = ?`,
        [outboxId, workerId],
      );
      return { run, job: mapJob(requireReturnedRow(jobRows, "enqueue-asset-purge-job")) };
    });

  const enqueueMediaRetrievalTemporaryCleanup = async ({ userId, jobId, objectKey }) => {
    if (!userId || !jobId || !String(objectKey || "").startsWith(`users/${userId}/media-retrieval-tmp/`)) {
      return { queued: false, cleanupTaskId: null };
    }
    const rows = await query(
      `INSERT INTO media_retrieval_temporary_cleanup_tasks
        (id, user_id, job_id, object_key, status, attempts, next_attempt_at)
      VALUES (?, ?, ?, ?, 'queued', 0, CURRENT_TIMESTAMP)
      ON CONFLICT (object_key) DO UPDATE
      SET status = CASE
            WHEN media_retrieval_temporary_cleanup_tasks.status = 'completed' THEN 'completed'
            ELSE 'queued'
          END,
          next_attempt_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      RETURNING id, status`,
      [idFactory(), userId, jobId, objectKey],
    );
    const task = requireReturnedRow(rows, "enqueue-temporary-cleanup-task");
    return { queued: task.status === "queued", cleanupTaskId: task.id };
  };

  const claimMediaRetrievalTemporaryCleanup = async ({ workerId }) =>
    withTransaction(async (connection) => {
      const candidates = await connection.query(
        `SELECT *
        FROM media_retrieval_temporary_cleanup_tasks
        WHERE status = 'queued'
          AND next_attempt_at <= CURRENT_TIMESTAMP
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
      );
      const task = candidates[0];
      if (!task) return null;
      const rows = await connection.query(
        `UPDATE media_retrieval_temporary_cleanup_tasks
        SET status = 'claimed',
            claimed_by = ?,
            claimed_at = CURRENT_TIMESTAMP,
            attempts = attempts + 1
        WHERE id = ? AND status = 'queued'
        RETURNING *`,
        [workerId, task.id],
      );
      return rows[0] || null;
    });

  const completeMediaRetrievalTemporaryCleanup = async ({ cleanupTaskId, workerId }) => {
    const rows = await query(
      `UPDATE media_retrieval_temporary_cleanup_tasks
      SET status = 'completed',
          completed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'claimed' AND claimed_by = ?
      RETURNING id`,
      [cleanupTaskId, workerId],
    );
    return Boolean(rows[0]);
  };

  const retryMediaRetrievalTemporaryCleanup = async ({ cleanupTaskId, workerId }) => {
    const rows = await query(
      `UPDATE media_retrieval_temporary_cleanup_tasks
      SET status = 'queued',
          claimed_by = NULL,
          claimed_at = NULL,
          next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '1 minute'
      WHERE id = ? AND status = 'claimed' AND claimed_by = ?
      RETURNING id`,
      [cleanupTaskId, workerId],
    );
    return Boolean(rows[0]);
  };

  const claimNextMediaRetrievalJob = async ({ workerId }) =>
    withTransaction(async (connection) => {
      const candidates = await connection.query(
        `SELECT *
        FROM media_retrieval_jobs
        WHERE status = 'queued' AND available_at <= CURRENT_TIMESTAMP
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
      );
      const job = candidates[0];
      if (!job) return null;
      const rows = await connection.query(
        `UPDATE media_retrieval_jobs
        SET status = 'running',
            claimed_at = CURRENT_TIMESTAMP,
            claimed_by = ?,
            heartbeat_at = CURRENT_TIMESTAMP,
            lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
        WHERE id = ? AND status = 'queued'
        RETURNING *`,
        [workerId, job.id],
      );
      return rows[0] ? mapJob(rows[0]) : null;
    });

  const aggregateTerminalAgentRun = async (connection, { agentRunId, userId }) => {
    if (!agentRunId) return null;
    const statusRows = await connection.query(
      `SELECT status, COUNT(*) AS total
      FROM media_retrieval_jobs
      WHERE agent_run_id = ? AND user_id = ?
      GROUP BY status`,
      [agentRunId, userId],
    );
    const counts = Object.fromEntries(statusRows.map((row) => [row.status, toNonNegativeInteger(row.total)]));
    if ((counts.queued || 0) + (counts.running || 0) > 0) return null;
    const totalJobs = Object.values(counts).reduce((total, value) => total + value, 0);
    if (!totalJobs) return null;
    const costRows = await connection.query(
      `SELECT
        COALESCE(SUM(CASE WHEN disposition = 'estimated' THEN amount_fen ELSE 0 END), 0) AS estimated_fen,
        COALESCE(SUM(CASE WHEN disposition = 'unknown' THEN amount_fen ELSE 0 END), 0) AS unknown_fen
      FROM media_retrieval_cost_ledger
      WHERE agent_run_id = ? AND user_id = ?`,
      [agentRunId, userId],
    );
    const lifecycleStatus = counts.failed
      ? "failed"
      : counts.blocked
        ? "blocked"
        : counts.cancelled
          ? "cancelled"
          : "succeeded";
    const failureCode = lifecycleStatus === "failed"
      ? "retrieval_child_jobs_failed"
      : lifecycleStatus === "blocked"
        ? "retrieval_child_jobs_blocked"
        : lifecycleStatus === "cancelled"
          ? "retrieval_child_jobs_cancelled"
          : null;
    const run = await updateRunLifecycle(connection, { agentRunId, lifecycleStatus, failureCode });
    if (!run) return null;
    const payload = {
      succeededCount: counts.succeeded || 0,
      failedCount: counts.failed || 0,
      blockedCount: counts.blocked || 0,
      cancelledCount: counts.cancelled || 0,
      totalJobs,
      estimatedFen: toNonNegativeInteger(costRows[0]?.estimated_fen),
      unknownFen: toNonNegativeInteger(costRows[0]?.unknown_fen),
    };
    await appendEventWithConnection(connection, {
      userId,
      agentRunId,
      lifecycleStatus,
      eventType: "aggregate-completed",
      deliveryKey: `aggregate-completed:${agentRunId}:${lifecycleStatus}`,
      payload,
    });
    return { run, payload };
  };

  const completeMediaRetrievalJob = async ({ jobId, workerId, checkpoint = {} }) =>
    withTransaction(async (connection) => {
      const rows = await connection.query(
        `UPDATE media_retrieval_jobs
        SET status = 'succeeded', progress = 100, checkpoint = ?::jsonb, finished_at = CURRENT_TIMESTAMP
        WHERE id = ? AND claimed_by = ? AND status = 'running'
        RETURNING *`,
        [JSON.stringify(checkpoint), jobId, workerId],
      );
      const job = rows[0] ? mapJob(rows[0]) : null;
      if (!job) return null;
      const aggregate = await aggregateTerminalAgentRun(connection, { agentRunId: job.agentRunId, userId: job.userId });
      return { job, run: aggregate?.run || null, aggregate: aggregate?.payload || null };
    });

  const failMediaRetrievalJob = async ({ jobId, workerId, lifecycleStatus = "failed", failureCode }) =>
    withTransaction(async (connection) => {
      const rows = await connection.query(
        `UPDATE media_retrieval_jobs
        SET status = ?, failure_code = ?, finished_at = CURRENT_TIMESTAMP
        WHERE id = ? AND claimed_by = ? AND status = 'running'
        RETURNING *`,
        [lifecycleStatus === "blocked" ? "blocked" : "failed", failureCode || null, jobId, workerId],
      );
      const job = rows[0] ? mapJob(rows[0]) : null;
      if (!job) return null;
      const aggregate = await aggregateTerminalAgentRun(connection, { agentRunId: job.agentRunId, userId: job.userId });
      return { job, run: aggregate?.run || null, aggregate: aggregate?.payload || null };
    });

  const reclaimExpiredMediaRetrievalJobs = async () =>
    withTransaction(async (connection) => {
      const chargedRows = await connection.query(
        `UPDATE media_retrieval_jobs AS job
        SET status = 'blocked',
            failure_code = 'retrieval_unknown_charge_no_retry',
            finished_at = CURRENT_TIMESTAMP
        WHERE job.status = 'running'
          AND COALESCE(job.lease_expires_at, job.claimed_at + INTERVAL '5 minutes') <= CURRENT_TIMESTAMP
          AND EXISTS (
            SELECT 1
            FROM media_retrieval_cost_ledger AS ledger
            WHERE ledger.job_id = job.id
              AND ledger.disposition IN ('reserved', 'unknown')
          )
        RETURNING job.id, job.user_id, job.agent_run_id`,
      );
      if (chargedRows.length) {
        const unknownReservations = await connection.query(
          `UPDATE media_retrieval_cost_ledger
          SET disposition = 'unknown', settled_at = CURRENT_TIMESTAMP
          WHERE job_id = ANY(?::text[])
            AND disposition = 'reserved'
          RETURNING user_id, amount_fen, created_at`,
          [chargedRows.map((row) => row.id)],
        );
        for (const reservation of unknownReservations) {
          const amountFen = toNonNegativeInteger(reservation.amount_fen);
          for (const scope of ["user", "global"]) {
            const scopeParams = scope === "user" ? [reservation.user_id] : [];
            const scopeWhere = scope === "user" ? "scope = 'user' AND user_id = ?" : "scope = 'global' AND user_id IS NULL";
            await connection.query(
              `UPDATE media_retrieval_cost_daily_rollups
              SET reserved_fen = GREATEST(0, reserved_fen - ?),
                  unknown_fen = unknown_fen + ?
              WHERE utc_day = (?::timestamptz AT TIME ZONE 'UTC')::date
                AND ${scopeWhere}`,
              [amountFen, amountFen, reservation.created_at, ...scopeParams],
            );
          }
        }
      }
      for (const job of chargedRows) {
        await aggregateTerminalAgentRun(connection, { agentRunId: job.agent_run_id, userId: job.user_id });
      }
      const requeuedRows = await connection.query(
        `UPDATE media_retrieval_jobs AS job
        SET status = 'queued',
            attempt = attempt + 1,
            claimed_at = NULL,
            claimed_by = NULL,
            heartbeat_at = NULL,
            lease_expires_at = NULL,
            available_at = CURRENT_TIMESTAMP
        WHERE job.status = 'running'
          AND COALESCE(job.lease_expires_at, job.claimed_at + INTERVAL '5 minutes') <= CURRENT_TIMESTAMP
          AND NOT EXISTS (
            SELECT 1
            FROM media_retrieval_cost_ledger AS ledger
            WHERE ledger.job_id = job.id
              AND ledger.disposition IN ('reserved', 'unknown')
          )
        RETURNING job.id, job.user_id, job.agent_run_id, job.attempt`,
      );
      for (const job of requeuedRows) {
        const run = await updateRunLifecycle(connection, {
          agentRunId: job.agent_run_id,
          lifecycleStatus: "queued",
        });
        if (run) {
          await appendEventWithConnection(connection, {
            userId: job.user_id,
            agentRunId: job.agent_run_id,
            lifecycleStatus: "queued",
            eventType: "recovery-queued",
            deliveryKey: `recovery-queued:${job.id}:${job.attempt || 0}`,
            payload: { jobType: "index" },
          });
        }
      }
      return { blocked: chargedRows.length, requeued: requeuedRows.length };
    });

  const checkpointMediaRetrievalJob = async ({ jobId, workerId, checkpoint = {} }) => {
    const safeCheckpoint = {
      completedSegmentIndexes: Array.from(
        new Set(
          (Array.isArray(checkpoint.completedSegmentIndexes) ? checkpoint.completedSegmentIndexes : [])
            .map((value) => Number(value))
            .map((value) => (Number.isInteger(value) ? value : -1))
            .filter((value) => value >= 0),
        ),
      ).sort((left, right) => left - right),
      lastFrameTimestampMs:
        checkpoint.lastFrameTimestampMs === null || checkpoint.lastFrameTimestampMs === undefined
          ? null
          : toNonNegativeInteger(checkpoint.lastFrameTimestampMs),
    };
    const rows = await query(
      `UPDATE media_retrieval_jobs
      SET checkpoint = checkpoint || ?::jsonb,
          heartbeat_at = CURRENT_TIMESTAMP,
          lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
      WHERE id = ? AND claimed_by = ? AND status = 'running'
      RETURNING *`,
      [JSON.stringify(safeCheckpoint), jobId, workerId],
    );
    return rows[0] ? mapJob(rows[0]) : null;
  };

  const heartbeatMediaRetrievalJob = async ({ jobId, workerId }) => {
    const rows = await query(
      `UPDATE media_retrieval_jobs
      SET heartbeat_at = CURRENT_TIMESTAMP,
          lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
      WHERE id = ? AND claimed_by = ? AND status = 'running'
      RETURNING *`,
      [jobId, workerId],
    );
    return rows[0] ? mapJob(rows[0]) : null;
  };

  const verifyMediaRetrievalJobDispatch = async ({
    jobId,
    workerId,
    userId,
    mediaAssetId,
    profileEpoch,
    contentFingerprint,
    processingVersion,
  }) =>
    withTransaction(async (connection) => {
      const rows = await connection.query(
        `SELECT
          job.id AS job_id,
          job.user_id AS job_user_id,
          job.media_asset_id AS job_media_asset_id,
          job.content_fingerprint AS job_content_fingerprint,
          job.processing_version AS job_processing_version,
          job.profile_epoch AS job_profile_epoch,
          job.status AS job_status,
          job.claimed_by AS job_claimed_by,
          profile.index_state,
          profile.consent_version,
          profile.index_epoch AS profile_index_epoch,
          asset.id AS asset_id,
          asset.status AS asset_status,
          asset.deleted_at,
          asset.storage_key,
          asset.byte_size,
          asset.updated_at
        FROM media_retrieval_jobs AS job
        JOIN media_retrieval_profiles AS profile ON profile.user_id = job.user_id
        JOIN station_media_assets AS asset ON asset.id = job.media_asset_id AND asset.user_id = job.user_id
        WHERE job.id = ?
          AND job.user_id = ?
          AND job.job_type = 'index'
          AND job.status = 'running'
          AND job.claimed_by = ?
          AND job.lease_expires_at > CURRENT_TIMESTAMP
        LIMIT 1
        FOR UPDATE OF job, profile, asset`,
        [jobId, userId, workerId],
      );
      const current = rows[0];
      if (!current) return { allowed: false, reasonCode: "retrieval_job_lease_lost" };
      if (
        current.index_state !== "enabled" ||
        current.consent_version !== MEDIA_RETRIEVAL_CONSENT_VERSION ||
        toNonNegativeInteger(current.job_profile_epoch, 1) !== toNonNegativeInteger(current.profile_index_epoch, 1) ||
        (profileEpoch !== undefined && profileEpoch !== null && toNonNegativeInteger(profileEpoch, 1) !== toNonNegativeInteger(current.profile_index_epoch, 1))
      ) {
        return { allowed: false, reasonCode: "retrieval_not_enabled" };
      }
      if (
        current.job_user_id !== userId ||
        current.job_media_asset_id !== mediaAssetId ||
        current.job_processing_version !== processingVersion ||
        current.job_content_fingerprint !== contentFingerprint ||
        current.asset_id !== mediaAssetId ||
        current.asset_status !== "uploaded" ||
        current.deleted_at !== null ||
        fingerprintAsset({
          id: current.asset_id,
          storage_key: current.storage_key,
          byte_size: current.byte_size,
          updated_at: current.updated_at,
        }) !== contentFingerprint
      ) {
        return { allowed: false, reasonCode: "asset_not_indexable" };
      }
      return { allowed: true, reasonCode: null };
    });

  const stageMediaRetrievalSegment = async ({
    userId,
    agentRunId,
    jobId,
    workerId,
    mediaAssetId,
    profileEpoch,
    processingVersion,
    contentFingerprint,
    segment,
  }) =>
    withTransaction(async (connection) => {
      const embedding = vectorLiteral(segment?.embedding);
      if (!workerId || !embedding || !Number.isInteger(Number(segment?.segmentIndex))) return null;
      const provenance = assertIndexingProvenance(segment);
      const currentRows = await connection.query(
        `SELECT job.id
        FROM media_retrieval_jobs AS job
        JOIN media_retrieval_profiles AS profile ON profile.user_id = job.user_id
        JOIN station_media_assets AS asset ON asset.id = job.media_asset_id AND asset.user_id = job.user_id
        WHERE job.id = ?
          AND job.user_id = ?
          AND job.media_asset_id = ?
          AND job.job_type = 'index'
          AND job.status = 'running'
          AND job.claimed_by = ?
          AND job.lease_expires_at > CURRENT_TIMESTAMP
          AND job.profile_epoch = ?
          AND job.processing_version = ?
          AND job.content_fingerprint = ?
          AND profile.index_state = 'enabled'
          AND profile.consent_version = ?
          AND profile.index_epoch = job.profile_epoch
          AND asset.status = 'uploaded'
          AND asset.deleted_at IS NULL
        LIMIT 1
        FOR UPDATE OF job, profile, asset`,
        [
          jobId,
          userId,
          mediaAssetId,
          workerId,
          toNonNegativeInteger(profileEpoch, 1),
          processingVersion,
          contentFingerprint,
          MEDIA_RETRIEVAL_CONSENT_VERSION,
        ],
      );
      if (!currentRows[0]) return null;
      const segmentIndex = toNonNegativeInteger(segment.segmentIndex);
      const frameTimestampMs = segment.sourceKind === "video-frame"
        ? toNonNegativeInteger(segment.frameTimestampMs)
        : null;
      await connection.query(
        `INSERT INTO media_retrieval_segment_staging
          (id, user_id, agent_run_id, job_id, media_asset_id, profile_epoch, segment_index, source_kind, frame_timestamp_ms, descriptor, embedding, descriptor_provenance, embedding_provenance, processing_version, content_fingerprint)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::vector, ?::jsonb, ?::jsonb, ?, ?)
        ON CONFLICT (job_id, segment_index) DO UPDATE
        SET descriptor = EXCLUDED.descriptor,
            embedding = EXCLUDED.embedding,
            descriptor_provenance = EXCLUDED.descriptor_provenance,
            embedding_provenance = EXCLUDED.embedding_provenance,
            source_kind = EXCLUDED.source_kind,
            frame_timestamp_ms = EXCLUDED.frame_timestamp_ms,
            profile_epoch = EXCLUDED.profile_epoch,
            processing_version = EXCLUDED.processing_version,
            content_fingerprint = EXCLUDED.content_fingerprint,
            updated_at = CURRENT_TIMESTAMP`,
        [
          idFactory(),
          userId,
          agentRunId,
          jobId,
          mediaAssetId,
          toNonNegativeInteger(profileEpoch, 1),
          segmentIndex,
          segment.sourceKind,
          frameTimestampMs,
          JSON.stringify(segment.descriptor || {}),
          embedding,
          JSON.stringify(provenance.descriptorProvenance),
          JSON.stringify(provenance.embeddingProvenance),
          processingVersion,
          contentFingerprint,
        ],
      );
      const checkpointRows = await connection.query(
        `UPDATE media_retrieval_jobs
        SET checkpoint = checkpoint || jsonb_build_object(
              'completedSegmentIndexes', (
                SELECT COALESCE(jsonb_agg(segment_index ORDER BY segment_index), '[]'::jsonb)
                FROM media_retrieval_segment_staging
                WHERE job_id = ?
              ),
              'lastFrameTimestampMs', ?::bigint
            ),
            heartbeat_at = CURRENT_TIMESTAMP,
            lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
        WHERE id = ? AND claimed_by = ? AND status = 'running'
        RETURNING *`,
        [jobId, frameTimestampMs, jobId, workerId],
      );
      return checkpointRows[0] ? mapJob(checkpointRows[0]) : null;
    });

  const listMediaRetrievalStagedSegments = async ({
    userId,
    jobId,
    workerId,
    contentFingerprint,
    processingVersion,
    profileEpoch,
  }) => {
    const rows = await query(
      `SELECT stage.segment_index, stage.source_kind, stage.frame_timestamp_ms, stage.descriptor, stage.embedding::text AS embedding,
              stage.descriptor_provenance, stage.embedding_provenance
      FROM media_retrieval_segment_staging AS stage
      JOIN media_retrieval_jobs AS job ON job.id = stage.job_id AND job.user_id = stage.user_id
      JOIN media_retrieval_profiles AS profile ON profile.user_id = job.user_id
      WHERE stage.user_id = ?
        AND stage.job_id = ?
        AND job.status = 'running'
        AND job.claimed_by = ?
        AND job.lease_expires_at > CURRENT_TIMESTAMP
        AND stage.content_fingerprint = ?
        AND stage.processing_version = ?
        AND stage.profile_epoch = ?
        AND profile.index_state = 'enabled'
        AND profile.consent_version = ?
        AND profile.index_epoch = stage.profile_epoch
      ORDER BY stage.segment_index ASC`,
      [
        userId,
        jobId,
        workerId,
        contentFingerprint,
        processingVersion,
        toNonNegativeInteger(profileEpoch, 1),
        MEDIA_RETRIEVAL_CONSENT_VERSION,
      ],
    );
    return rows.map((row) => ({
      segmentIndex: toNonNegativeInteger(row.segment_index),
      sourceKind: row.source_kind,
      frameTimestampMs: row.frame_timestamp_ms === null ? null : toNonNegativeInteger(row.frame_timestamp_ms),
      descriptor: typeof row.descriptor === "object" && row.descriptor !== null ? row.descriptor : JSON.parse(row.descriptor || "{}"),
      embedding: String(row.embedding || "")
        .replace(/^\[|\]$/g, "")
        .split(",")
        .filter(Boolean)
        .map(Number),
      ...assertIndexingProvenance({
        descriptorProvenance: typeof row.descriptor_provenance === "object" && row.descriptor_provenance !== null
          ? row.descriptor_provenance
          : JSON.parse(row.descriptor_provenance || "null"),
        embeddingProvenance: typeof row.embedding_provenance === "object" && row.embedding_provenance !== null
          ? row.embedding_provenance
          : JSON.parse(row.embedding_provenance || "null"),
      }),
    }));
  };

  const purgeMediaRetrievalArtifacts = async ({ userId, mediaAssetId = null }) =>
    withTransaction(async (connection) => {
      const assetPredicate = mediaAssetId ? " AND media_asset_id = ?" : "";
      const assetParams = mediaAssetId ? [mediaAssetId] : [];
      const deleted = await connection.query(
        `DELETE FROM media_retrieval_segments
        WHERE user_id = ?${assetPredicate}
        RETURNING id`,
        [userId, ...assetParams],
      );
      const deletedStaging = await connection.query(
        `DELETE FROM media_retrieval_segment_staging
        WHERE user_id = ?${assetPredicate}
        RETURNING id`,
        [userId, ...assetParams],
      );
      await connection.query(
        `UPDATE media_retrieval_jobs
        SET status = 'cancelled',
            failure_code = 'retrieval_purge_requested',
            finished_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND job_type = 'index'
          AND status = 'queued'${assetPredicate}`,
        [userId, ...assetParams],
      );
      const residueRows = await connection.query(
        `SELECT COUNT(*) AS residue_count
        FROM (
          SELECT id
          FROM media_retrieval_segments
          WHERE user_id = ?${assetPredicate}
            AND (descriptor IS NOT NULL OR embedding IS NOT NULL OR descriptor_provenance IS NOT NULL OR embedding_provenance IS NOT NULL)
          UNION ALL
          SELECT id
          FROM media_retrieval_segment_staging
          WHERE user_id = ?${assetPredicate}
            AND (descriptor IS NOT NULL OR embedding IS NOT NULL OR descriptor_provenance IS NOT NULL OR embedding_provenance IS NOT NULL)
        ) AS residues`,
        [userId, ...assetParams, userId, ...assetParams],
      );
      const residueCount = toNonNegativeInteger(residueRows[0]?.residue_count);
      if (!mediaAssetId && residueCount === 0) {
        await connection.query(
          `UPDATE media_retrieval_profiles
          SET index_state = 'purged',
              consent_version = NULL,
              consent_granted_at = NULL,
              indexed_at = NULL,
              disabled_at = CURRENT_TIMESTAMP
          WHERE user_id = ?`,
          [userId],
        );
      }
      return {
        deletedSegments: deleted.length + deletedStaging.length,
        deletedSnapshots: 0,
        residueCount,
      };
    });

  const persistMediaRetrievalSegments = async ({ userId, agentRunId, jobId, workerId, mediaAssetId, processingVersion, contentFingerprint, segments = [], stagingRequired = false }) =>
    withTransaction(async (connection) => {
      if (!workerId) {
        return { status: "invalidated", reasonCode: "retrieval_job_lease_lost", persistedCount: 0 };
      }
      const commitRows = await connection.query(
        `SELECT
          job.id AS job_id,
          job.user_id AS job_user_id,
          job.media_asset_id AS job_media_asset_id,
          job.content_fingerprint AS job_content_fingerprint,
          job.processing_version AS job_processing_version,
          job.profile_epoch,
          job.status AS job_status,
          job.claimed_by,
          profile.index_state,
          profile.consent_version,
          profile.index_epoch,
          asset.id AS asset_id,
          asset.status AS asset_status,
          asset.deleted_at,
          asset.storage_key,
          asset.byte_size,
          asset.updated_at
        FROM media_retrieval_jobs AS job
        JOIN media_retrieval_profiles AS profile ON profile.user_id = job.user_id
        JOIN station_media_assets AS asset ON asset.id = job.media_asset_id AND asset.user_id = job.user_id
        WHERE job.id = ?
          AND job.user_id = ?
          AND job.job_type = 'index'
          AND job.status = 'running'
          AND job.claimed_by = ?
          AND job.lease_expires_at > CURRENT_TIMESTAMP
        LIMIT 1
        FOR UPDATE OF job, profile, asset`,
        [jobId, userId, workerId],
      );
      const commit = commitRows[0];
      if (!commit) {
        return { status: "invalidated", reasonCode: "asset_not_indexable", persistedCount: 0 };
      }
      if (
        commit.index_state !== "enabled" ||
        commit.consent_version !== MEDIA_RETRIEVAL_CONSENT_VERSION ||
        toNonNegativeInteger(commit.profile_epoch, 1) !== toNonNegativeInteger(commit.index_epoch, 1)
      ) {
        return { status: "invalidated", reasonCode: "retrieval_not_enabled", persistedCount: 0 };
      }
      if (
        commit.job_status !== "running" ||
        commit.job_media_asset_id !== mediaAssetId ||
        commit.job_processing_version !== processingVersion ||
        commit.job_content_fingerprint !== contentFingerprint ||
        commit.asset_status !== "uploaded" ||
        commit.deleted_at !== null ||
        fingerprintAsset({
          id: commit.asset_id,
          storage_key: commit.storage_key,
          byte_size: commit.byte_size,
          updated_at: commit.updated_at,
        }) !== contentFingerprint
      ) {
        return { status: "invalidated", reasonCode: "asset_not_indexable", persistedCount: 0 };
      }

      const stagedRows = await connection.query(
        `SELECT segment_index, source_kind, frame_timestamp_ms, descriptor, embedding::text AS embedding,
                descriptor_provenance, embedding_provenance
        FROM media_retrieval_segment_staging
        WHERE user_id = ?
          AND job_id = ?
          AND media_asset_id = ?
          AND profile_epoch = ?
          AND processing_version = ?
          AND content_fingerprint = ?
        ORDER BY segment_index ASC`,
        [
          userId,
          jobId,
          mediaAssetId,
          toNonNegativeInteger(commit.profile_epoch, 1),
          processingVersion,
          contentFingerprint,
        ],
      );
      if (stagingRequired && !stagedRows.length) {
        return { status: "invalidated", reasonCode: "retrieval_staging_missing", persistedCount: 0 };
      }
      const sourceSegments = stagedRows.length
        ? stagedRows.map((row) => ({
          segmentIndex: toNonNegativeInteger(row.segment_index),
          sourceKind: row.source_kind,
          frameTimestampMs: row.frame_timestamp_ms === null ? null : toNonNegativeInteger(row.frame_timestamp_ms),
          descriptor: typeof row.descriptor === "object" && row.descriptor !== null ? row.descriptor : JSON.parse(row.descriptor || "{}"),
          embedding: String(row.embedding || "")
            .replace(/^\[|\]$/g, "")
            .split(",")
            .filter(Boolean)
            .map(Number),
          ...assertIndexingProvenance({
            descriptorProvenance: typeof row.descriptor_provenance === "object" && row.descriptor_provenance !== null
              ? row.descriptor_provenance
              : JSON.parse(row.descriptor_provenance || "null"),
            embeddingProvenance: typeof row.embedding_provenance === "object" && row.embedding_provenance !== null
              ? row.embedding_provenance
              : JSON.parse(row.embedding_provenance || "null"),
          }),
        }))
        : segments;
      const preparedSegments = sourceSegments.map((segment) => {
        const embedding = vectorLiteral(segment.embedding);
        if (!embedding) throw new TypeError("Media retrieval segment embedding must contain 1024 finite values.");
        const provenance = assertIndexingProvenance(segment);
        return {
          ...segment,
          ...provenance,
          embedding,
          segmentIndex: toNonNegativeInteger(segment.segmentIndex),
          frameTimestampMs: segment.sourceKind === "video-frame" ? toNonNegativeInteger(segment.frameTimestampMs) : null,
        };
      });
      const firstProvenance = preparedSegments[0]
        ? assertIndexingProvenance(preparedSegments[0])
        : null;
      if (firstProvenance && preparedSegments.some((segment) => {
        const provenance = assertIndexingProvenance(segment);
        return JSON.stringify(provenance) !== JSON.stringify(firstProvenance);
      })) {
        throw new TypeError("Media retrieval job staging contains mixed indexing provenance.");
      }

      await connection.query(
        `UPDATE media_retrieval_segments
        SET state = 'superseded'
        WHERE user_id = ?
          AND media_asset_id = ?
          AND state = 'ready'`,
        [userId, mediaAssetId],
      );
      const persisted = [];
      for (const segment of preparedSegments) {
        const rows = await connection.query(
          `INSERT INTO media_retrieval_segments
            (id, user_id, media_asset_id, agent_run_id, job_id, segment_index, source_kind, frame_timestamp_ms, descriptor, embedding, descriptor_provenance, embedding_provenance, state, processing_version, content_fingerprint)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::vector, ?::jsonb, ?::jsonb, 'ready', ?, ?)
          RETURNING *`,
          [
            idFactory(),
            userId,
            mediaAssetId,
            agentRunId,
            jobId,
            segment.segmentIndex,
            segment.sourceKind,
            segment.frameTimestampMs,
            JSON.stringify(segment.descriptor || {}),
            segment.embedding,
            JSON.stringify(segment.descriptorProvenance),
            JSON.stringify(segment.embeddingProvenance),
            processingVersion,
            contentFingerprint,
          ],
        );
        persisted.push(requireReturnedRow(rows, "persist-ready-segment"));
      }
      await connection.query(
        `DELETE FROM media_retrieval_segment_staging
        WHERE user_id = ? AND job_id = ?`,
        [userId, jobId],
      );
      return { status: "persisted", persistedCount: persisted.length };
    });

  const heartbeatMediaRetrievalWorker = async ({ workerId, state = "ready" }) => {
    await query(
      `INSERT INTO media_retrieval_worker_heartbeats (worker_id, state, last_seen_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (worker_id) DO UPDATE
      SET state = EXCLUDED.state, last_seen_at = CURRENT_TIMESTAMP`,
      [workerId, state],
    );
    return { workerId, state };
  };

  return {
    getMediaRetrievalProfile,
    enableMediaRetrievalProfile,
    enqueueAssetIndexJob,
    getIndexableMediaAsset,
    transitionMediaRetrievalRun,
    getMediaRetrievalDispatchState,
    canEnqueueMediaRetrievalForUser,
    enqueueBackfillJobs,
    enqueueReindexJobs,
    beginIndexPurge,
    claimMediaRetrievalLifecycleOutbox,
    createAssetPurgeRunAndJob,
    enqueueMediaRetrievalTemporaryCleanup,
    claimMediaRetrievalTemporaryCleanup,
    completeMediaRetrievalTemporaryCleanup,
    retryMediaRetrievalTemporaryCleanup,
    claimNextMediaRetrievalJob,
    completeMediaRetrievalJob,
    failMediaRetrievalJob,
    reclaimExpiredMediaRetrievalJobs,
    checkpointMediaRetrievalJob,
    heartbeatMediaRetrievalJob,
    verifyMediaRetrievalJobDispatch,
    stageMediaRetrievalSegment,
    listMediaRetrievalStagedSegments,
    purgeMediaRetrievalArtifacts,
    persistMediaRetrievalSegments,
    heartbeatMediaRetrievalWorker,
  };
}
