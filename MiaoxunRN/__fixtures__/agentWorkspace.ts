import {
  AgentWorkspace,
  WorkspaceStep,
  workspaceArtifactsMatch,
} from '../src/models/agentWorkspace';
export const workspaceStep = (
  changes: Partial<WorkspaceStep> = {},
): WorkspaceStep => ({
  id: 'node-1',
  round: 1,
  key: 'coordinate-1',
  agentId: 'miaoxun-butler',
  agentVersion: '0.1.0',
  capability: 'workspace.coordinate',
  goal: '理解目标并安排协作',
  dependencies: [],
  status: 'succeeded',
  summary: '需要选择素材',
  error: null,
  result: null,
  createdAt: '2026-10-12T00:00:00Z',
  updatedAt: '2026-10-12T00:00:00Z',
  ...changes,
});
export const agentWorkspace = (
  changes: Partial<AgentWorkspace> = {},
): AgentWorkspace => {
  const steps = changes.steps || [
    workspaceStep({ result: changes.result || null }),
  ];
  const result = changes.result || null;
  const resultNodeId =
    steps.find(
      step =>
        step.status === 'succeeded' &&
        result &&
        workspaceArtifactsMatch(step.result, result),
    )?.id || null;
  return {
    id: 'workspace-1',
    executionMode: 'coordinated',
    origin: null,
    goal: '选择旅行素材并生成页面',
    contextRefs: [{ kind: 'station-album', id: 'album-1' }],
    source: { page: 'miao.feed', module: 'task-feed' },
    status: 'running',
    revision: 3,
    currentRound: 1,
    rounds: [
      {
        number: 1,
        instruction: changes.goal || '选择旅行素材并生成页面',
        baseResultNodeId: null,
        resultNodeId,
        status: changes.status || 'running',
        summary: changes.summary || '',
        result,
        createdAt: '2026-10-12T00:00:00Z',
        completedAt: [
          'succeeded',
          'failed',
          'cancelled',
          'interrupted',
        ].includes(changes.status || '')
          ? '2026-10-12T00:01:00Z'
          : null,
      },
    ],
    summary: '',
    question: null,
    inputRequest: null,
    followups: [],
    error: null,
    createdAt: '2026-10-12T00:00:00Z',
    updatedAt: '2026-10-12T00:00:00Z',
    allowedActions: ['cancel'],
    limits: {
      deadlineSeconds: 180,
    },
    usage: { modelCalls: 1, coordinatorTurns: 1 },
    steps,
    result: null,
    approval: null,
    ...changes,
  };
};
