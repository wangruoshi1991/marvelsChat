jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../src/features/ai/useAITasks', () => ({
  useAITasks: () => ({
    tasks: [],
    loading: false,
    hasLoaded: true,
    error: '',
    refresh: jest.fn(),
  }),
}));
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { ThreadListScreen } from '../src/features/messages/ThreadListScreen';
import { SecondFloorScreen } from '../src/features/second-floor/SecondFloorScreen';
import { AIAssistProvider } from '../src/features/assist/AIAssistProvider';
import { palettes } from '../src/shared/theme';
import { defaultUIPreferences } from '../src/features/ui/uiPreferences';
import {
  emptyProfile,
  emptyRelationships,
  emptyStationContent,
} from '../src/features/session/sessionDefaults';
import type { useMiaoxunSession } from '../src/features/session/useMiaoxunSession';

const event = (
  previousY: number,
  currentY: number,
  timestamp: number,
  active = true,
) => ({
  nativeEvent: {
    timestamp,
    touches: active ? [{ identifier: 0, pageX: 100, pageY: currentY }] : [],
    changedTouches: active
      ? []
      : [{ identifier: 0, pageX: 100, pageY: currentY }],
  },
  touchHistory: {
    numberActiveTouches: active ? 1 : 0,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: timestamp,
    touchBank: [
      {
        touchActive: active,
        startTimeStamp: 1000,
        startPageX: 100,
        startPageY: 300,
        previousTimeStamp: timestamp - 100,
        previousPageX: 100,
        previousPageY: previousY,
        currentTimeStamp: timestamp,
        currentPageX: 100,
        currentPageY: currentY,
      },
    ],
  },
});
const preferences = defaultUIPreferences;
const provider = (children: React.ReactNode) => (
  <AIAssistProvider routeKey="second-floor-continuity" onAskButler={jest.fn()}>
    {children}
  </AIAssistProvider>
);
let tree: Renderer.ReactTestRenderer | undefined;
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test.each([false, true])(
  'conversation snapshot refresh cannot jump a held second-floor pull back to its last delta (Reduce Motion %s)',
  async reduceMotion => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(reduceMotion);
    const open = jest.fn();
    const screen = () =>
      provider(
        <ThreadListScreen
          palette={palettes.light}
          language="zh"
          threads={[]}
          agents={[]}
          notices={[]}
          unreadNoticeCount={0}
          selectedMessageTab="chat"
          renderUserAvatar={() => <View />}
          onOpenThread={jest.fn()}
          onOpenMessageActions={jest.fn()}
          onOpenSearch={jest.fn()}
          onSelectMessageTab={jest.fn()}
          onMarkNotificationRead={jest.fn()}
          onAcceptFriendRequest={jest.fn()}
          onRejectFriendRequest={jest.fn()}
          onOpenSecondFloor={open}
          uiPreferences={preferences()}
        />,
      );
    await act(async () => {
      tree = Renderer.create(screen());
    });
    const surface = () =>
      tree!.root.findByProps({ testID: 'messages-pull-surface' });
    const translation = () => {
      const node = surface()
        .findAllByType(Animated.View)
        .find(item =>
          StyleSheet.flatten(item.props.style)?.transform?.some(
            (transform: { translateY?: unknown }) => 'translateY' in transform,
          ),
        )!;
      const transform = StyleSheet.flatten(node.props.style).transform!.find(
        (item: { translateY?: unknown }) => 'translateY' in item,
      ) as { translateY: { __getValue: () => number } };
      return transform.translateY;
    };
    const dy = () => translation().__getValue();
    surface().props.onStartShouldSetResponderCapture(event(300, 300, 1000));
    expect(
      surface().props.onMoveShouldSetResponderCapture(event(300, 320, 1100)),
    ).toBe(true);
    act(() => {
      surface().props.onResponderGrant(event(300, 320, 1100));
      surface().props.onResponderMove(event(320, 450, 1700));
    });
    expect(dy()).toBeCloseTo(75);
    await act(async () => tree!.update(screen()));
    act(() => surface().props.onResponderMove(event(450, 455, 1800)));
    expect(dy()).toBeCloseTo(77.5);
    if (reduceMotion) {
      const timing = jest.spyOn(Animated, 'timing');
      act(() =>
        surface().props.onResponderRelease(event(455, 455, 1900, false)),
      );
      expect(open).toHaveBeenCalledTimes(1);
      expect(timing).not.toHaveBeenCalled();
      expect(dy()).toBe(0);
    } else {
      // A native spring can still be returning when the next finger lands.
      // Its current frame must become the new drag base, not jump to zero.
      const value = translation() as unknown as Animated.Value;
      act(() => value.setValue(36));
      const stopped: Array<(offset: number) => void> = [];
      jest.spyOn(value, 'stopAnimation').mockImplementation(callback => {
        if (callback) stopped.push(callback);
      });
      surface().props.onStartShouldSetResponderCapture(event(300, 300, 2000));
      act(() => {
        surface().props.onResponderGrant(event(300, 320, 2100));
        surface().props.onResponderMove(event(320, 340, 2200));
      });
      expect(dy()).toBe(36);
      expect(stopped).toHaveLength(1);
      act(() => stopped[0](36));
      expect(dy()).toBeCloseTo(56);
      const resetFrame = dy();
      act(() => {
        surface().props.onResponderRelease(event(340, 340, 2300, false));
        value.setValue(0);
        stopped[0](36);
      });
      expect(dy()).toBe(0);
      expect(resetFrame).toBeCloseTo(56);
    }
  },
);

test('second-floor return keeps the original distance when a preference refresh arrives during the swipe', async () => {
  const close = jest.fn();
  const session = (distance: number) =>
    ({
      token: 'isolated-fixture',
      appearance: 'light',
      language: 'zh',
      profile: emptyProfile,
      stationContent: emptyStationContent,
      agents: [],
      ownedAgents: [],
      agentReadiness: {},
      relationships: emptyRelationships,
      notices: [],
      unreadNoticeCount: 0,
      uiPreferences: {
        ...preferences(),
        gestures: {
          ...preferences().gestures,
          'secondFloor.swipeToExit': {
            ...preferences().gestures['secondFloor.swipeToExit']!,
            distance,
          },
        },
      },
    } as unknown as ReturnType<typeof useMiaoxunSession>);
  const screen = (distance: number) =>
    provider(
      <SecondFloorScreen
        palette={palettes.light}
        language="zh"
        session={session(distance)}
        onClose={close}
        onOpenFriendThread={jest.fn()}
        onOpenProfile={jest.fn()}
        onOpenSettings={jest.fn()}
        onOpenDeleteAccount={jest.fn()}
        onOpenNotices={jest.fn()}
        onOpenPostComposer={jest.fn()}
      />,
    );
  await act(async () => {
    tree = Renderer.create(screen(128));
  });
  const surface = () =>
    tree!.root.findByProps({ testID: 'floor-return-swipe-area' });
  surface().props.onStartShouldSetResponderCapture(event(300, 300, 1000));
  expect(
    surface().props.onMoveShouldSetResponderCapture(event(300, 280, 1100)),
  ).toBe(true);
  act(() => {
    surface().props.onResponderGrant(event(300, 280, 1100));
    surface().props.onResponderMove(event(280, 180, 1700));
  });
  await act(async () => tree!.update(screen(180)));
  act(() => {
    surface().props.onResponderMove(event(180, 165, 1800));
    surface().props.onResponderRelease(event(165, 165, 1900, false));
  });
  expect(close).toHaveBeenCalledTimes(1);
});

test('a short fast upward flick from the return affordance does not dismiss the floor', async () => {
  const close = jest.fn();
  const session = {
    token: 'isolated-fixture',
    appearance: 'light',
    language: 'zh',
    profile: emptyProfile,
    stationContent: emptyStationContent,
    agents: [],
    ownedAgents: [],
    agentReadiness: {},
    relationships: emptyRelationships,
    notices: [],
    unreadNoticeCount: 0,
    uiPreferences: preferences(),
  } as unknown as ReturnType<typeof useMiaoxunSession>;
  await act(async () => {
    tree = Renderer.create(
      provider(
        <SecondFloorScreen
          palette={palettes.light}
          language="zh"
          session={session}
          onClose={close}
          onOpenFriendThread={jest.fn()}
          onOpenProfile={jest.fn()}
          onOpenSettings={jest.fn()}
          onOpenDeleteAccount={jest.fn()}
          onOpenNotices={jest.fn()}
          onOpenPostComposer={jest.fn()}
        />,
      ),
    );
  });
  const surface = () =>
    tree!.root.findByProps({ testID: 'floor-return-swipe-area' });
  surface().props.onStartShouldSetResponderCapture(event(300, 300, 1000));
  expect(
    surface().props.onMoveShouldSetResponderCapture(event(300, 280, 1040)),
  ).toBe(true);
  act(() => {
    surface().props.onResponderGrant(event(300, 280, 1040));
    surface().props.onResponderMove(event(280, 250, 1060));
    surface().props.onResponderRelease(event(250, 250, 1065, false));
  });
  expect(close).not.toHaveBeenCalled();
});

test('fixed second-floor return area follows the finger while content scrollers remain independent', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  const close = jest.fn();
  const session = {
    token: 'isolated-fixture',
    appearance: 'light',
    language: 'zh',
    profile: emptyProfile,
    stationContent: emptyStationContent,
    agents: [],
    ownedAgents: [],
    agentReadiness: {},
    relationships: emptyRelationships,
    notices: [],
    unreadNoticeCount: 0,
    uiPreferences: preferences(),
  } as unknown as ReturnType<typeof useMiaoxunSession>;
  await act(async () => {
    tree = Renderer.create(
      provider(
        <SecondFloorScreen
          palette={palettes.light}
          language="zh"
          session={session}
          onClose={close}
          onOpenFriendThread={jest.fn()}
          onOpenProfile={jest.fn()}
          onOpenSettings={jest.fn()}
          onOpenDeleteAccount={jest.fn()}
          onOpenNotices={jest.fn()}
          onOpenPostComposer={jest.fn()}
        />,
      ),
    );
  });
  const surface = () =>
    tree!.root.findByProps({ testID: 'floor-return-swipe-area' });
  surface().props.onStartShouldSetResponderCapture(event(300, 300, 1000));
  expect(
    surface().props.onMoveShouldSetResponderCapture(event(300, 280, 1100)),
  ).toBe(true);
  act(() => {
    surface().props.onResponderGrant(event(300, 280, 1100));
    surface().props.onResponderMove(event(280, 180, 1700));
  });
  const root = tree!.root.findByProps({ testID: 'second-floor' });
  const translated = StyleSheet.flatten(root.props.style).transform![0] as {
    translateY: { __getValue: () => number };
  };
  expect(translated.translateY.__getValue()).toBeCloseTo(-108);
  expect(close).not.toHaveBeenCalled();
  const value = (
    StyleSheet.flatten(root.props.style).opacity as {
      _parent: Animated.Value;
    }
  )._parent;
  act(() => value.setValue(0.05));
  const frozenFrame = translated.translateY.__getValue();
  const stopped: Array<(offset: number) => void> = [];
  jest.spyOn(value, 'stopAnimation').mockImplementation(callback => {
    if (callback) stopped.push(callback);
  });
  surface().props.onStartShouldSetResponderCapture(event(300, 300, 2000));
  act(() => {
    surface().props.onResponderGrant(event(300, 280, 2100));
    surface().props.onResponderMove(event(280, 260, 2200));
  });
  expect(translated.translateY.__getValue()).toBeCloseTo(frozenFrame);
  expect(stopped).toHaveLength(1);
  act(() => stopped[0](0.05));
  expect(translated.translateY.__getValue()).toBeCloseTo(frozenFrame - 36);
  act(() => {
    surface().props.onResponderRelease(event(260, 260, 2300, false));
    value.setValue(0);
    stopped[0](0.05);
  });
  expect(translated.translateY.__getValue()).toBe(0);
});

describe('second-floor exit completion', () => {
  const session = {
    token: 'isolated-fixture',
    appearance: 'light',
    language: 'zh',
    profile: emptyProfile,
    stationContent: emptyStationContent,
    agents: [],
    ownedAgents: [],
    agentReadiness: {},
    relationships: emptyRelationships,
    notices: [],
    unreadNoticeCount: 0,
    uiPreferences: preferences(),
  } as unknown as ReturnType<typeof useMiaoxunSession>;
  const floor = (onClose: () => void, active = true) =>
    provider(
      <SecondFloorScreen
        active={active}
        palette={palettes.light}
        language="zh"
        session={session}
        onClose={onClose}
        onOpenFriendThread={jest.fn()}
        onOpenProfile={jest.fn()}
        onOpenSettings={jest.fn()}
        onOpenDeleteAccount={jest.fn()}
        onOpenNotices={jest.fn()}
        onOpenPostComposer={jest.fn()}
      />,
    );
  const requestClose = () =>
    tree!.root
      .findByProps({ testID: 'floor-return-gesture' })
      .props.onAccessibilityAction({
        nativeEvent: { actionName: 'activate' },
      });
  const progress = () =>
    (
      StyleSheet.flatten(
        tree!.root.findByProps({ testID: 'second-floor' }).props.style,
      ).opacity as {
        _parent: Animated.Value & { __getValue: () => number };
      }
    )._parent;
  const prepare = async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    const close = jest.fn();
    await act(async () => {
      tree = Renderer.create(floor(close));
    });
    const value = progress();
    const callbacks: Array<(result: { finished: boolean }) => void> = [];
    const timing = jest
      .spyOn(Animated, 'timing')
      .mockImplementation((animatedValue, config) => ({
        start: callback => {
          (animatedValue as Animated.Value).setValue(config.toValue as number);
          if (callback) callbacks.push(callback);
        },
        stop: jest.fn(),
        reset: jest.fn(),
      }));
    return { close, value, callbacks, timing };
  };

  test('successful close stays at the exit endpoint until removal and ignores duplicate completion', async () => {
    const { close, value, callbacks, timing } = await prepare();
    act(requestClose);
    expect(close).not.toHaveBeenCalled();
    expect(value.__getValue()).toBe(1);
    act(requestClose);
    expect(timing).toHaveBeenCalledTimes(1);
    act(() => callbacks[0]({ finished: true }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(value.__getValue()).toBe(1);
    act(() => callbacks[0]({ finished: true }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  test.each(['inactive', 'unmounted'] as const)(
    'late native completion after the floor is %s cannot close a later route',
    async state => {
      const { close, value, callbacks } = await prepare();
      act(requestClose);
      if (state === 'inactive') {
        await act(async () => tree!.update(floor(close, false)));
      } else {
        await act(async () => tree!.unmount());
        tree = undefined;
      }
      const stoppedFrame = value.__getValue();
      act(() => callbacks[0]({ finished: true }));
      expect(close).not.toHaveBeenCalled();
      expect(value.__getValue()).toBe(stoppedFrame);
    },
  );

  test('cancelled completion restores the floor and permits another close', async () => {
    const { close, value, callbacks, timing } = await prepare();
    act(requestClose);
    act(() => callbacks[0]({ finished: false }));
    expect(close).not.toHaveBeenCalled();
    expect(value.__getValue()).toBe(0);
    act(requestClose);
    expect(timing).toHaveBeenCalledTimes(2);
    act(() => callbacks[0]({ finished: true }));
    expect(close).not.toHaveBeenCalled();
    expect(value.__getValue()).toBe(1);
    act(() => callbacks[1]({ finished: true }));
    expect(close).toHaveBeenCalledTimes(1);
  });
});
