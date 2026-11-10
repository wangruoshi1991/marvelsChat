import {
  AgentWorkspace,
  WorkspaceOperation,
  WorkspaceRequest,
  WorkspaceContinuationAttempt,
  isWorkspaceContinuationAttempt,
  assertAgentWorkspace,
  assertWorkspaceTextDocument,
  isWorkspaceRequest,
  WorkspaceContribution,
  assertWorkspaceContribution,
} from '../../models/agentWorkspace';
import { StationMediaAssetDTO } from '../../models/api';
import {
  agentWorkspaceHeaders,
  assertAgentWorkspaceContract,
  assertSiteDocumentContract,
  siteDocumentHeaders,
} from '../aiContract';
import { request } from './http';
const path = '/api/agent-workspaces';
function accept(value: unknown, id?: string): AgentWorkspace {
  assertAgentWorkspace(value);
  if (id && value.id !== id) throw new Error('协作工作空间与请求不一致。');
  return value;
}
async function continueWorkspace(
  token: string,
  attempt: WorkspaceContinuationAttempt,
) {
  assertAgentWorkspaceContract(token);
  if (!isWorkspaceContinuationAttempt(attempt))
    throw new Error('修改提交记录格式不受支持，请重新读取。');
  const accepted = accept(
    await request<unknown>(
      `${path}/${encodeURIComponent(attempt.workspaceId)}/decision`,
      {
        token,
        method: 'POST',
        headers: agentWorkspaceHeaders,
        body: {
          revision: attempt.revision,
          operation: 'continue',
          text: attempt.text,
          idempotencyKey: attempt.idempotencyKey,
        },
      },
    ),
    attempt.workspaceId,
  );
  if (
    accepted.currentRound <= attempt.currentRound ||
    accepted.revision <= attempt.revision
  )
    throw new Error('续作提交结果尚未确认，请核对本次提交。');
  return accepted;
}
export const agentWorkspaceApi = {
  async contribution(token: string, agentId: string, nodeId: string) {
    assertAgentWorkspaceContract(token);
    if (
      !/^[a-z0-9-]{1,80}$/.test(agentId) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        nodeId,
      )
    )
      throw new Error('协作贡献标识无效。');
    const result = await request<unknown>(
      `${path}/contributions/${encodeURIComponent(
        agentId,
      )}/${encodeURIComponent(nodeId)}`,
      {
        token,
        headers: {
          ...agentWorkspaceHeaders,
          'X-Miaoxun-Workspace-Contributions': '3',
        },
      },
    );
    if (!result || typeof result !== 'object' || !('contribution' in result))
      throw new Error('协作贡献数据格式不受支持。');
    if (result.contribution === null) return null;
    assertWorkspaceContribution(result.contribution, agentId);
    if (
      result.contribution.step.id !== nodeId ||
      result.contribution.step.capability === 'workspace.coordinate'
    )
      throw new Error('协作贡献身份不匹配，请返回原任务重新选择。');
    return result.contribution;
  },
  async contributions(token: string, agentId: string, before?: string) {
    assertAgentWorkspaceContract(token);
    if (!/^[a-z0-9-]{1,80}$/.test(agentId)) throw new Error('Agent 标识无效。');
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (before !== undefined && !uuid.test(before))
      throw new Error('协作贡献分页标识无效。');
    const result = await request<unknown>(
      `${path}/contributions/${encodeURIComponent(agentId)}${
        before ? `?before=${encodeURIComponent(before)}` : ''
      }`,
      {
        token,
        headers: {
          ...agentWorkspaceHeaders,
          'X-Miaoxun-Workspace-Contributions': '3',
        },
      },
    );
    if (
      !result ||
      typeof result !== 'object' ||
      !('contributions' in result) ||
      !Array.isArray(result.contributions) ||
      result.contributions.length > 50 ||
      !('hasMore' in result) ||
      typeof result.hasMore !== 'boolean' ||
      !('nextCursor' in result) ||
      (result.hasMore
        ? typeof result.nextCursor !== 'string' || !uuid.test(result.nextCursor)
        : result.nextCursor !== null)
    )
      throw new Error('协作贡献列表格式不受支持。');
    const contributions: WorkspaceContribution[] = [];
    let unavailable = 0;
    const ids: string[] = [];
    for (const item of result.contributions) {
      if (
        item &&
        typeof item === 'object' &&
        'unavailable' in item &&
        item.unavailable === true &&
        'id' in item &&
        typeof item.id === 'string'
      ) {
        ids.push(item.id);
        unavailable += 1;
        continue;
      }
      assertWorkspaceContribution(item, agentId);
      ids.push(item.step.id);
      contributions.push(item);
    }
    if (new Set(ids).size !== ids.length)
      throw new Error('协作贡献列表包含重复项目。');
    if (
      result.hasMore &&
      (ids[ids.length - 1] !== result.nextCursor ||
        result.nextCursor === before)
    )
      throw new Error('协作贡献分页游标不一致。');
    return {
      contributions,
      unavailable,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor as string | null,
      scannedIds: ids,
    };
  },
  async list(token: string) {
    assertAgentWorkspaceContract(token);
    const result = await request<unknown>(`${path}?limit=30`, {
      token,
      headers: agentWorkspaceHeaders,
    });
    if (!Array.isArray(result) || result.length > 30)
      throw new Error('协作列表格式不受支持。');
    const workspaces = result.map(value => accept(value));
    if (new Set(workspaces.map(w => w.id)).size !== workspaces.length)
      throw new Error('协作列表包含重复项目。');
    return workspaces;
  },
  async get(token: string, id: string) {
    assertAgentWorkspaceContract(token);
    return accept(
      await request<unknown>(`${path}/${encodeURIComponent(id)}`, {
        token,
        headers: agentWorkspaceHeaders,
      }),
      id,
    );
  },
  async create(
    token: string,
    input: WorkspaceRequest & { idempotencyKey: string },
  ) {
    assertAgentWorkspaceContract(token);
    if (!isWorkspaceRequest(input) || !input.idempotencyKey)
      throw new Error('协作需求格式不受支持。');
    return accept(
      await request<unknown>(path, {
        token,
        headers: agentWorkspaceHeaders,
        method: 'POST',
        body: input,
      }),
    );
  },
  async decide(
    token: string,
    workspace: AgentWorkspace,
    operation: WorkspaceOperation,
    text?: string,
    idempotencyKey?: string,
  ) {
    assertAgentWorkspaceContract(token);
    if (!workspace.allowedActions.includes(operation))
      throw new Error('当前状态不允许此操作，请刷新协作进展。');
    if (operation === 'confirm') assertSiteDocumentContract(token);
    if (operation === 'continue')
      return continueWorkspace(token, {
        workspaceId: workspace.id,
        revision: workspace.revision,
        currentRound: workspace.currentRound,
        text: text?.trim() || '',
        idempotencyKey: idempotencyKey || '',
      });
    const accepted = accept(
      await request<unknown>(
        `${path}/${encodeURIComponent(workspace.id)}/decision`,
        {
          token,
          method: 'POST',
          headers:
            operation === 'confirm'
              ? { ...agentWorkspaceHeaders, ...siteDocumentHeaders }
              : agentWorkspaceHeaders,
          body: {
            revision: workspace.revision,
            operation,
            ...(operation === 'confirm'
              ? { approvalId: workspace.approval?.id }
              : {}),
            ...(operation === 'reply' ? { text } : {}),
          },
        },
      ),
      workspace.id,
    );
    return accepted;
  },
  // A persisted pending request carries no current permissions. The server
  // rechecks ownership and authorization before replaying the exact key.
  async recoverContinuation(
    token: string,
    attempt: WorkspaceContinuationAttempt,
  ) {
    return continueWorkspace(token, attempt);
  },
  async media(token: string, workspaceId: string, assetId: string) {
    assertAgentWorkspaceContract(token);
    const asset = await request<StationMediaAssetDTO>(
      `${path}/${encodeURIComponent(workspaceId)}/media/${encodeURIComponent(
        assetId,
      )}`,
      { token, headers: agentWorkspaceHeaders },
    );
    if (
      !asset ||
      asset.id !== assetId ||
      !['image', 'video'].includes(asset.kind) ||
      asset.status !== 'uploaded'
    )
      throw new Error('素材已不可用，请刷新协作结果。');
    return asset;
  },
  async text(token: string, workspaceId: string, nodeId: string) {
    assertAgentWorkspaceContract(token);
    const document = await request<unknown>(
      `${path}/${encodeURIComponent(workspaceId)}/text/${encodeURIComponent(
        nodeId,
      )}`,
      { token, headers: agentWorkspaceHeaders },
    );
    assertWorkspaceTextDocument(document, nodeId);
    return document;
  },
};
