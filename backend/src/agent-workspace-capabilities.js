import { z } from "zod";
import { getAgent, validateAgentWorkspaceCapabilities } from "../../agents/registry.js";
import { withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { mapProfile } from "./repository-mappers.js";
import { aiContextReferenceSchema, resolveAIContextReferences } from "./ai-context.js";
import { runAgent } from "./agent-runtime.js";
import { createAlbumAssistantTools } from "./album-assistant-tools.js";
import { mediaRetrievalUserService } from "./media-retrieval-default-service.js";
import { buildSiteDraftResponse, validateSiteDraftContent } from "./site-builder-service.js";
import { hashSiteDocumentValue } from "./site-document-repository.js";
import { collectSiteDocumentReferences } from "../../shared/site-document.js";
import { agentScopesMatchDeclaration } from "./ai-agent-access.js";

const fail = (status, code, message) => { throw new HttpError(status, message, { code }); };
const executorContracts = Object.freeze({
  "album-manager/media.select": {
    inputKinds: ["station-album"], dependencyKinds: [], outputKind: "media_selection", requiredScopes: ["album:read"],
  },
  "site-builder/site.compose": {
    inputKinds: ["chat-message", "station-photo", "station-diary"], dependencyKinds: ["media_selection", "text_result"], outputKind: "site_draft",
    requiredScopes: ["profile:read", "messages:read", "station:read", "station:write", "album:read"],
  },
  "file-preprocessor/text.summarize": {
    inputKinds: ["chat-message"], dependencyKinds: ["text_result"], outputKind: "text_result", requiredScopes: ["messages:read"],
  },
  "comic-diary/comic.storyboard": {
    inputKinds: ["chat-message", "station-diary", "station-photo"], dependencyKinds: ["text_result", "media_selection"], outputKind: "text_result", requiredScopes: ["messages:read", "station:read", "album:read"],
  },
  "video-production/video.script": {
    inputKinds: ["chat-message", "station-diary", "station-photo"], dependencyKinds: ["text_result", "media_selection"], outputKind: "text_result", requiredScopes: ["messages:read", "station:read", "album:read"],
  },
  "virtual-character/character.advise": {
    inputKinds: ["chat-message"], dependencyKinds: ["text_result"], outputKind: "text_result", requiredScopes: ["messages:read"],
  },
  "model-3d/model.advise": {
    inputKinds: ["chat-message"], dependencyKinds: ["text_result"], outputKind: "text_result", requiredScopes: ["messages:read"],
  },
  "miaoxun-butler/text.synthesize": {
    inputKinds: ["chat-message", "station-diary", "station-photo"], dependencyKinds: ["text_result", "media_selection"], outputKind: "text_result", requiredScopes: ["messages:read", "station:read", "album:read"],
  },
});
const sameSet = (a, b) => a.length === b.length && a.every(value => b.includes(value));

// A declared label is not an executable tool. Declarations must match a tested
// executor contract; malformed/mismatched registrations fail closed.
function registeredWorkspaceCapabilities(registeredAgents) {
  const catalogue = [];
  for (const agent of registeredAgents) {
    if (!agent.workspaceCapabilities?.length) continue;
    // listAgents returns data-only registry entries; coordinate is not a specialist.
    const specialist = { ...agent, workspaceCapabilities: agent.workspaceCapabilities.filter(entry => entry.outputKind !== "workspace_decision") };
    if (!specialist.workspaceCapabilities.length) continue;
    validateAgentWorkspaceCapabilities(specialist, { runtimeModes: agent.runtimeModes });
    for (const declaration of specialist.workspaceCapabilities) {
      const contract = executorContracts[`${agent.key}/${declaration.capability}`];
      if (!contract || contract.outputKind !== declaration.outputKind ||
        (declaration.outputKind === "text_result" && typeof agent.contribute !== "function" && !agent.runtimeModes?.includes("contribute")) ||
        ["inputKinds", "dependencyKinds", "requiredScopes"].some(key => !sameSet(contract[key], declaration[key]))) {
        fail(503, "WORKSPACE_CAPABILITY_UNAVAILABLE", "Agent 能力声明没有匹配的执行器。");
      }
      catalogue.push({ agent, entry: { agentId: agent.key, agentVersion: agent.version, ...declaration } });
    }
  }
  return catalogue;
}

function capabilityHasGrant({ agent, entry }, grants) {
  const grant = grants.find(item => item.agentId === agent.key);
  return Boolean(grant?.enabled && agentScopesMatchDeclaration(agent, grant.grantedScopes) &&
    entry.requiredScopes.every(scope => grant.grantedScopes.includes(scope) && agent.permissions.includes(scope)));
}

export function listExecutableWorkspaceCapabilities({ registeredAgents, grants }) {
  return registeredWorkspaceCapabilities(registeredAgents).filter(item => capabilityHasGrant(item, grants)).map(item => item.entry);
}

// These diagnostics explain supported but unavailable capabilities. They carry
// no executable grant, private source data or authority expansion. Identities
// only let the coordinator request access to a supported unavailable capability.
// Both catalogues share the exact registry-to-executor contract validation.
export function listUnavailableWorkspaceCapabilities({ registeredAgents, grants, authority = null }) {
  const diagnostics = [];
  for (const item of registeredWorkspaceCapabilities(registeredAgents)) {
    const granted = capabilityHasGrant(item, grants);
    if (granted && (!authority || authority.capabilities.some(snapshot =>
      hashSiteDocumentValue(snapshot) === hashSiteDocumentValue(item.entry)))) continue;
    diagnostics.push({ agentId: item.agent.key, agentName: item.agent.name, capability: item.entry.capability,
      requiredScopes: [...item.entry.requiredScopes], description: item.entry.description,
      reason: granted ? "new_task_required" : "authorization_required" });
  }
  return diagnostics;
}

export const hashWorkspaceProfile = profile => hashSiteDocumentValue({
  nickname: profile.nickname, bio: profile.bio, headline: profile.headline,
  publicLocation: profile.publicLocation, experienceYears: profile.experienceYears,
  languages: profile.languages, community: profile.community, activityArea: profile.activityArea,
  avatarConfig: profile.avatarConfig, stationConfig: profile.stationConfig,
});

async function profileForSources(connection, userId) {
  const rows = await connection.query(`SELECT p.*, u.ai_id FROM user_profiles p
    JOIN users u ON u.id = p.user_id WHERE p.user_id = ? FOR SHARE OF p`, [userId]);
  if (!rows[0]) fail(404, "WORKSPACE_PROFILE_MISSING", "小站资料不存在。");
  const profile = mapProfile(rows[0]);
  return { profile, profileHash: hashWorkspaceProfile(profile) };
}

async function resolveReferences(connection, userId, refs, scopes) {
  const references = [];
  const context = [];
  // A node may receive several selections (each up to ten assets). The public
  // request still limits user-picked references to six; each delegated identity
  // is validated with the same ownership/version resolver independently.
  for (const ref of [...refs].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`))) {
    const resolved = await resolveAIContextReferences({ userId, refs: [ref], grantedScopes: scopes,
      queryFn: connection.query.bind(connection), lock: true });
    references.push(...resolved.references);
    context.push(...resolved.context);
  }
  return { references, context };
}

async function readExactSiteSources(connection, userId, sourceReferences) {
  const resolved = await resolveReferences(connection, userId, sourceReferences, ["album:read", "station:read", "messages:read"]);
  const assetIds = resolved.references.filter(ref => ref.kind === "station-photo").map(ref => ref.id);
  const diaryIds = resolved.references.filter(ref => ref.kind === "station-diary").map(ref => ref.id);
  const mediaAssets = assetIds.length ? await connection.query(`SELECT id, kind, caption, original_filename AS "originalFilename", tags,
    content_revision_at::text AS "contentRevision", updated_at::text AS "updatedAt" FROM station_media_assets
    WHERE user_id = ? AND id = ANY(?::text[]) AND status = 'uploaded' AND deleted_at IS NULL ORDER BY id FOR SHARE`, [userId, assetIds]) : [];
  const diaryEntries = diaryIds.length ? await connection.query(`SELECT id, title, body, mood, updated_at::text AS "updatedAt"
    FROM station_diary_entries WHERE user_id = ? AND id = ANY(?::text[]) AND deleted_at IS NULL ORDER BY id FOR SHARE`, [userId, diaryIds]) : [];
  if (!sameSet(assetIds, mediaAssets.map(item => item.id)) || !sameSet(diaryIds, diaryEntries.map(item => item.id))) {
    fail(409, "WORKSPACE_SOURCES_CHANGED", "交付资源已变化或不可访问。");
  }
  const stationContent = { mediaAssets, diaryEntries, albums: [], outfits: [] };
  return { stationContent, sourceReferences: resolved.references, sourceHash: hashSiteDocumentValue(stationContent) };
}

// Called inside the workspace's finish/confirm transaction. This neither saves
// a draft nor applies profile changes; the owning service commits atomically.
export async function validateWorkspaceSiteSources(connection, userId, expected) {
  const current = { ...await profileForSources(connection, userId), ...await readExactSiteSources(connection, userId, expected.sourceReferences) };
  if (current.profileHash !== expected.profileHash) fail(409, "SITE_TASK_PROFILE_CHANGED", "小站资料已变化，请重新创建任务。");
  if (current.sourceHash !== expected.sourceHash) fail(409, "SITE_TASK_RESOURCES_CHANGED", "生成引用已变化，请重新创建任务。");
  return current;
}

function selectedNodeReferences(workspace, node, contract) {
  if (!Array.isArray(node.contextRefIndexes) || new Set(node.contextRefIndexes).size !== node.contextRefIndexes.length) {
    fail(422, "WORKSPACE_CONTEXT_INVALID", "节点引用索引无效。");
  }
  return node.contextRefIndexes.map(index => {
    const ref = Number.isInteger(index) && index >= 0 ? workspace.contextRefs[index] : null;
    if (!ref || !contract.inputKinds.includes(ref.kind) || !/^[a-f0-9]{64}$/.test(ref.version || "")) {
      fail(422, "WORKSPACE_CONTEXT_INVALID", "节点引用不匹配能力范围。");
    }
    return ref;
  });
}

const mediaArtifactSchema = z.object({
  kind: z.literal("media_selection"), title: z.string().min(1).max(160),
  assets: z.array(z.object({ id: z.string().uuid(), version: z.string().regex(/^[a-f0-9]{64}$/), kind: z.enum(["image", "video"]),
    matchedFrameTimestampMs: z.number().int().nonnegative().nullable() }).strict()).min(1).max(10),
  retrievalRunIds: z.array(z.string().uuid()).min(1).max(1),
}).strict();

async function readDeliveredMedia(connection, userId, asset, retrievalRunIds, allowedAlbumIds = null) {
  // Match the actual persisted retrieval event and current owner/content. The
  // completed event is also tied to the current consent epoch. No storage keys
  // or download URLs enter the handoff or coordinator context.
  const rows = await connection.query(`SELECT asset.id, asset.kind, asset.album_id AS "albumId", asset.caption,
    asset.original_filename AS "originalFilename", asset.tags, asset.content_revision_at::text AS "contentRevision",
    asset.updated_at::text AS "updatedAt" FROM station_media_assets asset
    WHERE asset.id = ? AND asset.user_id = ? AND asset.kind = ? AND asset.status = 'uploaded' AND asset.deleted_at IS NULL
    ${allowedAlbumIds ? "AND asset.album_id = ANY(?::text[])" : ""}
    AND EXISTS (SELECT 1 FROM agent_run_events event JOIN agent_runs run ON run.id = event.agent_run_id
      JOIN media_retrieval_profiles profile ON profile.user_id = event.user_id
      WHERE event.user_id = asset.user_id AND event.agent_run_id = ANY(?::text[]) AND event.event_type = 'completed'
      AND run.user_id = asset.user_id AND run.agent_id = 'media-retrieval' AND run.run_type = 'media-search'
      AND profile.index_state = 'enabled' AND profile.consent_version = 'media-retrieval-consent-v1'
      AND event.payload ->> 'indexEpoch' = profile.index_epoch::text AND asset.content_revision_at <= event.created_at
      AND (event.payload -> 'searchResponse' -> 'results') @> ?::jsonb) FOR SHARE OF asset`,
  [asset.id, userId, asset.kind, ...(allowedAlbumIds ? [allowedAlbumIds] : []), retrievalRunIds,
    JSON.stringify([{ mediaAssetId: asset.id, kind: asset.kind, matchedFrameTimestampMs: asset.matchedFrameTimestampMs }])]);
  if (!rows[0]) fail(409, "WORKSPACE_MEDIA_CHANGED", "检索素材已变化、超出相册范围或不可访问。");
  return rows[0];
}

async function lockMediaConsent(connection, userId) {
  const [profile] = await connection.query(`SELECT index_state, consent_version, index_epoch FROM media_retrieval_profiles
    WHERE user_id = ? FOR SHARE`, [userId]);
  if (profile?.index_state !== "enabled" || profile.consent_version !== "media-retrieval-consent-v1" ||
    !Number.isSafeInteger(Number(profile.index_epoch)) || Number(profile.index_epoch) < 1) {
    fail(403, "WORKSPACE_ACCESS_REVOKED", "相册 AI 授权已撤回，不能继续交付素材。");
  }
}

export async function validateWorkspaceMediaSources(connection, userId, artifact) {
  const parsed = mediaArtifactSchema.parse(artifact);
  await lockMediaConsent(connection, userId);
  if (new Set(parsed.assets.map(item => item.id)).size !== parsed.assets.length) fail(409, "WORKSPACE_MEDIA_INVALID", "素材交付重复。");
  for (const asset of parsed.assets) {
    if (asset.kind === "image" ? asset.matchedFrameTimestampMs !== null : !Number.isSafeInteger(asset.matchedFrameTimestampMs)) {
      fail(409, "WORKSPACE_MEDIA_INVALID", "素材类型或匹配时间无效。");
    }
    const current = await readDeliveredMedia(connection, userId, asset, parsed.retrievalRunIds);
    if (current.kind !== asset.kind || hashSiteDocumentValue(current) !== asset.version) {
      fail(409, "WORKSPACE_MEDIA_CHANGED", "素材交付版本已变化，请重新创建任务。");
    }
  }
  // The media delivery hash protects album membership and full precision
  // timestamps. General selected-context hashes are resolved separately; these
  // two version contracts must never be substituted for one another.
  return resolveReferences(connection, userId,
    parsed.assets.map(item => ({ kind: "station-photo", id: item.id })), ["album:read"]);
}

const textArtifactSchema = z.object({
  kind: z.literal("text_result"), title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(16000),
}).strict();
export function parseWorkspaceTextArtifact(value) {
  const checked = textArtifactSchema.safeParse(value);
  if (!checked.success) fail(422, "WORKSPACE_TEXT_INVALID", "文字成果无效。");
  return checked.data;
}
const sourceScope = { "chat-message": "messages:read", "station-album": "album:read", "station-photo": "album:read", "station-diary": "station:read" };

function exactSourceReferences(value) {
  const checked = z.array(aiContextReferenceSchema.extend({ version: z.string().regex(/^[a-f0-9]{64}$/) })).max(48).safeParse(value);
  if (!checked.success) fail(422, "WORKSPACE_TEXT_SOURCES_INVALID", "文字成果缺少完整的来源记录。");
  const refs = checked.data;
  if (new Set(refs.map(ref => `${ref.kind}:${ref.id}`)).size !== refs.length) fail(422, "WORKSPACE_TEXT_SOURCES_INVALID", "文字成果来源重复。");
  return refs;
}

function sourceIdentity(refs) {
  return hashSiteDocumentValue(refs.map(({ kind, id, version }) => ({ kind, id, version }))
    .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)));
}

// Used by the executor and the save transaction with authoritative node data.
// Derived text retains every original data boundary across explicit handoffs.
export async function collectWorkspaceTextSources(connection, userId, { sourceReferences, dependencyResults }, requiredScopes) {
  const sources = new Map();
  const add = refs => {
    for (const ref of exactSourceReferences(refs)) {
      if (!requiredScopes.includes(sourceScope[ref.kind])) fail(403, "AI_CONTEXT_SCOPE_REQUIRED", "此 Agent 未获准读取前序成果的原始来源。");
      const key = `${ref.kind}:${ref.id}`;
      if (sources.has(key) && sources.get(key).version !== ref.version) fail(409, "WORKSPACE_SOURCES_CHANGED", "不同交付包含冲突的来源版本。");
      sources.set(key, ref);
    }
  };
  add(sourceReferences);
  if (!Array.isArray(dependencyResults)) fail(422, "WORKSPACE_DEPENDENCY_INVALID", "文字节点缺少明确的成果依赖。");
  const dependencies = [];
  for (const dependency of dependencyResults) {
    if (dependency.result?.kind === "text_result") {
      const text = textArtifactSchema.safeParse(dependency.result);
      if (!text.success) fail(422, "WORKSPACE_TEXT_INVALID", "前序文字成果无效。");
      add(dependency.sourceReferences);
      dependencies.push(text.data);
    } else if (dependency.result?.kind === "media_selection") {
      add(dependency.sourceReferences);
      const delivered = await validateWorkspaceMediaSources(connection, userId, dependency.result);
      add(delivered.references);
      dependencies.push({ kind: "media_selection", title: dependency.result.title,
        assets: delivered.context.map(({ title, kind, caption }) => ({ title, kind, caption })) });
    } else fail(422, "WORKSPACE_DEPENDENCY_INVALID", "此文字能力不接受该成果类型。");
  }
  const references = exactSourceReferences([...sources.values()]);
  const resolved = await resolveReferences(connection, userId, references, requiredScopes);
  return { ...resolved, dependencies };
}

// The service supplies the independently collected source set when committing
// a node or accepting its final delivery; no omission or extra source is valid.
export async function validateWorkspaceTextSources(connection, userId, expected, requiredScopes, authoritativeSourceReferences = null) {
  if (!textArtifactSchema.safeParse(expected?.artifact).success) fail(422, "WORKSPACE_TEXT_INVALID", "文字成果无效。");
  const sources = exactSourceReferences(expected.sourceReferences);
  if (authoritativeSourceReferences !== null && sourceIdentity(sources) !== sourceIdentity(exactSourceReferences(authoritativeSourceReferences))) {
    fail(409, "WORKSPACE_TEXT_SOURCES_INVALID", "文字成果来源与实际交接不一致。");
  }
  return resolveReferences(connection, userId, sources, requiredScopes);
}

export function createWorkspaceCapabilityExecutor({ transaction = withTransaction, runAgentRuntime = runAgent,
  retrievalService = mediaRetrievalUserService, generateSite = buildSiteDraftResponse, loadAgent = getAgent } = {}) {
  return async function executeWorkspaceCapability({ workspace, node, user, assertAccess, beforeModelCall, afterModelCall }) {
    if (workspace.userId !== user.id || typeof assertAccess !== "function") fail(403, "WORKSPACE_ACCESS_REVOKED", "任务账号无效。");
    const agent = await loadAgent(node.agentId);
    if (!agent || agent.version !== node.agentVersion) fail(409, "WORKSPACE_AGENT_CHANGED", "Agent 已更新，请重新创建任务。");
    const declaration = agent.workspaceCapabilities?.find(item => item.capability === node.capability);
    const contract = executorContracts[`${node.agentId}/${node.capability}`];
    if (!declaration || !contract || !listExecutableWorkspaceCapabilities({ registeredAgents: [agent], grants: [{ agentId: agent.key,
      enabled: true, grantedScopes: agent.permissions }] }).some(entry => entry.capability === node.capability)) fail(422, "WORKSPACE_CAPABILITY_UNAVAILABLE", "该协作能力不可执行。");
    const refs = selectedNodeReferences(workspace, node, contract);
    const dependencies = node.dependencyResults;
    if (!Array.isArray(dependencies) || dependencies.some(item => !contract.dependencyKinds.includes(item.result?.kind))) {
      fail(422, "WORKSPACE_DEPENDENCY_INVALID", "节点成果依赖不匹配。");
    }
    await assertAccess();
    const guardedBeforeModelCall = async () => { await assertAccess(); return beforeModelCall ? beforeModelCall() : null; };

    if (contract.outputKind === "text_result") {
      const inputs = () => transaction(connection => collectWorkspaceTextSources(connection, user.id,
        { sourceReferences: refs, dependencyResults: dependencies }, contract.requiredScopes));
      const selected = await inputs();
      const beforeContributionCall = async () => { await assertAccess(); await inputs(); return beforeModelCall ? beforeModelCall() : null; };
      const result = await runAgentRuntime({ agentId: node.agentId, mode: "contribute", input: node.goal, user,
        thread: null, messages: [], appContext: { workspaceContribution: { selectedContext: selected.context, dependencies: selected.dependencies } },
        beforeModelCall: beforeContributionCall, afterModelCall });
      await assertAccess();
      const checked = textArtifactSchema.safeParse({ kind: "text_result", title: node.goal.trim().slice(0, 160), content: result.reply });
      if (!checked.success) fail(502, "WORKSPACE_TEXT_INVALID", "Agent 未交付有效文字成果。");
      const output = { artifact: checked.data, sourceReferences: selected.references };
      const current = await inputs();
      await transaction(connection => validateWorkspaceTextSources(connection, user.id, output, contract.requiredScopes, current.references));
      return { ...output, summary: "文字成果已完成", receipt: { provider: result.provider, tokenUsage: result.tokenUsage, latencyMs: result.latencyMs } };
    }

    if (contract.outputKind === "media_selection") {
      if (dependencies.length || (workspace.contextRefs.some(ref => ref.kind === "station-album") && !refs.length)) {
        fail(422, "WORKSPACE_CONTEXT_INVALID", "相册检索不能绕过用户所选的相册范围。");
      }
      const selected = await transaction(connection => resolveReferences(connection, user.id, refs, contract.requiredScopes));
      const allowedAlbumIds = refs.length ? refs.map(ref => ref.id) : null;
      const tools = createAlbumAssistantTools({
        userId: user.id, operationKey: `workspace:${workspace.id}:${node.id}`, service: retrievalService,
        allowedAlbumIds, assertAccess,
        beforeRetrievalCall: guardedBeforeModelCall, afterRetrievalCall: afterModelCall,
        listAlbums: (userId, name = "") => transaction(connection => connection.query(`SELECT id, title FROM station_albums
          WHERE user_id = ? AND deleted_at IS NULL AND title ILIKE ?${allowedAlbumIds ? " AND id = ANY(?::text[])" : ""}
          ORDER BY title, id LIMIT 51`, [userId, `%${name.replace(/[\\%_]/g, "\\$&")}%`, ...(allowedAlbumIds ? [allowedAlbumIds] : [])])),
      });
      const result = await runAgentRuntime({ agentId: node.agentId, input: node.goal, user,
        appContext: { workspaceTask: { selectedAlbums: selected.context, scope: allowedAlbumIds ? "selected-albums" : "owned-library" } },
        tools, beforeModelCall: guardedBeforeModelCall, afterModelCall });
      await assertAccess();
      const metadata = tools.metadata();
      if (metadata.outcome === "retrieval_unknown_charge_no_retry" || metadata.outcome === "retrieval_request_in_progress") {
        fail(504, "AI_PROVIDER_RESULT_UNKNOWN", "素材检索结果尚无法确认，不能自动重试或继续生成。");
      }
      if (metadata.outcome !== "found" || !tools.results().length || metadata.retrievalRunIds.length !== 1) {
        fail(422, "WORKSPACE_MEDIA_NOT_FOUND", "没有取得符合要求的素材，请调整目标后重新发起。");
      }
      const artifact = await transaction(async connection => {
        await lockMediaConsent(connection, user.id);
        await resolveReferences(connection, user.id, refs, contract.requiredScopes);
        const assets = [];
        for (const match of tools.results()) {
          const asset = { id: match.mediaAssetId, kind: match.kind, matchedFrameTimestampMs: match.matchedFrameTimestampMs };
          const current = await readDeliveredMedia(connection, user.id, asset, metadata.retrievalRunIds, allowedAlbumIds);
          assets.push({ ...asset, version: hashSiteDocumentValue(current) });
        }
        const artifact = mediaArtifactSchema.parse({ kind: "media_selection", title: "已找到的素材", assets, retrievalRunIds: metadata.retrievalRunIds });
        await validateWorkspaceMediaSources(connection, user.id, artifact);
        return artifact;
      });
      const delivered = await transaction(connection => validateWorkspaceMediaSources(connection, user.id, artifact));
      return { artifact, sourceReferences: [...selected.references, ...delivered.references], summary: `已找到 ${artifact.assets.length} 项素材`, receipt: { provider: result.provider, tokenUsage: result.tokenUsage, latencyMs: result.latencyMs } };
    }

    if (!dependencies.length && workspace.contextRefs.some(ref => ref.kind === "station-album")) {
      fail(422, "WORKSPACE_CONTEXT_INVALID", "所选相册需要真实素材成果，不能直接降级生成文字页面。");
    }
    if (!refs.length && !dependencies.length && workspace.contextRefs.some(ref => ["station-photo", "station-diary"].includes(ref.kind))) {
      fail(422, "WORKSPACE_CONTEXT_INVALID", "建站节点不能忽略用户所选素材后改为文字页面。");
    }
    const handoffs = await transaction(connection => collectWorkspaceTextSources(connection, user.id,
      { sourceReferences: refs, dependencyResults: dependencies }, contract.requiredScopes));
    const textHandoffs = handoffs.dependencies.filter(item => item.kind === "text_result");
    for (const source of handoffs.context.filter(item => item.kind === "chat-message" && refs.some(ref => ref.kind === item.kind && ref.id === item.id))) {
      textHandoffs.push({ kind: "text_result", title: source.title, content: source.content });
    }
    const context = await transaction(async connection => ({
      ...await profileForSources(connection, user.id),
      ...await readExactSiteSources(connection, user.id, handoffs.references),
    }));
    const beforeSiteCall = async () => {
      await assertAccess();
      await transaction(async connection => {
        await collectWorkspaceTextSources(connection, user.id, { sourceReferences: refs, dependencyResults: dependencies }, contract.requiredScopes);
        await validateWorkspaceSiteSources(connection, user.id, context);
      });
      return beforeModelCall ? beforeModelCall() : null;
    };
    const generation = await generateSite({ prompt: node.goal, user, profile: context.profile,
      stationContent: context.stationContent, textHandoffs, beforeModelCall: beforeSiteCall, afterModelCall });
    validateSiteDraftContent(generation.draft);
    await assertAccess();
    const used = collectSiteDocumentReferences(generation.draft);
    if (used.assetIds.some(id => !context.stationContent.mediaAssets.some(item => item.id === id)) ||
      used.diaryEntryIds.some(id => !context.stationContent.diaryEntries.some(item => item.id === id))) {
      fail(502, "SITE_BUILDER_INVALID_REFERENCES", "建站节点引用了未交付的资源。");
    }
    if (context.stationContent.mediaAssets.length && !used.assetIds.length) fail(502, "WORKSPACE_MEDIA_UNUSED", "建站节点未使用交付素材，不能将素材任务降级为文字页。");
    if (context.stationContent.diaryEntries.length && !used.diaryEntryIds.length) fail(502, "WORKSPACE_DIARY_UNUSED", "建站节点未使用所选日记。");
    await transaction(connection => validateWorkspaceSiteSources(connection, user.id, context));
    return { generation, summary: "页面草稿已完成", profileHash: context.profileHash,
      sourceReferences: context.sourceReferences, sourceHash: context.sourceHash,
      receipt: { provider: generation.model.provider, tokenUsage: generation.model.tokenUsage, latencyMs: generation.model.latencyMs } };
  };
}

export const executeWorkspaceCapability = createWorkspaceCapabilityExecutor();
