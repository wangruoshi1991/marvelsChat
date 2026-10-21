import React, { useState } from 'react';
import { FlatList, Pressable, Text, TextInput } from 'react-native';
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
  expect(text()).toContain('相册管理');
  expect(text()).toContain('正在执行');
  // The design puts the Agent strip (with its status pill) above the task
  // description, so the goal now reads after both.
  expect(text().indexOf('相册管理')).toBeLessThan(
    text().indexOf(recorded.goal),
  );
  expect(text().indexOf(recorded.goal)).toBeGreaterThan(
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

test('collaboration cards use shared content actions while tap and View workspace open the original workspace', () => {
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
  const surface = renderer!.root.findByType(AIAssistGestureSurface);
  expect(text()).toContain(recorded.summary);
  expect(text()).toContain('相册管理');
  expect(text()).toContain('未参与的妙管家');
  expect(text()).not.toContain('同分类未参与者');
  expect(surface.props.object.kind).toBe('agent-workspace');
  expect(
    surface.props.actions.map((action: { label: string }) => action.label),
  ).toEqual(['查看协作', '妙管家']);
  expect(open).not.toHaveBeenCalled();
  expect(mockAssist.askButler).not.toHaveBeenCalled();
  act(() => surface.props.onPress());
  expect(open).toHaveBeenLastCalledWith(recorded);
  act(() => surface.props.actions[0].onSelect(surface.props.object));
  expect(open).toHaveBeenCalledTimes(2);
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

test('the same tasks switch layout without generating data and large text keeps one readable column', () => {
  const tasks = [task(), task({ id: 'task-2' })];
  useTasks.mockReturnValue(state({ tasks }));
  act(() => {
    renderer = TestRenderer.create(feed({ waterfall: true }));
  });
  expect(renderer!.root.findByType(FlatList).props.numColumns).toBe(2);
  expect(
    renderer!.root
      .findByType(FlatList)
      .props.data.map((entry: { task: AITaskDTO }) => entry.task),
  ).toEqual(tasks);
  mockDimensions = { width: 430, height: 900, scale: 3, fontScale: 1.8 };
  act(() => renderer!.update(feed({ waterfall: true })));
  expect(renderer!.root.findByType(FlatList).props.numColumns).toBe(1);
  expect(
    renderer!.root
      .findByType(FlatList)
      .props.data.map((entry: { task: AITaskDTO }) => entry.task),
  ).toEqual(tasks);
  act(() => renderer!.update(feed({ active: false })));
  expect(useTasks).toHaveBeenLastCalledWith({ token: 'owner', active: false });
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
