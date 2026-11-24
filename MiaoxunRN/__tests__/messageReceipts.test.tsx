import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, AppStateStatus } from 'react-native';
import { useDirectMessageReceipts } from '../src/features/messages/useDirectMessageReceipts';
import type {
  ChatMessage,
  ChatThread,
} from '../src/features/session/sessionTypes';
import * as api from '../src/services/api/messageReceiptApi';
import { request } from '../src/services/api/http';

jest.mock('../src/services/api/http', () => ({ request: jest.fn() }));

const uuid = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const userId = uuid(1);
const peerId = uuid(2);
const threadId = uuid(3);
const availability = { directDelivery: 1, readDisclosure: false } as const;
const message = (
  id: number,
  sender = userId,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({
  id: uuid(id),
  threadId,
  senderType: 'user',
  senderName: 'QA',
  content: 'Receipt QA',
  metadata: { senderUserId: sender },
  ...extra,
});
const thread = (
  messages: ChatMessage[],
  extra: Partial<ChatThread> = {},
): ChatThread => ({
  id: threadId,
  title: 'QA',
  kind: 'direct',
  peerUserId: peerId,
  pinned: false,
  avatarText: 'Q',
  lastContent: '',
  unreadCount: 0,
  messages,
  ...extra,
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
};
let tree: Renderer.ReactTestRenderer;
let value: ReturnType<typeof useDirectMessageReceipts>;
let changeAppState: (state: AppStateStatus) => void;
function Harness(props: Parameters<typeof useDirectMessageReceipts>[0]) {
  value = useDirectMessageReceipts(props);
  return null;
}
const render = async (
  messages: ChatMessage[],
  overrides: Partial<Parameters<typeof useDirectMessageReceipts>[0]> = {},
) => {
  const element = (
    <Harness
      thread={thread(messages)}
      token="qa-session"
      currentUserId={userId}
      availability={availability}
      {...overrides}
    />
  );
  await act(async () => {
    if (tree) tree.update(element);
    else tree = Renderer.create(element);
  });
};
beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    value: 'active',
  });
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, handler) => {
      changeAppState = handler;
      return { remove: jest.fn() };
    });
  jest
    .spyOn(api, 'acknowledgeDirectMessageDelivery')
    .mockImplementation(async (_id, ids) => ids);
  jest
    .spyOn(api, 'loadDirectMessageReceipts')
    .mockImplementation(async (_id, ids) =>
      ids.map(messageId => ({ messageId, status: 'accepted' })),
    );
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined as unknown as Renderer.ReactTestRenderer;
  jest.restoreAllMocks();
  jest.clearAllMocks();
  jest.useRealTimers();
});

test('only a recipient ACK confirms incoming copies; sender delivery requires an authoritative receipt', async () => {
  const sent = message(10);
  const received = message(11, peerId);
  await render([sent, received]);
  expect(api.acknowledgeDirectMessageDelivery).toHaveBeenCalledWith(
    threadId,
    [received.id],
    'qa-session',
  );
  expect(value.statuses).toEqual({ [sent.id]: 'accepted' });
  expect(value.statuses[received.id]).toBeUndefined();
  jest
    .mocked(api.loadDirectMessageReceipts)
    .mockResolvedValueOnce([{ messageId: sent.id, status: 'delivered' }]);
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(value.statuses[sent.id]).toBe('delivered');
  expect(api.acknowledgeDirectMessageDelivery).toHaveBeenCalledTimes(1);
});

test('missing server contract, group, Agent and background do not acknowledge messages', async () => {
  const messages = [message(11, peerId)];
  await render(messages, { availability: undefined });
  expect(value.supported).toBe(false);
  await render(messages, {
    thread: thread(messages, { kind: 'group', groupId: uuid(9) }),
  });
  await render(messages, { thread: thread(messages, { agentId: 'qa-agent' }) });
  await render(messages, { active: false });
  expect(api.acknowledgeDirectMessageDelivery).not.toHaveBeenCalled();
  await act(async () => changeAppState('background'));
  await render(messages);
  await act(async () => {
    jest.advanceTimersByTime(15000);
  });
  expect(api.acknowledgeDirectMessageDelivery).not.toHaveBeenCalled();
});

test('local pending, recalled, deleted, other sender and wrong-thread data are excluded', async () => {
  await render([
    message(11, peerId),
    message(12, peerId, { localStatus: 'sending' }),
    message(13, peerId, { recalledAt: new Date().toISOString() }),
    message(14, peerId, { deletedAt: new Date().toISOString() }),
    message(15, uuid(8)),
    message(16, peerId, { threadId: uuid(99) }),
  ]);
  expect(api.acknowledgeDirectMessageDelivery).toHaveBeenCalledWith(
    threadId,
    [uuid(11)],
    'qa-session',
  );
});

test('late responses cannot cross account scope or trigger a background continuation', async () => {
  const old = deferred<api.DirectMessageReceipt[]>();
  jest.mocked(api.loadDirectMessageReceipts).mockReturnValueOnce(old.promise);
  await render([message(10)]);
  await render([message(10)], {
    token: 'different-session',
    availability: undefined,
  });
  await act(async () =>
    old.resolve([{ messageId: uuid(10), status: 'delivered' }]),
  );
  expect(value.statuses[uuid(10)]).toBe('accepted');
  expect(api.loadDirectMessageReceipts).toHaveBeenCalledTimes(1);
  const ack = deferred<string[]>();
  jest
    .mocked(api.acknowledgeDirectMessageDelivery)
    .mockReturnValueOnce(ack.promise);
  await render([message(10), message(11, peerId)]);
  expect(api.loadDirectMessageReceipts).toHaveBeenCalledTimes(2);
  await act(async () => changeAppState('background'));
  await act(async () => ack.resolve([uuid(11)]));
  await act(async () => {
    jest.advanceTimersByTime(15000);
  });
  expect(api.loadDirectMessageReceipts).toHaveBeenCalledTimes(2);
});

test('failure reports unknown delivery, retries, and preserves confirmed delivery after message refresh', async () => {
  jest
    .mocked(api.loadDirectMessageReceipts)
    .mockRejectedValueOnce(new Error('offline'));
  await render([message(10)]);
  expect(value.syncError).toBe(true);
  expect(value.statuses[uuid(10)]).toBe('accepted');
  jest
    .mocked(api.loadDirectMessageReceipts)
    .mockResolvedValueOnce([{ messageId: uuid(10), status: 'delivered' }]);
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(value.statuses[uuid(10)]).toBe('delivered');
  await render([message(10), message(12)]);
  expect(value.statuses[uuid(10)]).toBe('delivered');
  expect(value.statuses[uuid(12)]).toBe('accepted');
});

test('a processed empty ACK response is not repeatedly submitted', async () => {
  jest.mocked(api.acknowledgeDirectMessageDelivery).mockResolvedValue([]);
  const first = message(11, peerId);
  const second = message(12, peerId);
  await render([first]);
  await act(async () => {
    jest.advanceTimersByTime(15000);
  });
  expect(api.acknowledgeDirectMessageDelivery).toHaveBeenCalledTimes(1);
  await render([first, second]);
  expect(api.acknowledgeDirectMessageDelivery).toHaveBeenLastCalledWith(
    threadId,
    [second.id],
    'qa-session',
  );
});

test('message arrival during a slow ACK leaves sender status polling active', async () => {
  const ack = deferred<string[]>();
  jest
    .mocked(api.acknowledgeDirectMessageDelivery)
    .mockReturnValue(ack.promise);
  const sent = message(10);
  await render([sent, message(11, peerId)]);
  expect(api.loadDirectMessageReceipts).toHaveBeenCalledTimes(1);
  await render([sent, message(11, peerId), message(12, peerId)]);
  jest
    .mocked(api.loadDirectMessageReceipts)
    .mockResolvedValueOnce([{ messageId: sent.id, status: 'delivered' }]);
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(value.statuses[sent.id]).toBe('delivered');
});

test('an older loaded message retains confirmed delivery outside the polling window', async () => {
  const old = message(10);
  jest
    .mocked(api.loadDirectMessageReceipts)
    .mockResolvedValueOnce([{ messageId: old.id, status: 'delivered' }]);
  await render([old]);
  await render([
    old,
    ...Array.from({ length: 50 }, (_, index) => message(index + 20)),
  ]);
  expect(value.statuses[old.id]).toBe('delivered');
  expect(
    jest.mocked(api.loadDirectMessageReceipts).mock.lastCall?.[1],
  ).not.toContain(old.id);
});

test('batches are limited to 50 received and 50 outgoing messages', async () => {
  await render(
    Array.from({ length: 140 }, (_, index) =>
      message(index + 20, index % 2 ? peerId : userId),
    ),
  );
  expect(
    jest.mocked(api.acknowledgeDirectMessageDelivery).mock.calls[0][1],
  ).toHaveLength(50);
  expect(
    jest.mocked(api.loadDirectMessageReceipts).mock.calls[0][1],
  ).toHaveLength(50);
});

test('API adapters reject fabricated read state and receipts for unrequested messages', async () => {
  jest.restoreAllMocks();
  jest.mocked(request).mockResolvedValueOnce({
    receipts: [{ messageId: uuid(10), status: 'read' }],
  });
  await expect(
    api.loadDirectMessageReceipts(threadId, [uuid(10)], 'qa'),
  ).rejects.toThrow('有效');
  jest.mocked(request).mockResolvedValueOnce({
    receipts: [{ messageId: uuid(99), status: 'delivered' }],
  });
  await expect(
    api.loadDirectMessageReceipts(threadId, [uuid(10)], 'qa'),
  ).rejects.toThrow('有效');
  jest
    .mocked(request)
    .mockResolvedValueOnce({ acknowledgedMessageIds: [uuid(99)] });
  await expect(
    api.acknowledgeDirectMessageDelivery(threadId, [uuid(10)], 'qa'),
  ).rejects.toThrow('有效');
});
