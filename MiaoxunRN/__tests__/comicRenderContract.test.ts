import { comicRenderTask } from '../__fixtures__/comicRender';
import { parseComicRenderTask } from '../src/models/comicRender';
import { comicRenderApi } from '../src/services/api/comicRenderApi';
import {
  assertAIContract,
  assertComicRenderContract,
  clearAIContractSession,
  setAIContractSession,
  supportsComicRenders,
} from '../src/services/aiContract';

const response = (data: unknown, extra = {}, status = 200) =>
  ({
    ok: status < 400,
    status,
    headers: { get: () => 'request-comic' },
    text: async () => JSON.stringify({ data, ...extra }),
  } as unknown as Response);

const task = comicRenderTask();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  clearAIContractSession();
  jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  clearAIContractSession();
  jest.restoreAllMocks();
});

test('comic bootstrap capability is exact, session scoped, and independent of legacy tasks', () => {
  setAIContractSession('owner', { aiTasks: 1, comicRenders: 1 });
  expect(supportsComicRenders('owner')).toBe(true);
  expect(supportsComicRenders('other')).toBe(false);
  expect(() => assertAIContract('owner')).not.toThrow();
  setAIContractSession('owner', { comicRenders: 1 });
  expect(() => assertComicRenderContract('owner')).not.toThrow();
  expect(() => assertAIContract('owner')).toThrow();
  clearAIContractSession();
  expect(() => assertComicRenderContract('owner')).toThrow();
});

test.each([
  undefined,
  {},
  { aiTasks: 1 },
  { comicRenders: 2 },
  { comicRenders: '1' },
])(
  'unadvertised comic contract blocks writes and reads before HTTP: %p',
  async contracts => {
    setAIContractSession('owner', contracts);
    globalThis.fetch = jest.fn();
    await expect(
      comicRenderApi.create('owner', 'comic-1', 'key-1'),
    ).rejects.toThrow();
    await expect(comicRenderApi.list('owner', 'comic-1')).rejects.toThrow();
    await expect(comicRenderApi.get('owner', 'render-1')).rejects.toThrow();
    await expect(comicRenderApi.events('owner', 'render-1')).rejects.toThrow();
    await expect(comicRenderApi.cancel('owner', task)).rejects.toThrow();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  },
);

test('task parser accepts an owned safe DTO and a deleted successful image reference', () => {
  expect(parseComicRenderTask(task)).toEqual(task);
  const deleted = comicRenderTask({
    status: 'succeeded',
    phase: 'completed',
    allowedActions: [],
    progress: { total: 2, succeeded: 2, failed: 0, unknown: 0 },
    frames: task.frames.map(frame => ({
      ...frame,
      status: 'succeeded',
      mediaAssetId: null,
    })),
  });
  expect(parseComicRenderTask(deleted)).toEqual(deleted);
});

test('partial completion retains a saved frame when later frames are skipped before dispatch', () => {
  const partial = comicRenderTask({
    status: 'partially_succeeded',
    phase: 'completed',
    allowedActions: [],
    progress: { total: 2, succeeded: 1, failed: 0, unknown: 0 },
    frames: [
      {
        frameIndex: 1,
        status: 'succeeded',
        mediaAssetId: 'asset-1',
        errorCode: null,
      },
      {
        frameIndex: 2,
        status: 'skipped',
        mediaAssetId: null,
        errorCode: 'AGENT_ACCESS_REVOKED',
      },
    ],
  });
  expect(parseComicRenderTask(partial)).toEqual(partial);
});

test.each([
  { ...task, providerUrl: 'https://provider.invalid/image.png' },
  {
    ...task,
    frames: [{ ...task.frames[0], status: 'completed-ish' }, task.frames[1]],
  },
  {
    ...task,
    frames: [
      { ...task.frames[0], mediaAssetId: 'https://provider.invalid/x' },
      task.frames[1],
    ],
  },
  {
    ...task,
    frames: [
      { ...task.frames[0], objectKey: 'private/object' },
      task.frames[1],
    ],
  },
  { ...task, frames: [task.frames[0], task.frames[0]] },
  { ...task, revision: 0 },
  { ...task, progress: { total: 2, succeeded: 2, failed: 0, unknown: 0 } },
  { ...task, allowedActions: ['retry'] },
  {
    ...task,
    status: 'running',
    phase: 'rendering',
    allowedActions: ['cancel'],
  },
  { ...task, status: 'failed', phase: 'completed', allowedActions: [] },
  { ...task, updatedAt: 'invalid-date' },
  {
    ...task,
    error: { code: 'FAIL', message: 'Failed', providerBody: 'secret' },
  },
])('rejects unsafe or internally inconsistent task data: %p', invalid => {
  expect(() => parseComicRenderTask(invalid)).toThrow();
});

test('dedicated endpoints advertise the comic header and only enqueue idempotency or cancel revision', async () => {
  setAIContractSession('owner', { aiTasks: 1, comicRenders: 1 });
  const cancelled = comicRenderTask({
    status: 'cancelled',
    phase: 'cancelled',
    revision: 2,
    allowedActions: [],
    frames: task.frames.map(frame => ({ ...frame, status: 'skipped' })),
  });
  const page = {
    task,
    events: [
      {
        sequence: 1,
        status: 'queued',
        phase: 'queued',
        progress: task.progress,
        createdAt: task.createdAt,
      },
    ],
    hasMore: false,
    nextSequence: 1,
  };
  globalThis.fetch = jest
    .fn()
    .mockResolvedValueOnce(response(task, { reused: false }, 201))
    .mockResolvedValueOnce(response([task]))
    .mockResolvedValueOnce(response(task))
    .mockResolvedValueOnce(response(page))
    .mockResolvedValueOnce(response(cancelled));
  await expect(
    comicRenderApi.create('owner', 'comic-1', 'key-1'),
  ).resolves.toEqual(task);
  await expect(comicRenderApi.list('owner', 'comic-1')).resolves.toEqual([
    task,
  ]);
  await expect(comicRenderApi.get('owner', 'render-1')).resolves.toEqual(task);
  await expect(comicRenderApi.events('owner', 'render-1')).resolves.toEqual(
    page,
  );
  await expect(comicRenderApi.cancel('owner', task)).resolves.toEqual(
    cancelled,
  );
  const calls = (globalThis.fetch as jest.Mock).mock.calls;
  expect(calls.map(([url]) => new URL(url).pathname)).toEqual([
    '/api/station/comic-diaries/comic-1/render-tasks',
    '/api/station/comic-diaries/comic-1/render-tasks',
    '/api/station/comic-render-tasks/render-1',
    '/api/station/comic-render-tasks/render-1/events',
    '/api/station/comic-render-tasks/render-1/cancel',
  ]);
  for (const [, options] of calls) {
    expect(options.headers).toMatchObject({
      'X-Miaoxun-Comic-Renders': '1',
      Authorization: 'Bearer owner',
    });
    expect(options.headers['X-Miaoxun-AI-Contract']).toBeUndefined();
  }
  expect(JSON.parse(calls[0][1].body)).toEqual({ idempotencyKey: 'key-1' });
  expect(JSON.parse(calls[4][1].body)).toEqual({ revision: 1 });
});

test('list/detail/enqueue reject a task belonging to a different storyboard or requested task', async () => {
  setAIContractSession('owner', { comicRenders: 1 });
  globalThis.fetch = jest
    .fn()
    .mockResolvedValueOnce(
      response([comicRenderTask({ comicDiaryId: 'another-comic' })]),
    )
    .mockResolvedValueOnce(response(comicRenderTask({ id: 'another-task' })))
    .mockResolvedValueOnce(
      response(comicRenderTask({ comicDiaryId: 'another-comic' })),
    );
  await expect(comicRenderApi.list('owner', 'comic-1')).rejects.toThrow();
  await expect(comicRenderApi.get('owner', 'render-1')).rejects.toThrow();
  await expect(
    comicRenderApi.create('owner', 'comic-1', 'key-1'),
  ).rejects.toThrow();
});

test.each([
  {
    sequence: 1,
    status: 'queued',
    phase: 'queued',
    progress: task.progress,
    createdAt: task.createdAt,
    providerUrl: 'https://provider.invalid/x',
  },
  {
    sequence: 2,
    status: 'queued',
    phase: 'queued',
    progress: task.progress,
    createdAt: task.createdAt,
  },
  {
    sequence: 1,
    status: 'running',
    phase: 'rendering',
    progress: task.progress,
    createdAt: task.createdAt,
  },
  {
    sequence: 1,
    status: 'queued',
    phase: 'queued',
    progress: { total: 2, succeeded: 3, failed: 0, unknown: 0 },
    createdAt: task.createdAt,
  },
])(
  'event parsing rejects leaked data, cursor gaps, and mismatched snapshots: %p',
  async event => {
    setAIContractSession('owner', { comicRenders: 1 });
    globalThis.fetch = jest.fn(async () =>
      response({ task, events: [event], hasMore: false, nextSequence: 1 }),
    );
    await expect(comicRenderApi.events('owner', 'render-1')).rejects.toThrow();
  },
);

test('provider unavailable remains an explicit 503 without automatic retries', async () => {
  setAIContractSession('owner', { comicRenders: 1 });
  globalThis.fetch = jest.fn(async () =>
    response(
      undefined,
      {
        error: {
          code: 'COMIC_IMAGE_PROVIDER_UNAVAILABLE',
          message: '图片服务尚未就绪。',
        },
      },
      503,
    ),
  );
  await expect(
    comicRenderApi.create('owner', 'comic-1', 'key-1'),
  ).rejects.toMatchObject({
    status: 503,
    code: 'COMIC_IMAGE_PROVIDER_UNAVAILABLE',
  });
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});
