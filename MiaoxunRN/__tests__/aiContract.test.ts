import {
  assertAIContract,
  assertUIPreferencesContract,
  clearAIContractSession,
  setAIContractSession,
} from '../src/services/aiContract';
import { uiPreferencesApi } from '../src/services/api/uiPreferencesApi';
import { aiTaskApi } from '../src/services/api/aiTaskApi';
import { messageApi } from '../src/services/api/messageApi';
import { stationAgentApi } from '../src/services/api/stationAgentApi';
import { request } from '../src/services/api/http';
import { AITaskDTO } from '../src/models/aiTask';
import { ButlerClientContextPayload } from '../src/models/api';

jest.mock('../src/services/api/http', () => ({ request: jest.fn() }));
const mockedRequest = jest.mocked(request);
const task: AITaskDTO = {
  id: 'task',
  contractVersion: 1,
  kind: 'site_draft',
  agentId: 'site-builder',
  agentVersion: '1',
  goal: 'My site',
  threadId: null,
  inputMessageId: null,
  status: 'queued',
  revision: 1,
  phase: 'queued',
  contextRefs: [],
  artifacts: [],
  approval: null,
  error: null,
  createdAt: '2026-10-12T00:00:00Z',
  updatedAt: '2026-10-12T00:00:00Z',
  allowedActions: ['cancel'],
};

beforeEach(() => {
  clearAIContractSession();
  mockedRequest.mockReset();
});

test.each([
  undefined,
  null,
  {},
  { aiTasks: 0 },
  { aiTasks: 2 },
  { aiTasks: '1' },
])(
  'missing or unsupported bootstrap contract blocks AI requests before HTTP: %p',
  async contracts => {
    setAIContractSession('owner', contracts);
    await expect(
      stationAgentApi.createStationSiteDraft('owner', {
        prompt: 'My site',
        idempotencyKey: 'stable-key',
      }),
    ).rejects.toThrow('当前服务器不支持');
    await expect(aiTaskApi.list('owner')).rejects.toThrow('当前服务器不支持');
    await expect(aiTaskApi.decide('owner', task, 'cancel')).rejects.toThrow(
      '当前服务器不支持',
    );
    expect(() =>
      messageApi.sendMessage(
        'thread',
        'Use this',
        'owner',
        undefined,
        undefined,
        undefined,
        45000,
        [{ kind: 'station-album', id: 'album' }],
      ),
    ).toThrow('当前服务器不支持');
    expect(mockedRequest).not.toHaveBeenCalled();
  },
);

test('accepted bootstrap applies only to its active login and is cleared on session reset', async () => {
  setAIContractSession('owner', { aiTasks: 1, siteDocuments: 2 });
  expect(() => assertAIContract('other')).toThrow();
  mockedRequest.mockResolvedValue({ task });
  await stationAgentApi.createStationSiteDraft('owner', {
    prompt: 'My site',
    idempotencyKey: 'stable-key',
  });
  expect(mockedRequest).toHaveBeenCalledWith(
    '/api/station/site-drafts',
    expect.objectContaining({
      headers: { 'X-Miaoxun-AI-Contract': '1', 'X-Miaoxun-Site-Document': '2' },
      token: 'owner',
    }),
  );
  mockedRequest.mockResolvedValue([]);
  await aiTaskApi.list('owner');
  expect(mockedRequest).toHaveBeenLastCalledWith(
    '/api/tasks?limit=30',
    expect.objectContaining({ headers: { 'X-Miaoxun-AI-Contract': '1' } }),
  );
  clearAIContractSession();
  expect(() => assertAIContract('owner')).toThrow();
  setAIContractSession('other', { aiTasks: 1 });
  expect(() => assertAIContract('owner')).toThrow();
  expect(() => assertAIContract('other')).not.toThrow();
  setAIContractSession('other', {});
  expect(() => assertAIContract('other')).toThrow();
});

test('UI preference requests require the bootstrap UI preference contract', async () => {
  expect(() =>
    uiPreferencesApi.previewUIPreferences('owner', '把妙页卡片变紧凑', 'miao'),
  ).toThrow('界面偏好');
  setAIContractSession('owner', { uiPreferences: 1 });
  mockedRequest.mockResolvedValue({
    id: 'preview',
    status: 'pending',
    baseRevision: 0,
    expiresAt: '2026-11-03T04:10:00Z',
    patch: {},
    preferences: {},
    intent: '调整界面',
    rationale: '测试',
    affectedSurfaces: ['miao'],
  });
  await uiPreferencesApi.previewUIPreferences(
    'owner',
    '把妙页卡片变紧凑',
    'miao',
  );
  expect(mockedRequest).toHaveBeenCalledWith(
    '/api/ui/preferences/preview',
    expect.objectContaining({
      headers: { 'X-Miaoxun-UI-Preferences': '1' },
      token: 'owner',
    }),
  );
  expect(() => assertUIPreferencesContract('other')).toThrow();
});

test('ordinary message and draft metadata reads do not require the AI contract', async () => {
  mockedRequest
    .mockResolvedValueOnce({ messages: [] })
    .mockResolvedValueOnce([]);
  await messageApi.sendMessage('direct-thread', 'Hello', 'owner');
  await stationAgentApi.stationSiteDrafts('owner');
  expect(mockedRequest).toHaveBeenCalledTimes(2);
});

test('message requests advertise UI preview support only for the active compatible session', async () => {
  setAIContractSession('owner', { uiPreferences: 1 });
  await messageApi.sendMessage('butler-thread', '调整按钮', 'owner');
  expect(mockedRequest).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({
      headers: expect.objectContaining({ 'X-Miaoxun-UI-Preferences': '1' }),
    }),
  );
  await messageApi.sendMessage('butler-thread', '调整按钮', 'other');
  expect(mockedRequest).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({
      headers: expect.not.objectContaining({ 'X-Miaoxun-UI-Preferences': '1' }),
    }),
  );
});

test('an older task server cannot receive structured-page generation or confirmation', async () => {
  setAIContractSession('owner', { aiTasks: 1 });
  await expect(
    stationAgentApi.createStationSiteDraft('owner', {
      prompt: 'Page',
      idempotencyKey: 'same-request',
    }),
  ).rejects.toThrow('结构化页面');
  await expect(stationAgentApi.siteDocument('owner', 'draft')).rejects.toThrow(
    '结构化页面',
  );
  await expect(aiTaskApi.decide('owner', task, 'confirm')).rejects.toThrow(
    '结构化页面',
  );
  expect(mockedRequest).not.toHaveBeenCalled();
  mockedRequest.mockResolvedValue(task);
  await aiTaskApi.decide('owner', task, 'cancel');
  expect(mockedRequest).toHaveBeenCalledTimes(1);
});

test('page confirmation sends both contracts while other task operations remain unchanged', async () => {
  setAIContractSession('owner', { aiTasks: 1, siteDocuments: 2 });
  mockedRequest.mockResolvedValue(task);
  await aiTaskApi.decide('owner', task, 'confirm');
  expect(mockedRequest).toHaveBeenCalledWith(
    '/api/tasks/task/decision',
    expect.objectContaining({
      headers: { 'X-Miaoxun-AI-Contract': '1', 'X-Miaoxun-Site-Document': '2' },
      body: expect.objectContaining({ operation: 'confirm' }),
    }),
  );
  setAIContractSession('other', { aiTasks: 1, siteDocuments: 2 });
  await expect(stationAgentApi.siteDocument('owner', 'draft')).rejects.toThrow(
    '当前服务器不支持',
  );
});

test('Butler scope reset is sent only when explicitly true and requires both authenticated AI contracts', async () => {
  mockedRequest.mockResolvedValue({ messages: [] });
  expect(() =>
    messageApi.sendMessage(
      'thread',
      'Continue',
      'owner',
      undefined,
      undefined,
      'stable',
      45000,
      [],
      true,
    ),
  ).toThrow('当前服务器不支持');
  setAIContractSession('owner', { aiTasks: 1 });
  expect(() =>
    messageApi.sendMessage(
      'thread',
      'Continue',
      'owner',
      undefined,
      undefined,
      'stable',
      45000,
      [],
      true,
    ),
  ).toThrow('Agent 协作');
  expect(mockedRequest).not.toHaveBeenCalled();
  setAIContractSession('owner', { aiTasks: 1, agentWorkspaces: 6 });
  await messageApi.sendMessage(
    'thread',
    'Continue',
    'owner',
    undefined,
    undefined,
    'stable',
    45000,
    [],
    true,
  );
  expect(mockedRequest.mock.calls[0][1]?.body).toEqual({
    content: 'Continue',
    contextRefs: [],
    clientMessageId: 'stable',
    butlerContextReset: true,
  });
  await messageApi.sendMessage(
    'thread',
    'Chat',
    'owner',
    undefined,
    undefined,
    'next',
    45000,
    [],
    false,
  );
  expect(mockedRequest.mock.calls[1][1]?.body).toEqual({
    content: 'Chat',
    contextRefs: [],
    clientMessageId: 'next',
  });
});

const butlerContext: ButlerClientContextPayload = {
  currentPage: 'messages.butler',
  language: 'zh',
  appearance: 'light',
  profileSnapshot: {
    nickname: 'Tester',
    followersCount: 0,
    followingCount: 0,
    collectionsCount: 0,
    miaoPoints: 0,
  },
  enabledAgentIds: [],
};

test('a Butler chat without references sends both AI1 and workspace6 declarations', async () => {
  setAIContractSession('owner', { aiTasks: 1, agentWorkspaces: 6 });
  mockedRequest.mockResolvedValue({ messages: [] });
  await messageApi.sendMessage('butler-thread', '你好', 'owner', butlerContext);
  expect(mockedRequest).toHaveBeenCalledWith(
    '/api/threads/butler-thread/messages',
    expect.objectContaining({
      token: 'owner',
      headers: {
        'X-Miaoxun-AI-Contract': '1',
        'X-Miaoxun-Agent-Workspace': '6',
      },
      body: { content: '你好', contextRefs: [], clientContext: butlerContext },
    }),
  );
});

test.each([
  undefined,
  { aiTasks: 1 },
  { aiTasks: 1, agentWorkspaces: 1 },
  { aiTasks: 1, agentWorkspaces: 2 },
  { aiTasks: 1, agentWorkspaces: 3 },
  { aiTasks: 1, agentWorkspaces: 4 },
  { aiTasks: 1, agentWorkspaces: 5 },
  { aiTasks: 1, agentWorkspaces: 7 },
  { aiTasks: 1, agentWorkspaces: '4' },
  { agentWorkspaces: 6 },
])(
  'an unknown or older server cannot receive a reference-free Butler request: %p',
  contracts => {
    setAIContractSession('owner', contracts);
    expect(() =>
      messageApi.sendMessage('butler-thread', '你好', 'owner', butlerContext),
    ).toThrow();
    expect(mockedRequest).not.toHaveBeenCalled();
  },
);

test('workspace declarations do not impose a workspace gate on friends or other Agent requests', async () => {
  mockedRequest.mockResolvedValue({ messages: [] });
  await messageApi.sendMessage('friend-thread', '你好', 'owner');
  setAIContractSession('owner', { aiTasks: 1 });
  const refs = [{ kind: 'station-album' as const, id: 'album' }];
  await messageApi.sendMessage(
    'album-thread',
    '查找照片',
    'owner',
    null,
    null,
    'album-request',
    45000,
    refs,
  );
  expect(mockedRequest).toHaveBeenCalledTimes(2);
  expect(mockedRequest.mock.calls[1][1]).toEqual(
    expect.objectContaining({
      headers: {
        'X-Miaoxun-AI-Contract': '1',
        'X-Miaoxun-Agent-Workspace': '6',
      },
      body: {
        content: '查找照片',
        contextRefs: refs,
        clientMessageId: 'album-request',
      },
    }),
  );
});

test('another login cannot reuse an accepted Butler workspace contract', () => {
  setAIContractSession('another-owner', { aiTasks: 1, agentWorkspaces: 6 });
  expect(() =>
    messageApi.sendMessage('butler-thread', '你好', 'owner', butlerContext),
  ).toThrow();
  expect(mockedRequest).not.toHaveBeenCalled();
});
