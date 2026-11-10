import React, { useState } from 'react';
import {
  AppState,
  Animated,
  FlatList,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { MiaoTaskFeed } from '../src/features/miao/MiaoTaskFeed';
import { AIRequestComposer } from '../src/features/ai/AIRequestComposer';
import { useAITasks } from '../src/features/ai/useAITasks';
import { useAgentWorkspaces } from '../src/features/workspaces/useAgentWorkspaces';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';
import { AIAssistGestureSurface } from '../src/features/assist/AIAssistGestureSurface';
import { AITaskDTO } from '../src/models/aiTask';
import { AgentDTO } from '../src/models/api';
import { palettes } from '../src/shared/theme';
import { MiaoTaskCard } from '../src/features/miao/MiaoTaskCard';
import { AgentGlyphAvatar } from '../src/features/messages/AgentGlyphAvatar';
import { defaultUIPreferences } from '../src/features/ui/uiPreferences';
import { agentWorkspaceApi } from '../src/services/api/agentWorkspaceApi';
import { ChatMessageText } from '../src/features/messages/ChatMessageText';

jest.mock('../src/services/api/agentWorkspaceApi', () => ({
  agentWorkspaceApi: { text: jest.fn() },
}));
jest.mock('../src/features/ai/useAITasks', () => ({ useAITasks: jest.fn() }));
jest.mock('../src/features/workspaces/useAgentWorkspaces', () => ({
  useAgentWorkspaces: jest.fn(),
}));
jest.mock('../src/features/assist/AIAssistProvider', () => ({
  useAIAssist: () => mockAssist,
}));
const mockAssist = {
  open: jest.fn(),
  dismiss: jest.fn(),
  move: jest.fn(),
  release: jest.fn(),
  askButler: jest.fn(),
  routeKey: 'miao',
  getGeneration: () => 0,
};
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockDimensions,
}));
let mockDimensions = { width: 430, height: 900, scale: 3, fontScale: 1 };
const useTasks = jest.mocked(useAITasks);
const useWorkspaces = jest.mocked(useAgentWorkspaces);
const refresh = jest.fn();
const task = (changes: Partial<AITaskDTO> = {}): AITaskDTO => ({
  id: 'task-1',
  contractVersion: 1,
  kind: 'agent_message',
  agentId: 'album-manager',
  agentVersion: '1',
  goal: '找到旅行相册中的海边视频',
  threadId: 'thread-1',
  inputMessageId: 'message-1',
  status: 'running',
  revision: 3,
  phase: 'searching',
  contextRefs: [],
  artifacts: [],
  approval: null,
  error: null,
  createdAt: '2026-10-12T00:00:00Z',
  updatedAt: '2026-10-12T00:00:03Z',
  allowedActions: [],
  ...changes,
});
const agents: AgentDTO[] = [
  {
    key: 'album-manager',
    name: '相册管理',
    version: '1',
    category: 'media-management',
    identity: {
      avatarKind: 'agent-mark' as const,
      mark: '测',
      shape: 'circle' as const,
      colors: {
        background: '#123456',
        foreground: '#ffffff',
        accent: '#abcdef',
      },
    },
    description: '',
    capabilities: [],
    permissions: [],
    status: 'registered',
  },
  {
    key: 'another-album-agent',
    name: '同分类未参与者',
    version: '1',
    category: 'media-management',
    identity: {
      avatarKind: 'agent-mark' as const,
      mark: '测',
      shape: 'circle' as const,
      colors: {
        background: '#123456',
        foreground: '#ffffff',
        accent: '#abcdef',
      },
    },
    description: '',
    capabilities: [],
    permissions: [],
    status: 'registered',
  },
  {
    key: 'miaoxun-butler',
    name: '未参与的妙管家',
    version: '1',
    category: 'orchestrator',
    identity: {
      avatarKind: 'agent-mark' as const,
      mark: '测',
      shape: 'circle' as const,
      colors: {
        background: '#123456',
        foreground: '#ffffff',
        accent: '#abcdef',
      },
    },
    description: '',
    capabilities: [],
    permissions: [],
    status: 'registered',
  },
];
const state = (
  changes: Partial<ReturnType<typeof useAITasks>> = {},
): ReturnType<typeof useAITasks> => ({
  tasks: [],
  loading: false,
  hasLoaded: true,
  error: '',
  decisionError: '',
  pendingTaskId: null,
  refresh,
  track: jest.fn(),
  decide: jest.fn(),
  ...changes,
});
let renderer: TestRenderer.ReactTestRenderer | undefined;
const feed = (
  options: Partial<React.ComponentProps<typeof MiaoTaskFeed>> = {},
) => (
  <MiaoTaskFeed
    token="owner"
    active
    palette={palettes.light}
    language="zh"
    agents={agents}
    waterfall={false}
    voiceMenuExpanded={false}
    onOpenTask={jest.fn()}
    {...options}
  />
);
const text = () =>
  renderer!.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .join(' ');
const button = (label: string) =>
  renderer!.root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      node.props.accessibilityLabel === label,
  )[0];

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(agentWorkspaceApi.text).mockReset();
  AppState.currentState = 'active';
  refresh.mockReset();
  refresh.mockResolvedValue(undefined);
  useTasks.mockReturnValue(state());
  useWorkspaces.mockReturnValue({
    workspaces: [],
    loaded: true,
    error: '',
    refresh: jest.fn().mockResolvedValue(undefined),
  });
  mockDimensions = { width: 430, height: 900, scale: 3, fontScale: 1 };
});
afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = undefined;
  jest.restoreAllMocks();
});

test('task cards show only their recorded executor and open the original task without Agent management', () => {
  const recorded = task();
  useTasks.mockReturnValue(state({ tasks: [recorded] }));
  const open = jest.fn();
  act(() => {
    renderer = TestRenderer.create(feed({ onOpenTask: open }));
  });
  expect(text()).toContain(recorded.goal);
  // The PDF names each recorded participant in the persistent top header.
  expect(text()).toContain('相册管理');
  expect(
    renderer!.root.findByProps({ testID: 'miao-participant-album-manager' }),
  ).toBeTruthy();
  expect(text()).toContain('正在执行');
  // The named Agent header precedes the brief and footer status.
  expect(text().indexOf('相册管理')).toBeLessThan(
    text().indexOf(recorded.goal),
  );
  expect(text().indexOf(recorded.goal)).toBeLessThan(
    text().indexOf('正在执行'),
  );
  expect(text()).not.toMatch(
    /同分类未参与者|未参与的妙管家|已添加|全部 Agent|添加 Agent|权限范围/,
  );
  expect(
    renderer!.root.findAllByProps({
      testID: 'miao-participant-another-album-agent',
    }),
  ).toHaveLength(0);
  expect(
    renderer!.root.findAllByProps({
      testID: 'miao-participant-miaoxun-butler',
    }),
  ).toHaveLength(0);
  act(() => renderer!.root.findByType(AIAssistGestureSurface).props.onPress());
  expect(open).toHaveBeenCalledWith(recorded);
  expect(useTasks).toHaveBeenCalledWith({ token: 'owner', active: true });
});

test('hiding the task feed stops polling and shows the recovery path without task contents', () => {
  const preferences = defaultUIPreferences();
  preferences.hiddenModules.miao = ['taskFeed'];
  useTasks.mockReturnValue(state({ tasks: [task()] }));
  act(() => {
    renderer = TestRenderer.create(
      feed({ onOpenWorkspace: jest.fn(), uiPreferences: preferences }),
    );
  });
  expect(renderer!.root.findAllByType(FlatList)).toHaveLength(0);
  expect(text()).not.toContain(task().goal);
  expect(text()).toContain('恢复默认界面');
  expect(useTasks).toHaveBeenCalledWith({ token: 'owner', active: false });
  expect(useWorkspaces).toHaveBeenCalledWith({ token: 'owner', active: false });
});

test('an inactive retained collaboration feed cannot capture a new horizontal touch', () => {
  useWorkspaces.mockReturnValue({
    workspaces: [agentWorkspace()],
    loaded: true,
    error: '',
    refresh: jest.fn().mockResolvedValue(undefined),
  });
  const options = { onOpenWorkspace: jest.fn() };
  act(() => {
    renderer = TestRenderer.create(feed(options));
  });
  const surface = () =>
    renderer!.root
      .findByType(MiaoTaskCard)
      .findAllByType(Animated.View)
      .find(node => node.props.onResponderMove)!;
  const first = {
    nativeEvent: { touches: [{ identifier: 0, pageX: 100, pageY: 100 }] },
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: 1000,
      touchBank: [
        {
          touchActive: true,
          startTimeStamp: 1000,
          startPageX: 100,
          startPageY: 100,
          previousTimeStamp: 1000,
          previousPageX: 100,
          previousPageY: 100,
          currentTimeStamp: 1000,
          currentPageX: 100,
          currentPageY: 100,
        },
      ],
    },
  };
  const moved = {
    ...first,
    touchHistory: {
      ...first.touchHistory,
      mostRecentTimeStamp: 1020,
      touchBank: [
        {
          ...first.touchHistory.touchBank[0],
          currentTimeStamp: 1020,
          currentPageX: 140,
        },
      ],
    },
  };
  surface().props.onStartShouldSetResponderCapture(first);
  expect(surface().props.onMoveShouldSetResponderCapture(moved)).toBe(true);
  act(() => renderer!.update(feed({ ...options, active: false })));
  surface().props.onStartShouldSetResponderCapture(first);
  expect(surface().props.onMoveShouldSetResponderCapture(moved)).toBe(false);
});

test('the feed uses the V6 dark palette and dims its content while the voice menu is open', () => {
  useTasks.mockReturnValue(state({ tasks: [task()] }));
  act(() => {
    renderer = TestRenderer.create(feed({ voiceMenuExpanded: true }));
  });

  const listStyle = StyleSheet.flatten(
    renderer!.root.findByType(FlatList).props.style,
  );
  expect(listStyle).toMatchObject({
    backgroundColor: '#11121e',
    opacity: 0.72,
  });
  expect(renderer!.root.findByType(MiaoTaskCard).props.palette).toMatchObject({
    surface: '#292e3f',
    text: '#f6f7fa',
    secondaryText: '#a4a8b5',
    mint: '#00c7cb',
  });
});

test('a narrow grid card keeps every recorded Agent reachable through its participant count', () => {
  const participants = [
    ...agents,
    { ...agents[0], key: 'fourth-agent', name: '名称较长的第四位执行 Agent' },
  ];
  const open = jest.fn();
  act(() => {
    renderer = TestRenderer.create(
      <MiaoTaskCard
        object={{ kind: 'ai-task', id: 'narrow', title: '窄卡片任务' }}
        goal="窄卡片任务"
        status="等待你确认下一步"
        participantIds={participants.map(agent => agent.key)}
        agents={participants}
        palette={palettes.light}
        language="zh"
        grid
        failed={false}
        openLabel="查看任务"
        onOpen={open}
        renderState={cardState =>
          cardState === 'agents'
            ? participants.map(participant => (
                <Text key={participant.key}>{participant.name}</Text>
              ))
            : null
        }
      />,
    );
  });
  participants.forEach(agent => expect(text()).toContain(agent.name));
  const header = renderer!.root.findByProps({
    testID: 'miao-card-agent-header',
  });
  const strip = header
    .findAllByType(View)
    .find(node => StyleSheet.flatten(node.props.style)?.flexWrap === 'wrap')!;
  const stripStyle = StyleSheet.flatten(strip.props.style);
  const avatarWidths = participants.map(participant => {
    const avatar = header.findByProps({
      testID: `miao-participant-${participant.key}`,
    });
    const style = StyleSheet.flatten(avatar.props.style);
    expect(style).toMatchObject({ width: 40, minWidth: 40, maxWidth: 40 });
    expect(avatar.findByType(AgentGlyphAvatar).props.size).toBe(26);
    const name = avatar
      .findAllByType(Text)
      .find(node => node.props.children === participant.name)!;
    expect(name.props.numberOfLines).toBe(2);
    expect(StyleSheet.flatten(name.props.style).fontSize).toBe(10);
    return style.width;
  });
  const menu = header.findByProps({ testID: 'miao-card-content-menu' });
  expect(StyleSheet.flatten(menu.props.style)).toMatchObject({
    minWidth: 44,
    minHeight: 44,
  });
  // At the 360pt waterfall threshold, two named avatars fit beside the full
  // 44pt menu without reducing its touch target or dropping a participant.
  const halfCardWidth = (360 - 26 - 8) / 2;
  const availableStripWidth = halfCardWidth - 24 - 8 - 44;
  expect(
    avatarWidths[0] + avatarWidths[1] + stripStyle.gap,
  ).toBeLessThanOrEqual(availableStripWidth);
  // Wrap the fixed header instead of nesting another horizontal swipe surface.
  expect(renderer!.root.findAllByType(ScrollView)).toHaveLength(0);
  const stopPropagation = jest.fn();
  const participantControl = () =>
    renderer!.root.findByProps({ testID: 'miao-card-participants-action' });
  act(() => participantControl().props.onPress({ stopPropagation }));
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  expect(open).not.toHaveBeenCalled();
  participants.forEach(agent => expect(text()).toContain(agent.name));
  expect(text()).toContain('等待你确认下一步');
  expect(participantControl().props.accessibilityState.expanded).toBe(true);
  expect(renderer!.root.findAllByType(ScrollView)).toHaveLength(0);
  act(() => participantControl().props.onPress({ stopPropagation }));
  expect(text()).toContain('相册管理');
  expect(open).not.toHaveBeenCalled();
});

test('task actions preserve the page, real task state and input reference before asking for help', () => {
  const recorded = task({ status: 'awaiting_confirmation', revision: 8 });
  useTasks.mockReturnValue(state({ tasks: [recorded] }));
  const open = jest.fn();
  act(() => {
    renderer = TestRenderer.create(feed({ onOpenTask: open }));
  });
  const surface = renderer!.root.findByType(AIAssistGestureSurface);
  expect(surface.props.object).toEqual({
    kind: 'ai-task',
    id: recorded.id,
    title: recorded.goal,
    scene: {
      page: 'miao.feed',
      label: '妙 · 任务动态',
      module: { key: 'task-feed', label: '任务动态' },
      task: {
        id: recorded.id,
        goal: recorded.goal,
        status: recorded.status,
        phase: recorded.phase,
        agentId: recorded.agentId,
        revision: recorded.revision,
        inputMessageId: recorded.inputMessageId,
      },
    },
  });
  expect(mockAssist.askButler).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  expect(
    surface.props.actions.map((action: { label: string }) => action.label),
  ).toEqual(expect.arrayContaining(['查看任务']));
  act(() =>
    surface.props.actions
      .find((action: { label: string }) => action.label === '妙管家')
      .onSelect(surface.props.object),
  );
  expect(mockAssist.askButler).toHaveBeenCalledWith({
    ...surface.props.object,
  });
  expect(open).not.toHaveBeenCalled();
});

test('collaboration cards honor confirmed detail swipe distance from the feed', () => {
  useWorkspaces.mockReturnValue({
    workspaces: [agentWorkspace()],
    loaded: true,
    error: '',
    refresh: jest.fn(),
  });
  const preferences = defaultUIPreferences();
  preferences.gestures['miao.taskCard.detailsSwipe'] = {
    ...preferences.gestures['miao.taskCard.detailsSwipe']!,
    distance: 140,
  };
  const pan = jest.spyOn(PanResponder, 'create');
  act(() => {
    renderer = TestRenderer.create(
      feed({ onOpenWorkspace: jest.fn(), uiPreferences: preferences }),
    );
  });
  const config = pan.mock.calls.at(-1)?.[0];
  expect(config).toBeDefined();
  act(() => {
    config!.onPanResponderRelease?.(
      {} as never,
      {
        dx: -120,
        dy: 0,
        vx: 0,
        vy: 0,
      } as never,
    );
  });
  expect(
    renderer!.root.findAllByProps({ testID: 'miao-workspace-detail' }),
  ).toHaveLength(0);
  act(() => {
    config!.onPanResponderRelease?.(
      {} as never,
      {
        dx: -140,
        dy: 0,
        vx: 0,
        vy: 0,
      } as never,
    );
  });
  expect(
    renderer!.root.findAllByProps({ testID: 'miao-workspace-detail' }).length,
  ).toBeGreaterThan(0);
});

test('collaboration cards hide the participant control when the confirmed preference requires it', () => {
  useWorkspaces.mockReturnValue({
    workspaces: [agentWorkspace({ steps: [workspaceStep()] })],
    loaded: true,
    error: '',
    refresh: jest.fn(),
  });
  const preferences = defaultUIPreferences();
  preferences.components.miao = {
    'miao.taskCard.participants': { visible: false },
  };
  act(() => {
    renderer = TestRenderer.create(
      feed({ onOpenWorkspace: jest.fn(), uiPreferences: preferences }),
    );
  });
  expect(
    renderer!.root.findAllByProps({ accessibilityLabel: '查看 1 个 Agent' }),
  ).toHaveLength(0);
});

test('collaboration cards open inline participants and details while the content menu preserves the original workspace', () => {
  const recorded = agentWorkspace({
    summary: '先选择照片，再生成页面',
    steps: [
      workspaceStep(),
      workspaceStep({ id: 'node-2', agentId: 'album-manager' }),
      workspaceStep({ id: 'node-3', agentId: 'album-manager' }),
    ],
  });
  useWorkspaces.mockReturnValue({
    workspaces: [recorded],
    loaded: true,
    error: '',
    refresh: jest.fn().mockResolvedValue(undefined),
  });
  const open = jest.fn();
  act(() => {
    renderer = TestRenderer.create(feed({ onOpenWorkspace: open }));
  });
  const surface = () => renderer!.root.findByType(AIAssistGestureSurface);
  expect(text()).toContain(recorded.summary);
  expect(text()).toContain('相册管理');
  const participants = () =>
    renderer!.root.findByProps({ testID: 'miao-card-participants-action' });
  act(() => participants().props.onPress({ stopPropagation: jest.fn() }));
  expect(open).not.toHaveBeenCalled();
  expect(participants().props.accessibilityState.expanded).toBe(true);
  const visibleTexts = renderer!.root.findAllByType(Text);
  const goalRows = visibleTexts.filter(
    node => node.props.children === recorded.steps[0].goal,
  );
  const resultRows = visibleTexts.filter(
    node => node.props.children === recorded.steps[0].summary,
  );
  expect(goalRows.some(node => node.props.numberOfLines === 1)).toBe(true);
  expect(resultRows.some(node => node.props.numberOfLines === 2)).toBe(true);
  expect(text()).toContain('相册管理');
  expect(text()).toContain('未参与的妙管家');
  expect(text()).not.toContain('同分类未参与者');
  expect(surface().props.object.kind).toBe('agent-workspace');
  expect(
    surface().props.actions.map((action: { label: string }) => action.label),
  ).toEqual(['查看协作', '妙管家']);
  expect(open).not.toHaveBeenCalled();
  expect(mockAssist.askButler).not.toHaveBeenCalled();
  act(() => participants().props.onPress({ stopPropagation: jest.fn() }));
  expect(participants().props.accessibilityState.expanded).toBe(false);
  act(() => surface().props.onPress());
  expect(open).not.toHaveBeenCalled();
  expect(
    renderer!.root.findAllByProps({ testID: 'miao-workspace-detail' }).length,
  ).toBeGreaterThan(0);
  expect(
    renderer!.root.findByProps({ testID: 'miao-card-details-action' }).props
      .accessibilityLabel,
  ).toBe('收起详情');
  act(() => surface().props.actions[0].onSelect(surface().props.object));
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenLastCalledWith(recorded);
  expect(mockAssist.askButler).not.toHaveBeenCalled();
});

test('collaboration cards identify parallel running steps without presenting queued work as active', () => {
  const recorded = agentWorkspace({
    summary: '此前安排的摘要',
    steps: [
      workspaceStep(),
      workspaceStep({
        id: 'select',
        key: 'select',
        agentId: 'album-manager',
        capability: 'media.select',
        status: 'running',
        goal: '查找海边旅行照片',
      }),
      workspaceStep({
        id: 'draft',
        key: 'draft',
        agentId: 'site-builder',
        capability: 'site.compose',
        status: 'running',
        goal: '整理旅行页面的文字',
      }),
      workspaceStep({
        id: 'later',
        key: 'later',
        agentId: 'site-builder',
        capability: 'site.compose',
        status: 'queued',
        goal: '尚未开始的后续工作',
      }),
    ],
  });
  useWorkspaces.mockReturnValue({
    workspaces: [recorded],
    loaded: true,
    error: '',
    refresh: jest.fn(),
  });
  const registered = [
    ...agents,
    { ...agents[0], key: 'site-builder', name: '建站助手' },
  ];
  act(() => {
    renderer = TestRenderer.create(
      feed({ agents: registered, onOpenWorkspace: jest.fn() }),
    );
  });
  expect(text()).toContain('相册管理');
  expect(text()).toContain('建站助手');
  expect(text()).toContain('查找海边旅行照片');
  expect(text()).toContain('整理旅行页面的文字');
  expect(text()).not.toMatch(
    /尚未开始的后续工作|此前安排的摘要|media\.select|site\.compose|\d+%/,
  );
  expect(
    renderer!.root
      .findAllByType(Text)
      .filter(node => /^workspace-active-/.test(String(node.props.testID))),
  ).toHaveLength(2);
  expect(
    renderer!.root.findByType(AIAssistGestureSurface).props.accessibilityLabel,
  ).toContain('建站助手 · 整理旅行页面的文字');
});

test.each([
  ['clarification', '需要哪一年的旅行记录？'],
  ['confirmation', '待你预览页面并确认保存'],
  ['unavailable-confirmation', '页面尚未确认，打开任务查看'],
] as const)(
  'collaboration cards expose the real %s action before opening the task',
  (kind, expected) => {
    const recorded = agentWorkspace(
      kind === 'clarification'
        ? {
            status: 'waiting_input',
            question: expected,
            inputRequest: { kind: 'clarification', question: expected },
            allowedActions: ['cancel', 'reply'],
          }
        : {
            status: 'awaiting_confirmation',
            allowedActions:
              kind === 'confirmation'
                ? ['cancel', 'confirm', 'reject']
                : ['cancel', 'reject'],
            result: { kind: 'site_draft', id: 'page', title: '海边旅行记' },
          },
    );
    useWorkspaces.mockReturnValue({
      workspaces: [recorded],
      loaded: true,
      error: '',
      refresh: jest.fn(),
    });
    act(() => {
      renderer = TestRenderer.create(feed({ onOpenWorkspace: jest.fn() }));
    });
    expect(
      renderer!.root.findByProps({ testID: 'workspace-card-attention' }).props
        .children,
    ).toBe(expected);
    if (kind !== 'clarification') expect(text()).toContain('成果：海边旅行记');
    expect(
      renderer!.root.findAll(node =>
        /^workspace-active-/.test(String(node.props.testID)),
      ),
    ).toHaveLength(0);
  },
);

test('collaboration cards retain the latest successful partial result and prefer the actual final delivery', () => {
  const latest = {
    kind: 'text_result' as const,
    id: 'latest',
    title: '完成的旅行文案',
  };
  const recorded = agentWorkspace({
    status: 'failed',
    error: { code: 'PRIVATE_FAILURE_CODE', message: '页面生成未完成' },
    steps: [
      workspaceStep({
        id: 'latest',
        key: 'latest',
        agentId: 'retired-specialist',
        capability: 'text.summarize',
        result: latest,
        updatedAt: '2026-10-12T00:02:00Z',
      }),
      workspaceStep({
        id: 'old',
        key: 'old',
        agentId: 'album-manager',
        capability: 'media.select',
        result: { kind: 'text_result', id: 'old', title: '较早的内容' },
        updatedAt: '2026-10-12T00:01:00Z',
      }),
      workspaceStep({
        id: 'failed',
        key: 'failed',
        agentId: 'site-builder',
        capability: 'site.compose',
        status: 'failed',
        result: { kind: 'site_draft', id: 'invalid', title: '未成功的页面' },
        updatedAt: '2026-10-12T00:03:00Z',
      }),
    ],
  });
  const before = JSON.stringify(recorded);
  useWorkspaces.mockReturnValue({
    workspaces: [recorded],
    loaded: true,
    error: '',
    refresh: jest.fn(),
  });
  act(() => {
    renderer = TestRenderer.create(feed({ onOpenWorkspace: jest.fn() }));
  });
  expect(text()).toContain('最新成果：完成的旅行文案');
  expect(text()).toContain('页面生成未完成');
  expect(text()).not.toMatch(
    /较早的内容|未成功的页面|retired-specialist|PRIVATE_FAILURE_CODE/,
  );
  expect(JSON.stringify(recorded)).toBe(before);
  useWorkspaces.mockReturnValue({
    workspaces: [
      {
        ...recorded,
        status: 'succeeded',
        error: null,
        result: { kind: 'site_draft', id: 'final', title: '最终旅行页' },
      },
    ],
    loaded: true,
    error: '',
    refresh: jest.fn(),
  });
  act(() => renderer!.update(feed({ onOpenWorkspace: jest.fn() })));
  expect(text()).toContain('成果：最终旅行页');
  expect(text()).not.toContain('最新成果：完成的旅行文案');
});

test.each(['   ', '找到旅行相册中的海边视频', '已完成'])(
  'task previews omit empty or repeated detail %p without replacing the real content',
  title => {
    const recorded = task({
      status: 'succeeded',
      artifacts: [{ kind: 'message', id: 'result', title }],
    });
    useTasks.mockReturnValue(state({ tasks: [recorded] }));
    act(() => {
      renderer = TestRenderer.create(feed());
    });
    const visibleText = renderer!.root
      .findAllByType(Text)
      .map(node => node.props.children);
    expect(visibleText.filter(value => value === recorded.goal)).toHaveLength(
      1,
    );
    expect(visibleText.filter(value => value === '已完成')).toHaveLength(1);
    expect(visibleText).not.toContain('   ');
    expect(recorded.artifacts[0].title).toBe(title);
  },
);

test('a removed Agent definition never substitutes another registered Agent or invents a result count', () => {
  useTasks.mockReturnValue(
    state({
      tasks: [
        task({
          agentId: 'retired-agent',
          status: 'succeeded',
          phase: 'completed',
          artifacts: [{ kind: 'message', id: 'result', title: '相册查询回复' }],
        }),
      ],
    }),
  );
  act(() => {
    renderer = TestRenderer.create(feed());
  });
  expect(text()).toContain('执行 Agent');
  expect(text()).not.toContain('retired-agent');
  expect(text()).not.toContain('相册管理');
  expect(text()).not.toContain('同分类未参与者');
  expect(text()).not.toMatch(/\d+\s*张|\d+%/);
  expect(
    renderer!.root.findByProps({ testID: 'miao-participant-retired-agent' }),
  ).toBeTruthy();
});

test('loading, a genuine empty list and unavailable original content remain distinct', () => {
  useTasks.mockReturnValue(state({ loading: true, hasLoaded: false }));
  act(() => {
    renderer = TestRenderer.create(feed());
  });
  expect(text()).toContain('正在读取任务');
  expect(text()).not.toContain('还没有任务动态');
  useTasks.mockReturnValue(state());
  act(() => renderer!.update(feed()));
  expect(text()).toContain('还没有任务动态');
  expect(
    renderer!.root.findAll(node =>
      /^miao-task-task-/.test(String(node.props.testID)),
    ),
  ).toHaveLength(0);
  useTasks.mockReturnValue(state({ tasks: [task({ goal: '' })] }));
  act(() => renderer!.update(feed()));
  expect(text()).toContain('原任务内容已不可用');
  expect(text()).not.toContain('还没有任务动态');
});

test('read failures remain explicit, retry and pull-to-refresh call the actual task loader', async () => {
  useTasks.mockReturnValue(state({ error: '读取失败，请重试' }));
  act(() => {
    renderer = TestRenderer.create(feed());
  });
  expect(text()).toContain('读取失败，请重试');
  expect(text()).not.toContain('还没有任务动态');
  await act(async () => button('重试读取任务').props.onPress());
  expect(refresh).toHaveBeenCalledTimes(1);
  useTasks.mockReturnValue(state({ tasks: [task()], error: '网络连接中断' }));
  act(() => renderer!.update(feed()));
  expect(text()).toContain(task().goal);
  expect(text()).toContain('网络连接中断');
  await act(async () =>
    renderer!.root.findByType(FlatList).props.refreshControl.props.onRefresh(),
  );
  expect(refresh).toHaveBeenCalledTimes(2);
});

test.each(['success', 'failure'] as const)(
  'polling never pulls the feed down, and manual refresh finishes after %s',
  async outcome => {
    useTasks.mockReturnValue(state({ tasks: [task()], loading: true }));
    act(() => {
      renderer = TestRenderer.create(feed());
    });
    const control = () =>
      renderer!.root.findByType(FlatList).props.refreshControl.props;
    expect(control().refreshing).toBe(false);
    let finish!: () => void;
    refresh.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    let request!: Promise<void>;
    act(() => {
      request = control().onRefresh();
      control().onRefresh();
    });
    expect(control().refreshing).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    // useAITasks reports errors as state and settles refresh; it does not throw.
    useTasks.mockReturnValue(
      state({
        tasks: [task()],
        error: outcome === 'failure' ? '刷新失败，请重试' : '',
      }),
    );
    await act(async () => {
      finish();
      await request;
      renderer!.update(feed());
    });
    expect(control().refreshing).toBe(false);
    expect(text()).toContain(task().goal);
    if (outcome === 'failure') expect(text()).toContain('刷新失败，请重试');
    useTasks.mockReturnValue(state({ tasks: [task()], loading: true }));
    act(() => renderer!.update(feed()));
    expect(control().refreshing).toBe(false);
  },
);

type FeedRow = {
  entries: { kind: string; task: { id: string } }[];
  fullWidth: boolean;
};
const feedRows = (): FeedRow[] =>
  renderer!.root.findByType(FlatList).props.data;
const rowIds = () =>
  feedRows().map(row =>
    row.entries.map(entry => `${entry.kind}:${entry.task.id}`),
  );
const workspaceCard = (id: string) =>
  renderer!.root
    .findAllByType(MiaoTaskCard)
    .find(
      card =>
        card.props.object.kind === 'agent-workspace' &&
        card.props.object.id === id,
    )!;
const cardAction = (id: string, action: 'participants' | 'details') =>
  workspaceCard(id).findByProps({ testID: `miao-card-${action}-action` });

test('the same tasks switch row layout without generating data and large text keeps one readable column', () => {
  const tasks = [task(), task({ id: 'task-2' })];
  useTasks.mockReturnValue(state({ tasks }));
  act(() => {
    renderer = TestRenderer.create(feed({ waterfall: true }));
  });
  expect(renderer!.root.findByType(FlatList).props.numColumns).toBe(1);
  expect(rowIds()).toEqual([['task:task-1', 'task:task-2']]);
  expect(feedRows()[0].fullWidth).toBe(false);
  expect(
    renderer!.root.findAllByType(MiaoTaskCard).every(card => card.props.grid),
  ).toBe(true);
  mockDimensions = { width: 430, height: 900, scale: 3, fontScale: 1.8 };
  act(() => renderer!.update(feed({ waterfall: true })));
  expect(rowIds()).toEqual([['task:task-1'], ['task:task-2']]);
  expect(
    renderer!.root.findAllByType(MiaoTaskCard).every(card => !card.props.grid),
  ).toBe(true);
  act(() => renderer!.update(feed({ active: false })));
  expect(useTasks).toHaveBeenLastCalledWith({ token: 'owner', active: false });
});

test('expanded waterfall cards occupy their own row, retain state across polling, and collapse into ordered pairs', () => {
  const first = agentWorkspace({
    id: 'same-id',
    createdAt: '2026-10-14T00:00:00Z',
  });
  const second = agentWorkspace({
    id: 'second',
    createdAt: '2026-10-12T00:00:00Z',
  });
  const tasks = [
    task({ id: 'same-id', createdAt: '2026-10-13T00:00:00Z' }),
    task({ id: 'last', createdAt: '2026-10-11T00:00:00Z' }),
  ];
  useTasks.mockReturnValue(state({ tasks }));
  useWorkspaces.mockReturnValue({
    workspaces: [first, second],
    loaded: true,
    error: '',
    refresh: jest.fn(),
  });
  const options = { waterfall: true, onOpenWorkspace: jest.fn() };
  act(() => {
    renderer = TestRenderer.create(feed(options));
  });
  expect(rowIds()).toEqual([
    ['workspace:same-id', 'task:same-id'],
    ['workspace:second', 'task:last'],
  ]);
  act(() =>
    cardAction('same-id', 'participants').props.onPress({
      stopPropagation: jest.fn(),
    }),
  );
  expect(rowIds()).toEqual([
    ['workspace:same-id'],
    ['task:same-id', 'workspace:second'],
    ['task:last'],
  ]);
  expect(feedRows()[0].fullWidth).toBe(true);
  expect(workspaceCard('same-id').props.grid).toBe(false);
  expect(
    workspaceCard('same-id').findByProps({
      testID: 'miao-workspace-participants',
    }),
  ).toBeTruthy();
  useWorkspaces.mockReturnValue({
    workspaces: [{ ...first, revision: 4 }, second],
    loaded: true,
    error: '',
    refresh: jest.fn(),
  });
  act(() => renderer!.update(feed(options)));
  expect(
    workspaceCard('same-id').findByProps({
      testID: 'miao-workspace-participants',
    }),
  ).toBeTruthy();
  act(() =>
    cardAction('same-id', 'details').props.onPress({
      stopPropagation: jest.fn(),
    }),
  );
  expect(rowIds()).toEqual([
    ['workspace:same-id', 'task:same-id'],
    ['workspace:second', 'task:last'],
  ]);
  act(() =>
    cardAction('second', 'details').props.onPress({
      stopPropagation: jest.fn(),
    }),
  );
  expect(rowIds()).toEqual([
    ['workspace:same-id', 'task:same-id'],
    ['workspace:second'],
    ['task:last'],
  ]);
  expect(
    workspaceCard('second').findByProps({ testID: 'miao-workspace-detail' }),
  ).toBeTruthy();
  expect(
    workspaceCard('same-id').findAllByProps({
      testID: 'miao-workspace-detail',
    }),
  ).toHaveLength(0);
  mockDimensions = { width: 320, height: 900, scale: 3, fontScale: 1 };
  act(() => renderer!.update(feed(options)));
  expect(feedRows()).toHaveLength(4);
  expect(
    workspaceCard('second').findByProps({ testID: 'miao-workspace-detail' }),
  ).toBeTruthy();
  act(() => renderer!.update(feed({ ...options, token: 'another-owner' })));
  expect(
    workspaceCard('second').findAllByProps({ testID: 'miao-workspace-detail' }),
  ).toHaveLength(0);
  act(() => renderer!.update(feed(options)));
  expect(
    workspaceCard('second').findAllByProps({ testID: 'miao-workspace-detail' }),
  ).toHaveLength(0);
});

function ComposerHarness({
  initial = '',
  proceed = jest.fn(() => true),
}: {
  initial?: string;
  proceed?: (value: string) => boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const [open, setOpen] = useState(true);
  return open ? (
    <AIRequestComposer
      palette={palettes.light}
      language="zh"
      draft={draft}
      onChangeDraft={setDraft}
      onClose={() => setOpen(false)}
      onContinue={proceed}
    />
  ) : (
    <Pressable testID="reopen-composer" onPress={() => setOpen(true)} />
  );
}

test('closing and reopening the controlled composer preserves the edited draft without sending', () => {
  const proceed = jest.fn(() => true);
  act(() => {
    renderer = TestRenderer.create(
      <ComposerHarness initial="语音识别草稿" proceed={proceed} />,
    );
  });
  act(() =>
    renderer!.root.findByType(TextInput).props.onChangeText('用户修改后的需求'),
  );
  expect(renderer!.root.findByType(TextInput).props.value).toBe(
    '用户修改后的需求',
  );
  act(() => button('收起需求草稿').props.onPress());
  expect(proceed).not.toHaveBeenCalled();
  act(() =>
    renderer!.root.findByProps({ testID: 'reopen-composer' }).props.onPress(),
  );
  expect(renderer!.root.findByType(TextInput).props.value).toBe(
    '用户修改后的需求',
  );
});

test('blank requests stay disabled and continuing passes only the user draft for review', async () => {
  const proceed = jest.fn(() => true);
  act(() => {
    renderer = TestRenderer.create(
      <ComposerHarness initial="   " proceed={proceed} />,
    );
  });
  expect(button('交给妙管家').props.disabled).toBe(true);
  act(() =>
    renderer!.root
      .findByType(TextInput)
      .props.onChangeText('  整理我的旅行记录  '),
  );
  expect(button('交给妙管家').props.disabled).toBe(false);
  expect(proceed).not.toHaveBeenCalled();
  await act(async () => button('交给妙管家').props.onPress());
  expect(proceed).toHaveBeenCalledWith('整理我的旅行记录');
  expect(text()).toContain('妙管家会按需邀请你的 AI 伙伴协作。');
});

test('failed navigation leaves an explicit inline error and retains the editable draft for retry', async () => {
  const proceed = jest.fn(() => false);
  act(() => {
    renderer = TestRenderer.create(
      <ComposerHarness initial="仍需处理的需求" proceed={proceed} />,
    );
  });
  await act(async () => button('交给妙管家').props.onPress());
  expect(proceed).toHaveBeenCalledWith('仍需处理的需求');
  expect(renderer!.root.findByType(TextInput).props.value).toBe(
    '仍需处理的需求',
  );
  expect(
    renderer!.root.findAll(node => node.props.accessibilityRole === 'alert')
      .length,
  ).toBeGreaterThan(0);
  act(() =>
    renderer!.root.findByType(TextInput).props.onChangeText('修改后再次尝试'),
  );
  proceed.mockReturnValueOnce(true);
  await act(async () => button('交给妙管家').props.onPress());
  expect(proceed).toHaveBeenLastCalledWith('修改后再次尝试');
});

const interruptedTextWorkspace = () =>
  agentWorkspace({
    status: 'interrupted',
    error: {
      code: 'WORKSPACE_MODEL_RESULT_UNKNOWN',
      message: '部分调用结果未知，不会自动重新执行。',
    },
    summary: '协作已中断',
    steps: [
      workspaceStep({
        id: 'saved-text',
        key: 'storyboard',
        agentId: 'comic-diary',
        capability: 'comic.storyboard',
        summary: '文字成果已完成',
        result: {
          kind: 'text_result',
          id: 'saved-text',
          title: '已保存的分镜',
        },
        updatedAt: '2026-10-12T00:01:00Z',
      }),
      // A later failed step by the same participant must not hide its delivery.
      workspaceStep({
        id: 'unknown-step',
        key: 'another-step',
        agentId: 'comic-diary',
        capability: 'comic.storyboard',
        status: 'interrupted',
        summary: '',
        error: { code: 'WORKSPACE_MODEL_RESULT_UNKNOWN', message: '结果未知' },
        updatedAt: '2026-10-12T00:02:00Z',
      }),
    ],
  });
const showInterruptedTextWorkspace = () => {
  const recorded = interruptedTextWorkspace();
  useWorkspaces.mockReturnValue({
    workspaces: [recorded],
    loaded: true,
    error: '',
    refresh: jest.fn(),
  });
  const preferences = defaultUIPreferences();
  preferences.components.miao = {
    'miao.taskCard.details': { label: '查看当前成果' },
  };
  return { recorded, preferences };
};
const openCardResult = () =>
  renderer!.root
    .findByProps({ testID: 'miao-card-details-action' })
    .props.onPress({ stopPropagation: jest.fn() });
const resultBodies = () =>
  renderer!.root
    .findAllByType(ChatMessageText)
    .map(node => node.props.children);

test('an interrupted collaboration reads its saved text in S2 without opening another page', async () => {
  const { recorded, preferences } = showInterruptedTextWorkspace();
  let resolve!: (value: { id: string; title: string; content: string }) => void;
  jest.mocked(agentWorkspaceApi.text).mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  const onOpenWorkspace = jest.fn();
  await act(async () => {
    renderer = TestRenderer.create(
      feed({ onOpenWorkspace, uiPreferences: preferences }),
    );
  });
  expect(agentWorkspaceApi.text).not.toHaveBeenCalled();
  expect(text()).toContain('执行中断');
  expect(text()).toContain('最新成果：已保存的分镜');
  await act(async () => openCardResult());
  expect(text()).toContain('阅读完整成果');
  await act(async () =>
    renderer!.root
      .findByProps({ testID: 'workspace-text-toggle-saved-text' })
      .props.onPress(),
  );
  expect(text()).toContain('正在读取文字成果');
  expect(agentWorkspaceApi.text).toHaveBeenCalledWith(
    'owner',
    recorded.id,
    'saved-text',
  );
  await act(async () =>
    resolve({
      id: 'saved-text',
      title: '已保存的分镜',
      content: '这是已持久化的分镜正文。',
    }),
  );
  expect(resultBodies()).toEqual(['这是已持久化的分镜正文。']);
  expect(onOpenWorkspace).not.toHaveBeenCalled();
  expect(
    renderer!.root.findByProps({ testID: 'miao-workspace-detail' }),
  ).toBeTruthy();
});

test('leaving the feed or backgrounding clears S2 text and rereads authorization on return', async () => {
  const { preferences } = showInterruptedTextWorkspace();
  let notifyAppState!: (state: 'active' | 'background') => void;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((event, listener) => {
      if (event === 'change') notifyAppState = listener;
      return { remove: jest.fn() };
    });
  jest.mocked(agentWorkspaceApi.text).mockResolvedValue({
    id: 'saved-text',
    title: '已保存的分镜',
    content: '当前获准读取的正文',
  });
  const options = { onOpenWorkspace: jest.fn(), uiPreferences: preferences };
  await act(async () => {
    renderer = TestRenderer.create(feed(options));
  });
  await act(async () => openCardResult());
  await act(async () =>
    renderer!.root
      .findByProps({ testID: 'workspace-text-toggle-saved-text' })
      .props.onPress(),
  );
  expect(resultBodies()).toEqual(['当前获准读取的正文']);
  await act(async () => renderer!.update(feed({ ...options, active: false })));
  expect(resultBodies()).toEqual([]);
  await act(async () => renderer!.update(feed(options)));
  await act(async () =>
    renderer!.root
      .findByProps({ testID: 'workspace-text-toggle-saved-text' })
      .props.onPress(),
  );
  expect(agentWorkspaceApi.text).toHaveBeenCalledTimes(2);
  await act(async () => notifyAppState('background'));
  expect(resultBodies()).toEqual([]);
  await act(async () => notifyAppState('active'));
  expect(agentWorkspaceApi.text).toHaveBeenCalledTimes(2);
  expect(resultBodies()).toEqual([]);
  await act(async () =>
    renderer!.root
      .findByProps({ testID: 'workspace-text-toggle-saved-text' })
      .props.onPress(),
  );
  expect(agentWorkspaceApi.text).toHaveBeenCalledTimes(3);
  expect(resultBodies()).toEqual(['当前获准读取的正文']);
  await act(async () =>
    renderer!.update(feed({ ...options, token: 'other-account' })),
  );
  // A new account starts at S0 and never inherits the old account's open body.
  expect(resultBodies()).toEqual([]);
  expect(agentWorkspaceApi.text).toHaveBeenCalledTimes(3);
  await act(async () => openCardResult());
  await act(async () =>
    renderer!.root
      .findByProps({ testID: 'workspace-text-toggle-saved-text' })
      .props.onPress(),
  );
  expect(agentWorkspaceApi.text).toHaveBeenLastCalledWith(
    'other-account',
    'workspace-1',
    'saved-text',
  );
});

test('S2 shows a real access failure and only retries after the user requests it', async () => {
  const { preferences } = showInterruptedTextWorkspace();
  jest
    .mocked(agentWorkspaceApi.text)
    .mockRejectedValueOnce(new Error('此成果授权已撤回。'));
  await act(async () => {
    renderer = TestRenderer.create(
      feed({ onOpenWorkspace: jest.fn(), uiPreferences: preferences }),
    );
  });
  await act(async () => openCardResult());
  await act(async () =>
    renderer!.root
      .findByProps({ testID: 'workspace-text-toggle-saved-text' })
      .props.onPress(),
  );
  expect(resultBodies()).toEqual([]);
  expect(text()).toContain('此成果授权已撤回。');
  expect(agentWorkspaceApi.text).toHaveBeenCalledTimes(1);
  jest.mocked(agentWorkspaceApi.text).mockResolvedValueOnce({
    id: 'saved-text',
    title: '已保存的分镜',
    content: '重新确认授权后的正文',
  });
  await act(async () =>
    renderer!.root
      .findByProps({ testID: 'workspace-text-retry-saved-text' })
      .props.onPress(),
  );
  expect(resultBodies()).toEqual(['重新确认授权后的正文']);
  expect(agentWorkspaceApi.text).toHaveBeenCalledTimes(2);
});

test('S2 expands the same card for a long result while the outer feed owns vertical reading', async () => {
  const { preferences } = showInterruptedTextWorkspace();
  const prose = '一段需要滚动阅读的真实成果。'.repeat(100);
  jest.mocked(agentWorkspaceApi.text).mockResolvedValueOnce({
    id: 'saved-text',
    title: '已保存的分镜',
    content: prose,
  });
  const pan = jest.spyOn(PanResponder, 'create');
  await act(async () => {
    renderer = TestRenderer.create(
      feed({ onOpenWorkspace: jest.fn(), uiPreferences: preferences }),
    );
  });
  await act(async () => openCardResult());
  await act(async () =>
    renderer!.root
      .findByProps({ testID: 'workspace-text-toggle-saved-text' })
      .props.onPress(),
  );
  const reader = renderer!.root.findByProps({
    testID: 'miao-workspace-text-reader',
  });
  expect(reader.findAllByType(ChatMessageText)[0].props.children).toBe(prose);
  expect(reader.findAllByType(ScrollView)).toHaveLength(0);
  expect(StyleSheet.flatten(reader.props.style).maxHeight).toBeUndefined();
  const responder = pan.mock.calls.at(-1)![0];
  expect(
    responder.onMoveShouldSetPanResponderCapture!(
      {} as never,
      { dx: 5, dy: -120 } as never,
    ),
  ).toBe(false);
});
