import crypto from "node:crypto";
import { query, withTransaction } from "./db.js";

// Wait out already-issued upload URLs (ten minutes) and in-flight writes.
export const storageCleanupGraceMs = 15 * 60 * 1000;

const objectIdentity = ({ provider, objectKey }) =>
  `${String(provider || "").trim().toLowerCase()}\0${String(objectKey || "").trim()}`;

export function createStorageCleanupRepository({
  runQuery = query,
  transaction = withTransaction,
  idFactory = crypto.randomUUID,
  leaseMs = 60_000,
  maxAttempts = 12,
} = {}) {
  const enqueueStorageCleanup = async (connection, { scope, userId, targetId, objects }) => {
    const uniqueObjects = new Map();
    for (const item of objects || []) {
      const provider = String(item.provider || "").trim().toLowerCase();
      const objectKey = String(item.objectKey || "").trim();
      if (!provider || !objectKey) continue;
      const identity = objectIdentity({ provider, objectKey });
      const notBefore = item.notBefore ? new Date(item.notBefore) : null;
      if (notBefore && !Number.isFinite(notBefore.getTime()))
        throw new TypeError("Storage cleanup notBefore must be a valid date.");
      uniqueObjects.set(identity, { provider, objectKey, notBefore });
    }
    const dedupeKey = `${scope}:${userId}:${targetId}`;
    const [existing] = await connection.query(
      `INSERT INTO storage_cleanup_operations
        (id, scope, user_id, target_id, dedupe_key, status)
      VALUES (?, ?, ?, ?, ?, 'queued')
      ON CONFLICT (dedupe_key) DO UPDATE SET dedupe_key = EXCLUDED.dedupe_key
      RETURNING id, status`,
      [idFactory(), scope, userId, targetId, dedupeKey],
    );
    const operation = existing;
    for (const object of uniqueObjects.values()) {
      await connection.query(
        `INSERT INTO storage_cleanup_objects
          (id, operation_id, provider, object_key, next_attempt_at, not_before)
        VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT (operation_id, provider, object_key) DO NOTHING`,
        [idFactory(), operation.id, object.provider, object.objectKey, object.notBefore, object.notBefore],
      );
    }
    if (!uniqueObjects.size) {
      const [completed] = await connection.query(
        `UPDATE storage_cleanup_operations SET status = 'completed', completed_at = statement_timestamp()
        WHERE id = ? AND status = 'queued' AND NOT EXISTS (
          SELECT 1 FROM storage_cleanup_objects WHERE operation_id = ?
        ) RETURNING status`,
        [operation.id, operation.id],
      );
      if (completed) return { id: operation.id, status: completed.status };
    }
    return { id: operation.id, status: operation.status };
  };

  const getStorageCleanup = async (connection, { scope, userId, targetId }) => {
    const [operation] = await connection.query(
      `SELECT id, status FROM storage_cleanup_operations
      WHERE dedupe_key = ? LIMIT 1`,
      [`${scope}:${userId}:${targetId}`],
    );
    return operation || null;
  };

  const claimStorageCleanup = async ({ limit = 25 } = {}) =>
    transaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT object.id
        FROM storage_cleanup_objects object
        JOIN storage_cleanup_operations operation ON operation.id = object.operation_id
        WHERE (object.status = 'queued' AND object.next_attempt_at <= statement_timestamp()
            AND object.not_before <= statement_timestamp())
          OR (object.status = 'running' AND object.claim_lease_until <= statement_timestamp())
        ORDER BY object.next_attempt_at, object.created_at, object.id
        LIMIT ? FOR UPDATE OF object SKIP LOCKED`,
        [limit],
      );
      if (!rows.length) return [];
      const claimed = [];
      for (const row of rows) {
        const [updated] = await connection.execute(
          `UPDATE storage_cleanup_objects SET status = 'running', attempts = attempts + 1,
            claim_token = ?, claim_lease_until = statement_timestamp() + (? * interval '1 millisecond')
          WHERE id = ? RETURNING id, operation_id, provider, object_key, attempts, claim_token`,
          [idFactory(), leaseMs, row.id],
        );
        if (updated[0]) claimed.push(updated[0]);
      }
      if (claimed.length) {
        await connection.execute(
          `UPDATE storage_cleanup_operations operation SET status = 'running'
          FROM (SELECT DISTINCT operation_id FROM storage_cleanup_objects WHERE id = ANY(?::bpchar[])) claimed
          WHERE operation.id = claimed.operation_id AND operation.status <> 'completed'`,
          [claimed.map((item) => item.id)],
        );
      }
      return claimed;
    });

  const completeStorageCleanupObject = async ({ objectId, claimToken }) => {
    const [row] = await runQuery(
      `UPDATE storage_cleanup_objects
      SET status = 'completed', completed_at = statement_timestamp(), claim_token = NULL,
        claim_lease_until = NULL
      WHERE id = ? AND status = 'running' AND claim_token = ? RETURNING operation_id`,
      [objectId, claimToken],
    );
    return row ? { operationId: row.operation_id } : null;
  };

  const retryStorageCleanupObject = async ({ objectId, claimToken, attempts }) => {
    if (attempts >= maxAttempts) {
      const [row] = await runQuery(
        `UPDATE storage_cleanup_objects SET status = 'queued', attempts = 0,
          next_attempt_at = statement_timestamp() + interval '1 day', claim_token = NULL,
          claim_lease_until = NULL
        WHERE id = ? AND status = 'running' AND claim_token = ? RETURNING operation_id`,
        [objectId, claimToken],
      );
      return row ? { operationId: row.operation_id } : null;
    }
    const delaySeconds = Math.min(3600, 2 ** Math.min(attempts, 10));
    const [row] = await runQuery(
      `UPDATE storage_cleanup_objects SET status = 'queued',
        next_attempt_at = statement_timestamp() + (? * interval '1 second'), claim_token = NULL,
        claim_lease_until = NULL
      WHERE id = ? AND status = 'running' AND claim_token = ? RETURNING operation_id`,
      [delaySeconds, objectId, claimToken],
    );
    return row ? { operationId: row.operation_id } : null;
  };

  const completeStorageCleanupOperations = async () =>
    runQuery(
      `UPDATE storage_cleanup_operations operation SET status = 'completed', completed_at = statement_timestamp()
      WHERE operation.status <> 'completed' AND NOT EXISTS (
        SELECT 1 FROM storage_cleanup_objects object
        WHERE object.operation_id = operation.id AND object.status <> 'completed'
      ) RETURNING operation.id`,
    );

  const processStorageCleanup = async ({
    deleteObject,
    limit = 25,
  }) => {
    let claimed = 0;
    let failed = 0;
    for (; claimed < limit; claimed += 1) {
      const [object] = await claimStorageCleanup({ limit: 1 });
      if (!object) break;
      try {
        const [retained] = await runQuery(
          `SELECT EXISTS (
            SELECT 1 FROM station_media_assets WHERE deleted_at IS NULL
              AND storage_key = ? AND lower(storage_provider) = ANY(?::text[])
            UNION ALL
            SELECT 1 FROM file_assets WHERE deleted_at IS NULL
              AND storage_key = ? AND lower(storage_provider) = ANY(?::text[])
          ) AS retained`,
          [
            object.object_key, object.provider === "oss" || object.provider === "aliyun-oss" ? ["oss", "aliyun-oss"] : [object.provider],
            object.object_key, object.provider === "oss" || object.provider === "aliyun-oss" ? ["oss", "aliyun-oss"] : [object.provider],
          ],
        );
        if (!retained.retained) await deleteObject({ provider: object.provider, objectKey: object.object_key });
        await completeStorageCleanupObject({ objectId: object.id, claimToken: object.claim_token });
      } catch {
        failed += 1;
        await retryStorageCleanupObject({
          objectId: object.id,
          claimToken: object.claim_token,
          attempts: Number(object.attempts),
        });
      }
    }
    await completeStorageCleanupOperations();
    return { claimed, failed };
  };

  return {
    enqueueStorageCleanup,
    getStorageCleanup,
    claimStorageCleanup,
    completeStorageCleanupObject,
    retryStorageCleanupObject,
    processStorageCleanup,
  };
}

const repository = createStorageCleanupRepository();
export const {
  enqueueStorageCleanup,
  getStorageCleanup,
  claimStorageCleanup,
  completeStorageCleanupObject,
  retryStorageCleanupObject,
  processStorageCleanup,
} = repository;
