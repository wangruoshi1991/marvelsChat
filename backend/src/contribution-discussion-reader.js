import crypto from "node:crypto";
import { getAgent } from "../../agents/registry.js";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { readContributionDiscussionContext } from "./agent-workspace-service.js";
import { workspaceContextSchema } from "./workspace-discussion-contract.js";
import { validateDiscussionHistory } from "./workspace-discussion-history.js";

const unavailable = () => new HttpError(409, "原贡献或讨论已不可访问，请重新查看任务与授权。", { code: "WORKSPACE_CONTRIBUTION_UNAVAILABLE" });
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Protected discussion text is never ordinary message content. Each visible
// read follows the same source/entitlement gate as the selected result itself.
export function createContributionDiscussionReader({ transaction = withTransaction, runQuery = query,
  readContribution = readContributionDiscussionContext, loadAgent = getAgent } = {}) {
  return async ({ userId, threadId, messageId }) => {
    const [identity] = await runQuery(`SELECT m.metadata,t.agent_id FROM chat_messages m
      JOIN chat_threads t ON t.id=m.thread_id AND t.user_id=m.user_id
      WHERE m.id=? AND m.user_id=? AND t.id=? AND t.kind='agent'
        AND m.sender_type='agent' AND m.deleted_at IS NULL AND m.recalled_at IS NULL`, [messageId, userId, threadId]);
    const stored = identity?.metadata?.workspaceContext;
    if (!identity) throw new HttpError(404, "讨论消息不存在或不可访问。", { code: "WORKSPACE_CONTRIBUTION_UNAVAILABLE" });
    const selector = stored && workspaceContextSchema.safeParse({ id: stored.id, revision: stored.revision,
      currentRound: stored.currentRound, nodeId: stored.nodeId });
    if (!selector?.success || !selector.data.nodeId || !identity.metadata.workspaceContributionDiscussion) throw unavailable();
    return transaction(async connection => {
      // Match the aggregate -> source -> message lock order used by execution.
      const [workspace] = await connection.query("SELECT id FROM agent_workspaces WHERE id=? AND user_id=? FOR UPDATE", [selector.data.id, userId]);
      if (!workspace) throw unavailable();
      const selected = await readContribution({ connection, userId, agentId: identity.agent_id, selector: selector.data });
      const [row] = await connection.query(`SELECT output.metadata, input.metadata AS input_metadata FROM agent_runs run
        JOIN chat_messages output ON output.id=run.output_message_id
        JOIN chat_messages input ON input.id=run.input_message_id
        WHERE run.user_id=? AND run.thread_id=? AND run.agent_id=? AND run.status='success' AND run.run_type='chat'
          AND output.id=? AND output.user_id=? AND output.thread_id=?
          AND input.user_id=? AND input.thread_id=?
          AND output.deleted_at IS NULL AND output.recalled_at IS NULL AND input.deleted_at IS NULL AND input.recalled_at IS NULL
        FOR SHARE OF output,input`, [userId, threadId, identity.agent_id, messageId, userId, threadId, userId, threadId]);
      const protectedReply = row?.metadata?.workspaceContributionDiscussion;
      const agent = await loadAgent(identity.agent_id);
      if (!row || row.metadata.workspaceDiscussion?.mode !== "discussContribution" ||
          row.metadata.workspaceDiscussion.agentVersion !== agent?.version ||
          JSON.stringify(row.metadata.workspaceContext) !== JSON.stringify(identity.metadata.workspaceContext) ||
          JSON.stringify(row.input_metadata.workspaceContext) !== JSON.stringify(row.metadata.workspaceContext) ||
          protectedReply?.sourceHash !== hash(selected) || typeof protectedReply.reply !== "string") throw unavailable();
      await validateDiscussionHistory(connection, { userId, threadId,
        history: row.input_metadata.workspaceDiscussion?.history, transitive: true });
      return { content: protectedReply.reply };
    });
  };
}

export const readContributionDiscussion = createContributionDiscussionReader();
