import {
  CLIENT_EVENT_VISIBILITY,
  MEDIA_RETRIEVAL_AGENT_KEY,
  TERMINAL_LIFECYCLE_STATUSES,
  isSafeLifecycleStatus,
  mapEvent,
  mapRun,
  redactInputSummary,
  safeEventPayload,
  statusForLifecycle,
  toInteger,
} from "./media-retrieval-repository-shared.js";
import { MediaRetrievalRepositoryError } from "./media-retrieval-errors.js";

export function createMediaRetrievalRunEventRepository({
  query,
  withTransaction,
  now = () => new Date(),
  idFactory,
  traceIdFactory,
} = {}) {
  if (typeof query !== "function" || typeof withTransaction !== "function") {
    throw new TypeError("Media retrieval run/event repository requires query and withTransaction functions.");
  }
  if (typeof idFactory !== "function" || typeof traceIdFactory !== "function") {
    throw new TypeError("Media retrieval run/event repository requires ID factories.");
  }

  const getExistingRunByIdempotency = async (connection, { userId, idempotencyKey }) => {
    if (!idempotencyKey) return null;
    const rows = await connection.query(
      `SELECT *
      FROM agent_runs
      WHERE user_id = ? AND agent_id = 'media-retrieval' AND idempotency_key = ?
      LIMIT 1`,
      [userId, idempotencyKey],
    );
    return rows[0] || null;
  };

  const appendEventWithConnection = async (connection, input) => {
    const runRows = await connection.query(
      `SELECT id
      FROM agent_runs
      WHERE id = ? AND user_id = ? AND agent_id = 'media-retrieval'
      LIMIT 1
      FOR UPDATE`,
      [input.agentRunId, input.userId],
    );
    if (!runRows[0]) return null;

    const existingRows = await connection.query(
      `SELECT id, sequence, lifecycle_status, event_type, visibility, payload, created_at
      FROM agent_run_events
      WHERE agent_run_id = ? AND delivery_key = ?
      LIMIT 1`,
      [input.agentRunId, input.deliveryKey],
    );
    if (existingRows[0]) return mapEvent(existingRows[0]);

    const sequenceRows = await connection.query(
      `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
      FROM agent_run_events
      WHERE agent_run_id = ?`,
      [input.agentRunId],
    );
    const sequence = toInteger(sequenceRows[0]?.next_sequence, 1);
    const rows = await connection.query(
      `INSERT INTO agent_run_events
        (id, agent_run_id, user_id, sequence, lifecycle_status, event_type, visibility, payload, delivery_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)
      ON CONFLICT (delivery_key) DO NOTHING
      RETURNING id, sequence, lifecycle_status, event_type, visibility, payload, created_at`,
      [
        idFactory(),
        input.agentRunId,
        input.userId,
        sequence,
        input.lifecycleStatus,
        input.eventType,
        input.visibility || CLIENT_EVENT_VISIBILITY,
        JSON.stringify(safeEventPayload(input.payload)),
        input.deliveryKey,
      ],
    );
    if (rows[0]) return mapEvent(rows[0]);

    const replayRows = await connection.query(
      `SELECT id, sequence, lifecycle_status, event_type, visibility, payload, created_at
      FROM agent_run_events
      WHERE agent_run_id = ? AND delivery_key = ?
      LIMIT 1`,
      [input.agentRunId, input.deliveryKey],
    );
    return replayRows[0] ? mapEvent(replayRows[0]) : null;
  };

  const insertMediaRetrievalRun = async (connection, input) => {
    const id = idFactory();
    const traceId = traceIdFactory();
    const runType = input.runType || "media-index";
    await connection.query(
      `INSERT INTO agent_runs
        (id, user_id, agent_id, status, provider, run_type, lifecycle_status, trace_id, attempt, input_summary, confirmation, idempotency_key)
      VALUES (?, ?, 'media-retrieval', 'pending', 'local', ?, 'accepted', ?, 1, ?::jsonb, ?::jsonb, ?)`,
      [
        id,
        input.userId,
        runType,
        traceId,
        JSON.stringify(redactInputSummary(input.inputSummary)),
        JSON.stringify({ confirmed: Boolean(input.confirmed) }),
        input.idempotencyKey || null,
      ],
    );
    await appendEventWithConnection(connection, {
      userId: input.userId,
      agentRunId: id,
      lifecycleStatus: "accepted",
      eventType: "accepted",
      visibility: CLIENT_EVENT_VISIBILITY,
      payload: { operation: runType },
      deliveryKey: `accepted:${id}`,
    });
    const rows = await connection.query(
      `SELECT *
      FROM agent_runs
      WHERE id = ? AND user_id = ? AND agent_id = 'media-retrieval'
      LIMIT 1`,
      [id, input.userId],
    );
    if (!rows[0]) throw new MediaRetrievalRepositoryError("retrieval_repository_write_failed");
    return mapRun(rows[0]);
  };

  const createOrGetMediaRetrievalRun = async (input) =>
    withTransaction(async (connection) => {
      const existing = await getExistingRunByIdempotency(connection, input);
      if (existing) return { run: mapRun(existing), reused: true };
      try {
        return { run: await insertMediaRetrievalRun(connection, input), reused: false };
      } catch (error) {
        if (!input.idempotencyKey || error?.code !== "23505") throw error;
        const replay = await getExistingRunByIdempotency(connection, input);
        if (!replay) throw error;
        return { run: mapRun(replay), reused: true };
      }
    });

  const appendAgentRunEvent = async (input) => {
    if (!isSafeLifecycleStatus(input.lifecycleStatus)) {
      throw new TypeError("Unknown media retrieval lifecycle status.");
    }
    return withTransaction((connection) => appendEventWithConnection(connection, input));
  };

  const getAgentRunForUser = async ({ userId, agentRunId }) => {
    const rows = await query(
      `SELECT *
      FROM agent_runs
      WHERE id = ? AND user_id = ? AND agent_id = 'media-retrieval'
      LIMIT 1`,
      [agentRunId, userId],
    );
    return rows[0] ? mapRun(rows[0]) : null;
  };

  const listAgentRunEventsForUser = async ({ userId, agentRunId, afterSequence = 0, limit = 100 }) => {
    const rows = await query(
      `SELECT id, sequence, lifecycle_status, event_type, visibility, payload, created_at
      FROM agent_run_events
      WHERE user_id = ?
        AND agent_run_id = ?
        AND visibility = 'client'
        AND sequence > ?
      ORDER BY sequence ASC
      LIMIT ?`,
      [userId, agentRunId, Math.max(0, toInteger(afterSequence)), Math.min(100, Math.max(1, toInteger(limit, 100)))],
    );
    return rows.map(mapEvent);
  };

  const updateRunLifecycle = async (connection, { agentRunId, lifecycleStatus, failureCode = null }) => {
    if (!agentRunId || !isSafeLifecycleStatus(lifecycleStatus)) return null;
    const rows = await connection.query(
      `UPDATE agent_runs
      SET lifecycle_status = ?, status = ?, failure_code = ?, finished_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE finished_at END
      WHERE id = ? AND agent_id = 'media-retrieval'
      RETURNING *`,
      [
        lifecycleStatus,
        statusForLifecycle(lifecycleStatus),
        failureCode,
        TERMINAL_LIFECYCLE_STATUSES.has(lifecycleStatus),
        agentRunId,
      ],
    );
    return rows[0] ? mapRun(rows[0]) : null;
  };

  return {
    createOrGetMediaRetrievalRun,
    appendAgentRunEvent,
    getAgentRunForUser,
    listAgentRunEventsForUser,
    appendEventWithConnection,
    insertMediaRetrievalRun,
    updateRunLifecycle,
  };
}
