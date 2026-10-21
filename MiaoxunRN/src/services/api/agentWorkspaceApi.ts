import {
  AgentWorkspace,
  WorkspaceOperation,
  WorkspaceRequest,
  WorkspaceContinuationAttempt,
  isWorkspaceContinuationAttempt,
  assertAgentWorkspace,
  assertWorkspaceTextDocument,
  isWorkspaceRequest,
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
