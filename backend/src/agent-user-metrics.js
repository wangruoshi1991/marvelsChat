import { query } from "./db.js";

// Count delivered messages and completed workspace rounds, not retries or nodes.
export function mapAgentUserMetrics(row = {}) {
  const count = (value) => {
    const parsed = Number(value ?? 0);
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new TypeError("Agent metric count is invalid");
    return parsed;
  };
  const successfulConversations = count(row.successful_conversations);
  const completedWorkspaceRounds = count(row.completed_workspace_rounds);
  const completedInteractions = count(successfulConversations + completedWorkspaceRounds);
  return {
    version: 1,
    completedInteractions,
    successfulConversations,
    completedWorkspaceRounds,
    level: 1 + Math.floor(completedInteractions / 10),
    levelProgress: completedInteractions % 10,
    levelTarget: 10,
    preferenceMatchPercent: null,
    preferenceMatchStatus: "not_evaluated",
  };
}

export async function listAgentUserMetrics(userId, agentIds, queryFn = query) {
  const keys = [...new Set(agentIds)];
  if (!keys.length) return new Map();
  const rows = await queryFn(`WITH conversations AS (
    SELECT runs.agent_id, COUNT(DISTINCT runs.output_message_id)::integer AS successful_conversations
      FROM agent_runs runs
      JOIN chat_messages message ON message.id = runs.output_message_id AND message.user_id = runs.user_id
     WHERE runs.user_id = ? AND runs.agent_id = ANY(?::text[])
       AND runs.status = 'success' AND runs.lifecycle_status = 'succeeded'
       AND runs.output_message_id IS NOT NULL
       AND jsonb_exists(message.metadata, 'agentWorkspace') IS NOT TRUE
     GROUP BY runs.agent_id
  ), workspace_rounds AS (
    SELECT completed.agent_id, COUNT(*)::integer AS completed_workspace_rounds
      FROM (
        SELECT DISTINCT n.agent_id, n.workspace_id, n.round_number
          FROM agent_workspace_nodes n
          JOIN agent_workspace_rounds r ON r.workspace_id = n.workspace_id
            AND r.user_id = n.user_id AND r.round_number = n.round_number
         WHERE n.user_id = ? AND n.agent_id = ANY(?::text[])
           AND n.status = 'succeeded' AND r.status = 'succeeded'
      ) completed GROUP BY completed.agent_id
  )
  SELECT k.agent_id, COALESCE(c.successful_conversations, 0) AS successful_conversations,
         COALESCE(w.completed_workspace_rounds, 0) AS completed_workspace_rounds
    FROM unnest(?::text[]) AS k(agent_id)
    LEFT JOIN conversations c ON c.agent_id = k.agent_id
    LEFT JOIN workspace_rounds w ON w.agent_id = k.agent_id`,
  [userId, keys, userId, keys, keys]);
  return new Map(rows.map((row) => [row.agent_id, mapAgentUserMetrics(row)]));
}
