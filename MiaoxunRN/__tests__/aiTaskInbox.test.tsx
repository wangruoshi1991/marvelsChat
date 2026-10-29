import React from 'react';
import { AppState, AppStateStatus, SectionList, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { AITaskInbox } from '../src/features/ai/AITaskInbox';
import { useAITasks } from '../src/features/ai/useAITasks';
import { AITaskDTO } from '../src/models/aiTask';
import { AgentDTO } from '../src/models/api';
import { aiTaskApi } from '../src/services/api/aiTaskApi';
import { palettes } from '../src/shared/theme';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';
import { agentWorkspaceApi } from '../src/services/api/agentWorkspaceApi';
import { AIAssistProvider } from '../src/features/assist/AIAssistProvider';
import { AgentWorkspaceCard } from '../src/features/workspaces/AgentWorkspaceCard';
import { XunTaskCard } from '../src/features/ai/XunTaskCard';
import { xunV3Palette } from '../src/shared/xunPalette';
import { WorkspaceStatus } from '../src/models/agentWorkspace';

jest.mock('../src/services/api/aiTaskApi', () => ({
  aiTaskApi: { list: jest.fn(), decide: jest.fn() },
}));
jest.mock('../src/services/api/agentWorkspaceApi', () => ({
  agentWorkspaceApi: { list: jest.fn() },
}));
const list = jest.mocked(aiTaskApi.list);
const task = (changes: Partial<AITaskDTO> = {}): AITaskDTO => ({
  id: 'album-task',
  contractVersion: 1,
  kind: 'agent_message',
  agentId: 'album-manager',
  agentVersion: '1',
  goal: '找到我上传的雪山视频',
  threadId: 'album-thread',
  inputMessageId: 'input-message',
  status: 'queued',
  revision: 1,
  phase: 'queued',
  contextRefs: [],
  artifacts: [],
  approval: null,
  error: null,
  createdAt: '2026-10-10T03:00:00Z',
  updatedAt: '2026-10-10T03:00:00Z',
  allowedActions: ['cancel'],
  ...changes,
});
const agents: AgentDTO[] = [
  {
    key: 'album-manager',
    name: '相册管理',
    version: '1',
    category: 'media-management',
    identity: {
      avatarKind: 'agent-mark',
      mark: '测',
      shape: 'circle',
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
    key: 'site-builder',
    name: '建站助手',
    version: '1',
    category: 'site-builder',
    identity: {
      avatarKind: 'agent-mark',
      mark: '测',
      shape: 'circle',
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
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
};
let renderer: TestRenderer.ReactTestRenderer | undefined;
let controller: ReturnType<typeof useAITasks>;
function Harness({
  kind,
  token = 'owner-a',
  threadId,
}: {
  kind?: AITaskDTO['kind'];
  token?: string;
  threadId?: string;
}) {
  controller = useAITasks({ token, kind, threadId });
  return null;
}
const inbox = (
  options: Partial<React.ComponentProps<typeof AITaskInbox>> = {},
) => (
  <AITaskInbox
    token="owner-a"
    active
    palette={palettes.light}
    language="zh"
    agents={agents}
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
  jest.useFakeTimers();
  jest.clearAllMocks();
  list.mockResolvedValue([]);
  jest.mocked(agentWorkspaceApi.list).mockResolvedValue([]);
});
afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('loads both task kinds, shows real goals and opens their original workspaces without deciding', async () => {
  const album = task({
    status: 'running',
    phase: 'searching',
    allowedActions: [],
  });
  const site = task({
    id: 'site-task',
    kind: 'site_draft',
    agentId: 'site-builder',
    goal: '用我的旅行日记整理个人主页',
    threadId: null,
    inputMessageId: null,
    status: 'awaiting_confirmation',
    phase: 'awaiting_confirmation',
    allowedActions: ['confirm', 'reject'],
  });
  list.mockResolvedValue([album, site]);
  const open = jest.fn();
  await act(async () => {
    renderer = TestRenderer.create(inbox({ onOpenTask: open }));
  });
  expect(list).toHaveBeenCalledWith('owner-a', {
    kind: undefined,
    threadId: undefined,
  });
  expect(text()).toContain(album.goal);
  expect(text()).toContain(site.goal);
  expect(text()).toContain('相册管理');
  expect(text()).toContain('建站助手');
  expect(text()).toContain('正在查找素材');
  expect(text()).toContain('等待确认');
  expect(text()).not.toContain('确认应用');
  expect(text()).not.toContain('取消任务');
  act(() =>
    renderer!.root
      .findByProps({ testID: 'ai-task-inbox-site-task' })
      .props.onPress(),
  );
  expect(open).toHaveBeenLastCalledWith(site);
  act(() =>
    renderer!.root
      .findByProps({ testID: 'ai-task-inbox-album-task' })
      .props.onPress(),
  );
  expect(open).toHaveBeenLastCalledWith(album);
  expect(aiTaskApi.decide).not.toHaveBeenCalled();
  await act(async () => renderer!.update(inbox({ onOpenTask: jest.fn() })));
  expect(list).toHaveBeenCalledTimes(1);
});

test('the task inbox includes direct workspaces alongside legacy tasks and opens their canonical IDs', async () => {
  const workspace = agentWorkspace({
    id: 'direct-site',
    goal: '专业会话创建的页面',
    executionMode: 'direct',
    origin: {
      kind: 'agent_conversation',
      threadId: 'site-thread',
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
  });
  list.mockResolvedValue([task()]);
  jest.mocked(agentWorkspaceApi.list).mockResolvedValue([workspace]);
  const open = jest.fn();
  await act(async () => {
    renderer = TestRenderer.create(
      <AIAssistProvider routeKey="inbox" onAskButler={jest.fn()}>
        {inbox({ onOpenWorkspace: open })}
      </AIAssistProvider>,
    );
  });
  expect(text()).toContain(workspace.goal);
  expect(text()).toContain(task().goal);
  expect(renderer!.root.findAllByType(AgentWorkspaceCard)).toHaveLength(1);
  act(() => renderer!.root.findByType(AgentWorkspaceCard).props.onOpen());
  expect(open).toHaveBeenCalledWith(workspace);
  expect(aiTaskApi.decide).not.toHaveBeenCalled();
});

test('shows loading until the real empty response and never creates sample tasks', async () => {
  const response = deferred<AITaskDTO[]>();
  list.mockReturnValueOnce(response.promise);
  await act(async () => {
    renderer = TestRenderer.create(inbox());
  });
  expect(text()).toContain('正在读取任务');
  expect(text()).not.toContain('还没有任务');
  await act(async () => response.resolve([]));
  expect(text()).toContain('还没有任务');
  expect(text()).not.toContain('正在读取任务');
  expect(
    renderer!.root.findAll(node =>
      String(node.props.testID || '').startsWith('ai-task-inbox-'),
    ),
  ).toHaveLength(0);
});

test('shows fetch errors with retry and preserves known task state if a later refresh fails', async () => {
  list.mockRejectedValueOnce(new Error('网络暂时不可用'));
  await act(async () => {
    renderer = TestRenderer.create(inbox());
  });
  expect(text()).toContain('网络暂时不可用');
  expect(text()).not.toContain('还没有任务');
  list.mockResolvedValueOnce([task()]);
  await act(async () => button('重试读取任务').props.onPress());
  expect(text()).toContain('找到我上传的雪山视频');
  expect(text()).not.toContain('网络暂时不可用');
  list.mockRejectedValueOnce(new Error('连接已断开'));
  await act(async () => button('刷新任务').props.onPress());
  expect(text()).toContain('连接已断开');
  expect(text()).toContain('找到我上传的雪山视频');
});

test('displays an interrupted result and an unavailable recalled goal without inventing progress', async () => {
  list.mockResolvedValue([
    task({
      goal: '',
      status: 'interrupted',
      phase: 'interrupted',
      error: { code: 'AI_TASK_INTERRUPTED', message: '任务执行中断' },
      allowedActions: [],
    }),
  ]);
  await act(async () => {
    renderer = TestRenderer.create(inbox());
  });
  expect(text()).toContain('原消息已删除或撤回');
  expect(text()).toContain('任务执行中断');
  expect(text()).toContain('不会自动重试');
  expect(text()).not.toMatch(/\d+%/);
});

test('Xun cards retain actual legacy status, errors, results and canonical opening without deciding', async () => {
  const interrupted = task({
    goal: '',
    status: 'interrupted',
    phase: 'interrupted',
    agentId: 'removed-agent',
    error: { code: 'AI_TASK_INTERRUPTED', message: '连接中断' },
    artifacts: [{ kind: 'message', id: 'partial', title: '已保存的部分成果' }],
    allowedActions: [],
  });
  const awaiting = task({
    id: 'confirm-site',
    kind: 'site_draft',
    status: 'awaiting_confirmation',
    phase: 'awaiting_confirmation',
    allowedActions: ['confirm'],
  });
  const queued = task({ id: 'queued' });
  list.mockResolvedValue([interrupted, awaiting, queued]);
  const open = jest.fn();
  await act(async () => {
    renderer = TestRenderer.create(
      inbox({ palette: xunV3Palette(palettes.light), onOpenTask: open }),
    );
  });
  expect(text()).toContain('原消息已删除或撤回');
  expect(text()).toContain('连接中断');
  expect(text()).toContain('不会自动重试');
  expect(text()).toContain('已保存的部分成果');
  expect(text()).toContain('执行 Agent');
  expect(text()).not.toContain('removed-agent');
  const cards = renderer!.root.findAllByType(XunTaskCard);
  expect(
    cards.find(card => card.props.testID.endsWith('confirm-site'))?.props
      .actionVariant,
  ).toBe('primary');
  expect(
    cards.find(card => card.props.testID.endsWith('queued'))?.props
      .actionVariant,
  ).toBe('secondary');
  const stopPropagation = jest.fn();
  act(() => button('查看并确认').props.onPress({ stopPropagation }));
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith(awaiting);
  expect(aiTaskApi.decide).not.toHaveBeenCalled();
});

test('Xun workspace cards retain active work, attention and real deliveries with their long-press context', async () => {
  const working = agentWorkspace({
    id: 'active-workspace',
    status: 'running',
    steps: [
      workspaceStep({
        id: 'working',
        status: 'running',
        agentId: 'album-manager',
        capability: 'media.search',
        goal: '正在查找雪山视频',
      }),
      workspaceStep({
        id: 'result',
        agentId: 'site-builder',
        capability: 'site.compose',
        result: { kind: 'site_draft', id: 'draft', title: '真实旅行页草稿' },
      }),
    ],
  });
  const waiting = agentWorkspace({
    id: 'waiting-workspace',
    status: 'waiting_input',
    inputRequest: {
      kind: 'clarification',
      question: '希望使用哪一年的旅行素材？',
    },
    allowedActions: ['reply'],
  });
  jest.mocked(agentWorkspaceApi.list).mockResolvedValue([working, waiting]);
  const open = jest.fn();
  await act(async () => {
    renderer = TestRenderer.create(
      <AIAssistProvider routeKey="inbox" onAskButler={jest.fn()}>
        {inbox({
          palette: xunV3Palette(palettes.light),
          onOpenWorkspace: open,
        })}
      </AIAssistProvider>,
    );
  });
  expect(text()).toContain('正在查找雪山视频');
  expect(text()).toContain('真实旅行页草稿');
  expect(text()).toContain('希望使用哪一年的旅行素材？');
  const cards = renderer!.root.findAllByType(XunTaskCard);
  const activeCard = cards.find(
    card => card.props.testID === 'miao-workspace-active-workspace',
  )!;
  expect(activeCard.props.context.object).toMatchObject({
    kind: 'agent-workspace',
    id: working.id,
  });
  expect(activeCard.props.actionVariant).toBe('secondary');
  expect(
    cards.find(card => card.props.testID === 'miao-workspace-waiting-workspace')
      ?.props.actionVariant,
  ).toBe('primary');
  act(() => activeCard.props.onOpen());
  expect(open).toHaveBeenCalledWith(working);
  expect(aiTaskApi.decide).not.toHaveBeenCalled();
});

test('Xun separates attention, ongoing and historical tasks without dropping either task contract or cancelling work', async () => {
  const legacyStatuses: AITaskDTO['status'][] = [
    'queued',
    'running',
    'awaiting_confirmation',
    'succeeded',
    'failed',
    'cancelled',
    'interrupted',
  ];
  const workspaceStatuses: WorkspaceStatus[] = [
    ...legacyStatuses,
    'waiting_input',
    'cancelling',
  ];
  list.mockResolvedValue(
    legacyStatuses.map(status => task({ id: `legacy-${status}`, status })),
  );
  jest
    .mocked(agentWorkspaceApi.list)
    .mockResolvedValue(
      workspaceStatuses.map(status =>
        agentWorkspace({ id: `workspace-${status}`, status }),
      ),
    );
  await act(async () => {
    renderer = TestRenderer.create(
      <AIAssistProvider routeKey="inbox" onAskButler={jest.fn()}>
        {inbox({
          palette: xunV3Palette(palettes.light),
          onOpenWorkspace: jest.fn(),
        })}
      </AIAssistProvider>,
    );
  });
  const sections = renderer!.root.findByType(SectionList).props.sections;
  expect(sections.map((section: { title: string }) => section.title)).toEqual([
    '待你确认',
    '正在跟进',
    '历史任务',
  ]);
  expect(
    sections.map((section: { data: { task: { id: string } }[] }) =>
      section.data.map(entry => entry.task.id).sort(),
    ),
  ).toEqual([
    [
      'legacy-awaiting_confirmation',
      'workspace-awaiting_confirmation',
      'workspace-waiting_input',
    ],
    [
      'legacy-queued',
      'legacy-running',
      'workspace-cancelling',
      'workspace-queued',
      'workspace-running',
    ],
    [
      'legacy-cancelled',
      'legacy-failed',
      'legacy-interrupted',
      'legacy-succeeded',
      'workspace-cancelled',
      'workspace-failed',
      'workspace-interrupted',
      'workspace-succeeded',
    ],
  ]);
  expect(aiTaskApi.decide).not.toHaveBeenCalled();
});

test('Xun orders by recent activity within each group and moves refreshed tasks without leaving empty headings', async () => {
  const older = task({
    id: 'older',
    status: 'awaiting_confirmation',
    updatedAt: '2026-10-10T03:00:00Z',
  });
  const updated = task({
    id: 'updated',
    status: 'awaiting_confirmation',
    createdAt: '2026-10-09T03:00:00Z',
    updatedAt: '2026-10-12T03:00:00Z',
  });
  list.mockResolvedValueOnce([older, updated]);
  await act(async () => {
    renderer = TestRenderer.create(
      inbox({ palette: xunV3Palette(palettes.light) }),
    );
  });
  let sections = renderer!.root.findByType(SectionList).props.sections;
  expect(sections.map((section: { key: string }) => section.key)).toEqual([
    'attention',
  ]);
  expect(
    sections[0].data.map((entry: { task: AITaskDTO }) => entry.task.id),
  ).toEqual(['updated', 'older']);
  list.mockResolvedValueOnce([
    { ...older, status: 'succeeded', revision: 2 },
    { ...updated, status: 'succeeded', revision: 2 },
  ]);
  await act(async () => button('刷新任务').props.onPress());
  sections = renderer!.root.findByType(SectionList).props.sections;
  expect(sections.map((section: { key: string }) => section.key)).toEqual([
    'history',
  ]);
  expect(text()).not.toContain('待你确认');
  expect(text()).not.toContain('正在跟进');
  expect(text()).toContain('历史任务');
  expect(aiTaskApi.decide).not.toHaveBeenCalled();
});

test('all-kind and filtered scopes discard stale requests and expose accurate loading state', async () => {
  const all = deferred<AITaskDTO[]>();
  const filtered = deferred<AITaskDTO[]>();
  list.mockReturnValueOnce(all.promise).mockReturnValueOnce(filtered.promise);
  await act(async () => {
    renderer = TestRenderer.create(<Harness />);
  });
  expect(controller.loading).toBe(true);
  expect(controller.hasLoaded).toBe(false);
  await act(async () => renderer!.update(<Harness kind="site_draft" />));
  await act(async () => all.resolve([task()]));
  expect(controller.tasks).toEqual([]);
  expect(controller.loading).toBe(true);
  await act(async () =>
    filtered.resolve([task({ id: 'site', kind: 'site_draft' })]),
  );
  expect(controller.tasks.map(value => value.id)).toEqual(['site']);
  expect(controller.loading).toBe(false);
  expect(controller.hasLoaded).toBe(true);
  const next = deferred<AITaskDTO[]>();
  list.mockReturnValueOnce(next.promise);
  await act(async () => renderer!.update(<Harness token="owner-b" />));
  expect(controller.tasks).toEqual([]);
  expect(controller.hasLoaded).toBe(false);
  await act(async () => next.resolve([]));
  expect(controller.hasLoaded).toBe(true);
});

test('the inbox pauses polling offscreen and in background and does not read signed-out data', async () => {
  const listeners: Array<(state: AppStateStatus) => void> = [];
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    });
  await act(async () => {
    renderer = TestRenderer.create(inbox());
  });
  await act(async () => renderer!.update(inbox({ active: false })));
  await act(async () => jest.advanceTimersByTime(9000));
  expect(list).toHaveBeenCalledTimes(1);
  await act(async () => renderer!.update(inbox()));
  await act(async () => listeners.forEach(listener => listener('background')));
  const paused = list.mock.calls.length;
  await act(async () => jest.advanceTimersByTime(9000));
  expect(list).toHaveBeenCalledTimes(paused);
  await act(async () => renderer!.update(inbox({ token: '' })));
  expect(text()).toContain('登录后查看任务');
  expect(list).toHaveBeenCalledTimes(paused);
});
