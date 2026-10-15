export type AIContextReference = {
  kind: 'chat-message' | 'station-album' | 'station-diary' | 'station-photo';
  id: string;
  version?: string;
  title?: string;
};

export type AITaskStatus =
  | 'queued'
  | 'running'
  | 'awaiting_confirmation'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type AITaskOperation = 'cancel' | 'confirm' | 'reject';
export type AIArtifact = {
  kind: 'message' | 'site_draft';
  id: string;
  threadId?: string;
  title: string;
};

export type AITaskDTO = {
  id: string;
  contractVersion: 1;
  kind: 'agent_message' | 'site_draft';
  agentId: string;
  agentVersion: string;
  goal: string;
  threadId: string | null;
  inputMessageId: string | null;
  status: AITaskStatus;
  revision: number;
  phase: string;
  contextRefs: AIContextReference[];
  artifacts: AIArtifact[];
  approval: {
    id: string;
    draftId: string;
    draftHash: string;
    profileHash: string;
    resourcesHash?: string;
    expiresAt: string;
  } | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
  allowedActions: AITaskOperation[];
};

export const isTaskTerminal = (task: AITaskDTO) =>
  ['succeeded', 'failed', 'cancelled', 'interrupted'].includes(task.status);

export function isContextReference(
  value: unknown,
): value is AIContextReference {
  if (!value || typeof value !== 'object') return false;
  const ref = value as AIContextReference;
  return (
    [
      'chat-message',
      'station-album',
      'station-diary',
      'station-photo',
    ].includes(ref.kind) &&
    typeof ref.id === 'string' &&
    ref.id.length > 0 &&
    (ref.version === undefined || typeof ref.version === 'string') &&
    (ref.title === undefined || typeof ref.title === 'string')
  );
}

export function assertAITask(value: unknown): asserts value is AITaskDTO {
  const task = value as AITaskDTO | null;
  if (
    !task ||
    task.contractVersion !== 1 ||
    typeof task.id !== 'string' ||
    !['agent_message', 'site_draft'].includes(task.kind) ||
    ![
      'queued',
      'running',
      'awaiting_confirmation',
      'succeeded',
      'failed',
      'cancelled',
      'interrupted',
    ].includes(task.status) ||
    !Number.isInteger(task.revision) ||
    task.revision < 0 ||
    typeof task.phase !== 'string' ||
    typeof task.agentId !== 'string' ||
    typeof task.goal !== 'string' ||
    !Array.isArray(task.contextRefs) ||
    !task.contextRefs.every(isContextReference) ||
    !Array.isArray(task.artifacts) ||
    !task.artifacts.every(
      artifact =>
        artifact &&
        ['message', 'site_draft'].includes(artifact.kind) &&
        typeof artifact.id === 'string' &&
        typeof artifact.title === 'string',
    ) ||
    !Array.isArray(task.allowedActions) ||
    !task.allowedActions.every(action =>
      ['cancel', 'confirm', 'reject'].includes(action),
    ) ||
    typeof task.createdAt !== 'string' ||
    typeof task.updatedAt !== 'string' ||
    (task.approval !== null &&
      (!task.approval ||
        typeof task.approval.id !== 'string' ||
        typeof task.approval.draftId !== 'string' ||
        typeof task.approval.draftHash !== 'string' ||
        typeof task.approval.profileHash !== 'string' ||
        !Number.isFinite(Date.parse(task.approval.expiresAt)))) ||
    (task.error !== null &&
      (!task.error ||
        typeof task.error.code !== 'string' ||
        typeof task.error.message !== 'string'))
  )
    throw new Error('任务数据格式不受支持，请更新应用或联系支持。');
}
