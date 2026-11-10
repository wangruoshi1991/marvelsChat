import { AgentWorkspace } from './agentWorkspace';

export type WorkspaceContextSelector = {
  id: string;
  revision: number;
  currentRound: number;
  nodeId?: string;
};

export type WorkspaceDiscussionContext = WorkspaceContextSelector & {
  goal: string;
};

// A navigation draft has not been submitted and carries no execution key.
export type WorkspaceContinuationDraft = WorkspaceContextSelector & {
  text: string;
  draftId: string;
};

const workspaceIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isWorkspaceContextSelector(
  value: unknown,
): value is WorkspaceContextSelector {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    workspaceIdPattern.test(item.id) &&
    Number.isSafeInteger(item.revision) &&
    (item.revision as number) > 0 &&
    Number.isSafeInteger(item.currentRound) &&
    (item.currentRound as number) > 0 &&
    (item.nodeId === undefined ||
      (typeof item.nodeId === 'string' && workspaceIdPattern.test(item.nodeId)))
  );
}

export function isWorkspaceDiscussionContext(
  value: unknown,
): value is WorkspaceDiscussionContext {
  return (
    isWorkspaceContextSelector(value) &&
    'goal' in value &&
    typeof value.goal === 'string' &&
    Boolean(value.goal.trim()) &&
    value.goal.length <= 2000
  );
}

export function workspaceContextSelector(
  value: WorkspaceContextSelector,
): WorkspaceContextSelector {
  if (!isWorkspaceContextSelector(value))
    throw new Error('任务关联无效，请重新打开任务。');
  return {
    id: value.id,
    revision: value.revision,
    currentRound: value.currentRound,
    ...(value.nodeId ? { nodeId: value.nodeId } : {}),
  };
}

export function workspaceDiscussionContext(
  workspace: AgentWorkspace,
  nodeId?: string,
  agentId?: string,
): WorkspaceDiscussionContext {
  if (workspace.readAccess?.state === 'unavailable')
    throw new Error('原任务来源不可用，请检查授权后重试。');
  if (nodeId) {
    const node = workspace.steps.find(step => step.id === nodeId);
    if (
      !agentId ||
      !node ||
      node.agentId !== agentId ||
      node.round !== workspace.currentRound ||
      node.status !== 'succeeded' ||
      node.result?.kind !== 'text_result' ||
      node.result.id !== node.id
    )
      throw new Error(
        '这份贡献已变化或不属于当前 Agent，请返回原任务重新选择当前成果。',
      );
  }
  const value = {
    ...workspaceContextSelector(workspace),
    ...(nodeId ? { nodeId } : {}),
    goal: workspace.goal,
  };
  if (!isWorkspaceDiscussionContext(value))
    throw new Error('任务关联无效，请重新打开任务。');
  return value;
}

export function sameWorkspaceContext(
  left: WorkspaceContextSelector,
  right: WorkspaceContextSelector,
) {
  return (
    left.id === right.id &&
    left.revision === right.revision &&
    left.currentRound === right.currentRound &&
    left.nodeId === right.nodeId
  );
}
