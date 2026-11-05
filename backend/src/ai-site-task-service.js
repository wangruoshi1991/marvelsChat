import crypto from "node:crypto";
import { z } from "zod";
import { getAgent } from "../../agents/registry.js";
import { withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { mapProfile, publicUser } from "./repository-mappers.js";
import { advanceAITask, createAITaskInTransaction, finishAITask } from "./ai-task-repository.js";
import { buildSiteDraftResponse, validateSiteDraftContent } from "./site-builder-service.js";
import { applyStationSiteDraft, createStationSiteDraft } from "./station-agent-repository.js";
import { hashSiteDocumentValue, readSiteDocumentResources, validateStoredSiteDocument } from "./site-document-repository.js";
import { agentScopesMatchDeclaration, assertAgentProductEntitlement } from "./ai-agent-access.js";

export const siteTaskRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(1200),
  idempotencyKey: z.string().min(8).max(160),
}).strict();

const requiredScopes = ["profile:read", "station:read", "station:write"];
const approvalLifetimeMs = 30 * 60 * 1000;
export const hashSiteTaskValue = hashSiteDocumentValue;
const fail = (status, code, message) => { throw new HttpError(status, message, { code }); };

async function authorize(connection, userId, agent, { write = false, lockProfile = true } = {}) {
  const users = await connection.query("SELECT * FROM users WHERE id = ? FOR SHARE", [userId]);
  if (!users[0] || users[0].status !== "active") fail(403, "SITE_TASK_ACCESS_REVOKED", "账号当前不可执行建站任务。");
  const grants = await connection.query("SELECT enabled, granted_scopes FROM user_agents WHERE user_id = ? AND agent_id = 'site-builder' FOR SHARE", [userId]);
  if (!grants[0]?.enabled || !agentScopesMatchDeclaration(agent, grants[0].granted_scopes)) {
    fail(403, "SITE_TASK_ACCESS_REVOKED", "建站 Agent 授权已撤回或范围已变化，请在“我”移除后重新添加。");
  }
  await assertAgentProductEntitlement({ userId, agent, queryFn: connection.query.bind(connection) });
  const profiles = await connection.query(`SELECT p.*, u.ai_id FROM user_profiles p
    JOIN users u ON u.id = p.user_id
    WHERE p.user_id = ?${lockProfile ? ` FOR ${write ? "UPDATE" : "SHARE"} OF p` : ""}`, [userId]);
  if (!profiles[0]) fail(404, "SITE_TASK_PROFILE_MISSING", "小站资料不存在。");
  const profile = mapProfile(profiles[0]);
  // Exclude activity counters/timestamps; protect all editable planner context.
  const profileHash = hashSiteTaskValue({
    nickname: profile.nickname, bio: profile.bio, headline: profile.headline,
    publicLocation: profile.publicLocation, experienceYears: profile.experienceYears,
    languages: profile.languages, community: profile.community, activityArea: profile.activityArea,
    avatarConfig: profile.avatarConfig, stationConfig: profile.stationConfig,
  });
  return { user: publicUser(users[0]), profile, profileHash };
}

async function stationContext(connection, userId) {
  // No signed URLs, storage keys, unrelated conversations, or file contents.
  const mediaAssets = await connection.query(`SELECT id, kind, caption, original_filename AS "originalFilename", tags,
    content_revision_at::text AS "contentRevision"
    FROM station_media_assets WHERE user_id = ? AND status = 'uploaded' AND deleted_at IS NULL
    ORDER BY created_at DESC, id DESC LIMIT 12 FOR SHARE`, [userId]);
  const diaryEntries = await connection.query(`SELECT id, title, body, updated_at::text AS "updatedAt" FROM station_diary_entries
    WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 8 FOR SHARE`, [userId]);
  const albums = await connection.query(`SELECT id, title FROM station_albums
    WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 8 FOR SHARE`, [userId]);
  const outfits = await connection.query(`SELECT id, title, note FROM station_outfits
    WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 6 FOR SHARE`, [userId]);
  return { mediaAssets, diaryEntries, albums, outfits };
}

export function createSiteTaskService({
  transaction = withTransaction, loadAgent = getAgent,
  createTask = createAITaskInTransaction, finishTask = finishAITask,
  advanceTask = advanceAITask,
  generate = buildSiteDraftResponse, createDraft = createStationSiteDraft,
  applyDraft = applyStationSiteDraft, now = () => Date.now(),
} = {}) {
  const registeredAgent = async expectedVersion => {
    const agent = await loadAgent("site-builder");
    if (!agent || !requiredScopes.every(scope => agent.permissions.includes(scope)) ||
      (expectedVersion && agent.version !== expectedVersion)) {
      fail(409, "SITE_TASK_AGENT_CHANGED", "建站 Agent 已变更，请重新创建任务。");
    }
    return agent;
  };

  const submitSiteTask = async ({ user, prompt, idempotencyKey }) => {
    const body = siteTaskRequestSchema.parse({ prompt, idempotencyKey });
    const agent = await registeredAgent();
    return transaction(async connection => {
      // A replay can lock an existing task; do not hold a profile lock before
      // that task lock, since confirmation acquires task then profile.
      await authorize(connection, user.id, agent, { lockProfile: false });
      const { task } = await createTask(connection, {
        userId: user.id, kind: "site_draft", agentId: agent.key, agentVersion: agent.version,
        input: { prompt: body.prompt }, idempotencyKey: body.idempotencyKey,
        requestHash: hashSiteTaskValue({ prompt: body.prompt }), phase: "queued",
      });
      return task;
    });
  };

  const executeSiteTask = async record => {
    if (record.kind !== "site_draft" || record.agentId !== "site-builder") fail(400, "SITE_TASK_INVALID", "任务类型无效。");
    const agent = await registeredAgent(record.agentVersion);
    const prompt = siteTaskRequestSchema.shape.prompt.parse(record.input?.prompt);
    const context = await transaction(async connection => {
      const authorized = await authorize(connection, record.userId, agent);
      return { ...authorized, stationContent: await stationContext(connection, record.userId) };
    });
    const contextHash = hashSiteTaskValue(context.stationContent);
    await advanceTask({ taskId: record.id, claimToken: record.claimToken, phase: "generating", expectedPhase: "validating" });
    const generation = await generate({
      prompt, user: context.user, profile: context.profile, stationContent: context.stationContent,
      beforeModelCall: async () => transaction(async connection => {
        const currentAgent = await registeredAgent(record.agentVersion);
        await authorize(connection, record.userId, currentAgent);
      }),
    });
    validateSiteDraftContent(generation.draft);
    return finishTask({
      taskId: record.id, claimToken: record.claimToken,
      status: "awaiting_confirmation", phase: "awaiting_confirmation",
      complete: async (connection, current) => {
        const currentAgent = await registeredAgent(current.agentVersion);
        const latest = await authorize(connection, current.userId, currentAgent);
        if (latest.profileHash !== context.profileHash) fail(409, "SITE_TASK_PROFILE_CHANGED", "生成期间小站资料已变化，请重新创建任务。");
        if (hashSiteTaskValue(await stationContext(connection, current.userId)) !== contextHash) {
          fail(409, "SITE_TASK_RESOURCES_CHANGED", "生成期间建站引用内容已变化，请重新生成方案。");
        }
        const draft = await createDraft({ userId: current.userId, prompt, ...generation, connection });
        validateStoredSiteDocument(draft.draft, draft.id);
        const { resourcesHash } = await readSiteDocumentResources(connection, current.userId, draft.draft);
        return {
          artifacts: [{ kind: "site_draft", id: draft.id, title: draft.draft.title }],
          approval: {
            id: crypto.randomUUID(), draftId: draft.id, draftHash: hashSiteTaskValue(draft.draft),
            profileHash: latest.profileHash, resourcesHash, expiresAt: new Date(now() + approvalLifetimeMs).toISOString(),
          },
        };
      },
    });
  };

  const confirmSiteTask = async (connection, record, { approvalId, userId }) => {
    if (record.userId !== userId || record.kind !== "site_draft" || record.agentId !== "site-builder") {
      fail(404, "SITE_TASK_NOT_FOUND", "建站任务不存在。");
    }
    const agent = await registeredAgent(record.agentVersion);
    const approval = record.approval;
    if (record.status !== "awaiting_confirmation" || !approval || approval.id !== approvalId) {
      fail(409, "SITE_TASK_CONFIRMATION_CHANGED", "确认内容已变化，请刷新任务。");
    }
    if (!Number.isFinite(Date.parse(approval.expiresAt)) || Date.parse(approval.expiresAt) <= now()) {
      fail(409, "SITE_TASK_APPROVAL_EXPIRED", "建站确认已过期，请重新创建任务。");
    }
    const context = await authorize(connection, userId, agent, { write: true });
    if (context.profileHash !== approval.profileHash) fail(409, "SITE_TASK_PROFILE_CHANGED", "小站资料已变化，不能应用旧方案。");
    const rows = await connection.query(`SELECT * FROM station_site_drafts
      WHERE id = ? AND user_id = ? AND source = 'model' AND deleted_at IS NULL FOR UPDATE`, [approval.draftId, userId]);
    if (rows[0]) validateStoredSiteDocument(rows[0].draft, rows[0].id);
    if (!rows[0] || rows[0].status !== "draft" || hashSiteTaskValue(rows[0].draft) !== approval.draftHash) {
      fail(409, "SITE_TASK_DRAFT_CHANGED", "建站草稿已变化或不可用。");
    }
    const { resourcesHash } = await readSiteDocumentResources(connection, userId, rows[0].draft);
    if (!approval.resourcesHash || resourcesHash !== approval.resourcesHash) {
      fail(409, "SITE_TASK_RESOURCES_CHANGED", "建站引用内容已变化，请重新生成方案。");
    }
    const { siteDraft } = await applyDraft({ userId, draftId: approval.draftId, connection });
    return { artifacts: [{ kind: "site_draft", id: siteDraft.id, title: siteDraft.draft.title }], approval: null };
  };

  return { submitSiteTask, executeSiteTask, confirmSiteTask };
}

export const { submitSiteTask, executeSiteTask, confirmSiteTask } = createSiteTaskService();
