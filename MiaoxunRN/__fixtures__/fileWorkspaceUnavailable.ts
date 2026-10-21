// Public DTO captured from the isolated synthetic file QA workflow after source deletion.
export const fileWorkspaceUnavailable = {
  id: '98807aaf-6790-4a99-a7c3-1c279fbd1b4b',
  goal: '请总结这份文件，并保留末尾核验内容。',
  status: 'succeeded',
  revision: 8,
  executionMode: 'direct',
  origin: {
    kind: 'agent_conversation',
    threadId: 'bc3ea3ef-a613-4a86-95c2-69106297ab52',
    inputMessageId: '8e347134-d509-49b6-b76c-e1686fb7b3ca',
    agentId: 'file-preprocessor',
    agentVersion: '0.2.0',
    capability: 'file.summary',
  },
  currentRound: 2,
  rounds: [
    {
      number: 1,
      instruction: '请总结这份文件，并保留末尾核验内容。',
      baseResultNodeId: null,
      resultNodeId: '7e70307e-4f8a-418c-9844-409a37976697',
      status: 'succeeded',
      summary:
        '引用文件已删除、变化或授权不可用，成果无法打开，请重新选择文件创建任务。',
      result: null,
      createdAt: '2026-10-21T03:03:43.502Z',
      completedAt: '2026-10-21T03:03:44.920Z',
    },
    {
      number: 2,
      instruction: '请改成三条要点，保留文件末尾信息。',
      baseResultNodeId: '7e70307e-4f8a-418c-9844-409a37976697',
      resultNodeId: '7b76bb45-d13a-43fc-9329-fcaa5967c77e',
      status: 'succeeded',
      summary:
        '引用文件已删除、变化或授权不可用，成果无法打开，请重新选择文件创建任务。',
      result: null,
      createdAt: '2026-10-21T03:05:06.933Z',
      completedAt: '2026-10-21T03:05:07.465Z',
    },
  ],
  source: {
    page: 'messages.agent',
    module: null,
  },
  contextRefs: [
    {
      kind: 'station-file',
      id: '5a7060e9-9eea-42af-bb16-83aa019d847c',
      version:
        'cf0dbd2395a54cc91e73994e90d02f1da19c6b9cbd9191dfb4f81da5c7985c0e',
      title: '完整正文.md',
    },
  ],
  followups: [],
  summary:
    '引用文件已删除、变化或授权不可用，成果无法打开，请重新选择文件创建任务。',
  question: null,
  inputRequest: null,
  error: null,
  createdAt: '2026-10-21T03:03:43.500Z',
  updatedAt: '2026-10-21T03:05:07.465Z',
  allowedActions: [],
  limits: {
    deadlineSeconds: 1200,
  },
  usage: {
    modelCalls: 2,
    coordinatorTurns: 0,
  },
  steps: [
    {
      id: '7e70307e-4f8a-418c-9844-409a37976697',
      key: 'direct-1',
      round: 1,
      agentId: 'file-preprocessor',
      agentVersion: '0.2.0',
      capability: 'file.summary',
      goal: '请总结这份文件，并保留末尾核验内容。',
      dependencies: [],
      status: 'succeeded',
      summary:
        '引用文件已删除、变化或授权不可用，成果无法打开，请重新选择文件创建任务。',
      error: null,
      result: null,
      createdAt: '2026-10-21T03:03:43.504Z',
      updatedAt: '2026-10-21T03:03:44.916Z',
    },
    {
      id: '7b76bb45-d13a-43fc-9329-fcaa5967c77e',
      key: 'direct-2',
      round: 2,
      agentId: 'file-preprocessor',
      agentVersion: '0.2.0',
      capability: 'file.summary',
      goal: '请改成三条要点，保留文件末尾信息。',
      dependencies: ['direct-1'],
      status: 'succeeded',
      summary:
        '引用文件已删除、变化或授权不可用，成果无法打开，请重新选择文件创建任务。',
      error: null,
      result: null,
      createdAt: '2026-10-21T03:05:06.935Z',
      updatedAt: '2026-10-21T03:05:07.458Z',
    },
  ],
  result: null,
  approval: null,
  readAccess: {
    state: 'unavailable',
    code: 'WORKSPACE_FILE_SOURCE_UNAVAILABLE',
  },
};
