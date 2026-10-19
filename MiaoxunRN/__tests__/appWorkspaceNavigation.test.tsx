import React from 'react';
import { FlatList, Modal, PanResponder, Text, View } from 'react-native';
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
};
let renderer: TestRenderer.ReactTestRenderer;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('three root tabs retain the station, hide navigation in second floor, and reset across accounts', async () => {
  jest.useFakeTimers();
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });
  // A cold start lands on 讯; 妙 is one tap away.
  expect(renderer.root.findByType(ThreadListScreen)).toBeTruthy();
  act(() => renderer.root.findByType(BottomBar).props.onSelectTab('agents'));
  expect(renderer.root.findByType(MiaoTaskFeed)).toBeTruthy();
  const labels = renderer.root
    .findByType(BottomBar)
    .findAllByType(Text)
    .map(node => node.props.children);
  expect(labels).toEqual(['妙', '讯', '我']);
  act(() => renderer.root.findByType(BottomBar).props.onSelectTab('station'));
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
  act(() => renderer.root.findByType(SecondFloorScreen).props.onClose());
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

test('voice hides the retained navigation without shifting its anchor and drafts are isolated by account', async () => {
  jest.useFakeTimers();
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });
  const dock = () => renderer.root.findByType(VoiceShortcutDock);
  // The app opens on 讯; switch to 妙 first so the offsets below compare the
  // two tones rather than 讯 against itself.
  act(() => renderer.root.findByType(BottomBar).props.onSelectTab('agents'));
  const miaoOffset = dock().props.bottomOffset;
  expect(miaoOffset).toBe(140);
  act(() => renderer.root.findByType(BottomBar).props.onSelectTab('messages'));
  const xunOffset = dock().props.bottomOffset;
  expect(xunOffset).toBe(miaoOffset);
  act(() => renderer.root.findByType(BottomBar).props.onSelectTab('agents'));
  expect(dock().props.bottomOffset).toBe(miaoOffset);
  act(() => dock().props.onExpandedChange(true));
  expect(
    renderer.root.findByProps({ testID: 'root-navigation' }).props
      .pointerEvents,
  ).toBe('none');
  expect(
    renderer.root.findByProps({ testID: 'root-navigation' }).props
      .accessibilityElementsHidden,
  ).toBe(true);
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
