import React from 'react';
import { Modal, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { ChatForwardSheet } from '../src/features/messages/ChatForwardSheet';
import type { ChatThread } from '../src/features/session/sessionTypes';
import { palettes } from '../src/shared/theme';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaProvider: View, SafeAreaView: View };
});

jest.mock('../src/shared/useReduceMotion', () => ({
  useReduceMotion: () => true,
}));

const direct: ChatThread = {
  id: 'direct',
  title: 'Alex',
  avatarText: 'A',
  kind: 'direct',
  pinned: false,
  lastContent: '',
  unreadCount: 0,
  messages: [],
};
const group: ChatThread = {
  ...direct,
  id: 'group',
  title: 'Studio team',
  avatarText: 'S',
  kind: 'group',
};

function pendingRequest() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('ChatForwardSheet', () => {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  const render = (
    overrides: Partial<React.ComponentProps<typeof ChatForwardSheet>> = {},
  ) => {
    const props = {
      sourceLabel: 'Synthetic message',
      threads: [direct, group],
      palette: palettes.light,
      language: 'en' as const,
      onClose: jest.fn(),
      onForward: jest
        .fn<Promise<void>, [ChatThread]>()
        .mockResolvedValue(undefined),
      ...overrides,
    };
    act(() => {
      renderer = TestRenderer.create(<ChatForwardSheet {...props} />);
    });
    return props;
  };
  const button = (id: string) =>
    renderer!.root
      .findAllByProps({ testID: id })
      .find(node => typeof node.props.onPress === 'function')!;
  const modal = () => renderer!.root.findByType(Modal);
  const reportedError = () =>
    renderer!.root.findAllByProps({ testID: 'chat-forward-error' })[0];

  afterEach(() => act(() => renderer?.unmount()));

  it('requires a destination and confirmation, blocking duplicate taps and dismissal until completion', async () => {
    const request = pendingRequest();
    const onForward = jest.fn((_destination: ChatThread) => request.promise);
    const { onClose } = render({ onForward });
    const confirm = () => button('chat-forward-confirm');
    const cancel = () => button('chat-forward-cancel');
    const choice = () => button('chat-forward-choice-group');

    expect(modal().props.animationType).toBe('none');
    expect(confirm().props.disabled).toBe(true);
    expect(choice().props.accessibilityLabel).toBe('Studio team, Group chat');
    act(() => choice().props.onPress());
    expect(choice().props.accessibilityState.checked).toBe(true);
    expect(onForward).not.toHaveBeenCalled();

    const pressConfirm = confirm().props.onPress;
    act(() => {
      pressConfirm();
      pressConfirm();
      modal().props.onRequestClose();
      cancel().props.onPress();
    });
    expect(onForward).toHaveBeenCalledTimes(1);
    expect(onForward).toHaveBeenCalledWith(group);
    expect(confirm().props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(cancel().props.disabled).toBe(true);
    expect(choice().props.disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => request.resolve());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the chosen conversation and reports failure while enabling a retry', async () => {
    const request = pendingRequest();
    const onForward = jest
      .fn<Promise<void>, [ChatThread]>()
      .mockResolvedValue(undefined)
      .mockImplementationOnce(() => request.promise);
    const { onClose } = render({ onForward });
    const directChoice = () => button('chat-forward-choice-direct');

    act(() => directChoice().props.onPress());
    act(() => {
      button('chat-forward-confirm').props.onPress();
    });
    await act(async () => request.reject(new Error('internal server error')));

    expect(reportedError()?.props).toMatchObject({
      accessibilityRole: 'alert',
      children: 'Could not forward the message. Try again.',
    });
    expect(directChoice().props.accessibilityState.checked).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(button('chat-forward-confirm').props.disabled).toBe(false);

    await act(async () => button('chat-forward-confirm').props.onPress());
    expect(onForward.mock.calls).toEqual([[direct], [direct]]);
    expect(reportedError()).toBeUndefined();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps a removed destination from submitting and honors system back before sending', () => {
    const props = render();
    act(() => button('chat-forward-choice-direct').props.onPress());
    act(() => renderer!.update(<ChatForwardSheet {...props} threads={[]} />));
    expect(button('chat-forward-confirm').props.disabled).toBe(true);
    expect(
      renderer!.root
        .findAllByType(Text)
        .some(node => node.props.children === 'No conversations available'),
    ).toBe(true);
    act(() => {
      button('chat-forward-confirm').props.onPress();
      modal().props.onRequestClose();
    });
    expect(props.onForward).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores a response after the sheet unmounts', async () => {
    const request = pendingRequest();
    const { onClose } = render({ onForward: () => request.promise });
    act(() => button('chat-forward-choice-direct').props.onPress());
    act(() => {
      button('chat-forward-confirm').props.onPress();
    });
    act(() => renderer?.unmount());
    renderer = undefined;
    await act(async () => request.resolve());
    expect(onClose).not.toHaveBeenCalled();
  });
});
