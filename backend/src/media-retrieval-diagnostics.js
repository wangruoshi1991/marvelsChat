import crypto from "node:crypto";
import { query } from "./db.js";
import { projectMediaRetrievalDiagnostic } from "./media-retrieval-errors.js";
import { MEDIA_RETRIEVAL_ERROR_CONTRACTS } from "../../shared/media-retrieval-public-contract.js";

export const MEDIA_RETRIEVAL_DIAGNOSTIC_EVENT = "media_retrieval.provider.failed";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createMediaRetrievalDiagnostics({ queryFn = query, idFactory = crypto.randomUUID } = {}) {
  return {
    async record({ reservationId, failureCode, diagnostic }) {
      const safe = projectMediaRetrievalDiagnostic(diagnostic);
      if (!UUID_PATTERN.test(reservationId || "") || !safe || !Object.hasOwn(MEDIA_RETRIEVAL_ERROR_CONTRACTS, failureCode)) {
        throw new TypeError("Media retrieval diagnostic context is invalid.");
      }
      // Ownership and the run reference come from the durable reservation, never
      // from untrusted provider output or a caller-supplied user ID.
      const rows = await queryFn(
        `INSERT INTO usage_events (id, user_id, event_type, target_type, target_id, payload)
        SELECT ?, cost.user_id, ?, 'agent_run', cost.agent_run_id, ?::jsonb
        FROM media_retrieval_cost_ledger cost
        JOIN agent_runs run ON run.id = cost.agent_run_id AND run.user_id = cost.user_id
        WHERE cost.id = ? AND run.agent_id = 'media-retrieval'
        RETURNING id`,
        [idFactory(), MEDIA_RETRIEVAL_DIAGNOSTIC_EVENT, JSON.stringify({ failureCode, ...safe }), reservationId],
      );
      if (rows.length !== 1) throw new Error("Media retrieval diagnostic reservation was not found.");
    },
    async list() {
      const rows = await queryFn(
        `SELECT id, target_id AS agent_run_id, payload, created_at
        FROM usage_events
        WHERE event_type = ? AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
        ORDER BY created_at DESC
        LIMIT 20`,
        [MEDIA_RETRIEVAL_DIAGNOSTIC_EVENT],
      );
      return rows.flatMap((row) => {
        const diagnostic = projectMediaRetrievalDiagnostic(row.payload);
        if (!diagnostic || !UUID_PATTERN.test(row.agent_run_id || "")) return [];
        return [{
          agentRunId: row.agent_run_id,
          failureCode: Object.hasOwn(MEDIA_RETRIEVAL_ERROR_CONTRACTS, row.payload?.failureCode)
            ? row.payload.failureCode : "retrieval_service_unavailable",
          ...diagnostic,
          createdAt: new Date(row.created_at).toISOString(),
        }];
      });
    },
  };
}

export const recordMediaRetrievalDiagnostic = createMediaRetrievalDiagnostics().record;
