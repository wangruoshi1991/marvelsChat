import React from 'react';
import {
  AccessibilityInfo,
  Animated,
  FlatList,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  StyleSheet,
  View,
} from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { ThreadListScreen } from '../src/features/messages/ThreadListScreen';
import { ChatThread } from '../src/features/session/sessionTypes';
import { palettes } from '../src/shared/theme';
import { xunV3Palette } from '../src/shared/xunPalette';

jest.mock('../src/features/assist/AIAssistProvider', () => ({
  useAIAssist: () => ({ isActive: false }),
}));

const thread: ChatThread = {
  id: 'retained-thread',
  title: '保留的会话',
  avatarText: '会',
  kind: 'group',
  pinned: false,
  unreadCount: 0,
  lastContent: '已有消息',
  messages: [],
};
const touch = {
  nativeEvent: { touches: [{ identifier: 0 }] },
} as unknown as GestureResponderEvent;
const gesture = (dx: number, dy: number): PanResponderGestureState => ({
  stateID: 1,
  moveX: dx,
  moveY: dy,
  x0: 0,
  y0: 0,
  dx,
  dy,
  vx: 0,
  vy: 0,
  numberActiveTouches: 1,
  _accountsForMovesUpTo: 0,
});
const openThread = jest.fn();
const openFloor = jest.fn();
let tree: Renderer.ReactTestRenderer | undefined;

function screen(
  active: boolean,
  selectedMessageTab: 'chat' | 'tasks' = 'chat',
) {
  return (
    <ThreadListScreen
      active={active}
      palette={xunV3Palette(palettes.light)}
      language="zh"
      threads={[thread]}
      agents={[]}
      notices={[]}
      unreadNoticeCount={0}
      selectedMessageTab={selectedMessageTab}
      renderUserAvatar={() => <View />}
      onOpenThread={openThread}
      onOpenMessageActions={jest.fn()}
      onOpenSearch={jest.fn()}
      onSelectMessageTab={jest.fn()}
      onMarkNotificationRead={jest.fn(async () => undefined)}
      onAcceptFriendRequest={jest.fn(async () => undefined)}
      onRejectFriendRequest={jest.fn(async () => undefined)}
      onOpenSecondFloor={openFloor}
    />
  );
}

afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test('hiding the conversation under a floor retains the native list instance', async () => {
  await act(async () => {
    tree = Renderer.create(screen(true));
  });
  const list = tree!.root.findByType(FlatList);
  await act(async () => tree!.update(screen(false)));
  expect(tree!.root.findByType(FlatList) === list).toBe(true);
  await act(async () => tree!.update(screen(true)));
  expect(tree!.root.findByType(FlatList) === list).toBe(true);
});

test('a retained nonzero native scroll position cannot become a false top-edge pull', async () => {
  const create = jest.spyOn(PanResponder, 'create');
  await act(async () => {
    tree = Renderer.create(screen(true));
  });
  tree!.root.findByType(FlatList).props.onScroll({
    nativeEvent: { contentOffset: { y: 240 } },
  });
  await act(async () => tree!.update(screen(false)));
  await act(async () => tree!.update(screen(true)));
  const pull = create.mock.calls.find(
    ([config]) => config.onMoveShouldSetPanResponderCapture,
  )![0];
  pull.onStartShouldSetPanResponderCapture?.(touch, gesture(0, 0));
  expect(
    pull.onMoveShouldSetPanResponderCapture?.(touch, gesture(0, 100)),
  ).toBe(false);
  tree!.root.findByType(FlatList).props.onScroll({
    nativeEvent: { contentOffset: { y: 0 } },
  });
  pull.onStartShouldSetPanResponderCapture?.(touch, gesture(0, 0));
  expect(
    pull.onMoveShouldSetPanResponderCapture?.(touch, gesture(0, 100)),
  ).toBe(true);
});

test('a hidden retained row cannot capture a new swipe', async () => {
  const create = jest.spyOn(PanResponder, 'create');
  await act(async () => {
    tree = Renderer.create(screen(false));
  });
  const row = create.mock.calls.find(
    ([config]) =>
      config.onMoveShouldSetPanResponder &&
      !config.onMoveShouldSetPanResponderCapture,
  )![0];
  row.onStartShouldSetPanResponderCapture?.(touch, gesture(0, 0));
  expect(row.onMoveShouldSetPanResponder?.(touch, gesture(-100, 0))).toBe(
    false,
  );
});

test('a cancelled row swipe cannot open a conversation after the floor is closed', async () => {
  const create = jest.spyOn(PanResponder, 'create');
  let complete: ((result: { finished: boolean }) => void) | undefined;
  jest.spyOn(Animated, 'timing').mockImplementation(() => ({
    start: callback => {
      complete = callback;
    },
    stop: jest.fn(),
    reset: jest.fn(),
  }));
  await act(async () => {
    tree = Renderer.create(screen(true));
  });
  const row = create.mock.calls.find(
    ([config]) =>
      config.onMoveShouldSetPanResponder &&
      !config.onMoveShouldSetPanResponderCapture,
  )![0];
  act(() => {
    row.onStartShouldSetPanResponderCapture?.(touch, gesture(0, 0));
    row.onPanResponderGrant?.(touch, gesture(0, 0));
    row.onPanResponderMove?.(touch, gesture(-100, 0));
    row.onPanResponderRelease?.(touch, gesture(-100, 0));
  });
  expect(complete).toBeDefined();
  await act(async () => tree!.update(screen(false)));
  await act(async () => tree!.update(screen(true)));
  act(() => complete?.({ finished: true }));
  expect(openThread).not.toHaveBeenCalled();
  const retainedRow = tree!.root.findAllByType(Animated.View).find(node => {
    const transforms = StyleSheet.flatten(node.props.style)?.transform;
    return (
      transforms?.length === 1 &&
      transforms.some((item: { translateX?: unknown }) => 'translateX' in item)
    );
  })!;
  const transform = StyleSheet.flatten(retainedRow.props.style)
    .transform![0] as {
    translateX: Animated.Value & { __getValue: () => number };
  };
  expect(transform.translateX.__getValue()).toBe(0);

  // Returning to the retained row must still permit a fresh, completed swipe.
  act(() => {
    row.onStartShouldSetPanResponderCapture?.(touch, gesture(0, 0));
    row.onPanResponderGrant?.(touch, gesture(0, 0));
    row.onPanResponderMove?.(touch, gesture(-100, 0));
    row.onPanResponderRelease?.(touch, gesture(-100, 0));
    complete?.({ finished: true });
  });
  expect(openThread).toHaveBeenCalledTimes(1);
  expect(openThread).toHaveBeenCalledWith(thread);
});

test.each(['inactive', 'restored', 'unmounted'] as const)(
  'a late second-floor entrance completion after the list is %s cannot open a later route',
  async state => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    const create = jest.spyOn(PanResponder, 'create');
    const completions: Array<(result: { finished: boolean }) => void> = [];
    jest.spyOn(Animated, 'parallel').mockImplementation(() => ({
      start: callback => {
        if (callback) completions.push(callback);
      },
      stop: jest.fn(),
      reset: jest.fn(),
    }));
    const mount = async () => {
      await act(async () => {
        tree = Renderer.create(screen(true));
      });
      return create.mock.calls.find(
        ([config]) => config.onMoveShouldSetPanResponderCapture,
      )![0];
    };
    const pull = await mount();
    const startPull = (responder: typeof pull) => {
      act(() => {
        responder.onStartShouldSetPanResponderCapture?.(touch, gesture(0, 0));
        expect(
          responder.onMoveShouldSetPanResponderCapture?.(
            touch,
            gesture(0, 130),
          ),
        ).toBe(true);
        responder.onPanResponderGrant?.(touch, gesture(0, 0));
        responder.onPanResponderMove?.(touch, gesture(0, 130));
        responder.onPanResponderRelease?.(touch, gesture(0, 130));
      });
    };
    startPull(pull);
    expect(completions).toHaveLength(1);
    if (state === 'unmounted') {
      await act(async () => tree!.unmount());
      tree = undefined;
    } else {
      await act(async () => tree!.update(screen(false)));
      if (state === 'restored') {
        await act(async () => tree!.update(screen(true)));
      }
    }
    act(() => completions[0]({ finished: true }));
    expect(openFloor).not.toHaveBeenCalled();

    // A cancelled native completion must not poison a fresh gesture either.
    let nextPull = pull;
    if (state === 'unmounted') {
      create.mockClear();
      nextPull = await mount();
    } else if (state === 'inactive') {
      await act(async () => tree!.update(screen(true)));
    }
    startPull(nextPull);
    expect(completions).toHaveLength(2);
    act(() => completions[0]({ finished: true }));
    expect(openFloor).not.toHaveBeenCalled();
    act(() => completions[1]({ finished: true }));
    expect(openFloor).toHaveBeenCalledTimes(1);
    act(() => completions[1]({ finished: true }));
    expect(openFloor).toHaveBeenCalledTimes(1);
  },
);
