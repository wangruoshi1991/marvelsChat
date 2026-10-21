import { AgentWorkspace } from './agentWorkspace';

export type WorkspaceContextSelector = {
  id: string;
  revision: number;
  currentRound: number;
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
    (item.currentRound as number) > 0
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
  };
}

export function workspaceDiscussionContext(
  workspace: AgentWorkspace,
): WorkspaceDiscussionContext {
  const value = {
    ...workspaceContextSelector(workspace),
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
    left.currentRound === right.currentRound
  );
}
