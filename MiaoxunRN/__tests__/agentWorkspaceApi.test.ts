import { fileWorkspaceUnavailable } from '../__fixtures__/fileWorkspaceUnavailable';
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
import { AgentWorkspace } from '../src/models/agentWorkspace';
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
    agentWorkspaces: 6,
  });
test.each([
  undefined,
  {},
  { aiTasks: 1 },
  { aiTasks: 1, agentWorkspaces: 1 },
  { aiTasks: 1, agentWorkspaces: 2 },
  { aiTasks: 1, agentWorkspaces: 3 },
  { aiTasks: 1, agentWorkspaces: 4 },
  { aiTasks: 1, agentWorkspaces: 5 },
  { aiTasks: 1, agentWorkspaces: 7 },
  { aiTasks: 1, agentWorkspaces: '4' },
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

test('contribution responses require the requested agent and valid artifact identities', async () => {
  session();
  const step = workspaceStep({ agentId: 'album-manager', id: 'step-1' });
  const item = {
    workspace: {
      id: 'workspace-1',
      revision: 1,
      executionMode: 'coordinated',
      goal: '真实协作任务',
      currentRound: 1,
    },
    step,
  };
  http.mockResolvedValueOnce({
    contributions: [item, { unavailable: true, id: 'hidden' }],
    hasMore: false,
    nextCursor: null,
  });
  await expect(
    agentWorkspaceApi.contributions('token', 'album-manager'),
  ).resolves.toEqual({
    contributions: [item],
    unavailable: 1,
    hasMore: false,
    nextCursor: null,
    scannedIds: ['step-1', 'hidden'],
  });
  expect(http).toHaveBeenLastCalledWith(
    '/api/agent-workspaces/contributions/album-manager',
    expect.objectContaining({
      headers: expect.objectContaining({
        'X-Miaoxun-Workspace-Contributions': '3',
      }),
    }),
  );
  http.mockResolvedValueOnce({
    contributions: [{ ...item, step: { ...step, agentId: 'other' } }],
    hasMore: false,
    nextCursor: null,
  });
  await expect(
    agentWorkspaceApi.contributions('token', 'album-manager'),
  ).rejects.toThrow('格式');
  http.mockResolvedValueOnce({
    contributions: [
      {
        ...item,
        step: {
          ...step,
          result: { kind: 'text_result', id: 'different', title: 'text' },
        },
      },
    ],
    hasMore: false,
    nextCursor: null,
  });
  await expect(
    agentWorkspaceApi.contributions('token', 'album-manager'),
  ).rejects.toThrow('格式');
  http.mockResolvedValueOnce({
    contributions: [item, item],
    hasMore: false,
    nextCursor: null,
  });
  await expect(
    agentWorkspaceApi.contributions('token', 'album-manager'),
  ).rejects.toThrow('重复');
});

test('an exact contribution read validates the Agent, node identity and contribution protocol', async () => {
  session();
  const nodeId = '12a41286-e950-42a7-b482-1d1c56414e89';
  const workspace = agentWorkspace();
  const { id, revision, executionMode, goal, currentRound } = workspace;
  const contribution = {
    workspace: { id, revision, executionMode, goal, currentRound },
    step: workspaceStep({
      id: nodeId,
      agentId: 'comic-diary',
      capability: 'comic.storyboard',
    }),
  };
  http.mockResolvedValueOnce({ contribution });
  await expect(
    agentWorkspaceApi.contribution('token', 'comic-diary', nodeId),
  ).resolves.toEqual(contribution);
  expect(http).toHaveBeenLastCalledWith(
    `/api/agent-workspaces/contributions/comic-diary/${nodeId}`,
    expect.objectContaining({
      headers: expect.objectContaining({
        'X-Miaoxun-Workspace-Contributions': '3',
      }),
    }),
  );
  http.mockResolvedValueOnce({ contribution: null });
  await expect(
    agentWorkspaceApi.contribution('token', 'comic-diary', nodeId),
  ).resolves.toBeNull();
  http.mockResolvedValueOnce({
    contribution: {
      ...contribution,
      step: { ...contribution.step, id: 'different' },
    },
  });
  await expect(
    agentWorkspaceApi.contribution('token', 'comic-diary', nodeId),
  ).rejects.toThrow('贡献');
});

test('contract 5 requires execution mode and an exact direct origin whose executor cannot change', () => {
  const direct = agentWorkspace({
    executionMode: 'direct',
    origin: {
      kind: 'agent_conversation',
      threadId: 'thread',
      inputMessageId: 'input',
      agentId: 'comic-diary',
      agentVersion: '1',
      capability: 'comic.storyboard',
    },
    steps: [
      workspaceStep({
        agentId: 'comic-diary',
        agentVersion: '1',
        capability: 'comic.storyboard',
      }),
    ],
  });
  expect(() => assertAgentWorkspace(direct)).not.toThrow();
  for (const patch of [
    { executionMode: undefined },
    { executionMode: 'unknown' },
    { origin: undefined },
    { origin: null },
    { origin: { ...direct.origin, threadId: '' } },
    { origin: { ...direct.origin, privateHistory: [] } },
    { executionMode: 'coordinated' },
    { steps: [workspaceStep()] },
    {
      steps: [
        workspaceStep({
          agentId: 'comic-diary',
          agentVersion: '2',
          capability: 'comic.storyboard',
        }),
      ],
    },
  ])
    expect(() => assertAgentWorkspace({ ...direct, ...patch })).toThrow(
      '数据格式',
    );
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
    headers: { 'X-Miaoxun-AI-Contract': '1', 'X-Miaoxun-Agent-Workspace': '6' },
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
test('text endpoint sends contract4 and validates the requested node separately from snapshots', async () => {
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
        'X-Miaoxun-Agent-Workspace': '6',
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
        'X-Miaoxun-Agent-Workspace': '6',
        'X-Miaoxun-Site-Document': '2',
      },
      body: { revision: 3, operation: 'confirm', approvalId: 'approval' },
    }),
  );
  http.mockClear();
  setAIContractSession('token', { aiTasks: 1, agentWorkspaces: 6 });
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

test('round history retains matching completed results and rejects broken lineage', () => {
  const previousResult = {
    kind: 'text_result' as const,
    id: 'previous-node',
    title: '初稿',
  };
  const result = {
    kind: 'text_result' as const,
    id: 'revised-node',
    title: '修订稿',
  };
  const original = agentWorkspace({
    status: 'succeeded',
    result: previousResult,
    steps: [workspaceStep({ id: previousResult.id, result: previousResult })],
    allowedActions: ['continue'],
  });
  const current = agentWorkspace({
    currentRound: 2,
    status: 'succeeded',
    result,
    allowedActions: ['continue'],
    steps: [
      ...original.steps,
      workspaceStep({
        id: result.id,
        key: 'revised',
        round: 2,
        result,
      }),
    ],
    rounds: [
      original.rounds[0],
      {
        ...original.rounds[0],
        number: 2,
        instruction: '精简开头，保留已有安排',
        baseResultNodeId: previousResult.id,
        resultNodeId: result.id,
        result,
      },
    ],
  });
  expect(() => assertAgentWorkspace(current)).not.toThrow();
  expect(() =>
    assertAgentWorkspace({
      ...current,
      result: { title: result.title, id: result.id, kind: result.kind },
    }),
  ).not.toThrow();
  for (const patch of [
    { currentRound: undefined },
    { currentRound: 0 },
    { currentRound: 3 },
    { rounds: undefined },
    { rounds: [] },
    { rounds: [{ ...current.rounds[0], number: 2 }, current.rounds[1]] },
    { rounds: [current.rounds[0], { ...current.rounds[1], instruction: '' }] },
    {
      rounds: [
        current.rounds[0],
        { ...current.rounds[1], baseResultNodeId: 'other' },
      ],
    },
    {
      rounds: [
        current.rounds[0],
        { ...current.rounds[1], resultNodeId: previousResult.id },
      ],
    },
    { rounds: [current.rounds[0], { ...current.rounds[1], result: null }] },
    { rounds: [current.rounds[0], { ...current.rounds[1], status: 'failed' }] },
    {
      rounds: [
        current.rounds[0],
        { ...current.rounds[1], summary: 'different' },
      ],
    },
    { steps: current.steps.map(step => ({ ...step, round: 0 })) },
    { steps: current.steps.map(step => ({ ...step, round: 3 })) },
    { steps: [current.steps[0], { ...current.steps[1], status: 'failed' }] },
    { steps: [current.steps[0], { ...current.steps[1], round: 1 }] },
  ])
    expect(() => assertAgentWorkspace({ ...current, ...patch })).toThrow();
});

test.each(['running', 'waiting_input', 'failed', 'cancelled'] as const)(
  'continue is never accepted for %s workspaces',
  status => {
    expect(() =>
      assertAgentWorkspace(
        agentWorkspace({
          status,
          result: { kind: 'site_draft', id: 'draft', title: '当前成果' },
          allowedActions: ['continue'],
        }),
      ),
    ).toThrow();
  },
);

const continuationReceipt = (w: AgentWorkspace): AgentWorkspace => ({
  ...w,
  status: 'queued',
  revision: w.revision + 1,
  currentRound: w.currentRound + 1,
  summary: '',
  result: null,
  allowedActions: ['cancel'],
  rounds: [
    ...w.rounds,
    {
      number: w.currentRound + 1,
      instruction: '精简开头',
      baseResultNodeId: w.rounds[w.currentRound - 1].resultNodeId,
      resultNodeId: null,
      result: null,
      summary: '',
      status: 'queued',
      createdAt: w.updatedAt,
      completedAt: null,
    },
  ],
});

test('continuation sends only the current revision, explicit instruction and idempotency key to the same workspace', async () => {
  session();
  const w = agentWorkspace({
    status: 'succeeded',
    result: { kind: 'site_draft', id: 'draft', title: '当前成果' },
    allowedActions: ['continue'],
  });
  http.mockResolvedValue(continuationReceipt(w));
  await agentWorkspaceApi.decide(
    'token',
    w,
    'continue',
    '精简开头',
    'continue-request-1',
  );
  expect(http).toHaveBeenCalledWith(
    '/api/agent-workspaces/workspace-1/decision',
    {
      token: 'token',
      method: 'POST',
      headers: {
        'X-Miaoxun-AI-Contract': '1',
        'X-Miaoxun-Agent-Workspace': '6',
      },
      body: {
        revision: w.revision,
        operation: 'continue',
        text: '精简开头',
        idempotencyKey: 'continue-request-1',
      },
    },
  );
});

test.each([
  [undefined, 'stable-request'],
  ['', 'stable-request'],
  ['   ', 'stable-request'],
  ['文'.repeat(2001), 'stable-request'],
  ['修改标题', undefined],
  ['修改标题', 'short'],
  ['修改标题', 'x'.repeat(161)],
])('invalid continuation input never reaches HTTP: %p', async (text, key) => {
  session();
  const w = agentWorkspace({
    status: 'succeeded',
    result: { kind: 'site_draft', id: 'draft', title: '当前成果' },
    allowedActions: ['continue'],
  });
  await expect(
    agentWorkspaceApi.decide('token', w, 'continue', text, key),
  ).rejects.toThrow();
  expect(http).not.toHaveBeenCalled();
});

test('continuation never falls back to creation when the action or server contract is unavailable', async () => {
  session();
  const w = agentWorkspace({ status: 'succeeded', allowedActions: [] });
  await expect(
    agentWorkspaceApi.decide(
      'token',
      w,
      'continue',
      '修改标题',
      'stable-request',
    ),
  ).rejects.toThrow('当前状态');
  setAIContractSession('token', { aiTasks: 1, agentWorkspaces: 3 });
  await expect(
    agentWorkspaceApi.decide(
      'token',
      { ...w, allowedActions: ['continue'] },
      'continue',
      '修改标题',
      'stable-request',
    ),
  ).rejects.toThrow('任务续作');
  expect(http).not.toHaveBeenCalled();
});

test('a continuation requires a receipt from a later round, while a replay may return progress beyond the next round', async () => {
  session();
  const w = agentWorkspace({
    status: 'succeeded',
    result: { kind: 'site_draft', id: 'draft', title: '当前成果' },
    allowedActions: ['continue'],
  });
  http.mockResolvedValue(w);
  await expect(
    agentWorkspaceApi.decide(
      'token',
      w,
      'continue',
      '精简开头',
      'stable-request',
    ),
  ).rejects.toThrow('结果尚未确认');
  const firstReceipt = continuationReceipt(w);
  const nextResult = {
    kind: 'site_draft' as const,
    id: 'next-draft',
    title: '第二版',
  };
  const nextStep = workspaceStep({
    id: 'next-step',
    key: 'next-step',
    round: 2,
    result: nextResult,
  });
  const second = {
    ...firstReceipt,
    status: 'succeeded' as const,
    result: nextResult,
    steps: [...firstReceipt.steps, nextStep],
    allowedActions: ['continue' as const],
    rounds: [
      w.rounds[0],
      {
        ...firstReceipt.rounds[1],
        status: 'succeeded' as const,
        result: nextResult,
        resultNodeId: nextStep.id,
      },
    ],
  };
  const later = continuationReceipt(second);
  http.mockResolvedValue(later);
  await expect(
    agentWorkspaceApi.decide(
      'token',
      w,
      'continue',
      '精简开头',
      'stable-request',
    ),
  ).resolves.toEqual(later);
});

test('only explicit file source unavailability permits redacted historical result links', () => {
  const summary = '文件已删除、变化或授权不可用，历史成果正文不可读取。';
  const base = agentWorkspace({
    status: 'succeeded',
    summary,
    allowedActions: [],
    contextRefs: [{ kind: 'station-file', id: 'file-1', version: 'v1' }],
    steps: [workspaceStep({ summary, result: null })],
  });
  const redacted = {
    ...base,
    readAccess: {
      state: 'unavailable',
      code: 'WORKSPACE_FILE_SOURCE_UNAVAILABLE',
    },
    rounds: base.rounds.map(round => ({ ...round, resultNodeId: 'node-1' })),
  };
  expect(() => assertAgentWorkspace(redacted)).not.toThrow();
  for (const patch of [
    { readAccess: undefined },
    { readAccess: { state: 'unavailable', code: 'unknown' } },
    {
      readAccess: {
        state: 'unavailable',
        code: 'WORKSPACE_FILE_SOURCE_UNAVAILABLE',
        extra: true,
      },
    },
    { contextRefs: [{ kind: 'station-album', id: 'album-1' }] },
    { allowedActions: ['continue'] },
    { steps: [workspaceStep({ summary: 'unredacted summary' })] },
    {
      rounds: redacted.rounds.map(round => ({
        ...round,
        resultNodeId: 'missing-node',
      })),
    },
  ])
    expect(() => assertAgentWorkspace({ ...redacted, ...patch })).toThrow();
});

test('actual isolated HTTP deletion DTO keeps both historical rounds while protecting source content', async () => {
  expect(() => assertAgentWorkspace(fileWorkspaceUnavailable)).not.toThrow();
  expect(fileWorkspaceUnavailable.currentRound).toBe(2);
  expect(fileWorkspaceUnavailable.rounds[1].baseResultNodeId).toBe(
    fileWorkspaceUnavailable.rounds[0].resultNodeId,
  );
  expect(fileWorkspaceUnavailable.result).toBeNull();
  expect(fileWorkspaceUnavailable.allowedActions).not.toContain('continue');
  session();
  http.mockResolvedValueOnce([fileWorkspaceUnavailable]);
  await expect(agentWorkspaceApi.list('token')).resolves.toEqual([
    fileWorkspaceUnavailable,
  ]);
  http.mockResolvedValueOnce(fileWorkspaceUnavailable);
  await expect(
    agentWorkspaceApi.get('token', fileWorkspaceUnavailable.id),
  ).resolves.toEqual(fileWorkspaceUnavailable);
  const unmarked = { ...fileWorkspaceUnavailable, readAccess: undefined };
  expect(() => assertAgentWorkspace(unmarked)).toThrow();
});
