import React from 'react';
import {
  AppState,
  AppStateStatus,
  FlatList,
  Modal,
  PanResponder,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import App from '../src/App';
import { BottomBar } from '../src/shared/ui';
import { VoiceShortcutDock } from '../src/features/agents/VoiceShortcutDock';
import { AIRequestComposer } from '../src/features/ai/AIRequestComposer';
import { MiaoTaskFeed } from '../src/features/miao/MiaoTaskFeed';
import { SecondFloorScreen } from '../src/features/second-floor/SecondFloorScreen';
import { ThreadListScreen } from '../src/features/messages/ThreadListScreen';
import { AIAssistProvider } from '../src/features/assist/AIAssistProvider';
import {
  emptyProfile,
  emptyRelationships,
  emptyStationContent,
} from '../src/features/session/sessionDefaults';
import { palettes } from '../src/shared/theme';
import { AgentWorkspaceScreen } from '../src/features/workspaces/AgentWorkspaceScreen';
import { WorkspaceSubmissionRecovery } from '../src/features/workspaces/WorkspaceSubmission';
import { agentWorkspaceApi } from '../src/services/api/agentWorkspaceApi';
import { agentWorkspace } from '../__fixtures__/agentWorkspace';

jest.mock('react-native-safe-area-context', () => {
  const NativeView = require('react-native').View;
  return {
    SafeAreaProvider: NativeView,
    SafeAreaView: NativeView,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('../src/features/session/useMiaoxunSession', () => ({
  useMiaoxunSession: () => mockSession,
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
jest.mock('../src/app/AppModals', () => ({ AppModals: () => null }));
jest.mock('../src/app/LaunchAnimation', () => ({
  LaunchAnimation: () => null,
}));
jest.mock('../src/features/station/StationScreen', () => {
  const ReactModule = require('react');
  const NativeView = require('react-native').View;
  return {
    StationScreen: (props: unknown) =>
      ReactModule.createElement(NativeView, {
        ...(props as object),
        testID: 'retained-station-screen',
      }),
  };
});
let mockSession = {
  token: 'unit-test-token',
  user: { id: 'account-1' },
  appearance: 'light',
  language: 'zh',
  isRestoring: false,
  restoreStatus: 'authenticated',
  profile: emptyProfile,
  stationContent: emptyStationContent,
  relationships: emptyRelationships,
  agents: [],
  agentReadiness: {},
  ownedAgents: [],
  threads: [],
  notices: [],
  unreadNoticeCount: 0,
  setActiveThreadId: jest.fn(),
  refreshStationContent: jest.fn(async () => emptyStationContent),
  refreshBootstrap: jest.fn(async () => undefined),
};
let renderer: TestRenderer.ReactTestRenderer;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('three root tabs retain the station, keep navigation under voice menus, and reset across accounts', async () => {
  jest.useFakeTimers();
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });
  // A cold start lands on 讯; 妙 is one tap away.
  expect(renderer.root.findByType(ThreadListScreen)).toBeTruthy();
  expect(
    StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'app-top-safe-area' }).props.style,
    ).backgroundColor,
  ).toBe('#f4f6f9');
  expect(
    renderer.root.findByProps({
      accessibilityLabel: '搜索对话、任务或Agent',
    }),
  ).toBeTruthy();
  expect(
    renderer.root.findAllByProps({
      accessibilityLabel: '应用通知，0条未读',
    }),
  ).toHaveLength(0);
  const xunVoiceDock = renderer.root
    .findAllByType(VoiceShortcutDock)
    .find(node => node.props.tone === 'xun');
  expect(xunVoiceDock).toBeTruthy();
  expect(
    renderer.root.findByProps({ testID: 'app-bottom-safe-area' }).props.edges,
  ).toEqual([]);
  expect(
    renderer.root.findAllByProps({
      accessibilityLabel: '下拉进入二楼，你的个人空间',
    }),
  ).toHaveLength(0);
  act(() => xunVoiceDock?.props.onExpandedChange(true));
  expect(
    renderer.root.findByType(ThreadListScreen).props.messageActionsOpen,
  ).toBe(true);
  expect(
    renderer.root.findAllByProps({
      accessibilityLabel: '下拉进入二楼，你的个人空间',
    }),
  ).toHaveLength(0);
  expect(renderer.root.findAllByType(BottomBar)).toHaveLength(1);
  expect(
    StyleSheet.flatten(
      renderer.root.findByType(BottomBar).findByType(View).props.style,
    ),
  ).toMatchObject({ height: 89, minHeight: 89 });
  expect(
    renderer.root.findByProps({ testID: 'app-bottom-safe-area' }).props.edges,
  ).toEqual([]);
  act(() => xunVoiceDock?.props.onExpandedChange(false));
  const xunTabLabels = renderer.root
    .findByType(ThreadListScreen)
    .findAllByType(Text)
    .filter(
      node => node.props.children === '对话' || node.props.children === '任务',
    );
  expect(xunTabLabels).toHaveLength(2);
  expect(StyleSheet.flatten(xunTabLabels[0].props.style)).toMatchObject({
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
  });
  expect(StyleSheet.flatten(xunTabLabels[1].props.style)).toMatchObject({
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '400',
  });
  act(() => renderer.root.findByType(BottomBar).props.onSelectTab('agents'));
  expect(renderer.root.findByType(MiaoTaskFeed)).toBeTruthy();
  expect(renderer.root.findByType(StatusBar).props.barStyle).toBe(
    'light-content',
  );
  expect(
    StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'app-top-safe-area' }).props.style,
    ).backgroundColor,
  ).toBe('#11121e');
  const labels = renderer.root
    .findByType(BottomBar)
    .findAllByType(Text)
    .map(node => node.props.children);
  expect(labels).toEqual(['妙', '讯', '我']);
  act(() => renderer.root.findByType(BottomBar).props.onSelectTab('station'));
  expect(mockSession.refreshBootstrap).toHaveBeenCalledWith(
    'unit-test-token',
    false,
  );
  mockSession.refreshBootstrap.mockClear();
  act(() =>
    renderer.root
      .findByProps({ testID: 'retained-station-screen' })
      .props.onSelectStationTab('agents'),
  );
  expect(mockSession.refreshBootstrap).toHaveBeenCalledWith(
    'unit-test-token',
    false,
  );
  expect(renderer.root.findByType(StatusBar).props.barStyle).toBe(
    'light-content',
  );
  expect(
    renderer.root.findByProps({ testID: 'retained-station-screen' }).props
      .active,
  ).toBe(true);
  act(() => renderer.root.findByType(BottomBar).props.onSelectTab('messages'));
  expect(
    renderer.root.findByProps({ testID: 'retained-station-screen' }).props
      .active,
  ).toBe(false);
  act(() =>
    renderer.root.findByType(ThreadListScreen).props.onOpenSecondFloor(),
  );
  expect(renderer.root.findByType(SecondFloorScreen)).toBeTruthy();
  expect(renderer.root.findAllByType(BottomBar)).toHaveLength(0);
  for (const testID of ['app-top-safe-area', 'app-bottom-safe-area']) {
    expect(
      StyleSheet.flatten(renderer.root.findByProps({ testID }).props.style)
        .backgroundColor,
    ).toBe('#f3f6f9');
  }
  act(() => renderer.root.findByType(SecondFloorScreen).props.onClose());
  expect(
    StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'app-top-safe-area' }).props.style,
    ).backgroundColor,
  ).toBe('#f4f6f9');
  expect(
    StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'app-bottom-safe-area' }).props.style,
    ).backgroundColor,
  ).toBe('#ffffff');
  expect(renderer.root.findByType(BottomBar).props.selectedTab).toBe(
    'messages',
  );
  act(() =>
    renderer.root.findByType(ThreadListScreen).props.onOpenSecondFloor(),
  );
  mockSession = { ...mockSession, user: { id: 'account-2' } };
  await act(async () => renderer.update(<App />));
  expect(renderer.root.findAllByType(SecondFloorScreen)).toHaveLength(0);
  // A different account starts fresh on 讯, the same page a cold start opens.
  expect(renderer.root.findByType(BottomBar).props.selectedTab).toBe(
    'messages',
  );
});

test('refreshes the session catalog when the app returns to the foreground', async () => {
  let onStateChange: ((state: AppStateStatus) => void) | undefined;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((event, handler) => {
      if (event === 'change') onStateChange = handler;
      return { remove: jest.fn() };
    });
  AppState.currentState = 'active';
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });

  mockSession.refreshBootstrap.mockClear();
  act(() => onStateChange?.('background'));
  act(() => onStateChange?.('active'));

  expect(mockSession.refreshBootstrap).toHaveBeenCalledWith(
    'unit-test-token',
    false,
  );
});

test('pull-down opens only from the top, and short or horizontal gestures preserve the conversation list', async () => {
  jest.useFakeTimers();
  const create = jest.spyOn(PanResponder, 'create');
  const open = jest.fn();
  await act(async () => {
    renderer = TestRenderer.create(
      <AIAssistProvider routeKey="unit-test" onAskButler={jest.fn()}>
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
        />
      </AIAssistProvider>,
    );
  });
  const config = create.mock.calls[0][0];
  const event = {} as never;
  const gesture = (dx: number, dy: number) => ({ dx, dy } as never);
  config.onStartShouldSetPanResponderCapture?.(event, gesture(0, 0));
  expect(
    config.onMoveShouldSetPanResponderCapture?.(event, gesture(100, 15)),
  ).toBe(false);
  expect(
    config.onMoveShouldSetPanResponderCapture?.(event, gesture(0, 130)),
  ).toBe(true);
  act(() => config.onPanResponderRelease?.(event, gesture(0, 45)));
  expect(open).not.toHaveBeenCalled();
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => String(node.props.children).includes('下拉进入二楼')),
  ).toBe(false);
  act(() => config.onPanResponderRelease?.(event, gesture(0, 180)));
  act(() => jest.runAllTimers());
  expect(open).toHaveBeenCalledTimes(1);
  renderer.root
    .findByType(FlatList)
    .props.onScroll({ nativeEvent: { contentOffset: { y: 240 } } });
  config.onStartShouldSetPanResponderCapture?.(event, gesture(0, 0));
  expect(
    config.onMoveShouldSetPanResponderCapture?.(event, gesture(0, 140)),
  ).toBe(false);
});

test('retained conversation surface clears an interrupted pull when leaving and returning', async () => {
  jest.useFakeTimers();
  const open = jest.fn();
  await act(async () => {
    renderer = TestRenderer.create(
      <AIAssistProvider routeKey="unit-test" onAskButler={jest.fn()}>
        <ThreadListScreen
          active
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
        />
      </AIAssistProvider>,
    );
  });
  // Obtain the handlers from the rendered surface itself.
  const surface = renderer.root.findByProps({
    testID: 'messages-pull-surface',
  });
  const gesture = { dx: 0, dy: 180 } as never;
  surface.props.onStartShouldSetPanResponderCapture?.({}, gesture);
  surface.props.onMoveShouldSetPanResponderCapture?.({}, gesture);
  surface.props.onPanResponderRelease?.({}, gesture);
  await act(async () =>
    renderer.update(
      <AIAssistProvider routeKey="unit-test" onAskButler={jest.fn()}>
        <ThreadListScreen
          active={false}
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
        />
      </AIAssistProvider>,
    ),
  );
  act(() => jest.runAllTimers());
  expect(open).not.toHaveBeenCalled();
});

test('voice keeps the retained navigation anchored and drafts are isolated by account', async () => {
  jest.useFakeTimers();
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });
  const dock = () => renderer.root.findByType(VoiceShortcutDock);
  // The navigation surface is fixed by the V15 shell; a tab switch must not
  // re-measure it and move the floating assistant dock.
  expect(
    renderer.root.findByProps({ testID: 'root-navigation' }).props.onLayout,
  ).toBeUndefined();
  // The app opens on 讯; switch to 妙 first so the offsets below compare the
  // two tones rather than 讯 against itself.
  act(() => renderer.root.findByType(BottomBar).props.onSelectTab('agents'));
  const miaoOffset = dock().props.bottomOffset;
  expect(miaoOffset).toBe(191);
  act(() => renderer.root.findByType(BottomBar).props.onSelectTab('messages'));
  const xunOffset = dock().props.bottomOffset;
  expect(xunOffset).toBe(miaoOffset);
  act(() => renderer.root.findByType(BottomBar).props.onSelectTab('agents'));
  expect(dock().props.bottomOffset).toBe(miaoOffset);
  act(() => dock().props.onExpandedChange(true));
  expect(
    StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'app-shell' }).props.style,
    ).backgroundColor,
  ).toBe('#11121e');
  expect(
    renderer.root.findByProps({ testID: 'root-navigation' }).props
      .pointerEvents,
  ).toBeUndefined();
  expect(
    renderer.root.findByProps({ testID: 'root-navigation' }).props
      .accessibilityElementsHidden,
  ).toBeUndefined();
  expect(renderer.root.findByType(BottomBar)).toBeTruthy();
  expect(dock().props.bottomOffset).toBe(miaoOffset);
  await act(async () => dock().props.onCompose('本地尚未发送的草稿'));
  expect(renderer.root.findByType(MiaoTaskFeed).props.active).toBe(false);
  expect(dock().props.active).toBe(false);
  act(() =>
    renderer.root
      .findByType(AIRequestComposer)
      .props.onChangeDraft('修改后的本地草稿'),
  );
  act(() => renderer.root.findByType(Modal).props.onRequestClose());
  expect(renderer.root.findAllByType(AIRequestComposer)).toHaveLength(0);
  await act(async () => dock().props.onCompose());
  expect(renderer.root.findByType(AIRequestComposer).props.draft).toBe(
    '修改后的本地草稿',
  );
  mockSession = {
    ...mockSession,
    user: { id: 'account-new' },
    token: 'new-token',
  };
  await act(async () => renderer.update(<App />));
  expect(renderer.root.findAllByType(AIRequestComposer)).toHaveLength(0);
  // The new account starts on 讯, whose dock composes into a butler thread
  // rather than the request composer; the draft claim is about 妙's dock.
  act(() => renderer.root.findByType(BottomBar).props.onSelectTab('agents'));
  await act(async () => dock().props.onCompose());
  expect(renderer.root.findByType(AIRequestComposer).props.draft).toBe('');
});

test('leaving Miao through Butler clears the parent-owned long-press state', async () => {
  jest.useFakeTimers();
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });
  act(() => renderer.root.findByType(BottomBar).props.onSelectTab('agents'));
  const dock = () => renderer.root.findByType(VoiceShortcutDock);
  act(() => dock().props.onExpandedChange(true));
  expect(
    renderer.root.findByProps({ testID: 'root-navigation' }).props
      .pointerEvents,
  ).toBeUndefined();

  // Invoke the same callback the dock uses after releasing on 妙管家. The
  // child may be retained for one render while the composer route opens, so
  // the App must clear its own expansion state as the route changes.
  await act(async () => dock().props.onOpenButler());
  expect(renderer.root.findByType(MiaoTaskFeed).props.voiceMenuExpanded).toBe(
    false,
  );
  expect(
    renderer.root.findByProps({ testID: 'root-navigation' }).props
      .pointerEvents,
  ).toBeUndefined();
});

test.each(['header', 'system'])(
  'closing a workspace by %s refreshes outcomes and resumes the covered station only after leaving',
  async exit => {
    jest.useFakeTimers();
    const w = agentWorkspace();
    jest.spyOn(agentWorkspaceApi, 'get').mockResolvedValue(w);
    mockSession.refreshStationContent.mockClear();
    await act(async () => {
      renderer = TestRenderer.create(<App />);
    });
    act(() => renderer.root.findByType(BottomBar).props.onSelectTab('agents'));
    const station = () =>
      renderer.root.findByProps({ testID: 'retained-station-screen' });
    // A task's workspace covers the retained station; the station no longer
    // opens workspaces itself now that outcomes live in the second floor.
    await act(async () =>
      renderer.root.findByType(MiaoTaskFeed).props.onOpenWorkspace(w),
    );
    act(() => renderer.root.findByType(BottomBar).props.onSelectTab('station'));
    expect(station().props.active).toBe(false);
    await act(async () => {
      if (exit === 'header')
        renderer.root.findByType(AgentWorkspaceScreen).props.onClose();
      else renderer.root.findByType(Modal).props.onRequestClose();
    });
    expect(mockSession.refreshStationContent).toHaveBeenCalledTimes(1);
    expect(station().props.active).toBe(true);
    expect(renderer.root.findAllByType(AgentWorkspaceScreen)).toHaveLength(0);
  },
);

test('workspace recovery opens existing agent management or an editable draft with all requirements and references', async () => {
  jest.useFakeTimers();
  const w = agentWorkspace({
    followups: ['只选横图', '不要修改原素材'],
    contextRefs: [
      {
        kind: 'station-album',
        id: 'album-1',
        version: 'a'.repeat(64),
        title: '已选相册',
      },
      {
        kind: 'station-diary',
        id: 'diary-1',
        version: 'b'.repeat(64),
        title: '已选日记',
      },
    ],
  });
  jest.spyOn(agentWorkspaceApi, 'get').mockResolvedValue(w);
  const create = jest.spyOn(agentWorkspaceApi, 'create');
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });
  act(() => renderer.root.findByType(BottomBar).props.onSelectTab('agents'));
  await act(async () =>
    renderer.root.findByType(MiaoTaskFeed).props.onOpenWorkspace(w),
  );
  act(() =>
    renderer.root.findByType(AgentWorkspaceScreen).props.onManageAgents(),
  );
  expect(renderer.root.findByType(BottomBar).props.selectedTab).toBe('station');
  expect(
    renderer.root.findByProps({ testID: 'retained-station-screen' }).props
      .selectedStationTab,
  ).toBe('agents');
  expect(renderer.root.findAllByType(AgentWorkspaceScreen)).toHaveLength(0);
  act(() => renderer.root.findByType(BottomBar).props.onSelectTab('agents'));
  await act(async () =>
    renderer.root.findByType(MiaoTaskFeed).props.onOpenWorkspace(w),
  );
  await act(async () =>
    renderer.root.findByType(AgentWorkspaceScreen).props.onNewTask(w),
  );
  const composer = () => renderer.root.findByType(AIRequestComposer);
  expect(composer().props.draft).toContain(w.goal);
  w.followups.forEach(text => expect(composer().props.draft).toContain(text));
  expect(composer().props.references).toEqual(w.contextRefs);
  expect(composer().props.scene.page).toBe('miao.workspace');
  expect(composer().props.references).toEqual(w.contextRefs);
  expect(
    renderer.root.findByType(WorkspaceSubmissionRecovery).props.request,
  ).toBeUndefined();
  expect(create).not.toHaveBeenCalled();
  act(() => composer().props.onRemoveReference(0));
  expect(composer().props.references).toEqual([w.contextRefs[1]]);
  mockSession = {
    ...mockSession,
    user: { id: 'different-owner' },
    token: 'different-token',
  };
  await act(async () => renderer.update(<App />));
  expect(renderer.root.findAllByType(AIRequestComposer)).toHaveLength(0);
  expect(create).not.toHaveBeenCalled();
});
