import React from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import App from '../src/App';
import { BottomBar } from '../src/shared/ui';
import { AIRequestComposer } from '../src/features/ai/AIRequestComposer';
import { AgentWorkspaceScreen } from '../src/features/workspaces/AgentWorkspaceScreen';
import { WorkspaceSubmissionRecovery } from '../src/features/workspaces/WorkspaceSubmission';
import { AIAssistProvider } from '../src/features/assist/AIAssistProvider';
import { ChatComposer } from '../src/features/messages/ChatComposer';
import { WorkspaceContextCard } from '../src/features/messages/WorkspaceContextCard';
import { ChatMessageItem } from '../src/features/messages/ChatMessageItem';
import { ChatScreen } from '../src/features/messages/MessagesScreen';
import { ThreadListScreen } from '../src/features/messages/ThreadListScreen';
import { VoiceShortcutDock } from '../src/features/agents/VoiceShortcutDock';
import { MiaoTaskFeed } from '../src/features/miao/MiaoTaskFeed';
import { SecondFloorScreen } from '../src/features/second-floor/SecondFloorScreen';
import { StationScreen } from '../src/features/station/StationScreen';
import {
  emptyProfile,
  emptyRelationships,
  emptyStationContent,
} from '../src/features/session/sessionDefaults';
import { ChatThread } from '../src/features/session/sessionTypes';
import { AgentWorkspace } from '../src/models/agentWorkspace';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';
import { agentWorkspaceApi } from '../src/services/api/agentWorkspaceApi';

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
    refresh: jest.fn().mockResolvedValue(undefined),
  }),
}));
jest.mock('../src/features/workspaces/useAgentWorkspaces', () => ({
  useAgentWorkspaces: () => ({
    workspaces: mockWorkspaces,
    loaded: true,
    error: '',
    refresh: jest.fn().mockResolvedValue(undefined),
  }),
}));
jest.mock('../src/services/api/agentWorkspaceApi', () => ({
  agentWorkspaceApi: { create: jest.fn(), decide: jest.fn(), get: jest.fn() },
}));
jest.mock('../src/app/AppModals', () => ({ AppModals: () => null }));
jest.mock('../src/app/LaunchAnimation', () => ({
  LaunchAnimation: () => null,
}));
jest.mock('../src/features/station/StationScreen', () => ({
  StationScreen: () => null,
}));

const albumId = '0c28f97c-5dd7-483d-8d9d-c891925641d6';
const albumTitle = '旅行记录';
const butlerThread: ChatThread = {
  id: 'b89e76c9-df15-42f1-ad40-ed64c408455c',
  agentId: 'miaoxun-butler',
  title: '妙讯管家',
  avatarText: '妙',
  kind: 'agent',
  pinned: false,
  lastContent: '',
  unreadCount: 0,
  messages: [],
};
const makeSession = () => ({
  token: 'unit-test-token',
  user: { id: 'account-1', displayName: 'Tester' },
  appearance: 'light',
  language: 'zh',
  isRestoring: false,
  restoreStatus: 'authenticated',
  profile: emptyProfile,
  stationContent: {
    ...emptyStationContent,
    albums: [
      {
        id: albumId,
        title: albumTitle,
        description: '只在隔离单测中使用的相册夹具',
        visibility: 'private',
        mediaCount: 0,
      },
    ],
  },
  relationships: emptyRelationships,
  agents: [],
  agentReadiness: {},
  ownedAgents: [
    {
      id: 'miaoxun-butler',
      name: '妙讯管家',
      description: '',
      category: 'orchestrator',
      enabled: true,
      grantedScopes: [
        'profile:read',
        'messages:read',
        'agents:invoke',
        'album:read',
      ],
    },
  ],
  threads: [butlerThread],
  notices: [],
  unreadNoticeCount: 0,
  sendMessage: jest.fn().mockResolvedValue(true),
  setActiveThreadId: jest.fn(),
  markThreadRead: jest.fn(),
  refreshThreadMessages: jest.fn().mockResolvedValue(undefined),
  refreshStationContent: jest.fn().mockResolvedValue(emptyStationContent),
  setAppearance: jest.fn(),
  setLanguage: jest.fn(),
});
let mockSession = makeSession();
let mockWorkspaces: AgentWorkspace[] = [];
let renderer: TestRenderer.ReactTestRenderer | undefined;
const root = () => renderer!.root;
const button = (label: string) => {
  const node = root().findAll(
    candidate =>
      candidate.props.accessibilityLabel === label &&
      typeof candidate.props.onPress === 'function',
  )[0];
  if (!node) throw new Error(`Missing button: ${label}`);
  return node;
};
const tool = (key: string) =>
  root().findAll(
    node =>
      node.props.testID === `floor-tool-${key}` &&
      typeof node.props.onPress === 'function',
  )[0];
const text = () =>
  root()
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .join(' ');
const chatComposer = () => root().findByType(ChatComposer);

beforeEach(() => {
  jest.useFakeTimers();
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  mockSession = makeSession();
  mockWorkspaces = [];
  jest.mocked(agentWorkspaceApi.create).mockClear();
  jest.mocked(agentWorkspaceApi.decide).mockClear();
  jest.mocked(agentWorkspaceApi.get).mockReset();
  jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(callback => {
    callback(0, 0, 393, 760);
  });
});
afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = undefined;
  jest.clearAllTimers();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function openAlbumMenu() {
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });
  act(() => root().findByType(BottomBar).props.onSelectTab('messages'));
  await act(async () =>
    root().findByType(ThreadListScreen).props.onOpenSecondFloor(),
  );
  act(() => tool('albums').props.onPress());
  const card = root().findAll(
    node =>
      node.props.accessibilityLabel === `查看相册${albumTitle}` &&
      typeof node.props.onLongPress === 'function',
  )[0];
  expect(card).toBeTruthy();
  await act(async () =>
    card.props.onLongPress({ nativeEvent: { pageX: 160, pageY: 300 } }),
  );
  expect(
    root().findAllByProps({ testID: 'content-actions-overlay' }).length,
  ).toBeGreaterThan(0);
}

async function openAlbumRequest() {
  await openAlbumMenu();
  await act(async () => button('妙管家').props.onPress());
  expect(root().findByType(AIRequestComposer).props.context).toEqual(
    expect.objectContaining({ kind: 'station-album', id: albumId }),
  );
  expect(text()).toContain(albumTitle);
  expect(text()).not.toContain(`关于「${albumTitle}」`);
  expect(text()).not.toMatch(/发起位置|所在模块/);
  expect(mockSession.sendMessage).not.toHaveBeenCalled();
  const composer = root().findByType(AIRequestComposer);
  expect(composer.props.draft).toBe('');
  expect(button('交给妙管家').props.disabled).toBe(true);
  act(() => composer.props.onChangeDraft('帮我整理这本相册'));
}

async function openWorkspaceMenu() {
  mockWorkspaces = [
    agentWorkspace({
      id: '45267cd7-549c-4f8f-8576-49d061cc335a',
      revision: 8,
      steps: [
        workspaceStep(),
        workspaceStep({
          id: 'node-2',
          key: 'select-media',
          agentId: 'album-manager',
        }),
        workspaceStep({ id: 'node-3', key: 'coordinate-again' }),
      ],
    }),
  ];
  jest
    .mocked(agentWorkspaceApi.get)
    .mockImplementation(async () => mockWorkspaces[0]);
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });
  // The app opens on 讯; the workspace cards live on 妙.
  await act(async () =>
    root().findByType(BottomBar).props.onSelectTab('agents'),
  );
  const card = root().findAll(
    node =>
      node.props.testID ===
        'miao-workspace-45267cd7-549c-4f8f-8576-49d061cc335a' &&
      typeof node.props.onLongPress === 'function',
  )[0];
  expect(card).toBeTruthy();
  act(() =>
    card.props.onLongPress({ nativeEvent: { pageX: 160, pageY: 300 } }),
  );
}

function closeRequestToMiao() {
  act(() => root().findByType(AIRequestComposer).props.onClose());
  const floor = root().findAllByType(SecondFloorScreen)[0];
  if (floor) act(() => floor.props.onClose());
  act(() => root().findByType(BottomBar).props.onSelectTab('agents'));
}

test.each([
  { item: 'album', route: 'keyboard' },
  { item: 'album', route: 'butler' },
  { item: 'workspace', route: 'keyboard' },
  { item: 'workspace', route: 'butler' },
])(
  'closed $item drafts retain their selection and origin when continuing through voice $route',
  async ({ item, route }) => {
    if (item === 'album') await openAlbumRequest();
    else {
      await openWorkspaceMenu();
      act(() => button('妙管家').props.onPress());
    }
    const composer = root().findByType(AIRequestComposer);
    const context = composer.props.context;
    const scene = composer.props.scene;
    act(() => composer.props.onChangeDraft('保留我的编辑，只做计划'));
    closeRequestToMiao();
    const dock = root().findByType(VoiceShortcutDock);
    expect(dock.props.active).toBe(true);
    if (route === 'keyboard') {
      await act(async () => dock.props.onCompose('还要说明下一步'));
      const reopened = root().findByType(AIRequestComposer);
      expect(reopened.props.context).toEqual(context);
      expect(reopened.props.scene).toEqual(scene);
      expect(reopened.props.draft).toBe(
        '保留我的编辑，只做计划\n还要说明下一步',
      );
      await act(async () => button('交给妙管家').props.onPress());
    } else await act(async () => dock.props.onOpenButler('还要说明下一步'));

    expect(chatComposer().props.draft).toContain(
      '保留我的编辑，只做计划\n还要说明下一步',
    );
    if (item === 'workspace') {
      expect(chatComposer().props.draft).not.toContain(context.title);
      expect(root().findByType(WorkspaceContextCard).props.context.goal).toBe(
        context.title,
      );
    }
    expect(chatComposer().props.draft).not.toMatch(
      /发起位置|所在模块|记录版本/,
    );
    expect(chatComposer().props.contextRefs).toEqual(
      item === 'album'
        ? [{ kind: 'station-album', id: albumId, title: albumTitle }]
        : [],
    );
    expect(chatComposer().props.assistSource).toEqual({
      currentPage: scene.page,
    });
    if (item === 'workspace') {
      expect(chatComposer().props.draft).not.toContain(
        '45267cd7-549c-4f8f-8576-49d061cc335a',
      );
      expect(text()).toContain('发送消息只讨论');
    }
    expect(mockSession.sendMessage).not.toHaveBeenCalled();
    expect(agentWorkspaceApi.create).not.toHaveBeenCalled();
    expect(agentWorkspaceApi.decide).not.toHaveBeenCalled();

    act(() => root().findByType(ChatScreen).props.onBack());
    act(() => root().findByType(BottomBar).props.onSelectTab('agents'));
    await act(async () =>
      root().findByType(VoiceShortcutDock).props.onCompose(),
    );
    const next = root().findByType(AIRequestComposer);
    expect(next.props.draft).toBe('');
    expect(next.props.context).toBeUndefined();
    expect(next.props.references).toBeUndefined();
    expect(next.props.scene.page).toBe('miao.feed');
  },
);

test('a restarted access request retains edited followups and remaining references when voice opens the assistant', async () => {
  const workspace = agentWorkspace({
    status: 'waiting_input',
    allowedActions: ['cancel'],
    followups: ['只选横图', '不要修改原素材'],
    contextRefs: [
      {
        kind: 'station-album',
        id: albumId,
        version: 'a'.repeat(64),
        title: albumTitle,
      },
      {
        kind: 'station-diary',
        id: 'diary-1',
        version: 'b'.repeat(64),
        title: '旅行日记',
      },
    ],
    question: '需要更新建站授权。',
    inputRequest: {
      kind: 'agent_access',
      reason: 'authorization_required',
      question: '需要更新建站授权。',
      nextAction: 'manage_agents_then_restart',
      requirements: [
        {
          agentId: 'site-builder',
          agentName: '建站 Agent',
          capability: 'site.compose',
          requiredScopes: ['album:read'],
          reason: 'authorization_required',
        },
      ],
    },
  });
  jest.mocked(agentWorkspaceApi.get).mockResolvedValue(workspace);
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });
  act(() => root().findByType(BottomBar).props.onSelectTab('agents'));
  await act(async () =>
    root().findByType(MiaoTaskFeed).props.onOpenWorkspace(workspace),
  );
  await act(async () => button('以此目标准备新任务').props.onPress());
  let composer = root().findByType(AIRequestComposer);
  const edited = `${composer.props.draft}\n保留用户新编辑`;
  act(() => composer.props.onChangeDraft(edited));
  act(() => root().findByType(AIRequestComposer).props.onRemoveReference(1));
  closeRequestToMiao();
  await act(async () => root().findByType(VoiceShortcutDock).props.onCompose());
  composer = root().findByType(AIRequestComposer);
  expect(composer.props.draft).toBe(edited);
  expect(composer.props.references).toEqual([workspace.contextRefs[0]]);
  expect(composer.props.scene.page).toBe('miao.workspace');
  closeRequestToMiao();
  await act(async () =>
    root().findByType(VoiceShortcutDock).props.onOpenButler('先帮我检查要求'),
  );
  expect(chatComposer().props.draft).toContain(edited);
  expect(chatComposer().props.draft).toContain('先帮我检查要求');
  expect(chatComposer().props.draft).not.toContain('原请求来源：');
  expect(chatComposer().props.contextRefs).toEqual([workspace.contextRefs[0]]);
  expect(chatComposer().props.assistSource).toEqual({
    currentPage: 'miao.workspace',
  });
  expect(mockSession.sendMessage).not.toHaveBeenCalled();
  expect(agentWorkspaceApi.create).not.toHaveBeenCalled();
  expect(agentWorkspaceApi.decide).not.toHaveBeenCalled();
});

test.each(['oversized', 'unavailable'])(
  'voice preserves the full selected draft for editing when assistant handoff is %s',
  async failure => {
    await openAlbumRequest();
    const composer = root().findByType(AIRequestComposer);
    const context = composer.props.context;
    const scene = composer.props.scene;
    const draft =
      failure === 'oversized' ? '完整需求'.repeat(500) : '已编辑的目标';
    act(() => composer.props.onChangeDraft(draft));
    if (failure === 'unavailable') {
      mockSession = { ...mockSession, threads: [] };
      await act(async () => renderer!.update(<App />));
    }
    closeRequestToMiao();
    await act(async () =>
      root().findByType(VoiceShortcutDock).props.onOpenButler('新增要求'),
    );
    const preserved = root().findByType(AIRequestComposer);
    expect(preserved.props.context).toEqual(context);
    expect(preserved.props.scene).toEqual(scene);
    expect(preserved.props.draft).toBe(`${draft}\n新增要求`);
    expect(root().findAllByType(ChatComposer)).toHaveLength(0);
    if (failure === 'oversized') expect(text()).toContain('最多 2000 字');
    expect(mockSession.sendMessage).not.toHaveBeenCalled();
    expect(agentWorkspaceApi.create).not.toHaveBeenCalled();
  },
);

test.each(['妙管家'])(
  'workspace %s retains the selected revision through polling, review and explicit sending without inventing resource references',
  async action => {
    await openWorkspaceMenu();
    // A refreshed task must not replace the snapshot of an already open menu.
    mockWorkspaces = [
      { ...mockWorkspaces[0], revision: 9, status: 'succeeded', steps: [] },
    ];
    await act(async () => renderer!.update(<App />));
    act(() => button(action).props.onPress());
    const composer = root().findByType(AIRequestComposer);
    expect(composer.props.draft).toBe('');
    act(() => composer.props.onChangeDraft('请检查这项任务的进展'));
    expect(composer.props.context.kind).toBe('agent-workspace');
    expect(composer.props.context.scene.task).toBeUndefined();
    expect(composer.props.context.scene.workspace).toEqual({
      id: '45267cd7-549c-4f8f-8576-49d061cc335a',
      goal: '选择旅行素材并生成页面',
      status: 'running',
      revision: 8,
      currentRound: 1,
      participants: [
        { agentId: 'miaoxun-butler', name: 'miaoxun-butler' },
        { agentId: 'album-manager', name: 'album-manager' },
      ],
    });
    expect(text()).not.toMatch(/发起位置|所在模块|记录版本/);
    expect(text()).toContain('选中时协作中');
    expect(text()).toContain('发送消息只讨论');
    expect(mockSession.sendMessage).not.toHaveBeenCalled();
    expect(agentWorkspaceApi.create).not.toHaveBeenCalled();
    expect(agentWorkspaceApi.decide).not.toHaveBeenCalled();

    await act(async () => button('交给妙管家').props.onPress());
    expect(root().findAllByType(ChatComposer)).toHaveLength(0);
    expect(text()).toContain('任务已更新');
    expect(root().findByType(AIRequestComposer).props.draft).toBe(
      '请检查这项任务的进展',
    );
    await act(async () => button('交给妙管家').props.onPress());
    const draft = chatComposer().props.draft;
    expect(draft).toBe('请检查这项任务的进展');
    expect(root().findByType(WorkspaceContextCard).props.context).toEqual({
      id: mockWorkspaces[0].id,
      revision: 9,
      currentRound: 1,
      goal: mockWorkspaces[0].goal,
    });
    expect(chatComposer().props.contextRefs).toEqual([]);
    expect(chatComposer().props.assistSource).toEqual({
      currentPage: 'miao.feed',
    });
    expect(mockSession.sendMessage).not.toHaveBeenCalled();
    await act(async () => button('发送消息').props.onPress());
    expect(mockSession.sendMessage).toHaveBeenLastCalledWith(
      butlerThread.id,
      draft,
      undefined,
      null,
      [],
      { currentPage: 'miao.feed' },
      undefined,
      {
        id: mockWorkspaces[0].id,
        revision: 9,
        currentRound: 1,
        goal: mockWorkspaces[0].goal,
      },
    );
    expect(root().findByType(WorkspaceContextCard).props.context.revision).toBe(
      9,
    );
    expect(chatComposer().props.draft).toBe('');
    expect(chatComposer().props.assistSource).toBeUndefined();
  },
);

test('removing a workspace selection removes its snapshot while preserving where assistance started', async () => {
  await openWorkspaceMenu();
  act(() => button('妙管家').props.onPress());
  act(() =>
    root()
      .findByType(AIRequestComposer)
      .props.onChangeDraft('我想提出另一个需求'),
  );
  act(() => button('移除选中内容').props.onPress());
  expect(text()).not.toContain('45267cd7-549c-4f8f-8576-49d061cc335a');
  await act(async () => button('交给妙管家').props.onPress());
  expect(chatComposer().props.draft).not.toContain('记录版本');
  expect(chatComposer().props.draft).not.toContain('选择旅行素材并生成页面');
  expect(chatComposer().props.draft).not.toContain('发起位置');
  expect(chatComposer().props.assistSource).toEqual({
    currentPage: 'miao.feed',
  });
  expect(chatComposer().props.contextRefs).toEqual([]);
  expect(mockSession.sendMessage).not.toHaveBeenCalled();
});

test('closing an active task discussion through the real header preserves it for a later reopen', async () => {
  await openWorkspaceMenu();
  act(() => button('妙管家').props.onPress());
  const request = root().findByType(AIRequestComposer);
  act(() => request.props.onChangeDraft('请继续检查这项任务'));
  await act(async () => button('交给妙管家').props.onPress());
  expect(root().findByType(WorkspaceContextCard).props.context.revision).toBe(
    8,
  );
  act(() => chatComposer().props.onChangeDraft('保留这段讨论草稿'));

  await act(async () => button('返回').props.onPress());
  expect(root().findAllByType(ChatScreen)).toHaveLength(0);
  expect(mockSession.sendMessage).not.toHaveBeenCalled();

  act(() => root().findByType(BottomBar).props.onSelectTab('messages'));
  act(() =>
    root().findByType(ThreadListScreen).props.onOpenThread(butlerThread),
  );
  expect(chatComposer().props.draft).toBe('保留这段讨论草稿');
  expect(root().findByType(WorkspaceContextCard).props.context).toEqual(
    expect.objectContaining({
      id: '45267cd7-549c-4f8f-8576-49d061cc335a',
      revision: 8,
      currentRound: 1,
    }),
  );
  expect(mockSession.sendMessage).not.toHaveBeenCalled();
});

test.each(['success', 'failure', 'later-reset'] as const)(
  'removing an active task link keeps the new-request boundary through %s',
  async result => {
    const threadWithPreviousClarification: ChatThread = {
      ...butlerThread,
      messages: [
        {
          id: 'old-clarification',
          threadId: butlerThread.id,
          senderType: 'agent',
          senderName: '妙讯管家',
          content: '是否继续使用之前的素材？',
          metadata: {
            butlerClarification: {
              contextRefs: [
                { kind: 'station-album', id: albumId, title: albumTitle },
              ],
              source: { currentPage: 'second-floor.albums' },
            },
          },
        },
      ],
    };
    mockSession = {
      ...mockSession,
      threads: [threadWithPreviousClarification],
    };
    await openWorkspaceMenu();
    act(() => button('妙管家').props.onPress());
    const request = root().findByType(AIRequestComposer);
    act(() => request.props.onChangeDraft('先保留这段任务讨论'));
    await act(async () => button('交给妙管家').props.onPress());
    const originalContext =
      root().findByType(WorkspaceContextCard).props.context;
    act(() => chatComposer().props.onChangeDraft('这是移除关联后的新需求'));
    await act(async () =>
      root().findByType(WorkspaceContextCard).props.onRemove(),
    );
    expect(chatComposer().props.workspaceActions).toBeDefined();
    expect(text()).toContain('移除关联后将开始新的需求');
    expect(chatComposer().props.contextRefs).toEqual([]);
    expect(chatComposer().props.draft).toBe('这是移除关联后的新需求');

    await act(async () => button('返回').props.onPress());
    act(() => root().findByType(BottomBar).props.onSelectTab('messages'));
    act(() =>
      root().findByType(ThreadListScreen).props.onOpenThread(butlerThread),
    );
    expect(chatComposer().props.draft).toBe('这是移除关联后的新需求');
    expect(chatComposer().props.contextRefs).toEqual([]);
    expect(text()).toContain('移除关联后将开始新的需求');

    let resolveSend: ((value: boolean) => void) | undefined;
    if (result === 'failure')
      mockSession.sendMessage.mockResolvedValueOnce(false);
    if (result === 'later-reset')
      mockSession.sendMessage.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveSend = resolve;
          }),
      );
    await act(async () => button('发送消息').props.onPress());
    expect(mockSession.sendMessage).toHaveBeenLastCalledWith(
      butlerThread.id,
      '这是移除关联后的新需求',
      undefined,
      null,
      [],
      { currentPage: 'miao.feed' },
      true,
    );
    if (result === 'later-reset') {
      act(() =>
        root()
          .findByType(ChatMessageItem)
          .props.onRestoreWorkspaceContext(originalContext),
      );
      act(() => root().findByType(WorkspaceContextCard).props.onRemove());
      await act(async () => resolveSend!(true));
    }
    if (result !== 'success') {
      expect(text()).toContain('移除关联后将开始新的需求');
      expect(chatComposer().props.contextRefs).toEqual([]);
      act(() => chatComposer().props.onChangeDraft('下一条也应是新的需求'));
      await act(async () => button('发送消息').props.onPress());
      expect(mockSession.sendMessage.mock.calls[1][6]).toBe(true);
    }
    expect(chatComposer().props.contextRefs).toEqual([]);
    expect(text()).not.toContain('移除关联后将开始新的需求');
    act(() => chatComposer().props.onChangeDraft('成功后继续普通对话'));
    await act(async () => button('发送消息').props.onPress());
    expect(mockSession.sendMessage.mock.calls.at(-1)?.[6]).toBeUndefined();
  },
);

test('album assistance retains its actual origin and reference through review, then clears both for the next message', async () => {
  await openAlbumRequest();
  await act(async () => button('交给妙管家').props.onPress());
  expect(root().findAllByType(AIRequestComposer)).toHaveLength(0);
  expect(chatComposer().props.assistSource).toEqual({
    currentPage: 'second-floor.albums',
  });
  expect(chatComposer().props.contextRefs).toEqual([
    { kind: 'station-album', id: albumId, title: albumTitle },
  ]);
  const reviewedDraft = chatComposer().props.draft;
  expect(reviewedDraft).not.toMatch(/发起位置|所在模块|选中对象/);
  expect(text()).not.toContain('发起于：');
  expect(mockSession.sendMessage).not.toHaveBeenCalled();

  await act(async () => button('发送消息').props.onPress());
  expect(mockSession.sendMessage).toHaveBeenCalledTimes(1);
  expect(mockSession.sendMessage).toHaveBeenLastCalledWith(
    butlerThread.id,
    reviewedDraft,
    undefined,
    null,
    [{ kind: 'station-album', id: albumId, title: albumTitle }],
    { currentPage: 'second-floor.albums' },
  );
  expect(chatComposer().props.assistSource).toBeUndefined();
  expect(chatComposer().props.contextRefs).toEqual([]);
  expect(chatComposer().props.draft).toBe('');
  act(() => chatComposer().props.onChangeDraft('下一条普通消息'));
  await act(async () => button('发送消息').props.onPress());
  expect(mockSession.sendMessage).toHaveBeenLastCalledWith(
    butlerThread.id,
    '下一条普通消息',
    undefined,
    null,
    [],
    undefined,
  );
});

test('album assistance preserves the draft while access is missing and only enables sending after access is refreshed', async () => {
  mockSession.ownedAgents[0].grantedScopes = [
    'profile:read',
    'messages:read',
    'agents:invoke',
  ];
  await openAlbumRequest();
  await act(async () => button('交给妙管家').props.onPress());
  const draft = chatComposer().props.draft;
  expect(text()).toContain('读取相册');
  expect(button('发送消息').props.disabled).toBe(true);
  // Calling the callback directly must also be guarded, not just the button.
  await act(async () => chatComposer().props.onSend());
  expect(mockSession.sendMessage).not.toHaveBeenCalled();
  expect(chatComposer().props.draft).toBe(draft);
  expect(chatComposer().props.contextRefs[0].id).toBe(albumId);
  mockSession = {
    ...mockSession,
    ownedAgents: [
      {
        ...mockSession.ownedAgents[0],
        grantedScopes: [
          ...mockSession.ownedAgents[0].grantedScopes,
          'album:read',
        ],
      },
    ],
  };
  await act(async () => renderer!.update(<App />));
  expect(button('发送消息').props.disabled).toBe(false);
  await act(async () => button('发送消息').props.onPress());
  expect(mockSession.sendMessage).toHaveBeenLastCalledWith(
    butlerThread.id,
    draft,
    undefined,
    null,
    [{ kind: 'station-album', id: albumId, title: albumTitle }],
    { currentPage: 'second-floor.albums' },
  );
});

test.each(['cancel', 'grant'])(
  'an actual authorization navigation round-trip preserves the edited album draft after %s without sending it',
  async decision => {
    mockSession.ownedAgents[0].grantedScopes = [
      'profile:read',
      'messages:read',
      'agents:invoke',
    ];
    await openAlbumRequest();
    await act(async () => button('交给妙管家').props.onPress());
    act(() =>
      chatComposer().props.onChangeDraft(
        '我编辑后的目标：只分析选中的旅行相册',
      ),
    );
    const draft = chatComposer().props.draft;
    const references = chatComposer().props.contextRefs;
    const source = chatComposer().props.assistSource;
    act(() =>
      button(chatComposer().props.contextAccessWarning).props.onPress(),
    );
    expect(root().findAllByType(ChatScreen)).toHaveLength(0);
    expect(root().findAllByType(ChatComposer)).toHaveLength(0);
    expect(root().findByType(BottomBar).props.selectedTab).toBe('station');
    expect(root().findByType(StationScreen).props.selectedStationTab).toBe(
      'agents',
    );
    expect(mockSession.setActiveThreadId).toHaveBeenLastCalledWith(null);
    expect(mockSession.sendMessage).not.toHaveBeenCalled();
    if (decision === 'grant') {
      mockSession = {
        ...mockSession,
        ownedAgents: [
          {
            ...mockSession.ownedAgents[0],
            grantedScopes: [
              ...mockSession.ownedAgents[0].grantedScopes,
              'album:read',
            ],
          },
        ],
      };
      await act(async () => renderer!.update(<App />));
    }
    // Return through the real App callback from Agent management. Cancelling
    // leaves the grant untouched; neither path automatically sends the draft.
    act(() =>
      root()
        .findByType(StationScreen)
        .props.onOpenAgentThread('miaoxun-butler'),
    );
    expect(chatComposer().props.draft).toBe(draft);
    expect(chatComposer().props.contextRefs).toEqual(references);
    expect(chatComposer().props.assistSource).toEqual(source);
    expect(mockSession.sendMessage).not.toHaveBeenCalled();
    expect(button('发送消息').props.disabled).toBe(decision === 'cancel');
    if (decision === 'cancel') {
      await act(async () => chatComposer().props.onSend());
      expect(mockSession.sendMessage).not.toHaveBeenCalled();
      expect(chatComposer().props.draft).toBe(draft);
    } else {
      await act(async () => button('发送消息').props.onPress());
      expect(mockSession.sendMessage).toHaveBeenLastCalledWith(
        butlerThread.id,
        draft,
        undefined,
        null,
        references,
        source,
      );
      act(() => root().findByType(ChatScreen).props.onBack());
      act(() =>
        root()
          .findByType(StationScreen)
          .props.onOpenAgentThread('miaoxun-butler'),
      );
      expect(chatComposer().props.draft).toBe('');
      expect(chatComposer().props.contextRefs).toEqual([]);
      expect(chatComposer().props.assistSource).toBeUndefined();
    }
  },
);

test('an authorization draft is restored only in its original thread', async () => {
  mockSession.ownedAgents[0].grantedScopes = ['messages:read'];
  const otherThread = {
    ...butlerThread,
    id: 'other-thread',
    agentId: null,
    title: 'Other conversation',
    kind: 'direct' as const,
  };
  mockSession.threads = [butlerThread, otherThread];
  await openAlbumRequest();
  await act(async () => button('交给妙管家').props.onPress());
  act(() => chatComposer().props.onChangeDraft('留在原会话的目标'));
  act(() => button(chatComposer().props.contextAccessWarning).props.onPress());
  await act(async () =>
    root().findByType(BottomBar).props.onSelectTab('messages'),
  );
  act(() =>
    root().findByType(ThreadListScreen).props.onOpenThread(otherThread),
  );
  expect(chatComposer().props.draft).toBe('');
  expect(chatComposer().props.contextRefs).toEqual([]);
  act(() => root().findByType(ChatScreen).props.onBack());
  act(() =>
    root().findByType(ThreadListScreen).props.onOpenThread(butlerThread),
  );
  expect(chatComposer().props.draft).toBe('留在原会话的目标');
  expect(chatComposer().props.contextRefs[0].id).toBe(albumId);
  expect(mockSession.sendMessage).not.toHaveBeenCalled();
});

test.each(['empty', 'new-text'])(
  'returning through the assistant shortcut after authorization with %s restores only the intended draft',
  async choice => {
    mockSession.ownedAgents[0].grantedScopes = ['messages:read'];
    await openAlbumRequest();
    await act(async () => button('交给妙管家').props.onPress());
    act(() => chatComposer().props.onChangeDraft('原始相册目标，保留我的编辑'));
    const source = chatComposer().props.assistSource;
    const references = chatComposer().props.contextRefs;
    act(() =>
      button(chatComposer().props.contextAccessWarning).props.onPress(),
    );
    expect(root().findAllByType(ChatScreen)).toHaveLength(0);
    await act(async () =>
      root().findByType(BottomBar).props.onSelectTab('agents'),
    );
    await act(async () =>
      root()
        .findByType(VoiceShortcutDock)
        .props.onOpenButler(
          choice === 'empty' ? undefined : '这是新的一条要求',
        ),
    );
    expect(chatComposer().props.draft).toBe(
      choice === 'empty' ? '原始相册目标，保留我的编辑' : '这是新的一条要求',
    );
    expect(chatComposer().props.contextRefs).toEqual(
      choice === 'empty' ? references : [],
    );
    expect(chatComposer().props.assistSource).toEqual(
      choice === 'empty' ? source : { currentPage: 'miao.feed' },
    );
    expect(mockSession.sendMessage).not.toHaveBeenCalled();
    act(() => root().findByType(ChatScreen).props.onBack());
    await act(async () =>
      root().findByType(VoiceShortcutDock).props.onOpenButler(),
    );
    expect(chatComposer().props.draft).toBe('');
    expect(chatComposer().props.contextRefs).toEqual([]);
  },
);

test.each(['account', 'token'])(
  '%s changes during authorization clear the retained draft and reject stale callbacks',
  async boundary => {
    mockSession.ownedAgents[0].grantedScopes = ['messages:read'];
    await openAlbumRequest();
    await act(async () => button('交给妙管家').props.onPress());
    act(() => chatComposer().props.onChangeDraft('属于旧登录的未发送草稿'));
    const stalePreserve =
      root().findByType(ChatScreen).props.onPreserveDraftForAccess;
    act(() =>
      button(chatComposer().props.contextAccessWarning).props.onPress(),
    );
    const originalSession = mockSession;
    mockSession = {
      ...mockSession,
      ...(boundary === 'account'
        ? { user: { id: 'next-account', displayName: 'Next user' } }
        : { token: 'next-token' }),
    };
    await act(async () => renderer!.update(<App />));
    act(() =>
      stalePreserve({
        text: '晚到的旧草稿',
        references: [{ kind: 'station-album', id: albumId, title: albumTitle }],
        source: { currentPage: 'second-floor.albums' },
      }),
    );
    act(() => root().findByType(BottomBar).props.onSelectTab('messages'));
    act(() =>
      root().findByType(ThreadListScreen).props.onOpenThread(butlerThread),
    );
    expect(chatComposer().props.draft).toBe('');
    expect(chatComposer().props.contextRefs).toEqual([]);
    expect(chatComposer().props.assistSource).toBeUndefined();
    mockSession = originalSession;
    await act(async () => renderer!.update(<App />));
    act(() => root().findByType(BottomBar).props.onSelectTab('messages'));
    act(() =>
      root().findByType(ThreadListScreen).props.onOpenThread(butlerThread),
    );
    expect(chatComposer().props.draft).toBe('');
    expect(chatComposer().props.contextRefs).toEqual([]);
    expect(mockSession.sendMessage).not.toHaveBeenCalled();
  },
);

test('an explicit server access refusal is visible and retrying while access is missing does not resubmit', async () => {
  mockSession.ownedAgents[0].grantedScopes = [
    'profile:read',
    'messages:read',
    'agents:invoke',
  ];
  const failed = {
    id: 'local-denied',
    threadId: butlerThread.id,
    senderType: 'user',
    senderName: 'Tester',
    content: '理解所选内容',
    localStatus: 'failed' as const,
    localFailure: {
      message: '请先确认相册读取授权。',
      code: 'AI_CONTEXT_SCOPE_REQUIRED',
    },
    metadata: {
      contextRefs: [
        { kind: 'station-album' as const, id: albumId, title: albumTitle },
      ],
      assistSource: { currentPage: 'second-floor.albums' },
    },
  };
  mockSession.threads = [{ ...butlerThread, messages: [failed] }];
  await openAlbumRequest();
  await act(async () => button('交给妙管家').props.onPress());
  expect(text()).toContain('请先确认相册读取授权。');
  expect(text()).not.toContain('发送失败，点击重试');
  expect(button('查看授权')).toBeTruthy();
  const item = root().findByType(ChatMessageItem);
  await act(async () => item.props.onRetrySend(failed));
  expect(mockSession.sendMessage).not.toHaveBeenCalled();
});

test('removing the selected album removes its reference and summary before reviewing in chat', async () => {
  await openAlbumRequest();
  act(() => button('移除选中内容').props.onPress());
  expect(root().findByType(AIRequestComposer).props.context).toBeUndefined();
  expect(
    root().findAllByProps({ testID: 'assist-context-summary' }),
  ).toHaveLength(0);
  await act(async () => button('交给妙管家').props.onPress());
  expect(chatComposer().props.contextRefs).toEqual([]);
  expect(chatComposer().props.draft).not.toContain(albumTitle);
  expect(chatComposer().props.assistSource).toEqual({
    currentPage: 'second-floor.albums',
  });
  expect(mockSession.sendMessage).not.toHaveBeenCalled();
});

test.each([
  { boundary: 'account', stage: 'request' },
  { boundary: 'token', stage: 'request' },
  { boundary: 'account', stage: 'chat' },
  { boundary: 'token', stage: 'chat' },
])(
  'a $boundary change clears the unsent $stage and its references',
  async ({ boundary, stage }) => {
    await openAlbumRequest();
    act(() =>
      root()
        .findByType(AIRequestComposer)
        .props.onChangeDraft('只属于旧会话的私有草稿'),
    );
    if (stage === 'chat')
      await act(async () => button('交给妙管家').props.onPress());
    const previousSender = mockSession.sendMessage;
    const oldRouteKey = root().findByType(AIAssistProvider).props.routeKey;
    mockSession = {
      ...mockSession,
      ...(boundary === 'account'
        ? { user: { id: 'account-2', displayName: 'Next user' } }
        : { token: 'replacement-token' }),
      sendMessage: jest.fn().mockResolvedValue(true),
    };
    await act(async () => renderer!.update(<App />));
    expect(root().findByType(AIAssistProvider).props.routeKey).not.toBe(
      oldRouteKey,
    );
    expect(root().findAllByType(AIRequestComposer)).toHaveLength(0);
    for (const composer of root().findAllByType(ChatComposer)) {
      expect(composer.props.draft).toBe('');
      expect(composer.props.contextRefs).toEqual([]);
      expect(composer.props.assistSource).toBeUndefined();
    }
    expect(text()).not.toContain('只属于旧会话的私有草稿');
    expect(previousSender).not.toHaveBeenCalled();
    expect(mockSession.sendMessage).not.toHaveBeenCalled();
  },
);

test('switching second-floor tools invalidates a visible album menu and its stale action', async () => {
  await openAlbumMenu();
  const oldRouteKey = root().findByType(AIAssistProvider).props.routeKey;
  const oldAction = button('妙管家').props.onPress;
  act(() => tool('files').props.onPress());
  expect(root().findByType(AIAssistProvider).props.routeKey).not.toBe(
    oldRouteKey,
  );
  expect(
    root().findAllByProps({ testID: 'content-actions-overlay' }),
  ).toHaveLength(0);
  act(() => oldAction());
  expect(root().findAllByType(AIRequestComposer)).toHaveLength(0);
  expect(mockSession.sendMessage).not.toHaveBeenCalled();
});

test.each(['butler', 'chat'])(
  'a linked Butler task opens through the %s route after an owner-scoped read',
  async route => {
    const workspaceId = '45267cd7-549c-4f8f-8576-49d061cc335a';
    const workspace = agentWorkspace({ id: workspaceId });
    mockSession.threads = [
      {
        ...butlerThread,
        messages: [
          {
            id: 'reply-task',
            threadId: butlerThread.id,
            senderType: 'agent',
            senderName: '妙管家',
            content: '已安排协作，可查看任务进展。',
            metadata: { agentWorkspace: { id: workspaceId } },
          },
        ],
      },
    ];
    jest.mocked(agentWorkspaceApi.get).mockResolvedValue(workspace);
    await act(async () => {
      renderer = TestRenderer.create(<App />);
    });
    if (route === 'butler')
      await act(async () =>
        root().findByType(VoiceShortcutDock).props.onOpenButler(),
      );
    else {
      act(() => root().findByType(BottomBar).props.onSelectTab('messages'));
      act(() =>
        root()
          .findByType(ThreadListScreen)
          .props.onOpenThread(mockSession.threads[0]),
      );
    }
    expect(root().findAllByType(AgentWorkspaceScreen)).toHaveLength(0);
    await act(async () => button('查看任务').props.onPress());
    expect(agentWorkspaceApi.get).toHaveBeenCalledWith(
      'unit-test-token',
      workspaceId,
    );
    expect(root().findByType(AgentWorkspaceScreen).props.workspace.id).toBe(
      workspaceId,
    );
    expect(mockSession.sendMessage).not.toHaveBeenCalled();
  },
);

test('recovering an old task retains the new draft and selected content', async () => {
  await openAlbumRequest();
  act(() =>
    root()
      .findByType(AIRequestComposer)
      .props.onChangeDraft('正在编辑的新需求'),
  );
  const original = root().findByType(AIRequestComposer).props;
  const workspace = agentWorkspace();
  jest.mocked(agentWorkspaceApi.get).mockResolvedValue(workspace);
  await act(async () =>
    root().findByType(WorkspaceSubmissionRecovery).props.onCreated(workspace),
  );
  await act(async () =>
    root().findByType(AgentWorkspaceScreen).props.onClose(),
  );
  expect(mockSession.refreshStationContent).toHaveBeenCalledTimes(1);
  const floor = root().findAllByType(SecondFloorScreen)[0];
  if (floor) act(() => floor.props.onClose());
  act(() => root().findByType(BottomBar).props.onSelectTab('agents'));
  await act(async () => root().findByType(VoiceShortcutDock).props.onCompose());
  const restored = root().findByType(AIRequestComposer).props;
  expect(restored.draft).toBe('正在编辑的新需求');
  expect(restored.context).toEqual(original.context);
  expect(restored.scene).toEqual(original.scene);
  expect(mockSession.sendMessage).not.toHaveBeenCalled();
  expect(agentWorkspaceApi.create).not.toHaveBeenCalled();
});

const clarificationRefs = [
  {
    kind: 'station-album' as const,
    id: albumId,
    version: 'a'.repeat(64),
    title: albumTitle,
  },
  {
    kind: 'station-diary' as const,
    id: 'diary-clarification',
    version: 'b'.repeat(64),
    title: '素材说明',
  },
];
const clarificationReply = (id: string) => ({
  id,
  threadId: butlerThread.id,
  senderType: 'agent',
  senderName: '妙管家',
  content: '希望页面以哪些内容为主？',
  metadata: {
    butlerClarification: {
      contextRefs: clarificationRefs,
      source: { currentPage: 'second-floor.albums' },
    },
  },
});
async function openClarification() {
  mockSession.ownedAgents[0].grantedScopes.push('station:read');
  mockSession.threads = [
    { ...butlerThread, messages: [clarificationReply('clarification-1')] },
  ];
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });
  await act(async () =>
    root().findByType(VoiceShortcutDock).props.onOpenButler(),
  );
}

test('opening and reopening a pending clarification restores its original server references and source', async () => {
  await openClarification();
  expect(chatComposer().props.contextRefs).toEqual(clarificationRefs);
  expect(chatComposer().props.assistSource).toEqual({
    currentPage: 'second-floor.albums',
  });
  expect(chatComposer().props.draft).toBe('');
  act(() => root().findByType(ChatScreen).props.onBack());
  await act(async () =>
    root().findByType(VoiceShortcutDock).props.onOpenButler(),
  );
  expect(chatComposer().props.contextRefs).toEqual(clarificationRefs);
  act(() => chatComposer().props.onChangeDraft('以旅行照片为主'));
  await act(async () => chatComposer().props.onSend());
  const sent = mockSession.sendMessage.mock.calls[0] as unknown[];
  expect(sent[4]).toEqual(clarificationRefs);
  expect(sent[5]).toEqual({ currentPage: 'second-floor.albums' });
  expect(sent[6]).toBeUndefined();
  expect(chatComposer().props.contextRefs).toEqual([]);
  mockSession.threads = [
    { ...butlerThread, messages: [clarificationReply('clarification-2')] },
  ];
  await act(async () => renderer!.update(<App />));
  expect(chatComposer().props.contextRefs).toEqual(clarificationRefs);
});

test.each([1, 2])(
  'removing %s inherited references explicitly resets the pending selection while preserving the remaining references',
  async count => {
    await openClarification();
    for (let index = 0; index < count; index += 1)
      act(() => chatComposer().props.onRemoveContextReference(0));
    act(() => chatComposer().props.onChangeDraft('只按当前选择继续'));
    await act(async () => chatComposer().props.onSend());
    const sent = mockSession.sendMessage.mock.calls[0] as unknown[];
    expect(sent[4]).toEqual(clarificationRefs.slice(count));
    expect(sent[6]).toBe(true);
  },
);

test('a late clarification never overwrites a newly edited draft or selection', async () => {
  await openClarification();
  act(() => chatComposer().props.onChangeDraft('第一条补充'));
  await act(async () => chatComposer().props.onSend());
  act(() => chatComposer().props.onChangeDraft('这是一条另行编辑的新需求'));
  mockSession.threads = [
    { ...butlerThread, messages: [clarificationReply('clarification-late')] },
  ];
  await act(async () => renderer!.update(<App />));
  expect(chatComposer().props.draft).toBe('这是一条另行编辑的新需求');
  expect(chatComposer().props.contextRefs).toEqual([]);
});

test('a new explicit selection resets the older clarification and sends only its newly selected references', async () => {
  mockSession.threads = [
    { ...butlerThread, messages: [clarificationReply('older-clarification')] },
  ];
  await openAlbumRequest();
  act(() =>
    root()
      .findByType(AIRequestComposer)
      .props.onChangeDraft('新选择的独立需求'),
  );
  await act(async () => button('交给妙管家').props.onPress());
  expect(chatComposer().props.draft).toContain('新选择的独立需求');
  expect(chatComposer().props.contextRefs).toEqual([
    { kind: 'station-album', id: albumId, title: albumTitle },
  ]);
  await act(async () => chatComposer().props.onSend());
  const sent = mockSession.sendMessage.mock.calls[0] as unknown[];
  expect(sent[4]).toEqual([
    { kind: 'station-album', id: albumId, title: albumTitle },
  ]);
  expect(sent[6]).toBe(true);
});

test('a clarification consumed elsewhere clears its untouched inherited scope instead of reusing it for ordinary chat', async () => {
  await openClarification();
  mockSession.threads = [
    {
      ...butlerThread,
      messages: [
        {
          ...clarificationReply('ordinary-reply'),
          content: '普通回复',
          metadata: {},
        },
      ],
    },
  ];
  await act(async () => renderer!.update(<App />));
  expect(chatComposer().props.contextRefs).toEqual([]);
  expect(chatComposer().props.assistSource).toBeUndefined();
});

const professionalThread: ChatThread = {
  ...butlerThread,
  id: 'professional-thread',
  agentId: 'site-builder',
  title: '建站 Agent',
};
function enableProfessionalThread(clarification = true) {
  mockSession.ownedAgents.push({
    ...mockSession.ownedAgents[0],
    id: 'site-builder',
    name: '建站 Agent',
    grantedScopes: ['station:read', 'album:read', 'messages:read'],
  });
  mockSession.threads = [
    butlerThread,
    {
      ...professionalThread,
      messages: clarification
        ? [
            {
              ...clarificationReply('professional-clarification'),
              threadId: professionalThread.id,
              metadata: {
                agentDispatch: { version: 1, kind: 'clarify' },
                agentClarification: {
                  contextRefs: clarificationRefs,
                  source: { currentPage: 'messages.agent' },
                },
              },
            },
          ]
        : [],
    },
  ];
}
async function openProfessionalChat() {
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });
  await act(async () =>
    root()
      .findByType(ThreadListScreen)
      .props.onOpenThread(mockSession.threads[1]),
  );
}
test('professional clarification survives authorization round trips and removal uses only the professional reset', async () => {
  enableProfessionalThread();
  await openProfessionalChat();
  expect(chatComposer().props.contextRefs).toEqual(clarificationRefs);
  act(() => chatComposer().props.onRemoveContextReference(0));
  act(() => chatComposer().props.onChangeDraft('只用保留的素材'));
  act(() => chatComposer().props.onOpenAgentAccess());
  await act(async () =>
    root().findByType(StationScreen).props.onOpenAgentThread('site-builder'),
  );
  expect(chatComposer().props.contextRefs).toEqual(clarificationRefs.slice(1));
  expect(chatComposer().props.draft).toBe('只用保留的素材');
  await act(async () => chatComposer().props.onSend());
  const sent = mockSession.sendMessage.mock.calls[0] as unknown[];
  expect(sent[0]).toBe(professionalThread.id);
  expect(sent[4]).toEqual(clarificationRefs.slice(1));
  expect(sent.slice(6)).toEqual([undefined, undefined, true]);
  expect(agentWorkspaceApi.create).not.toHaveBeenCalled();
});

test('professional users can explicitly leave clarification and ordinary send never silently continues a workspace', async () => {
  enableProfessionalThread();
  await openProfessionalChat();
  act(() =>
    root().findByProps({ testID: 'chat-agent-new-request' }).props.onPress(),
  );
  expect(chatComposer().props.contextRefs).toEqual([]);
  act(() => chatComposer().props.onChangeDraft('换个话题，解释一个概念'));
  await act(async () => chatComposer().props.onSend());
  const sent = mockSession.sendMessage.mock.calls[0] as unknown[];
  expect(sent.slice(6)).toEqual([undefined, undefined, true]);
  expect(agentWorkspaceApi.decide).not.toHaveBeenCalled();
});

const professionalWorkspace = (changes: Partial<AgentWorkspace> = {}) =>
  agentWorkspace({
    id: 'direct-workspace',
    executionMode: 'direct',
    origin: {
      kind: 'agent_conversation',
      threadId: professionalThread.id,
      inputMessageId: 'input',
      agentId: 'site-builder',
      agentVersion: '1',
      capability: 'site.compose',
    },
    steps: [
      workspaceStep({
        agentId: 'site-builder',
        agentVersion: '1',
        capability: 'site.compose',
      }),
    ],
    ...changes,
  });
test('a professional workspace opened from Xun returns to its authenticated original conversation, and restart keeps the professional Agent', async () => {
  enableProfessionalThread(false);
  const workspace = professionalWorkspace({
    status: 'failed',
    allowedActions: [],
  });
  jest.mocked(agentWorkspaceApi.get).mockResolvedValue(workspace);
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });
  await act(async () =>
    root().findByType(ThreadListScreen).props.onOpenWorkspace(workspace),
  );
  expect(root().findByType(AgentWorkspaceScreen).props.workspace.id).toBe(
    workspace.id,
  );
  await act(async () =>
    root().findByType(AgentWorkspaceScreen).props.onOpenSource(workspace),
  );
  expect(mockSession.refreshThreadMessages).toHaveBeenCalledWith(
    professionalThread.id,
  );
  expect(root().findByType(ChatScreen).props.thread.id).toBe(
    professionalThread.id,
  );
  await act(async () =>
    root().findByType(ChatScreen).props.onOpenWorkspace(workspace),
  );
  await act(async () => button('以此目标准备新任务').props.onPress());
  expect(root().findByType(ChatScreen).props.thread.agentId).toBe(
    'site-builder',
  );
  expect(chatComposer().props.draft).toBe(workspace.goal);
  expect(chatComposer().props.contextRefs).toEqual(workspace.contextRefs);
  expect(root().findAllByType(AIRequestComposer)).toHaveLength(0);
  expect(mockSession.sendMessage).not.toHaveBeenCalled();
  expect(
    root().findByType(ChatScreen).props.initialAgentContextReset,
  ).toBeUndefined();
  expect(text()).toContain('移除关联后将开始新的需求');
  await act(async () => chatComposer().props.onSend());
  expect(mockSession.sendMessage.mock.calls[0].slice(6)).toEqual([
    undefined,
    undefined,
    true,
  ]);
});

test('the real direct restart button retains every user revision after a later round fails without submitting', async () => {
  enableProfessionalThread(false);
  const original = professionalWorkspace();
  const instructions = ['只保留两段，并把结尾改成邀请', '保留原内容，调整语气'];
  const workspace = professionalWorkspace({
    status: 'failed',
    allowedActions: [],
    currentRound: 3,
    followups: [instructions[0]],
    rounds: [
      original.rounds[0],
      ...instructions.map((instruction, index) => ({
        ...original.rounds[0],
        number: index + 2,
        instruction,
        status: 'failed' as const,
        completedAt: '2026-10-20T00:00:00Z',
      })),
    ],
  });
  jest.mocked(agentWorkspaceApi.get).mockResolvedValue(workspace);
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });
  await act(async () =>
    root().findByType(ThreadListScreen).props.onOpenWorkspace(workspace),
  );
  expect(button('以此目标准备新任务').props.disabled).toBe(false);
  await act(async () => button('以此目标准备新任务').props.onPress());
  expect(root().findByType(ChatScreen).props.thread.id).toBe(
    professionalThread.id,
  );
  expect(chatComposer().props.draft).toBe(
    [workspace.goal, ...instructions].join('\n\n'),
  );
  expect(chatComposer().props.contextRefs).toEqual(workspace.contextRefs);
  expect(mockSession.sendMessage).not.toHaveBeenCalled();
  expect(agentWorkspaceApi.create).not.toHaveBeenCalled();
  expect(agentWorkspaceApi.decide).not.toHaveBeenCalled();
});

test('a late original-conversation read cannot open a previous account thread', async () => {
  enableProfessionalThread(false);
  const workspace = professionalWorkspace();
  jest.mocked(agentWorkspaceApi.get).mockResolvedValue(workspace);
  let finish!: () => void;
  mockSession.refreshThreadMessages.mockImplementation(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      }),
  );
  await act(async () => {
    renderer = TestRenderer.create(<App />);
  });
  await act(async () =>
    root().findByType(ThreadListScreen).props.onOpenWorkspace(workspace),
  );
  act(() => {
    root().findByType(AgentWorkspaceScreen).props.onOpenSource(workspace);
  });
  mockSession = {
    ...makeSession(),
    token: 'other-token',
    user: { id: 'other-owner', displayName: 'Other' },
  };
  await act(async () => renderer!.update(<App />));
  await act(async () => finish());
  expect(root().findAllByType(ChatScreen)).toHaveLength(0);
  expect(mockSession.setActiveThreadId).not.toHaveBeenCalledWith(
    professionalThread.id,
  );
});
