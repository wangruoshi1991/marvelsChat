import React from 'react';
import { Modal } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ChatBatchForwardSheet } from '../src/features/messages/ChatBatchForwardSheet';
import type {
  ChatMessage,
  ChatThread,
} from '../src/features/session/sessionTypes';
import { palettes } from '../src/shared/theme';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaProvider: View, SafeAreaView: View };
});
jest.mock('../src/shared/useReduceMotion', () => ({
  useReduceMotion: () => true,
}));

const message = (id: string): ChatMessage => ({
  id,
  threadId: 'source',
  senderType: 'user',
  senderName: 'Sender',
  content: `Message ${id}`,
});
const one = message('one');
const two = message('two');
const three = message('three');
const target: ChatThread = {
  id: 'target',
  title: 'Team',
  avatarText: 'T',
  kind: 'group',
  pinned: false,
  lastContent: '',
  unreadCount: 0,
  messages: [],
};
const other: ChatThread = { ...target, id: 'other', title: 'Other' };
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('ChatBatchForwardSheet', () => {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  const render = (
    overrides: Partial<React.ComponentProps<typeof ChatBatchForwardSheet>> = {},
  ) => {
    const props = {
      scope: 'account:source',
      sourceThreadId: 'source',
      initialMessageId: 'one',
      messages: [one, two, three],
      threads: [target, other],
      requestKeys: new Map<string, string>(),
      palette: palettes.light,
      language: 'en' as const,
      onClose: jest.fn(),
      onForward: jest
        .fn<Promise<void>, [ChatMessage, ChatThread, string]>()
        .mockResolvedValue(undefined),
      ...overrides,
    };
    act(() => {
      renderer = TestRenderer.create(<ChatBatchForwardSheet {...props} />);
    });
    return props;
  };
  const button = (id: string) =>
    renderer!.root
      .findAllByProps({ testID: id })
      .find(node => typeof node.props.onPress === 'function')!;
  const confirm = () => button('chat-batch-confirm');
  const choose = (id: string) =>
    act(() => button(`chat-batch-message-${id}`).props.onPress());
  const pickTarget = () => {
    act(() => confirm().props.onPress());
    act(() => button('chat-batch-target-target').props.onPress());
  };
  const modal = () => renderer!.root.findByType(Modal);
  const summary = () =>
    renderer!.root.findAllByProps({ testID: 'chat-batch-summary' })[0].props
      .children;
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('requires explicit target confirmation and serializes sends while blocking duplicate taps and dismissal', async () => {
    const first = deferred();
    const second = deferred();
    const onForward = jest
      .fn<Promise<void>, [ChatMessage, ChatThread, string]>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { onClose, requestKeys } = render({ onForward });
    expect(modal().props.animationType).toBe('none');
    expect(
      button('chat-batch-message-one').props.accessibilityState.checked,
    ).toBe(true);
    choose('two');
    act(() => confirm().props.onPress());
    expect(confirm().props.disabled).toBe(true);
    expect(onForward).not.toHaveBeenCalled();
    act(() => button('chat-batch-target-target').props.onPress());
    expect(onForward).not.toHaveBeenCalled();
    const submit = confirm().props.onPress;
    act(() => {
      submit();
      submit();
      modal().props.onRequestClose();
      button('chat-batch-close').props.onPress();
    });
    expect(onForward).toHaveBeenCalledTimes(1);
    expect(onForward.mock.calls[0]).toEqual([one, target, expect.any(String)]);
    expect(requestKeys.size).toBe(2);
    expect(confirm().props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => first.resolve());
    expect(onForward).toHaveBeenCalledTimes(2);
    expect(onForward.mock.calls[1][0]).toEqual(two);
    expect(requestKeys.size).toBe(1);
    await act(async () => second.resolve());
    expect(summary()).toBe('2 sent, 0 unconfirmed, 2 total.');
    expect(requestKeys.size).toBe(0);
    act(() => confirm().props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('continues after individual failures and retries only failed messages with the original key and target', async () => {
    const failed = deferred();
    const onForward = jest
      .fn<Promise<void>, [ChatMessage, ChatThread, string]>()
      .mockResolvedValue(undefined)
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => failed.promise);
    const props = render({ onForward });
    choose('three');
    choose('two');
    pickTarget();
    await act(async () => confirm().props.onPress());
    expect(onForward.mock.calls.map(call => call[0].id)).toEqual([
      'one',
      'two',
    ]);
    await act(async () => failed.reject(new Error('internal server error')));
    expect(onForward.mock.calls.map(call => call[0].id)).toEqual([
      'one',
      'two',
      'three',
    ]);
    expect(summary()).toBe('2 sent, 1 unconfirmed, 3 total.');
    expect(props.requestKeys.size).toBe(1);
    const failedKey = onForward.mock.calls[1][2];
    act(() =>
      renderer!.update(<ChatBatchForwardSheet {...props} threads={[other]} />),
    );
    const retry = button('chat-batch-retry-two').props.onPress;
    await act(async () => {
      retry();
      retry();
    });
    expect(onForward).toHaveBeenCalledTimes(4);
    expect(onForward.mock.calls[3]).toEqual([two, target, failedKey]);
    expect(summary()).toBe('3 sent, 0 unconfirmed, 3 total.');
    expect(props.requestKeys.size).toBe(0);
  });

  it('reuses the unresolved receipt key after close and reopen', async () => {
    const requestKeys = new Map<string, string>();
    const onForward = jest
      .fn<Promise<void>, [ChatMessage, ChatThread, string]>()
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValue(undefined);
    render({ requestKeys, onForward });
    pickTarget();
    await act(async () => confirm().props.onPress());
    const key = onForward.mock.calls[0][2];
    expect(requestKeys.get('account:source:one:target')).toBe(key);
    act(() => renderer!.unmount());
    render({ requestKeys, onForward });
    pickTarget();
    await act(async () => confirm().props.onPress());
    expect(onForward.mock.calls[1]).toEqual([one, target, key]);
  });

  it('blocks submission when all selected sources or the chosen destination disappear', () => {
    const props = render();
    pickTarget();
    act(() =>
      renderer!.update(<ChatBatchForwardSheet {...props} messages={[]} />),
    );
    expect(confirm().props.disabled).toBe(true);
    act(() => confirm().props.onPress());
    expect(props.onForward).not.toHaveBeenCalled();
    act(() =>
      renderer!.update(<ChatBatchForwardSheet {...props} threads={[]} />),
    );
    expect(confirm().props.disabled).toBe(true);
    act(() => confirm().props.onPress());
    expect(props.onForward).not.toHaveBeenCalled();
  });

  it('uses system back to return to selection before closing', () => {
    const props = render();
    pickTarget();
    act(() => modal().props.onRequestClose());
    expect(
      button('chat-batch-message-one').props.accessibilityState.checked,
    ).toBe(true);
    expect(props.onClose).not.toHaveBeenCalled();
    act(() => modal().props.onRequestClose());
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it.each(['unmount', 'scope change'])(
    'stops unsent messages and preserves an unknown receipt on %s',
    async change => {
      const request = deferred();
      const onForward = jest
        .fn<Promise<void>, [ChatMessage, ChatThread, string]>()
        .mockImplementation(() => request.promise);
      const props = render({ onForward });
      choose('two');
      pickTarget();
      act(() => confirm().props.onPress());
      expect(onForward).toHaveBeenCalledTimes(1);
      if (change === 'unmount') {
        act(() => renderer!.unmount());
        renderer = undefined;
      } else {
        act(() =>
          renderer!.update(
            <ChatBatchForwardSheet {...props} scope="other-account:source" />,
          ),
        );
      }
      await act(async () => request.resolve());
      expect(onForward).toHaveBeenCalledTimes(1);
      expect(props.requestKeys.get('account:source:one:target')).toBe(
        onForward.mock.calls[0][2],
      );
      expect(props.onClose).not.toHaveBeenCalled();
    },
  );

  it('retries every failed item once without resending successful items', async () => {
    const onForward = jest
      .fn<Promise<void>, [ChatMessage, ChatThread, string]>()
      .mockResolvedValue(undefined)
      .mockRejectedValueOnce(new Error('failure one'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('failure three'));
    render({ onForward });
    choose('two');
    choose('three');
    pickTarget();
    await act(async () => confirm().props.onPress());
    expect(summary()).toBe('1 sent, 2 unconfirmed, 3 total.');
    const keys = new Map(
      onForward.mock.calls.map(call => [call[0].id, call[2]]),
    );
    await act(async () => confirm().props.onPress());
    expect(onForward.mock.calls.map(call => call[0].id)).toEqual([
      'one',
      'two',
      'three',
      'one',
      'three',
    ]);
    expect(onForward.mock.calls[3][2]).toBe(keys.get('one'));
    expect(onForward.mock.calls[4][2]).toBe(keys.get('three'));
    expect(summary()).toBe('3 sent, 0 unconfirmed, 3 total.');
  });
});
