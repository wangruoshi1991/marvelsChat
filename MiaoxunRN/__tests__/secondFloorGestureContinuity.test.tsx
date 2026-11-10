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

test('conversation snapshot refresh cannot jump a held second-floor pull back to its last delta', async () => {
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
  const dy = () => {
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
    return transform.translateY.__getValue();
  };
  surface().props.onStartShouldSetResponderCapture(event(300, 300, 1000));
  expect(
    surface().props.onMoveShouldSetResponderCapture(event(300, 320, 1100)),
  ).toBe(true);
  act(() => {
    surface().props.onResponderGrant(event(300, 320, 1100));
    surface().props.onResponderMove(event(320, 450, 1700));
  });
  expect(dy()).toBeCloseTo(93.6);
  await act(async () => tree!.update(screen()));
  act(() => surface().props.onResponderMove(event(450, 455, 1800)));
  expect(dy()).toBeCloseTo(97.2);
});

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
    tree = Renderer.create(screen(55));
  });
  const surface = () =>
    tree!.root.findByProps({ testID: 'floor-return-swipe-area' });
  surface().props.onStartShouldSetResponderCapture(event(300, 300, 1000));
  expect(
    surface().props.onMoveShouldSetResponderCapture(event(300, 280, 1100)),
  ).toBe(true);
  act(() => {
    surface().props.onResponderGrant(event(300, 280, 1100));
    surface().props.onResponderMove(event(280, 200, 1700));
  });
  await act(async () => tree!.update(screen(150)));
  act(() => {
    surface().props.onResponderMove(event(200, 195, 1800));
    surface().props.onResponderRelease(event(195, 195, 1900, false));
  });
  expect(close).toHaveBeenCalledTimes(1);
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
    surface().props.onResponderMove(event(280, 200, 1700));
  });
  const root = tree!.root.findByProps({ testID: 'second-floor' });
  const translated = StyleSheet.flatten(root.props.style).transform![0] as {
    translateY: { __getValue: () => number };
  };
  expect(translated.translateY.__getValue()).toBeCloseTo(-57.6);
  expect(close).not.toHaveBeenCalled();
});
