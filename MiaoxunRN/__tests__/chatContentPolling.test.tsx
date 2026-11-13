import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { MiaoxunApiError } from '../src/services/api/http';
import { comicRenderApi } from '../src/services/api/comicRenderApi';
import { comicRenderTask } from '../__fixtures__/comicRender';
import Renderer, { act } from 'react-test-renderer';
import { useChatContentPreviews } from '../src/features/messages/useChatContentPreviews';
import { chatContentApi } from '../src/services/api/chatContentApi';
import { setAIContractSession } from '../src/services/aiContract';
import { ContentPreview } from '../src/models/chatContentPreview';
jest.mock('../src/services/api/comicRenderApi', () => ({
  comicRenderApi: { get: jest.fn() },
}));
jest.mock('../src/services/api/chatContentApi', () => ({
  chatContentApi: { get: jest.fn(), confirm: jest.fn(), reject: jest.fn() },
}));
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const threadId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const messageId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const message = {
  id: messageId,
  threadId,
  senderType: 'agent',
  senderName: '漫画',
  content: '',
  metadata: { contentPreview: { version: 1 as const, id } },
};
const proposal = {
  id,
  version: 1,
  revision: 1,
  snapshotHash: 'a'.repeat(64),
  kind: 'diary',
  status: 'pending',
  threadId,
  inputMessageId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  outputMessageId: messageId,
  snapshot: { title: '散步', body: '走过桥', mood: '' },
  sources: [],
  allowedActions: ['confirm', 'reject'],
  expiresAt: '2099-01-01T00:00:00Z',
  result: null,
} as ContentPreview;
let state: ReturnType<typeof useChatContentPreviews>;
function Harness({
  token = 'owner',
  visible = [messageId],
}: {
  token?: string;
  visible?: string[];
}) {
  state = useChatContentPreviews({
    token,
    userId: token,
    threadId,
    agentId: 'comic-diary',
    messages: [message],
    visibleMessageIds: visible,
    active: true,
  });
  return null;
}
let lifecycle: (next: AppStateStatus) => void;
beforeEach(() => {
  jest.resetAllMocks();
  AppState.currentState = 'active';
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      lifecycle = callback;
      return { remove: jest.fn() };
    });
  setAIContractSession('owner', { chatContent: 1, comicRenders: 1 });
});
test('does not apply an old session read after the account changes', async () => {
  let finish!: (value: ContentPreview) => void;
  jest.mocked(chatContentApi.get).mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  let tree: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<Harness />);
  });
  await act(async () => {
    tree!.update(<Harness token="other" />);
  });
  await act(async () => {
    finish(proposal);
  });
  expect(state.entries[id]?.preview).toBeUndefined();
});
test('double confirmation dispatches once and unknown transport offers read recovery only', async () => {
  jest.mocked(chatContentApi.get).mockResolvedValue(proposal);
  let reject!: (value: Error) => void;
  jest.mocked(chatContentApi.confirm).mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  await act(async () => {
    Renderer.create(<Harness />);
  });
  let pending: Promise<void>;
  await act(async () => {
    pending = state.confirm(id);
    state.confirm(id).catch(() => undefined);
  });
  expect(chatContentApi.confirm).toHaveBeenCalledTimes(1);
  await act(async () => {
    reject(new Error('network'));
    await pending!;
  });
  await act(async () => {
    await state.confirm(id);
  });
  expect(chatContentApi.confirm).toHaveBeenCalledTimes(1);
  expect(state.entries[id].error).toContain('刷新');
  await act(async () => {
    await state.refresh(id);
  });
  expect(chatContentApi.get).toHaveBeenCalledTimes(2);
});

test('an unconfirmed transport result stays frozen after scrolling away and back', async () => {
  jest.mocked(chatContentApi.get).mockResolvedValue(proposal);
  jest.mocked(chatContentApi.confirm).mockRejectedValue(new Error('timeout'));
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<Harness />);
  });
  await act(async () => {
    await state.confirm(id);
  });
  await act(async () => {
    tree.update(<Harness visible={[]} />);
  });
  await act(async () => {
    tree.update(<Harness />);
  });
  await act(async () => {
    await state.confirm(id);
  });
  expect(chatContentApi.confirm).toHaveBeenCalledTimes(1);
  expect(state.entries[id].error).toContain('不要重复生成');
  await act(async () => tree.unmount());
});

test('central task polling ignores rollback, clears background results, and stops after a terminal read', async () => {
  jest.useFakeTimers();
  const confirmed = {
    ...proposal,
    kind: 'comic',
    status: 'confirmed',
    revision: 2,
    allowedActions: [],
    result: { comicDiaryId: 'comic-1', comicRenderTaskId: 'render-1' },
  } as unknown as ContentPreview;
  jest.mocked(chatContentApi.get).mockResolvedValue(confirmed);
  const running = comicRenderTask({
    status: 'running',
    revision: 5,
    allowedActions: [],
  });
  const terminal = comicRenderTask({
    status: 'succeeded',
    revision: 6,
    allowedActions: [],
  });
  jest
    .mocked(comicRenderApi.get)
    .mockResolvedValueOnce(running)
    .mockResolvedValueOnce({ ...running, revision: 4 })
    .mockResolvedValueOnce(terminal);
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<Harness />);
  });
  expect(state.entries[id].task?.revision).toBe(5);
  await act(async () => {
    jest.advanceTimersByTime(3000);
  });
  expect(state.entries[id].task?.revision).toBe(5);
  await act(async () => {
    lifecycle('background');
  });
  expect(state.entries).toEqual({});
  await act(async () => {
    jest.advanceTimersByTime(30000);
  });
  expect(comicRenderApi.get).toHaveBeenCalledTimes(2);
  await act(async () => {
    lifecycle('active');
  });
  expect(state.entries[id].task?.revision).toBe(6);
  await act(async () => {
    jest.advanceTimersByTime(30000);
  });
  expect(comicRenderApi.get).toHaveBeenCalledTimes(3);
  await act(async () => tree.unmount());
  jest.useRealTimers();
});

test.each([
  { status: 403 },
  { status: 409 },
  { status: 503, code: 'COMIC_RENDER_NOT_READY' },
])(
  'a definite server rejection can refresh and explicitly confirm again with the original key: %p',
  async options => {
    jest.mocked(chatContentApi.get).mockResolvedValue(proposal);
    jest
      .mocked(chatContentApi.confirm)
      .mockRejectedValue(new MiaoxunApiError('服务明确拒绝', options));
    let tree!: Renderer.ReactTestRenderer;
    await act(async () => {
      tree = Renderer.create(<Harness />);
    });
    await act(async () => {
      await state.confirm(id);
    });
    expect(state.entries[id].error).toContain('当前提案状态');
    await act(async () => {
      await state.refresh(id);
    });
    expect(state.entries[id].error).toBe('');
    await act(async () => {
      await state.confirm(id);
    });
    expect(chatContentApi.confirm).toHaveBeenCalledTimes(2);
    expect(jest.mocked(chatContentApi.confirm).mock.calls[1][2]).toBe(
      jest.mocked(chatContentApi.confirm).mock.calls[0][2],
    );
    await act(async () => tree.unmount());
  },
);
