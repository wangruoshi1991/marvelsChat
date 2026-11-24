import React from 'react';
import { PanResponder, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Renderer, { act } from 'react-test-renderer';
import {
  VoiceCallBar,
  VoiceCallPosition,
} from '../src/features/voiceCalls/VoiceCallBar';
import type { VoiceCallDisplay } from '../src/features/voiceCalls/voiceCallPresentation';
import { palettes } from '../src/shared/theme';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn(() => ({
    top: 44,
    bottom: 34,
    left: 0,
    right: 0,
  })),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })),
}));
const connected: VoiceCallDisplay = {
  peerName: 'Synthetic peer',
  phase: 'connected',
  muted: false,
  connectedAt: 1000,
};
let tree: Renderer.ReactTestRenderer;
let props: React.ComponentProps<typeof VoiceCallBar>;
let gestures: Parameters<typeof PanResponder.create>[0];
const render = async (next: Partial<typeof props> = {}) => {
  props = { ...props, ...next };
  await act(async () => tree.update(<VoiceCallBar {...props} />));
};
const button = () =>
  tree.root
    .findAllByProps({ testID: 'voice-call-bar' })
    .find(node => typeof node.props.onPress === 'function')!;
const position = () =>
  StyleSheet.flatten(
    tree.root.findAllByProps({ testID: 'voice-call-handle-position' })[0].props
      .style,
  );
const gesture = (dx: number, dy: number, numberActiveTouches = 1) =>
  ({ dx, dy, numberActiveTouches } as Parameters<
    NonNullable<typeof gestures.onPanResponderMove>
  >[1]);
const event = {} as Parameters<
  NonNullable<typeof gestures.onPanResponderMove>
>[0];
const layout = async (width: number, height: number) => {
  await act(async () =>
    tree.root
      .findAllByProps({ testID: 'voice-call-floating-overlay' })[0]
      .props.onLayout({ nativeEvent: { layout: { width, height } } }),
  );
};
beforeEach(async () => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  jest
    .mocked(useSafeAreaInsets)
    .mockReturnValue({ top: 44, bottom: 34, left: 0, right: 0 });
  jest.spyOn(PanResponder, 'create').mockImplementation(config => {
    gestures = config;
    return { panHandlers: {} } as ReturnType<typeof PanResponder.create>;
  });
  props = {
    display: connected,
    palette: palettes.light,
    language: 'zh',
    onRestore: jest.fn(),
    onPositionChange: jest.fn(),
  };
  await act(async () => {
    tree = Renderer.create(<VoiceCallBar {...props} />);
  });
});
afterEach(() => {
  act(() => tree.unmount());
  jest.restoreAllMocks();
});

test('floating handle only represents real connected or reconnecting calls', async () => {
  await render({ display: null });
  expect(tree.toJSON()).toBeNull();
  for (const phase of [
    'dialing',
    'outgoing',
    'incoming',
    'ended',
    'failed',
  ] as const) {
    await render({ display: { ...connected, phase } });
    expect(tree.toJSON()).toBeNull();
  }
  await render({ display: { ...connected, connectedAt: undefined } });
  expect(tree.toJSON()).toBeNull();
  await render({ display: connected });
  expect(button().props.accessibilityLabel).toContain('通话中');
  await render({ display: { ...connected, phase: 'connecting' } });
  expect(button().props.accessibilityLabel).toContain('正在恢复连接');
});

test('defaults to a small handle at the right and upper third without intercepting the page', () => {
  expect(position()).toMatchObject({
    position: 'absolute',
    left: 322,
    top: 56 + (742 - 56) / 3,
    width: 56,
    height: 56,
  });
  const outer = tree.root.findAllByProps({
    testID: 'voice-call-floating-overlay',
  })[0];
  expect(outer.props.pointerEvents).toBe('box-none');
  expect(StyleSheet.flatten(button().props.style)).toMatchObject({
    width: 56,
    height: 56,
    borderRadius: 18,
  });
  expect(props.onRestore).not.toHaveBeenCalled();
  expect(props.onPositionChange).not.toHaveBeenCalled();
});

test('small tap movement restores and only movement past threshold acquires drag', async () => {
  expect(gestures.onStartShouldSetPanResponder?.(event, gesture(0, 0))).toBe(
    false,
  );
  expect(
    gestures.onMoveShouldSetPanResponderCapture?.(event, gesture(3, 3)),
  ).toBe(false);
  expect(
    gestures.onMoveShouldSetPanResponderCapture?.(event, gesture(7, 0)),
  ).toBe(true);
  expect(
    gestures.onMoveShouldSetPanResponderCapture?.(event, gesture(10, 0, 2)),
  ).toBe(false);
  await act(async () => {
    button().props.onPressIn();
    button().props.onPress();
  });
  expect(props.onRestore).toHaveBeenCalledTimes(1);
});

test('dragging clamps to safe boundaries and persists normalized position without restoring', async () => {
  act(() => {
    button().props.onPressIn();
    gestures.onPanResponderGrant?.(event, gesture(0, 0));
    gestures.onPanResponderMove?.(event, gesture(-999, 999));
  });
  expect(position()).toMatchObject({ left: 12, top: 742 });
  await act(async () => {
    gestures.onPanResponderRelease?.(event, gesture(-999, 999));
    button().props.onPress();
  });
  expect(props.onPositionChange).toHaveBeenLastCalledWith({ x: 0, y: 1 });
  expect(props.onRestore).not.toHaveBeenCalled();
  await act(async () => {
    button().props.onPressIn();
    button().props.onPress();
  });
  expect(props.onRestore).toHaveBeenCalledTimes(1);
});

test('saved normalized position survives rerenders and resize while malformed input is clamped', async () => {
  const saved: VoiceCallPosition = { x: 0.25, y: 0.75 };
  await render({ position: saved });
  expect(position()).toMatchObject({
    left: 12 + 310 * 0.25,
    top: 56 + 686 * 0.75,
  });
  await render({
    display: { ...connected, muted: true },
    position: { ...saved },
  });
  expect(position()).toMatchObject({ left: 89.5, top: 570.5 });
  await layout(844, 390);
  expect(position()).toMatchObject({
    left: 12 + 764 * 0.25,
    top: 56 + 232 * 0.75,
  });
  await render({ position: { x: -10, y: 10 } });
  expect(position()).toMatchObject({ left: 12, top: 288 });
  await render({ position: { x: Number.NaN, y: Number.NaN } });
  expect(position()).toMatchObject({ left: 776, top: 56 + 232 / 3 });
});

test('modal topInset false and side safe insets constrain the handle in its actual host frame', async () => {
  jest
    .mocked(useSafeAreaInsets)
    .mockReturnValue({ top: 44, bottom: 20, left: 30, right: 30 });
  await render({ topInset: false, position: { x: 1, y: 0 } });
  await layout(320, 420);
  expect(position()).toMatchObject({ left: 222, top: 12 });
  await render({ position: { x: 0, y: 1 } });
  expect(position()).toMatchObject({ left: 42, top: 332 });
});

test('terminated drag persists clamped location and does not restore', async () => {
  act(() => {
    gestures.onPanResponderGrant?.(event, gesture(0, 0));
    gestures.onPanResponderMove?.(event, gesture(-100, -100));
  });
  const dragged = position();
  act(() => gestures.onPanResponderTerminate?.(event, gesture(-100, -100)));
  expect(position().left).toBeCloseTo(dragged.left as number);
  expect(position().top).toBeCloseTo(dragged.top as number);
  expect(props.onPositionChange).toHaveBeenCalledTimes(1);
  expect(props.onRestore).not.toHaveBeenCalled();
});

test('VoiceOver activation restores even after dragging and reads full peer and mute state', async () => {
  const peerName = 'A long peer name '.repeat(12);
  await render({
    display: { ...connected, peerName, muted: true },
    language: 'en',
  });
  expect(button().props.accessibilityLabel).toContain(peerName);
  expect(button().props.accessibilityLabel).toContain('Microphone muted');
  act(() => {
    gestures.onPanResponderGrant?.(event, gesture(0, 0));
    gestures.onPanResponderRelease?.(event, gesture(0, 0));
  });
  await act(async () =>
    button().props.onAccessibilityAction({
      nativeEvent: { actionName: 'activate' },
    }),
  );
  expect(props.onRestore).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByProps({ testID: 'voice-call-end' })).toHaveLength(
    0,
  );
  expect(tree.root.findAllByProps({ testID: 'voice-call-mute' })).toHaveLength(
    0,
  );
});
