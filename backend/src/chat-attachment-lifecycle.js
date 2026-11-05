import { config } from './config.js';
import { withTransaction } from './db.js';

export async function collectExpiredChatAttachments({ limits = config.chatAttachments, transact = withTransaction } = {}) {
  return transact(async connection => {
    await connection.query("SET LOCAL statement_timeout='10s'");
    await connection.query("SET LOCAL lock_timeout='1s'");
    const candidates = await connection.query(`SELECT a.id FROM chat_attachments a
      WHERE a.created_at < clock_timestamp() - (? * INTERVAL '1 hour')
        AND NOT EXISTS(SELECT 1 FROM chat_attachment_references r WHERE r.attachment_id=a.id)
      ORDER BY a.created_at,a.id LIMIT ? FOR UPDATE OF a SKIP LOCKED`, [limits.draftRetentionHours, limits.cleanupBatchSize]);
    if (!candidates.length) return { deletedCount: 0, deletedBytes: 0 };
    // A distinct statement gets a fresh READ COMMITTED snapshot after locking.
    // A concurrent send either holds its key-share lock or has now committed a
    // reference. Do not collapse selection/deletion into one stale CTE snapshot.
    const removed = await connection.query(`DELETE FROM chat_attachments a WHERE a.id=ANY(?::uuid[])
      AND a.created_at < clock_timestamp() - (? * INTERVAL '1 hour')
      AND NOT EXISTS(SELECT 1 FROM chat_attachment_references r WHERE r.attachment_id=a.id)
      RETURNING a.byte_size`, [candidates.map(item => item.id), limits.draftRetentionHours]);
    return { deletedCount: removed.length, deletedBytes: removed.reduce((sum, row) => sum + row.byte_size, 0) };
  });
}

export async function readChatAttachmentCapacity({ limits = config.chatAttachments, queryFn = null, transact = withTransaction } = {}) {
  if (!queryFn) return transact(async connection => {
    await connection.query('SET TRANSACTION READ ONLY');
    await connection.query("SET LOCAL statement_timeout='10s'");
    return readChatAttachmentCapacity({limits,queryFn:connection.query});
  });
  const [totals] = await queryFn(`WITH per_user AS (
      SELECT user_id,count(*) AS count,COALESCE(sum(byte_size),0) AS bytes FROM chat_attachments GROUP BY user_id
    ) SELECT COALESCE(sum(count),0)::bigint AS count,COALESCE(sum(bytes),0)::bigint AS bytes,
      count(*) FILTER(WHERE bytes >= ? * 0.8 OR count >= ? * 0.8)::int AS near_user_limit_count
    FROM per_user`, [limits.userMaxBytes, limits.userMaxCount]);
  const [expired] = await queryFn(`SELECT count(*)::int AS count,COALESCE(sum(a.byte_size),0)::bigint AS bytes FROM chat_attachments a
    WHERE a.created_at < clock_timestamp() - (? * INTERVAL '1 hour')
    AND NOT EXISTS(SELECT 1 FROM chat_attachment_references r WHERE r.attachment_id=a.id)`, [limits.draftRetentionHours]);
  const byteCount = Number(totals.bytes), attachmentCount = Number(totals.count);
  return { storedBytes: byteCount, attachmentCount, expiredDraftBytes: Number(expired.bytes), expiredDraftCount: Number(expired.count),
    nearUserLimitCount: totals.near_user_limit_count,
    globalNearCapacity: byteCount >= limits.globalMaxBytes * 0.8 || attachmentCount >= limits.globalMaxCount * 0.8,
    limits };
}

export function createChatAttachmentMaintenance({ collect = collectExpiredChatAttachments, inspect = readChatAttachmentCapacity,
  intervalMs = config.chatAttachments.maintenanceIntervalMs, logger = console } = {}) {
  let timer, pending = null, stopped = false;
  const runOnce = () => {
    if (stopped || pending) return Promise.resolve(false);
    pending = (async () => {
      // Assign pending before even a synchronous dependency failure can settle.
      await Promise.resolve();
      try {
        const removed = await collect();
        const capacity = await inspect();
        if (!stopped) logger.log(JSON.stringify({ type: 'chat_attachment_maintenance', ...removed, ...capacity,
          capacityWarning: capacity.globalNearCapacity || capacity.nearUserLimitCount > 0 }));
        return true;
      } catch {
        if (!stopped) logger.error(JSON.stringify({ type: 'chat_attachment_maintenance_failed', code: 'CHAT_ATTACHMENT_MAINTENANCE_FAILED' }));
        return false;
      } finally { pending = null; }
    })();
    return pending;
  };
  return { runOnce,
    start() { if (timer || stopped) return; runOnce(); timer = setInterval(runOnce, intervalMs); timer.unref?.(); },
    async stop() { stopped = true; clearInterval(timer); if (pending) await pending; },
  };
}
