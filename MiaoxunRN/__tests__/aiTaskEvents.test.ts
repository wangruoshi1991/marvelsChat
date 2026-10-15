import { AITaskDTO } from '../src/models/aiTask';
import { aiTaskApi } from '../src/services/api/aiTaskApi';
import { request } from '../src/services/api/http';
import {
  clearAIContractSession,
  setAIContractSession,
} from '../src/services/aiContract';

jest.mock('../src/services/api/http', () => ({ request: jest.fn() }));
const mockedRequest = jest.mocked(request);
const task: AITaskDTO = {
  id: 'task-1',
  contractVersion: 1,
  kind: 'agent_message',
  agentId: 'album-manager',
  agentVersion: '1',
  goal: '用户目标',
  threadId: 'thread-1',
  inputMessageId: 'message-1',
  status: 'running',
  revision: 2,
  phase: 'validating',
  contextRefs: [],
  artifacts: [],
  approval: null,
  error: null,
  createdAt: '2026-10-12T00:00:00Z',
  updatedAt: '2026-10-12T00:00:01Z',
  allowedActions: [],
};
const page = () => ({
  task,
  events: [
    {
      sequence: 1,
      status: 'queued',
      phase: 'queued',
      createdAt: '2026-10-12T00:00:00Z',
    },
    {
      sequence: 2,
      status: 'running',
      phase: 'validating',
      createdAt: '2026-10-12T00:00:01Z',
    },
  ],
  hasMore: false,
  nextSequence: 2,
});

beforeEach(() => {
  jest.clearAllMocks();
  setAIContractSession('owner', { aiTasks: 1 });
});
afterEach(() => clearAIContractSession());

test('reads owner-scoped events with the existing AI contract and a bounded cursor', async () => {
  mockedRequest.mockResolvedValue(page());
  await expect(aiTaskApi.events('owner', 'task-1')).resolves.toEqual(page());
  expect(mockedRequest).toHaveBeenCalledWith(
    '/api/tasks/task-1/events?afterSequence=0&limit=100',
    {
      token: 'owner',
      headers: { 'X-Miaoxun-AI-Contract': '1' },
    },
  );
  mockedRequest.mockResolvedValue({ ...page(), events: [], nextSequence: 2 });
  await expect(aiTaskApi.events('owner', 'task-1', 2)).resolves.toMatchObject({
    nextSequence: 2,
  });
});

test.each([
  [
    'another task',
    () => ({ ...page(), task: { ...task, id: 'different-task' } }),
  ],
  [
    'duplicate event',
    () => ({ ...page(), events: [page().events[0], page().events[0]] }),
  ],
  ['missing event', () => ({ ...page(), events: [page().events[1]] })],
  [
    'unknown status',
    () => ({
      ...page(),
      events: [{ ...page().events[0], status: 'thinking' }],
    }),
  ],
  [
    'unknown phase',
    () => ({
      ...page(),
      events: [{ ...page().events[0], phase: 'reasoning' }],
    }),
  ],
  [
    'mismatched phase',
    () => ({
      ...page(),
      events: [{ ...page().events[0], phase: 'completed' }],
    }),
  ],
  [
    'private payload',
    () => ({
      ...page(),
      events: [{ ...page().events[0], prompt: 'private-provider-input' }],
    }),
  ],
  [
    'invalid date',
    () => ({
      ...page(),
      events: [{ ...page().events[0], createdAt: 'yesterday' }],
    }),
  ],
  [
    'unsafe error',
    () => ({
      ...page(),
      events: [{ ...page().events[0], errorCode: 'raw provider response' }],
    }),
  ],
  ['wrong cursor', () => ({ ...page(), nextSequence: 1 })],
  [
    'empty forward page',
    () => ({ ...page(), events: [], hasMore: true, nextSequence: 0 }),
  ],
  [
    'event beyond revision',
    () => ({ ...page(), task: { ...task, revision: 1 } }),
  ],
  [
    'inconsistent snapshot',
    () => ({ ...page(), task: { ...task, phase: 'searching' } }),
  ],
])(
  'rejects %s instead of displaying unsupported task history',
  async (_name, invalidPage) => {
    mockedRequest.mockResolvedValue(invalidPage());
    await expect(aiTaskApi.events('owner', 'task-1')).rejects.toThrow(
      '不受支持',
    );
  },
);

test('invalid cursors and other account tokens never issue an HTTP request', async () => {
  await expect(aiTaskApi.events('other-owner', 'task-1')).rejects.toThrow();
  await expect(aiTaskApi.events('owner', 'task-1', -1)).rejects.toThrow(
    '游标无效',
  );
  await expect(aiTaskApi.events('owner', 'task-1', 1.5)).rejects.toThrow(
    '游标无效',
  );
  expect(mockedRequest).not.toHaveBeenCalled();
});
