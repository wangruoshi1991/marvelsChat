import crypto from "node:crypto";
import { z } from "zod";
import { getAgent, listAgents } from "../../agents/registry.js";
import { config } from "./config.js";
import { withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { aiContextReferencesSchema, resolveAIContextReferences } from "./ai-context.js";
import { publicUser, mapStationMediaAsset } from "./repository-mappers.js";
import { runAgent } from "./agent-runtime.js";
import * as repository from "./agent-workspace-repository.js";
import { validateWorkspaceDecision } from "./agent-workspace-plan.js";
import { workspaceAccessInputRequest } from "./agent-workspace-input-request.js";
import { classifiedWorkspaceRejection } from "./agent-workspace-submission.js";
import { agentScopesMatchDeclaration } from "./ai-agent-access.js";
import { executeWorkspaceCapability, listExecutableWorkspaceCapabilities, listUnavailableWorkspaceCapabilities,
  validateWorkspaceMediaSources, validateWorkspaceSiteSources, validateWorkspaceTextSources,
  collectWorkspaceTextSources, parseWorkspaceTextArtifact } from "./agent-workspace-capabilities.js";
import { createStationSiteDraft, applyStationSiteDraft } from "./station-agent-repository.js";
import { hashSiteDocumentValue, readSiteDocumentResources, validateStoredSiteDocument } from "./site-document-repository.js";

const fail = (status, code, message) => { throw new HttpError(status, message, { code }); };
const coordinatorId = "miaoxun-butler";
const scopeFor = { "station-album": "album:read", "station-photo": "album:read", "station-diary": "station:read", "chat-message": "messages:read" };
const sourceIdentities = references => references.map(({ kind, id, version }) => `${kind}:${id}:${version}`).sort();
const assertExactSources = (actual, expected) => {
  if (!Array.isArray(actual) || actual.some(ref => !ref || typeof ref !== "object") ||
    new Set(actual.map(ref => `${ref.kind}:${ref.id}`)).size !== actual.length ||
    JSON.stringify(sourceIdentities(actual)) !== JSON.stringify(sourceIdentities(expected))) {
    fail(409, "WORKSPACE_SOURCES_CHANGED", "交付成果的来源不完整或已变化。");
  }
};
const planningArtifact = result => {
  const artifact = result?.artifact;
  if (!artifact) return null;
  const sourceKinds = [...new Set(result.sourceReferences.map(ref => ref.kind))].sort();
  if (artifact.kind === "media_selection") return { kind: artifact.kind, sourceKinds, assetCount: artifact.assets.length };
  return { kind: artifact.kind, sourceKinds };
};
export const workspaceRequestSchema = z.object({
  goal: z.string().trim().min(1).max(2000), idempotencyKey: z.string().min(8).max(160),
  contextRefs: aiContextReferencesSchema,
  source: z.object({ page: z.string().min(1).max(80), module: z.string().min(1).max(120).nullable() }).strict(),
}).strict();

export function createAgentWorkspaceService({ transaction = withTransaction, repo = repository,
  loadAgent = getAgent, loadAgents = listAgents, run = runAgent, executeCapability = executeWorkspaceCapability,
  createDraft = createStationSiteDraft, applyDraft = applyStationSiteDraft,
  limits = config.agentWorkspace, now = () => Date.now(),
} = {}) {
  async function access(connection, userId, lock = true) {
    const [user] = await connection.query(`SELECT * FROM users WHERE id = ?${lock ? " FOR SHARE" : ""}`, [userId]);
    if (!user || user.status !== "active") fail(403, "WORKSPACE_ACCESS_REVOKED", "账号当前不可执行协作任务。");
    const rows = await connection.query(`SELECT agent_id, enabled, granted_scopes FROM user_agents WHERE user_id = ? ORDER BY agent_id${lock ? " FOR SHARE" : ""}`, [userId]);
    return { user: publicUser(user), grants: rows.map(row => ({ agentId: row.agent_id, enabled: row.enabled, grantedScopes: row.granted_scopes })) };
  }
  async function coordinator(connection, workspace, lock = true) {
    const current = await access(connection, workspace.userId, lock);
    const agent = await loadAgent(coordinatorId);
    const expected = workspace.authority.coordinator;
    if (!agent || agent.version !== workspace.coordinatorVersion || typeof agent.coordinate !== "function") fail(409, "WORKSPACE_AGENT_CHANGED", "协调 Agent 已更新，请重新创建任务。");
    const grant = current.grants.find(item => item.agentId === coordinatorId);
    if (!expected || !grant?.enabled || !agentScopesMatchDeclaration(agent, grant.grantedScopes) || !expected.scopes.includes("agents:invoke") ||
      !expected.scopes.every(scope => grant.grantedScopes.includes(scope) && agent.permissions.includes(scope))) fail(403, "WORKSPACE_ACCESS_REVOKED", "妙讯管家授权已撤回或范围已变化，请在“我”移除后重新添加。");
    const selected = await resolveAIContextReferences({ userId: workspace.userId, refs: workspace.contextRefs,
      grantedScopes: expected.scopes, queryFn: connection.query.bind(connection), lock });
    return { ...current, selected };
  }
  async function catalogue(connection, workspace) {
    const current = await coordinator(connection, workspace);
    const registeredAgents = await loadAgents();
    const entries = listExecutableWorkspaceCapabilities({ registeredAgents, grants: current.grants });
    // A later grant does not expand a running task's original authority.
    return { ...current, unavailableCapabilities: listUnavailableWorkspaceCapabilities({ registeredAgents, grants: current.grants,
      authority: workspace.authority }), entries: entries.filter(entry => workspace.authority.capabilities.some(snapshot =>
      hashSiteDocumentValue(snapshot) === hashSiteDocumentValue(entry))) };
  }
  async function authorizeNode(connection, workspace, node) {
    const current = await catalogue(connection, workspace);
    if (node.capability === "workspace.coordinate") return current;
    const declared = current.entries.find(item => item.agentId === node.agentId && item.agentVersion === node.agentVersion && item.capability === node.capability);
    if (!declared) fail(403, "WORKSPACE_ACCESS_REVOKED", "专业 Agent 的授权或版本已变化，任务已停止。");
    await resolveAIContextReferences({ userId: workspace.userId, refs: node.contextRefIndexes.map(index => workspace.contextRefs[index]),
      grantedScopes: declared.requiredScopes, queryFn: connection.query.bind(connection), lock: true });
    return { ...current, declaration: declared };
  }
  async function dependencyDeliveries(connection, workspace, node) {
    const deliveries = [];
    for (const key of node.dependencies) {
      const dependency = workspace.nodes.find(item => item.key === key);
      if (!dependency || dependency.status !== "succeeded" || !dependency.result?.artifact) {
        fail(409, "WORKSPACE_DEPENDENCY_INVALID", "专业 Agent 所需成果尚未交付。");
      }
      const sourceReferences = await validateDelivery(connection, workspace, dependency);
      deliveries.push({ key, result: dependency.result.artifact, sourceReferences });
    }
    return deliveries;
  }
  async function nodeDeliverySources(connection, workspace, node, requiredScopes) {
    const dependencies = await dependencyDeliveries(connection, workspace, node);
    return collectWorkspaceTextSources(connection, workspace.userId, {
      sourceReferences: node.contextRefIndexes.map(index => workspace.contextRefs[index]),
      dependencyResults: dependencies,
    }, requiredScopes);
  }
  async function validateDelivery(connection, workspace, node, visited = new Set()) {
    if (!node) fail(409, "WORKSPACE_DEPENDENCY_INVALID", "协作成果依赖缺失。");
    if (visited.has(node.key)) fail(409, "WORKSPACE_DEPENDENCY_INVALID", "协作成果依赖循环。");
    visited.add(node.key);
    const authorized = await authorizeNode(connection, workspace, node);
    if (node.status !== "succeeded" || !node.result?.artifact) fail(409, "WORKSPACE_RESULT_UNAVAILABLE", "协作成果尚未完成。");
    const dependencies = [];
    for (const key of node.dependencies) {
      const dependency = workspace.nodes.find(item => item.key === key);
      if (!dependency) fail(409, "WORKSPACE_DEPENDENCY_INVALID", "协作成果依赖缺失。");
      const sourceReferences = await validateDelivery(connection, workspace, dependency, new Set(visited));
      dependencies.push({ key, result: dependency.result.artifact, sourceReferences });
    }
    if (node.result.artifact.kind === "media_selection") {
      const selected = node.contextRefIndexes.map(index => workspace.contextRefs[index]);
      const delivered = await validateWorkspaceMediaSources(connection, workspace.userId, node.result.artifact);
      const expected = [...new Map([...selected, ...delivered.references].map(ref => [`${ref.kind}:${ref.id}`, ref])).values()];
      assertExactSources(node.result.sourceReferences, expected);
      return expected;
    }
    else if (node.result.artifact.kind === "site_draft") {
      await validateWorkspaceSiteSources(connection, workspace.userId, node.result);
      const expected = await collectWorkspaceTextSources(connection, workspace.userId, {
        sourceReferences: node.contextRefIndexes.map(index => workspace.contextRefs[index]), dependencyResults: dependencies,
      }, authorized.declaration.requiredScopes);
      assertExactSources(node.result.sourceReferences, expected.references);
      return node.result.sourceReferences;
    }
    else if (node.result.artifact.kind === "text_result") {
      const expected = await collectWorkspaceTextSources(connection, workspace.userId, {
        sourceReferences: node.contextRefIndexes.map(index => workspace.contextRefs[index]), dependencyResults: dependencies,
      }, authorized.declaration.requiredScopes);
      await validateWorkspaceTextSources(connection, workspace.userId, node.result,
        authorized.declaration.requiredScopes, expected.references);
      return expected.references;
    }
    else fail(409, "WORKSPACE_RESULT_UNAVAILABLE", "协作成果类型不可用。");
  }

  const submitAgentWorkspace = async ({ user, connection: submissionConnection = null, authorityCeiling = null, ...request }) => {
    const body = workspaceRequestSchema.parse(request);
    const requestHash = hashSiteDocumentValue({ goal: body.goal, source: body.source,
      contextRefs: body.contextRefs.map(({ kind, id, version }) => ({ kind, id, ...(version ? { version } : {}) })) });
    const submit = async connection => {
      // Replayed outcomes still require a currently active, authenticated owner.
      // This read does not acquire resource locks before the submission lock.
      await access(connection, user.id, false);
      let previous;
      try {
        previous = await repo.findWorkspaceSubmission(connection, { userId: user.id, idempotencyKey: body.idempotencyKey, requestHash });
      } catch (error) {
        // Waiting for an earlier request must not expose its receipt after this
        // account was disabled. Do not replace SQL/transport failures here.
        if (error instanceof HttpError) await access(connection, user.id, false);
        throw error;
      }
      if (previous) { await access(connection, user.id, false); return { workspace: previous }; }
      await connection.query("SAVEPOINT workspace_submission_attempt");
      try {
        if (new Set(body.contextRefs.map(ref => `${ref.kind}:${ref.id}`)).size !== body.contextRefs.length) fail(400, "WORKSPACE_CONTEXT_INVALID", "所选上下文重复。");
        const agent = await loadAgent(coordinatorId);
        if (!agent || typeof agent.coordinate !== "function") fail(503, "WORKSPACE_CAPABILITY_UNAVAILABLE", "协调 Agent 不可用。");
        const registeredAgents = await loadAgents();
        const current = await access(connection, user.id, false);
        const scopes = [...new Set(["agents:invoke", ...body.contextRefs.map(ref => scopeFor[ref.kind])])];
        const grant = current.grants.find(item => item.agentId === coordinatorId);
        if (!grant?.enabled || !agentScopesMatchDeclaration(agent, grant.grantedScopes) || !scopes.every(scope => grant.grantedScopes.includes(scope) && agent.permissions.includes(scope))) fail(403, "WORKSPACE_ACCESS_REQUIRED", "请在“我”添加妙讯管家并确认全部权限；已有授权范围不同请移除后重新添加。");
        const entries = listExecutableWorkspaceCapabilities({ registeredAgents, grants: current.grants }).filter(entry =>
          !authorityCeiling || authorityCeiling.some(snapshot => hashSiteDocumentValue(snapshot) === hashSiteDocumentValue(entry)));
        const selected = await resolveAIContextReferences({ userId: user.id, refs: body.contextRefs, grantedScopes: scopes,
          queryFn: connection.query.bind(connection), lock: false });
        const authority = { coordinator: { scopes }, capabilities: entries };
        const saved = await repo.createWorkspaceInTransaction(connection, {
          userId: user.id, goal: body.goal, source: body.source, contextRefs: selected.references, authority,
          coordinatorVersion: agent.version, limits, idempotencyKey: body.idempotencyKey,
          requestHash,
        });
        if (!saved.reused) await coordinator(connection, { userId: user.id, contextRefs: selected.references, authority, coordinatorVersion: agent.version });
        await connection.query("RELEASE SAVEPOINT workspace_submission_attempt");
        return { workspace: saved.workspace };
      } catch (error) {
        const rejection = classifiedWorkspaceRejection(error);
        if (!rejection) throw error;
        // Roll back every partial node/workspace write, retain the key lock,
        // and commit a rejection that every late duplicate must replay.
        await connection.query("ROLLBACK TO SAVEPOINT workspace_submission_attempt");
        const rejected = await repo.rejectWorkspaceSubmission(connection, {
          userId: user.id, idempotencyKey: body.idempotencyKey, requestHash, ...rejection,
        });
        await connection.query("RELEASE SAVEPOINT workspace_submission_attempt");
        return { rejected };
      }
    };
    const outcome = submissionConnection ? await submit(submissionConnection) : await transaction(submit);
    if (outcome.rejected) throw outcome.rejected;
    return outcome.workspace;
  };

  const executeWorkspaceNode = async ({ node: requestedNode }) => {
    let { workspace, node } = await transaction(connection => repo.readActiveWorkspaceClaim(connection,
      { nodeId: requestedNode.id, claimToken: requestedNode.claimToken }));
    const assertAccess = () => transaction(async connection => {
      const latest = await repo.readActiveWorkspaceClaim(connection, { nodeId: node.id, claimToken: node.claimToken });
      workspace = latest.workspace; node = latest.node;
      const authorized = await authorizeNode(connection, workspace, node);
      await dependencyDeliveries(connection, workspace, node);
      if (["text_result", "site_draft"].includes(authorized.declaration?.outputKind)) {
        await nodeDeliverySources(connection, workspace, node, authorized.declaration.requiredScopes);
      }
      return authorized;
    });
    const current = await assertAccess();
    const beforeModelCall = async () => {
      return repo.reserveWorkspaceModelCall({ nodeId: node.id, claimToken: node.claimToken,
        authorize: async (connection, currentClaim) => {
          const authorized = await authorizeNode(connection, currentClaim.workspace, currentClaim.node);
          await dependencyDeliveries(connection, currentClaim.workspace, currentClaim.node);
          if (["text_result", "site_draft"].includes(authorized.declaration?.outputKind)) {
            await nodeDeliverySources(connection, currentClaim.workspace, currentClaim.node, authorized.declaration.requiredScopes);
          }
        },
      });
    };
    const afterModelCall = ({ receipt, ...metadata }) => repo.recordWorkspaceModelCall({
      nodeId: node.id, claimToken: node.claimToken, callNumber: receipt.nodeModelCalls, receipt: metadata,
    });
    if (node.capability === "workspace.coordinate") {
      const response = await run({ agentId: coordinatorId, mode: "coordinate", input: workspace.goal, user: current.user,
        appContext: { source: workspace.source,
          contextRefs: workspace.contextRefs.map(({ kind, id, version }, index) => ({ index, kind, id, version })),
          followups: workspace.followups, availableCapabilities: current.entries, unavailableCapabilities: current.unavailableCapabilities,
          steps: workspace.nodes.filter(item => item.capability !== "workspace.coordinate").map(item => ({
            key: item.key, agentId: item.agentId, capability: item.capability, goal: item.goal, dependencies: item.dependencies,
            status: item.status, result: planningArtifact(item.result),
          })),
        }, beforeModelCall, afterModelCall });
      const decision = validateWorkspaceDecision(response.reply, { workspace, catalogue: current.entries,
        unavailableCapabilities: current.unavailableCapabilities });
      return repo.finishWorkspaceNode({ nodeId: node.id, claimToken: node.claimToken, summary: decision.summary || decision.question,
        result: { decision }, complete: async (connection, { workspace: latest }) => {
          const available = await catalogue(connection, latest);
          const checked = validateWorkspaceDecision(response.reply, { workspace: latest, catalogue: available.entries,
            unavailableCapabilities: available.unavailableCapabilities });
          if (checked.type === "clarify") return { status: "waiting_input", question: checked.question, summary: "等待补充任务信息" };
          if (checked.type === "request_access") {
            const request = workspaceAccessInputRequest(checked);
            return { status: "waiting_input", question: request.question,
              summary: request.reason === "authorization_required" ? "需要确认 Agent 授权后新建任务" : "需要新建任务使用已授权能力",
              nodeResult: { decision: checked } };
          }
          if (checked.type === "plan") {
            await repo.insertWorkspaceNodes(connection, latest, checked.nodes);
            await repo.queueWorkspaceCoordinator(connection, latest, { dependencies: checked.nodes.map(item => item.key) });
            return { status: "running", summary: checked.summary };
          }
          const delivered = latest.nodes.find(item => item.key === checked.resultKey);
          const sourceReferences = await validateDelivery(connection, latest, delivered);
          const result = { artifact: delivered.result.artifact, resultKey: delivered.key, sourceReferences };
          if (["media_selection", "text_result"].includes(result.artifact.kind)) return { status: "succeeded", result, summary: checked.summary };
          const [draft] = await connection.query("SELECT * FROM station_site_drafts WHERE id = ? AND user_id = ? AND status = 'draft' AND deleted_at IS NULL FOR SHARE", [result.artifact.id, latest.userId]);
          if (!draft) fail(409, "WORKSPACE_RESULT_UNAVAILABLE", "页面草稿已变化。");
          validateStoredSiteDocument(draft.draft, draft.id);
          const { resourcesHash } = await readSiteDocumentResources(connection, latest.userId, draft.draft);
          return { status: "awaiting_confirmation", result, summary: checked.summary, approval: {
            id: crypto.randomUUID(), draftId: draft.id, draftHash: hashSiteDocumentValue(draft.draft),
            profileHash: delivered.result.profileHash, resourcesHash, expiresAt: new Date(now() + 30 * 60000).toISOString(),
          } };
        } });
    }
    const dependencyResults = await transaction(connection => dependencyDeliveries(connection, workspace, node));
    const output = await executeCapability({ workspace, node: { ...node, dependencyResults }, user: current.user,
      assertAccess, beforeModelCall, afterModelCall });
    return repo.finishWorkspaceNode({ nodeId: node.id, claimToken: node.claimToken, summary: output.summary,
      result: output.artifact ? { artifact: output.artifact, sourceReferences: output.sourceReferences } : null,
      complete: async (connection, { workspace: latest, node: finished }) => {
        const authorized = await authorizeNode(connection, latest, finished);
        await dependencyDeliveries(connection, latest, finished);
        if ((output.artifact?.kind ?? "site_draft") !== authorized.declaration.outputKind) {
          fail(502, "WORKSPACE_RESULT_INVALID", "Agent 交付成果与声明能力不一致。");
        }
        if (output.artifact) {
          if (output.artifact.kind === "text_result") {
            const expected = await nodeDeliverySources(connection, latest, finished, authorized.declaration.requiredScopes);
            await validateWorkspaceTextSources(connection, latest.userId, finished.result,
              authorized.declaration.requiredScopes, expected.references);
            return {};
          }
          await validateWorkspaceMediaSources(connection, latest.userId, output.artifact);
          await validateDelivery(connection, latest, finished);
          return {};
        }
        await validateWorkspaceSiteSources(connection, latest.userId, output);
        const expected = await nodeDeliverySources(connection, latest, finished, authorized.declaration.requiredScopes);
        assertExactSources(output.sourceReferences, expected.references);
        const draft = await createDraft({ userId: latest.userId, prompt: finished.goal, ...output.generation, connection, workspaceNodeId: finished.id });
        return { nodeResult: { artifact: { kind: "site_draft", id: draft.id, title: draft.draft.title },
          profileHash: output.profileHash, sourceReferences: output.sourceReferences, sourceHash: output.sourceHash } };
      } });
  };

  const decideAgentWorkspace = async ({ userId, workspaceId, ...decision }) => repo.mutateAgentWorkspace({ userId, workspaceId, ...decision,
    mutate: ["reply", "confirm"].includes(decision.operation) ? async (connection, workspace) => {
      await coordinator(connection, workspace);
      if (decision.operation === "reply") return {};
      const delivered = workspace.nodes.find(item => item.key === workspace.result?.resultKey);
      if (!delivered || delivered.result?.artifact?.kind !== "site_draft") fail(409, "WORKSPACE_RESULT_UNAVAILABLE", "没有可确认的页面成果。");
      // Serialize profile writers before locking sources/draft, using the same
      // order as the standalone site confirmation flow.
      await connection.query("SELECT user_id FROM user_profiles WHERE user_id = ? FOR UPDATE", [userId]);
      await validateDelivery(connection, workspace, delivered);
      const approval = workspace.approval;
      const [draft] = await connection.query("SELECT * FROM station_site_drafts WHERE id = ? AND user_id = ? AND source = 'model' AND deleted_at IS NULL FOR UPDATE", [approval.draftId, userId]);
      if (!draft || draft.status !== "draft" || draft.workspace_node_id !== delivered.id || draft.id !== delivered.result.artifact.id || hashSiteDocumentValue(draft.draft) !== approval.draftHash) fail(409, "SITE_TASK_DRAFT_CHANGED", "页面草稿已变化，请重新生成。");
      validateStoredSiteDocument(draft.draft, draft.id);
      const { resourcesHash } = await readSiteDocumentResources(connection, userId, draft.draft);
      if (resourcesHash !== approval.resourcesHash || delivered.result.profileHash !== approval.profileHash) fail(409, "SITE_TASK_RESOURCES_CHANGED", "页面引用或资料已变化，请重新生成。");
      await applyDraft({ userId, draftId: draft.id, connection, workspaceNodeId: delivered.id });
      return { result: workspace.result, summary: "已保存到我的私有页面" };
    } : undefined });

  const getWorkspaceMedia = async ({ userId, workspaceId, assetId }) => transaction(async connection => {
    const [workspace] = await connection.query("SELECT id FROM agent_workspaces WHERE id = ? AND user_id = ? FOR SHARE", [workspaceId, userId]);
    if (!workspace) fail(404, "WORKSPACE_NOT_FOUND", "协作任务不存在。");
    const current = await access(connection, userId);
    const grant = current.grants.find(item => item.agentId === "album-manager");
    const agent = await loadAgent("album-manager");
    if (!grant?.enabled || !agentScopesMatchDeclaration(agent, grant.grantedScopes)) fail(403, "WORKSPACE_ACCESS_REVOKED", "相册 Agent 授权已撤回或范围已变化，请在“我”移除后重新添加。");
    const nodes = await connection.query("SELECT result FROM agent_workspace_nodes WHERE workspace_id = ? AND user_id = ? AND status = 'succeeded'", [workspaceId, userId]);
    const delivered = nodes.map(item => item.result?.artifact).find(item => item?.kind === "media_selection" && item.assets.some(asset => asset.id === assetId));
    if (!delivered) fail(404, "WORKSPACE_MEDIA_NOT_FOUND", "此素材不属于已完成的协作成果。");
    await validateWorkspaceMediaSources(connection, userId, delivered);
    const [asset] = await connection.query("SELECT * FROM station_media_assets WHERE id = ? AND user_id = ? AND status = 'uploaded' AND deleted_at IS NULL FOR SHARE", [assetId, userId]);
    if (!asset) fail(404, "WORKSPACE_MEDIA_NOT_FOUND", "素材已不可用。");
    return mapStationMediaAsset(asset);
  });
  const getWorkspaceText = async ({ userId, workspaceId, nodeId }) => transaction(async connection => {
    z.string().uuid().parse(nodeId);
    const workspace = await repo.readOwnedWorkspaceRecord(connection, { userId, workspaceId });
    const node = workspace.nodes.find(item => item.id === nodeId);
    if (node?.status !== "succeeded" || node.result?.artifact?.kind !== "text_result") {
      fail(404, "WORKSPACE_TEXT_NOT_FOUND", "此文字内容不属于已完成的协作成果。");
    }
    await validateDelivery(connection, workspace, node);
    const { title, content } = parseWorkspaceTextArtifact(node.result.artifact);
    return { id: node.id, title, content };
  });
  const authorizeWorkspaceSiteDraftRead = async ({ connection, userId, draftId, workspaceNodeId }) => {
    const [identity] = await connection.query("SELECT workspace_id FROM agent_workspace_nodes WHERE id = ? AND user_id = ?", [workspaceNodeId, userId]);
    if (!identity) fail(404, "SITE_DOCUMENT_UNAVAILABLE", "页面草稿已不可用。");
    // Confirmation and deletion take the owning workspace lock first. Read its
    // latest binding before source locks, then lock the draft after validation.
    const workspace = await repo.readOwnedWorkspaceRecord(connection, { userId, workspaceId: identity.workspace_id });
    const [binding] = await connection.query("SELECT workspace_node_id FROM station_site_drafts WHERE id = ? AND user_id = ?", [draftId, userId]);
    if (!binding) fail(404, "SITE_DOCUMENT_UNAVAILABLE", "页面草稿已不可用。");
    if (binding.workspace_node_id !== null) {
      const node = workspace.nodes.find(item => item.id === workspaceNodeId);
      if (binding.workspace_node_id !== workspaceNodeId || node?.result?.artifact?.kind !== "site_draft" || node.result.artifact.id !== draftId) {
        fail(409, "WORKSPACE_SITE_BINDING_INVALID", "页面草稿与协作任务不匹配。");
      }
      await validateDelivery(connection, workspace, node);
    }
    const [draft] = await connection.query("SELECT * FROM station_site_drafts WHERE id = ? AND user_id = ? AND source = 'model' FOR SHARE", [draftId, userId]);
    if (!draft) fail(404, "SITE_DOCUMENT_UNAVAILABLE", "页面草稿已不可用。");
    if (draft.workspace_node_id !== binding.workspace_node_id) fail(409, "WORKSPACE_SITE_BINDING_INVALID", "页面草稿所属任务已变化。");
    return draft;
  };
  return { submitAgentWorkspace, executeWorkspaceNode, decideAgentWorkspace, getWorkspaceMedia, getWorkspaceText, authorizeWorkspaceSiteDraftRead };
}

export const { submitAgentWorkspace, executeWorkspaceNode, decideAgentWorkspace, getWorkspaceMedia, getWorkspaceText, authorizeWorkspaceSiteDraftRead } = createAgentWorkspaceService();
