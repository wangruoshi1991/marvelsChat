import React from 'react';
import { Modal, Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import App from '../src/App';
import { BottomBar } from '../src/shared/ui';
import { AppModals } from '../src/app/AppModals';
import { PublicProfilePage } from '../src/features/profile/PublicProfilePage';
import { SearchScreen } from '../src/features/search/SearchScreen';
import { StationPostComposerScreen } from '../src/features/station/StationPostComposerScreen';
import { StationPostComposerContent } from '../src/features/station/StationPostComposerContent';
import { VoiceCallBar } from '../src/features/voiceCalls/VoiceCallBar';
import { ChatScreen } from '../src/features/messages/MessagesScreen';
import { ThreadListScreen } from '../src/features/messages/ThreadListScreen';
import {
  emptyProfile,
  emptyRelationships,
  emptyStationContent,
} from '../src/features/session/sessionDefaults';
import type { ChatThread } from '../src/features/session/sessionTypes';
import { VoiceCallSheet } from '../src/features/voiceCalls/VoiceCallSheet';
import { createVoiceCallController } from '../src/features/voiceCalls/voiceCallController';
import type { VoiceCallDisplay } from '../src/features/voiceCalls/voiceCallPresentation';

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
jest.mock('../src/services/api/chatContentApi', () => ({
  chatContentApi: { comics: jest.fn(async () => []) },
}));
jest.mock('../src/services/api/customStickerApi', () => ({
  customStickerApi: { list: jest.fn(async () => []) },
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
jest.mock('../src/services/voiceCall/voiceCallMedia', () => ({
  voiceCallMediaAvailable: () => true,
}));
jest.mock('../src/features/voiceCalls/voiceCallController', () => ({
  createVoiceCallController: jest.fn(
    (options: { onDisplay: (display: VoiceCallDisplay | null) => void }) => {
      mockPublishDisplay = options.onDisplay;
      return mockCallController;
    },
  ),
}));

const first: ChatThread = {
  id: 'voice-call-first-chat',
  title: 'First chat',
  kind: 'direct',
  peerUserId: 'peer-1',
  pinned: false,
  avatarText: 'F',
  lastContent: '',
  unreadCount: 0,
  unreadSequence: 0,
  readSequence: 0,
  messages: [],
};
const second: ChatThread = {
  ...first,
  id: 'voice-call-second-chat',
  title: 'Second chat',
  peerUserId: 'peer-2',
};
const connected: VoiceCallDisplay = {
  peerName: first.title,
  phase: 'connected',
  muted: true,
  connectedAt: 1_700_000_000_000,
};
const sessionDefaults = {
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
  threads: [first, second],
  notices: [],
  searchHistory: [],
  unreadNoticeCount: 0,
  chatVoiceCalls: { enabled: true, iceServers: [] },
  setActiveThreadId: jest.fn(),
  markThreadRead: jest.fn(),
  refreshStationContent: jest.fn(async () => emptyStationContent),
  refreshBootstrap: jest.fn(async () => undefined),
};
let mockSession = sessionDefaults;
let mockPublishDisplay: (display: VoiceCallDisplay | null) => void;
const mockCallController = {
  start: jest.fn(async () => undefined),
  accept: jest.fn(async () => undefined),
  end: jest.fn(async () => mockPublishDisplay(null)),
  mute: jest.fn(),
  dismiss: jest.fn(() => mockPublishDisplay(null)),
  setForeground: jest.fn(),
  dispose: jest.fn(),
};
let renderer: TestRenderer.ReactTestRenderer;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockSession = { ...sessionDefaults, threads: [first, second] };
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function renderApp() {
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });
  act(() => jest.advanceTimersByTime(1800));
  act(() => jest.advanceTimersByTime(300));
}
const sheet = () => renderer.root.findByType(VoiceCallSheet);
const chat = () => renderer.root.findByType(ChatScreen);
const input = () =>
  chat()
    .findAllByType(TextInput)
    .find(node => node.props.accessibilityLabel === '消息输入框')!;
const open = (thread: ChatThread) =>
  act(async () => {
    renderer.root.findByType(ThreadListScreen).props.onOpenThread(thread);
  });
const closeChat = () =>
  act(async () => {
    const back = chat()
      .findAllByProps({ accessibilityLabel: '返回' })
      .find(node => typeof node.props.onPress === 'function');
    expect(back).toBeDefined();
    back!.props.onPress();
  });
const press = (testID: string) =>
  act(async () => {
    const button = renderer.root
      .findAllByProps({ testID })
      .find(node => typeof node.props.onPress === 'function');
    expect(button).toBeDefined();
    await button!.props.onPress();
  });
const publish = (display: VoiceCallDisplay | null) =>
  act(async () => mockPublishDisplay(display));

test('minimized calls retain the owner while chats, drafts and root navigation remain usable', async () => {
  await renderApp();
  await open(first);
  await publish(connected);
  const foregroundChanges = mockCallController.setForeground.mock.calls.length;

  await press('voice-call-minimize');
  expect(sheet().props.display).toBeNull();
  expect(chat().props.voiceCallOpen).toBe(true);
  await act(async () => input().props.onChangeText('通话时保留的草稿'));
  await closeChat();
  expect(renderer.root.findAllByType(ChatScreen)).toHaveLength(0);
  await open(second);
  expect(input().props.value).toBe('');
  await act(async () => input().props.onChangeText('另一会话的草稿'));
  await closeChat();

  await act(async () =>
    renderer.root.findByType(BottomBar).props.onSelectTab('station'),
  );
  expect(renderer.root.findByType(BottomBar).props.selectedTab).toBe('station');
  expect(
    renderer.root.findAllByProps({ testID: 'retained-station-screen' }).length,
  ).toBeGreaterThan(0);
  await press('voice-call-bar');
  expect(sheet().props.display).toBe(connected);
  expect(renderer.root.findByType(BottomBar).props.selectedTab).toBe('station');
  expect(
    renderer.root.findAllByProps({ testID: 'voice-call-bar' }),
  ).toHaveLength(0);

  await press('voice-call-minimize');
  await act(async () =>
    renderer.root.findByType(BottomBar).props.onSelectTab('messages'),
  );
  await open(first);
  expect(input().props.value).toBe('通话时保留的草稿');
  await closeChat();
  await open(second);
  expect(input().props.value).toBe('另一会话的草稿');
  await press('voice-call-bar');
  expect(sheet().props.display).toBe(connected);
  expect(chat().props.thread.id).toBe(second.id);
  expect(createVoiceCallController).toHaveBeenCalledTimes(1);
  expect(mockCallController.setForeground).toHaveBeenCalledTimes(
    foregroundChanges,
  );
  expect(mockCallController.start).not.toHaveBeenCalled();
  expect(mockCallController.end).not.toHaveBeenCalled();
  expect(mockCallController.mute).not.toHaveBeenCalled();
  expect(mockCallController.dismiss).not.toHaveBeenCalled();
  expect(mockCallController.dispose).not.toHaveBeenCalled();

  await press('voice-call-mute');
  expect(mockCallController.mute).toHaveBeenCalledTimes(1);
  await press('voice-call-end');
  expect(mockCallController.end).toHaveBeenCalledTimes(1);
  expect(mockCallController.dismiss).not.toHaveBeenCalled();
  expect(sheet().props.display).toBeNull();
  expect(chat().props.thread.id).toBe(second.id);
  expect(input().props.value).toBe('另一会话的草稿');
});

test('expanded call controls suppress read receipts until the visible chat is restored', async () => {
  await renderApp();
  await open(first);
  await publish(connected);
  expect(chat().props.receiptActive).toBe(false);
  mockSession = {
    ...mockSession,
    threads: [
      {
        ...first,
        unreadCount: 3,
        unreadSequence: 3,
        messages: [
          {
            id: 'new-message-during-call',
            threadId: first.id,
            unreadSequence: 3,
            senderType: 'user',
            senderName: first.title,
            content: '通话界面覆盖期间收到的消息',
            metadata: { senderUserId: first.peerUserId },
          },
        ],
      },
      second,
    ],
  };
  await act(async () => renderer.update(<App />));
  expect(mockSession.markThreadRead).not.toHaveBeenCalled();

  await press('voice-call-minimize');
  expect(chat().props.receiptActive).toBe(true);
  expect(mockSession.markThreadRead).toHaveBeenCalledWith(
    first.id,
    3,
    expect.any(Function),
  );
  const currentReadScreen = mockSession.markThreadRead.mock.calls.at(-1)![2];
  expect(currentReadScreen()).toBe(true);
  mockSession.markThreadRead.mockClear();
  await press('voice-call-bar');
  expect(currentReadScreen()).toBe(false);
  expect(chat().props.receiptActive).toBe(false);
  expect(mockSession.markThreadRead).not.toHaveBeenCalled();
});

test.each(['ended', 'failed'] as const)(
  'a minimized %s call clears once and the next incoming call opens above the current chat',
  async phase => {
    await renderApp();
    await open(second);
    await publish(connected);
    await press('voice-call-minimize');
    await act(async () => input().props.onChangeText('保持当前输入'));

    const message = phase === 'ended' ? '对方已挂断' : '语音连接已断开';
    await publish({ ...connected, phase, message });
    expect(mockCallController.dismiss).toHaveBeenCalledTimes(1);
    expect(mockCallController.end).not.toHaveBeenCalled();
    expect(sheet().props.display).toBeNull();
    expect(
      renderer.root.findAllByProps({ testID: 'voice-call-bar' }),
    ).toHaveLength(0);
    expect(chat().props.thread.id).toBe(second.id);
    expect(input().props.value).toBe('保持当前输入');
    expect(
      renderer.root
        .findAllByType(Text)
        .some(node => node.props.children === message),
    ).toBe(true);
    await act(async () => renderer.update(<App />));
    expect(mockCallController.dismiss).toHaveBeenCalledTimes(1);

    const incoming: VoiceCallDisplay = {
      peerName: 'Another caller',
      phase: 'incoming',
      muted: false,
    };
    await publish(incoming);
    expect(sheet().props.display).toBe(incoming);
    expect(chat().props.thread.id).toBe(second.id);
    expect(chat().props.receiptActive).toBe(false);
    await press('voice-call-accept');
    expect(mockCallController.accept).toHaveBeenCalledTimes(1);
    expect(createVoiceCallController).toHaveBeenCalledTimes(1);
    expect(mockCallController.dispose).not.toHaveBeenCalled();
  },
);

function expectOwnedSheet(host: TestRenderer.ReactTestInstance) {
  expect(renderer.root.findAllByType(VoiceCallSheet)).toHaveLength(1);
  expect(host.findByType(VoiceCallSheet)).toBe(sheet());
  expect(sheet().props.display).toBe(connected);
}

test('search owns the only call controls and preserves its query on repeated restore', async () => {
  await renderApp();
  await publish(connected);
  await press('voice-call-minimize');
  await act(async () =>
    renderer.root.findByType(AppModals).props.onNavigateModal('search'),
  );
  const searchModal = renderer.root
    .findAllByType(Modal)
    .find(node => node.props.testID === 'app-modal-search')!;
  expect(searchModal.props.visible).toBe(true);
  // A nested native call sheet waits until its page has actually presented.
  expect(renderer.root.findAllByType(VoiceCallSheet)).toHaveLength(0);
  await act(async () => searchModal.props.onShow());
  await act(async () =>
    renderer.root.findByType(SearchScreen).props.onChangeQuery('保留搜索条件'),
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await press('voice-call-bar');
    expectOwnedSheet(searchModal);
    expect(renderer.root.findByType(AppModals).props.modalRoute).toBe('search');
    expect(renderer.root.findByType(SearchScreen).props.query).toBe(
      '保留搜索条件',
    );
    await press('voice-call-minimize');
  }
  const notice = '搜索操作反馈应显示在当前弹窗';
  await act(async () =>
    renderer.root.findByType(SearchScreen).props.onError(notice),
  );
  expect(
    searchModal
      .findAllByType(Text)
      .some(node => node.props.children === notice),
  ).toBe(true);
  await act(async () => renderer.root.findByType(SearchScreen).props.onBack());
  expect(renderer.root.findAllByType(VoiceCallSheet)).toHaveLength(1);
  await press('voice-call-bar');
  expect(sheet().props.display).toBe(connected);
  expect(mockCallController.end).not.toHaveBeenCalled();
  expect(mockCallController.dispose).not.toHaveBeenCalled();
});

test('the post editor keeps its body while it owns restored call controls', async () => {
  await renderApp();
  await open(first);
  await publish(connected);
  await press('voice-call-minimize');
  await act(async () =>
    chat().props.onPublishComic({ body: '保留动态草稿', mediaAssetIds: [] }),
  );
  const editor = renderer.root.findByType(StationPostComposerScreen);
  const editorModal = editor.findByType(Modal);
  expect(renderer.root.findAllByType(VoiceCallSheet)).toHaveLength(0);
  await act(async () => editorModal.props.onShow());
  const content = () => editor.findByType(StationPostComposerContent);
  await act(async () => content().props.composer.setBody('通话期间继续编辑'));
  await press('voice-call-bar');
  expectOwnedSheet(editor);
  expect(content().props.composer.body).toBe('通话期间继续编辑');
  await press('voice-call-minimize');
  expect(content().props.composer.body).toBe('通话期间继续编辑');
  expect(mockCallController.end).not.toHaveBeenCalled();
});

test('the handle position belongs to one call and clears before the next call', async () => {
  await renderApp();
  await publish(connected);
  await press('voice-call-minimize');
  const position = { x: 0.25, y: 0.75 };
  await act(async () =>
    renderer.root.findByType(VoiceCallBar).props.onPositionChange(position),
  );
  await press('voice-call-bar');
  await press('voice-call-minimize');
  expect(renderer.root.findByType(VoiceCallBar).props.position).toBe(position);
  await publish({ ...connected, phase: 'ended' });
  await publish({ ...connected, connectedAt: connected.connectedAt! + 10000 });
  await press('voice-call-minimize');
  expect(renderer.root.findByType(VoiceCallBar).props.position).toBeUndefined();
});

test('a profile page presents its own call sheet without dismissing the profile', async () => {
  await renderApp();
  await publish(connected);
  await press('voice-call-minimize');
  await act(async () =>
    renderer.root.findByType(AppModals).props.onNavigateModal('public-profile'),
  );
  const profile = renderer.root.findByType(PublicProfilePage);
  expect(renderer.root.findAllByType(VoiceCallSheet)).toHaveLength(0);
  await act(async () => profile.findByType(Modal).props.onShow());
  await press('voice-call-bar');
  expectOwnedSheet(profile);
  expect(renderer.root.findByType(AppModals).props.modalRoute).toBe(
    'public-profile',
  );
  await press('voice-call-minimize');
  expect(profile.findByType(VoiceCallBar)).toBeDefined();
});

test('a minimized call ending in search leaves its feedback inside that modal', async () => {
  await renderApp();
  await publish(connected);
  await press('voice-call-minimize');
  await act(async () =>
    renderer.root.findByType(AppModals).props.onNavigateModal('search'),
  );
  const modal = renderer.root
    .findAllByType(Modal)
    .find(node => node.props.testID === 'app-modal-search')!;
  await act(async () => modal.props.onShow());
  await publish({ ...connected, phase: 'ended', message: '对方已挂断' });
  expect(
    modal
      .findAllByType(Text)
      .some(node => node.props.children === '对方已挂断'),
  ).toBe(true);
  expect(renderer.root.findByType(AppModals).props.modalRoute).toBe('search');
  expect(renderer.root.findAllByType(VoiceCallBar)).toHaveLength(0);
  expect(mockCallController.dismiss).toHaveBeenCalledTimes(1);
});
