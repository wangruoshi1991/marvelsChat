import { agentWorkspaceApi } from '../src/services/api/agentWorkspaceApi';
import { request } from '../src/services/api/http';
import {
  clearAIContractSession,
  setAIContractSession,
} from '../src/services/aiContract';
import {
  assertAgentWorkspace,
  isWorkspaceArtifact,
} from '../src/models/agentWorkspace';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';
jest.mock('../src/services/api/http', () => ({ request: jest.fn() }));
const http = jest.mocked(request);
beforeEach(() => {
  http.mockReset();
  clearAIContractSession();
});
const session = () =>
  setAIContractSession('token', {
    aiTasks: 1,
    siteDocuments: 2,
    agentWorkspaces: 3,
  });
test.each([
  undefined,
  {},
  { aiTasks: 1 },
  { aiTasks: 1, agentWorkspaces: 1 },
  { aiTasks: 1, agentWorkspaces: 2 },
  { aiTasks: 1, agentWorkspaces: 4 },
  { aiTasks: 1, agentWorkspaces: '3' },
])('unsupported collaboration capability blocks HTTP: %p', async contracts => {
  setAIContractSession('token', contracts);
  await expect(agentWorkspaceApi.list('token')).rejects.toThrow();
  await expect(
    agentWorkspaceApi.create('token', {
      goal: '目标',
      contextRefs: [],
      source: { page: 'miao.feed', module: null },
      idempotencyKey: 'key',
    }),
  ).rejects.toThrow();
  expect(http).not.toHaveBeenCalled();
});
test('capability is scoped to active session', async () => {
  session();
  await expect(agentWorkspaceApi.list('other')).rejects.toThrow();
  clearAIContractSession();
  await expect(agentWorkspaceApi.list('token')).rejects.toThrow();
  expect(http).not.toHaveBeenCalled();
});
test('v3 retains typed input actions and never allows replying to an access request', () => {
  const question = '需要授权后新建任务';
  const inputRequest = {
    kind: 'agent_access' as const,
    question,
    reason: 'authorization_required' as const,
    nextAction: 'manage_agents_then_restart' as const,
    requirements: [
      {
        agentId: 'site-builder',
        agentName: '建站 Agent',
        capability: 'site.compose',
        requiredScopes: ['album:read'],
        reason: 'authorization_required' as const,
      },
    ],
  };
  const valid = agentWorkspace({
    status: 'waiting_input',
    question,
    inputRequest,
    followups: ['只选横图'],
  });
  expect(() => assertAgentWorkspace(valid)).not.toThrow();
  for (const patch of [
    { inputRequest: undefined },
    { inputRequest: null },
    { followups: undefined },
    { question: '不同问题' },
    { allowedActions: ['reply'] },
    { status: 'cancelled' },
    { inputRequest: { ...inputRequest, nextAction: 'restart' } },
    { inputRequest: { ...inputRequest, requirements: [] } },
    {
      inputRequest: {
        ...inputRequest,
        requirements: [{ ...inputRequest.requirements[0], requiredScopes: [] }],
      },
    },
    {
      inputRequest: {
        ...inputRequest,
        requirements: [
          {
            ...inputRequest.requirements[0],
            requiredScopes: ['album:read', 'album:read'],
          },
        ],
      },
    },
    {
      inputRequest: {
        ...inputRequest,
        requirements: [
          ...inputRequest.requirements,
          ...inputRequest.requirements,
        ],
      },
    },
    { inputRequest: { ...inputRequest, authorization: true } },
  ])
    expect(() => assertAgentWorkspace({ ...valid, ...patch })).toThrow();
});
test('goal, explicit source and real references cross one dedicated contract', async () => {
  session();
  const w = agentWorkspace();
  http.mockResolvedValue(w);
  const input = {
    goal: w.goal,
    contextRefs: w.contextRefs,
    source: w.source,
    idempotencyKey: 'key',
  };
  expect(await agentWorkspaceApi.create('token', input)).toEqual(w);
  expect(http).toHaveBeenCalledWith('/api/agent-workspaces', {
    token: 'token',
    method: 'POST',
    headers: { 'X-Miaoxun-AI-Contract': '1', 'X-Miaoxun-Agent-Workspace': '3' },
    body: input,
  });
});
test('wrong workspace response and duplicate aggregate ids fail explicitly', async () => {
  session();
  http.mockResolvedValue(agentWorkspace({ id: 'different' }));
  await expect(agentWorkspaceApi.get('token', 'workspace-1')).rejects.toThrow(
    '不一致',
  );
  http.mockResolvedValue([agentWorkspace(), agentWorkspace()]);
  await expect(agentWorkspaceApi.list('token')).rejects.toThrow('重复');
});
test('workspace responses preserve actual usage and the deadline without fixed counts', async () => {
  session();
  const w = agentWorkspace({
    usage: { modelCalls: 33, coordinatorTurns: 5 },
  });
  http.mockResolvedValue(w);
  expect(await agentWorkspaceApi.get('token', w.id)).toEqual(w);
  expect(w.limits).toEqual({ deadlineSeconds: 180 });
});
test('a text collaboration completes without a page approval or confirmation action', async () => {
  session();
  const result = {
    kind: 'text_result' as const,
    id: 'node-1',
    title: '周末安排',
  };
  const w = agentWorkspace({
    status: 'succeeded',
    contextRefs: [],
    result,
    allowedActions: [],
    steps: [
      workspaceStep({
        agentId: 'file-preprocessor',
        capability: 'text.summarize',
        result,
      }),
    ],
  });
  http.mockResolvedValue(w);
  expect(await agentWorkspaceApi.get('token', w.id)).toEqual(w);
  for (const patch of [
    { status: 'awaiting_confirmation' },
    { allowedActions: ['confirm'] },
    { allowedActions: ['reject'] },
    {
      approval: {
        id: 'approval',
        draftId: 'draft',
        draftHash: 'a'.repeat(64),
        resourcesHash: 'b'.repeat(64),
        profileHash: 'c'.repeat(64),
        expiresAt: '2026-10-15T00:00:00Z',
      },
    },
  ])
    expect(() => assertAgentWorkspace({ ...w, ...patch })).toThrow();
});
test.each([
  { kind: 'text_result', title: '建议' },
  { kind: 'text_result', id: '', title: '建议' },
  { kind: 'text_result', id: 'node-1', title: '' },
  { kind: 'text_result', id: 'node-1', title: ' '.repeat(4) },
  { kind: 'text_result', id: 'node-1', title: '题'.repeat(161) },
  { kind: 'text_result', id: 'node-1', title: '建议', content: '历史正文' },
  { kind: 'text_result', id: 'node-1', title: '建议', sourceReferences: [] },
  { kind: 'text_result', id: 'node-1', title: '建议', provider: 'internal' },
  { kind: 'site_draft', id: 'draft', title: '页面', provider: 'internal' },
  {
    kind: 'media_selection',
    title: '素材',
    assets: [],
    retrievalRunIds: [],
    sourceReferences: [],
  },
  {
    kind: 'media_selection',
    title: '素材',
    assets: [
      {
        id: 'asset',
        version: '1',
        kind: 'image',
        matchedFrameTimestampMs: null,
        owner: 'internal',
      },
    ],
    retrievalRunIds: [],
  },
])(
  'nonpublic or malformed artifacts are rejected at final and node boundaries: %p',
  result => {
    expect(isWorkspaceArtifact(result)).toBe(false);
    expect(() =>
      assertAgentWorkspace(agentWorkspace({ result: result as never })),
    ).toThrow();
    expect(() =>
      assertAgentWorkspace(
        agentWorkspace({ steps: [workspaceStep({ result: result as never })] }),
      ),
    ).toThrow();
  },
);
test('public text references bind the produced node and contain no body', () => {
  const result = {
    kind: 'text_result' as const,
    id: 'node-1',
    title: '题'.repeat(160),
  };
  expect(isWorkspaceArtifact(result)).toBe(true);
  const valid = agentWorkspace({
    status: 'succeeded',
    allowedActions: [],
    result,
    steps: [workspaceStep({ result })],
  });
  expect(() => assertAgentWorkspace(valid)).not.toThrow();
  for (const changes of [
    { result: { ...result, id: 'other' } },
    { result: { ...result, title: '不同标题' } },
    { steps: [workspaceStep({ result, status: 'failed' })] },
    { steps: [workspaceStep({ id: 'other', result })] },
  ])
    expect(() => assertAgentWorkspace({ ...valid, ...changes })).toThrow();
});
test('text endpoint sends contract3 and validates the requested node separately from snapshots', async () => {
  session();
  const document = {
    id: 'node-1',
    title: '故事',
    content: '一段正文。\n\n- 自由列表',
  };
  http.mockResolvedValue(document);
  expect(
    await agentWorkspaceApi.text('token', 'workspace-1', 'node-1'),
  ).toEqual(document);
  expect(http).toHaveBeenCalledWith(
    '/api/agent-workspaces/workspace-1/text/node-1',
    {
      token: 'token',
      headers: {
        'X-Miaoxun-AI-Contract': '1',
        'X-Miaoxun-Agent-Workspace': '3',
      },
    },
  );
  http.mockResolvedValue({
    id: 'node-1',
    title: '题'.repeat(160),
    content: '文'.repeat(16000),
  });
  await expect(
    agentWorkspaceApi.text('token', 'workspace-1', 'node-1'),
  ).resolves.toBeDefined();
});
test.each([
  null,
  { id: 'other', title: '建议', content: '正文' },
  { id: 'node-1', title: '建议', content: '' },
  { id: 'node-1', title: '建议', content: ' \n\t ' },
  { id: 'node-1', title: '建议', content: ' 文 ' },
  { id: 'node-1', title: '建议', content: '文'.repeat(16001) },
  { id: 'node-1', title: '', content: '正文' },
  { id: 'node-1', title: '题'.repeat(161), content: '正文' },
  { id: 'node-1', title: '建议', content: null },
  { id: 'node-1', title: '建议', content: '正文', sourceReferences: [] },
  { id: 'node-1', title: '建议', content: '正文', provider: 'internal' },
  { id: 'node-1', title: '建议', content: '正文', kind: 'text_result' },
])(
  'invalid or private text documents are explicitly rejected: %p',
  async value => {
    session();
    http.mockResolvedValue(value);
    await expect(
      agentWorkspaceApi.text('token', 'workspace-1', 'node-1'),
    ).rejects.toThrow('文字成果数据格式');
  },
);
test('text reads require the current session and never use a legacy contract', async () => {
  for (const contract of [undefined, { aiTasks: 1, agentWorkspaces: 2 }]) {
    setAIContractSession('token', contract);
    await expect(
      agentWorkspaceApi.text('token', 'workspace-1', 'node-1'),
    ).rejects.toThrow();
  }
  session();
  await expect(
    agentWorkspaceApi.text('other', 'workspace-1', 'node-1'),
  ).rejects.toThrow();
  expect(http).not.toHaveBeenCalled();
});
test.each(['maxSteps', 'maxModelCalls', 'maxCoordinatorTurns'])(
  'obsolete fixed count %s is rejected instead of accepted as compatibility',
  async key => {
    session();
    const w = agentWorkspace();
    http.mockResolvedValue({
      ...w,
      limits: { ...w.limits, [key]: 8 },
    });
    await expect(agentWorkspaceApi.get('token', w.id)).rejects.toThrow(
      '格式不受支持',
    );
  },
);
test.each([
  { result: { kind: 'freeform', title: '不受支持' } },
  { steps: [workspaceStep({ dependencies: ['missing'] })] },
  { steps: [workspaceStep(), workspaceStep()] },
  { allowedActions: ['confirm'] },
  { allowedActions: ['reply'], question: null },
  { usage: { modelCalls: -1, coordinatorTurns: 0 } },
  { limits: null },
  { limits: {} },
  { limits: { deadlineSeconds: null } },
  { remainingLimits: { modelCalls: 12, coordinatorTurns: 4 } },
  {
    result: {
      kind: 'media_selection',
      title: '素材',
      assets: [
        {
          id: 'asset',
          version: null,
          kind: 'image',
          matchedFrameTimestampMs: null,
        },
      ],
      retrievalRunIds: [],
    },
  },
])('malformed or unsafe graph data is rejected: %p', patch => {
  expect(() =>
    assertAgentWorkspace({ ...agentWorkspace(), ...patch }),
  ).toThrow();
});
test('confirmation needs document contract plus revision and approval', async () => {
  const w = agentWorkspace({
    status: 'awaiting_confirmation',
    allowedActions: ['confirm'],
    result: { kind: 'site_draft', id: 'draft', title: '页面' },
    approval: {
      id: 'approval',
      draftId: 'draft',
      draftHash: 'a'.repeat(64),
      resourcesHash: 'b'.repeat(64),
      profileHash: 'c'.repeat(64),
      expiresAt: '2026-10-13T00:00:00Z',
    },
  });
  session();
  http.mockResolvedValue(w);
  await agentWorkspaceApi.decide('token', w, 'confirm');
  expect(http).toHaveBeenCalledWith(
    expect.stringContaining('/decision'),
    expect.objectContaining({
      headers: {
        'X-Miaoxun-AI-Contract': '1',
        'X-Miaoxun-Agent-Workspace': '3',
        'X-Miaoxun-Site-Document': '2',
      },
      body: { revision: 3, operation: 'confirm', approvalId: 'approval' },
    }),
  );
  http.mockClear();
  setAIContractSession('token', { aiTasks: 1, agentWorkspaces: 3 });
  await expect(agentWorkspaceApi.decide('token', w, 'confirm')).rejects.toThrow(
    '结构化页面',
  );
  expect(http).not.toHaveBeenCalled();
});
test('media binds exact asset and accepts only currently uploaded assets', async () => {
  session();
  http.mockResolvedValue({ id: 'other', kind: 'image', status: 'uploaded' });
  await expect(
    agentWorkspaceApi.media('token', 'workspace', 'asset'),
  ).rejects.toThrow();
  http.mockResolvedValue({ id: 'asset', kind: 'image', status: 'deleted' });
  await expect(
    agentWorkspaceApi.media('token', 'workspace', 'asset'),
  ).rejects.toThrow();
});
