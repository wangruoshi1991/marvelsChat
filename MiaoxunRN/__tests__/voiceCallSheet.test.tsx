import React from 'react';
import {
  AccessibilityInfo,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import {
  VoiceCallSheet,
  VoiceCallDisplay,
} from '../src/features/voiceCalls/VoiceCallSheet';
import { palettes } from '../src/shared/theme';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaProvider: View, SafeAreaView: View };
});
jest.mock('../src/shared/useReduceMotion', () => ({
  useReduceMotion: () => true,
}));
const peer = 'Synthetic peer';
const display = (phase: VoiceCallDisplay['phase']): VoiceCallDisplay => ({
  peerName: peer,
  phase,
  muted: false,
});
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
let tree: Renderer.ReactTestRenderer;
let props: React.ComponentProps<typeof VoiceCallSheet>;
const button = (id: string) =>
  tree.root
    .findAllByProps({ testID: id })
    .find(node => typeof node.props.onPress === 'function')!;
const text = (id: string) =>
  tree.root.findAllByProps({ testID: id })[0]?.props.children;
const render = async (next: Partial<typeof props> = {}) => {
  props = { ...props, ...next };
  await act(async () => tree.update(<VoiceCallSheet {...props} />));
};
beforeEach(async () => {
  props = {
    display: null,
    palette: palettes.light,
    language: 'zh',
    onAccept: jest.fn(),
    onDecline: jest.fn(),
    onEnd: jest.fn(),
    onToggleMute: jest.fn(),
    onDismiss: jest.fn(),
  };
  await act(async () => {
    tree = Renderer.create(<VoiceCallSheet {...props} />);
  });
});
afterEach(() => {
  act(() => tree.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('absent calls render nothing and mounting real phases never invokes an action', async () => {
  expect(tree.toJSON()).toBeNull();
  for (const phase of [
    'dialing',
    'outgoing',
    'incoming',
    'connecting',
    'connected',
    'ended',
    'failed',
  ] as const) {
    await render({ display: display(phase) });
    expect(text('voice-call-peer')).toBe(peer);
    expect(tree.root.findByType(Modal).props.animationType).toBe('none');
  }
  for (const key of [
    'onAccept',
    'onDecline',
    'onEnd',
    'onToggleMute',
    'onDismiss',
  ] as const)
    expect(props[key]).not.toHaveBeenCalled();
});

test('outgoing cancel, incoming answer/decline and terminal dismissal invoke only their own callbacks', async () => {
  await render({ display: display('outgoing') });
  expect(button('voice-call-end').props.accessibilityLabel).toBe('取消呼叫');
  await act(async () => button('voice-call-end').props.onPress());
  expect(props.onEnd).toHaveBeenCalledTimes(1);
  expect(props.onDismiss).not.toHaveBeenCalled();
  await render({ display: display('incoming') });
  expect(tree.root.findAllByProps({ testID: 'voice-call-mute' })).toHaveLength(
    0,
  );
  await act(async () => button('voice-call-accept').props.onPress());
  expect(props.onAccept).toHaveBeenCalledTimes(1);
  await act(async () => button('voice-call-decline').props.onPress());
  expect(props.onDecline).toHaveBeenCalledTimes(1);
  await render({
    display: { ...display('failed'), message: '麦克风权限未开启' },
  });
  expect(text('voice-call-message')).toBe('麦克风权限未开启');
  expect(
    tree.root.findAllByProps({ testID: 'voice-call-accept' }),
  ).toHaveLength(0);
  await act(async () => button('voice-call-dismiss').props.onPress());
  expect(props.onDismiss).toHaveBeenCalledTimes(1);
});

test('pending actions block duplicate taps and show ending without claiming the call has ended', async () => {
  const end = deferred();
  await render({
    display: display('connected'),
    onEnd: jest.fn(() => end.promise),
  });
  const press = button('voice-call-end').props.onPress;
  let pending!: Promise<void>;
  act(() => {
    pending = press();
    press();
    tree.root.findByType(Modal).props.onRequestClose();
  });
  expect(props.onEnd).toHaveBeenCalledTimes(1);
  expect(text('voice-call-status')).toBe('正在结束通话…');
  expect(button('voice-call-end').props.disabled).toBe(true);
  expect(button('voice-call-mute').props.disabled).toBe(true);
  expect(
    tree.root.findAllByProps({ testID: 'voice-call-dismiss' }),
  ).toHaveLength(0);
  await act(async () => {
    end.resolve();
    await pending;
  });
  expect(text('voice-call-status')).toBe('通话中');
  await render({ display: display('ended') });
  expect(text('voice-call-status')).toBe('通话已结束');
  expect(button('voice-call-dismiss').props.disabled).toBe(false);
});

test('microphone status follows confirmed display changes and failed actions remain explicit and retryable', async () => {
  const mute = deferred();
  await render({
    display: display('connected'),
    onToggleMute: jest.fn(() => mute.promise),
  });
  let pending!: Promise<void>;
  act(() => {
    pending = button('voice-call-mute').props.onPress();
  });
  expect(text('voice-call-microphone-state')).toBe('麦克风已开启');
  expect(button('voice-call-mute').props.accessibilityState.selected).toBe(
    false,
  );
  await act(async () => {
    mute.reject(new Error('private native error'));
    await pending;
  });
  expect(text('voice-call-action-error')).toBe('操作未完成，请重试。');
  expect(JSON.stringify(tree.toJSON())).not.toContain('private native error');
  expect(button('voice-call-mute').props.disabled).toBe(false);
  await render({ display: { ...display('connected'), muted: true } });
  expect(text('voice-call-microphone-state')).toBe('麦克风已静音');
  expect(button('voice-call-mute').props.accessibilityLabel).toBe('取消静音');
  expect(button('voice-call-mute').props.accessibilityState.selected).toBe(
    true,
  );
  expect(
    tree.root.findAllByProps({ testID: 'voice-call-action-error' }),
  ).toHaveLength(0);
});

test('stale failures cannot overwrite a new phase or a reopened call', async () => {
  const answer = deferred();
  await render({
    display: display('incoming'),
    onAccept: jest.fn(() => answer.promise),
  });
  let pending!: Promise<void>;
  act(() => {
    pending = button('voice-call-accept').props.onPress();
  });
  expect(text('voice-call-status')).toBe('正在接听…');
  await render({ display: display('connecting') });
  await act(async () => {
    answer.reject(new Error('late'));
    await pending;
  });
  expect(text('voice-call-status')).toBe('正在建立语音连接…');
  expect(
    tree.root.findAllByProps({ testID: 'voice-call-action-error' }),
  ).toHaveLength(0);
  const ending = deferred();
  await render({ onEnd: jest.fn(() => ending.promise) });
  act(() => {
    pending = button('voice-call-end').props.onPress();
  });
  await render({ display: null });
  await render({ display: { ...display('incoming'), peerName: 'New peer' } });
  await act(async () => {
    ending.reject(new Error('late'));
    await pending;
  });
  expect(text('voice-call-peer')).toBe('New peer');
  expect(text('voice-call-status')).toBe('邀请你进行语音通话');
  expect(
    tree.root.findAllByProps({ testID: 'voice-call-action-error' }),
  ).toHaveLength(0);
});

test('native back and accessibility escape preserve active call actions and only dismiss terminal calls', async () => {
  await render({ display: display('incoming') });
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  expect(props.onDecline).toHaveBeenCalledTimes(1);
  expect(props.onDismiss).not.toHaveBeenCalled();
  await render({ display: display('connecting') });
  await act(async () =>
    tree.root
      .findAllByProps({ testID: 'voice-call-sheet' })[0]
      .props.onAccessibilityEscape(),
  );
  expect(props.onEnd).toHaveBeenCalledTimes(1);
  await render({ display: display('ended') });
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  expect(props.onDismiss).toHaveBeenCalledTimes(1);
});

test('duration uses the real connection time only and interval stops when the call ends', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(100000);
  const intervals = jest.spyOn(globalThis, 'setInterval');
  const clear = jest.spyOn(globalThis, 'clearInterval');
  await render({ display: { ...display('connecting'), connectedAt: 35000 } });
  expect(
    tree.root.findAllByProps({ testID: 'voice-call-duration' }),
  ).toHaveLength(0);
  await render({ display: { ...display('connected'), connectedAt: 35000 } });
  expect(text('voice-call-duration')).toBe('1:05');
  await act(async () => jest.advanceTimersByTime(2000));
  expect(text('voice-call-duration')).toBe('1:07');
  await render({ display: display('ended') });
  expect(intervals).toHaveBeenCalledTimes(1);
  expect(clear).toHaveBeenCalledWith(intervals.mock.results[0].value);
  expect(
    tree.root.findAllByProps({ testID: 'voice-call-duration' }),
  ).toHaveLength(0);
  await render({
    display: { ...display('connected'), connectedAt: Number.NaN },
  });
  expect(intervals).toHaveBeenCalledTimes(1);
  expect(clear).toHaveBeenCalledWith(intervals.mock.results[0].value);
  expect(
    tree.root.findAllByProps({ testID: 'voice-call-duration' }),
  ).toHaveLength(0);
});

test('large text remains scalable and untruncated inside a scrollable safe-area sheet', async () => {
  const longName = 'A very long peer name '.repeat(10);
  await render({
    display: {
      ...display('incoming'),
      peerName: longName,
      message: 'A detailed explanation '.repeat(20),
    },
    language: 'en',
    palette: palettes.dark,
  });
  expect(tree.root.findByType(ScrollView)).toBeDefined();
  expect(text('voice-call-peer')).toBe(longName);
  for (const node of tree.root.findAllByType(Text)) {
    expect(node.props.allowFontScaling).not.toBe(false);
    expect(node.props.numberOfLines).toBeUndefined();
    expect(node.props.maxFontSizeMultiplier).toBeUndefined();
  }
  expect(
    StyleSheet.flatten(button('voice-call-accept').props.style).minHeight,
  ).toBeGreaterThanOrEqual(44);
  expect(
    StyleSheet.flatten(button('voice-call-accept').props.style).height,
  ).toBeUndefined();
  expect(
    tree.root.findAllByProps({ testID: 'voice-call-sheet' })[0].props
      .accessibilityViewIsModal,
  ).toBe(true);
  jest
    .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
    .mockImplementation(() => undefined);
  expect(() => tree.root.findByType(Modal).props.onShow()).not.toThrow();
});

test('strict effect setup preserves action ownership', async () => {
  props = { ...props, display: display('incoming') };
  await act(async () =>
    tree.update(
      <React.StrictMode>
        <VoiceCallSheet {...props} />
      </React.StrictMode>,
    ),
  );
  await act(async () => button('voice-call-accept').props.onPress());
  expect(props.onAccept).toHaveBeenCalledTimes(1);
});

test('declining shows progress on decline, never on the answer action', async () => {
  const decline = deferred();
  await render({
    display: display('incoming'),
    onDecline: jest.fn(() => decline.promise),
  });
  let pending!: Promise<void>;
  act(() => {
    pending = button('voice-call-decline').props.onPress();
  });
  expect(button('voice-call-decline').props.accessibilityState.busy).toBe(true);
  expect(button('voice-call-accept').props.accessibilityState.busy).toBe(false);
  expect(text('voice-call-status')).toBe('正在结束通话…');
  await act(async () => {
    decline.resolve();
    await pending;
  });
});

test('minimize is offered only after a real connection and keeps explicit hangup separate', async () => {
  const onMinimize = jest.fn();
  for (const phase of [
    'dialing',
    'outgoing',
    'incoming',
    'connecting',
    'connected',
    'ended',
    'failed',
  ] as const) {
    await render({ display: display(phase), onMinimize });
    expect(
      tree.root.findAllByProps({ testID: 'voice-call-minimize' }),
    ).toHaveLength(0);
  }
  for (const connectedAt of [Number.NaN, 0, -1]) {
    await render({
      display: { ...display('connected'), connectedAt },
      onMinimize,
    });
    expect(
      tree.root.findAllByProps({ testID: 'voice-call-minimize' }),
    ).toHaveLength(0);
  }
  await render({
    display: { ...display('connected'), connectedAt: Date.now() },
    onMinimize,
  });
  expect(button('voice-call-minimize').props.accessibilityLabel).toBe(
    '收起通话',
  );
  await act(async () => button('voice-call-minimize').props.onPress());
  expect(onMinimize).toHaveBeenCalledTimes(1);
  expect(props.onEnd).not.toHaveBeenCalled();
  expect(props.onDismiss).not.toHaveBeenCalled();
  await act(async () => button('voice-call-end').props.onPress());
  expect(props.onEnd).toHaveBeenCalledTimes(1);
});

test('native back and VoiceOver escape minimize connected and reconnecting calls', async () => {
  const onMinimize = jest.fn();
  for (const phase of ['connected', 'connecting'] as const) {
    await render({
      display: { ...display(phase), connectedAt: Date.now() },
      onMinimize,
    });
    await act(async () => tree.root.findByType(Modal).props.onRequestClose());
    await act(async () =>
      tree.root
        .findAllByProps({ testID: 'voice-call-sheet' })[0]
        .props.onAccessibilityEscape(),
    );
  }
  expect(text('voice-call-status')).toBe('正在恢复语音连接…');
  expect(onMinimize).toHaveBeenCalledTimes(4);
  expect(props.onEnd).not.toHaveBeenCalled();
  expect(props.onDecline).not.toHaveBeenCalled();
  expect(props.onDismiss).not.toHaveBeenCalled();
  await render({ display: display('incoming'), onMinimize });
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  expect(props.onDecline).toHaveBeenCalledTimes(1);
  expect(onMinimize).toHaveBeenCalledTimes(4);
});

test('pending hangup prevents minimize and repeated minimize taps share the pending action', async () => {
  const pendingEnd = deferred();
  const onMinimize = jest.fn();
  await render({
    display: { ...display('connected'), connectedAt: Date.now() },
    onMinimize,
    onEnd: jest.fn(() => pendingEnd.promise),
  });
  let pending!: Promise<void>;
  act(() => {
    pending = button('voice-call-end').props.onPress();
  });
  expect(button('voice-call-minimize').props.disabled).toBe(true);
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  expect(onMinimize).not.toHaveBeenCalled();
  await act(async () => {
    pendingEnd.resolve();
    await pending;
  });
  const minimize = deferred();
  await render({ onMinimize: jest.fn(() => minimize.promise) });
  const press = button('voice-call-minimize').props.onPress;
  act(() => {
    pending = press();
    press();
  });
  expect(props.onMinimize).toHaveBeenCalledTimes(1);
  expect(button('voice-call-minimize').props.accessibilityState.busy).toBe(
    true,
  );
  await act(async () => {
    minimize.resolve();
    await pending;
  });
});
