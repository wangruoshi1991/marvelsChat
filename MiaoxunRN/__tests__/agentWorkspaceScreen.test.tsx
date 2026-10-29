import { fileWorkspaceUnavailable } from '../__fixtures__/fileWorkspaceUnavailable';
import { assertAgentWorkspace } from '../src/models/agentWorkspace';
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));
jest.mock('../src/services/api/agentWorkspaceApi', () => ({
  agentWorkspaceApi: {
    get: jest.fn(),
    decide: jest.fn(),
    media: jest.fn(),
    text: jest.fn(),
    recoverContinuation: jest.fn(),
  },
}));
jest.mock('../src/services/workspaceContinuationStore', () => ({
  workspaceContinuationStore: {
    read: jest.fn(),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));
jest.mock('../src/features/site-document/SiteDocumentPreview', () => ({
  SiteDocumentPreview: () => null,
}));
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  AppState,
  AppStateStatus,
  Image,
  Linking,
  Text,
  TextInput,
} from 'react-native';
import { AgentWorkspaceScreen } from '../src/features/workspaces/AgentWorkspaceScreen';
import { SiteDocumentPreview } from '../src/features/site-document/SiteDocumentPreview';
import { StationMediaPreviewScreen } from '../src/features/station/StationMediaPreviewScreen';
import { ChatMessageText } from '../src/features/messages/ChatMessageText';
import { MiaoTaskAgent } from '../src/features/miao/MiaoTaskAgent';
import { WorkspaceButton } from '../src/shared/workspaceUi';
import { palettes } from '../src/shared/theme';
import { agentWorkspaceApi } from '../src/services/api/agentWorkspaceApi';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';
import {
  AgentWorkspace,
  WorkspaceContinuationAttempt,
} from '../src/models/agentWorkspace';
import { workspaceContinuationStore } from '../src/services/workspaceContinuationStore';
import { MiaoxunApiError } from '../src/services/api/http';
const api = jest.mocked(agentWorkspaceApi);
const pendingStore = jest.mocked(workspaceContinuationStore);
const savedAttempts = new Map<string, WorkspaceContinuationAttempt>();
const attemptScope = (userId: string, workspaceId: string) =>
  `${userId}:${workspaceId}`;
let tree: TestRenderer.ReactTestRenderer;
let state: (value: AppStateStatus) => void;
const awaiting = () =>
  agentWorkspace({
    status: 'awaiting_confirmation',
    allowedActions: ['confirm', 'reject'],
    result: { kind: 'site_draft', id: 'draft', title: '页面' },
    approval: {
      id: 'approval',
      draftId: 'draft',
      draftHash: 'a'.repeat(64),
      resourcesHash: 'b'.repeat(64),
      profileHash: 'c'.repeat(64),
      expiresAt: '2026-10-13T00:00:00Z',
    },
  });
const props = {
  token: 'token',
  userId: 'owner',
  workspace: agentWorkspace(),
  agents: [
    {
      key: 'album-manager',
      name: '相册管理 Agent',
      version: '0.3.2',
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
      status: 'active',
    },
    {
      key: 'site-builder',
      name: '建站 Agent',
      version: '0.3.3',
      category: 'station-builder',
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
      status: 'active',
    },
  ],
  palette: palettes.light,
  language: 'zh' as const,
  onClose: jest.fn(),
  onManageAgents: jest.fn(),
  onNewTask: jest.fn(),
};
const mount = async (
  workspace: AgentWorkspace,
  extra: Partial<React.ComponentProps<typeof AgentWorkspaceScreen>> = {},
) => {
  api.get.mockResolvedValue(workspace);
  await act(async () => {
    tree = TestRenderer.create(
      <AgentWorkspaceScreen {...props} workspace={workspace} {...extra} />,
    );
  });
};
const button = (id: string) =>
  tree.root.findAllByType(WorkspaceButton).find(b => b.props.testID === id)!;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  api.recoverContinuation.mockReset();
  savedAttempts.clear();
  pendingStore.read.mockImplementation(
    async (userId, workspaceId) =>
      savedAttempts.get(attemptScope(userId, workspaceId)) || null,
  );
  pendingStore.save.mockImplementation(async (userId, value) => {
    savedAttempts.set(attemptScope(userId, value.workspaceId), value);
  });
  pendingStore.clear.mockImplementation(async (userId, workspaceId, key) => {
    const scope = attemptScope(userId, workspaceId);
    if (savedAttempts.get(scope)?.idempotencyKey === key)
      savedAttempts.delete(scope);
  });
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      state = listener;
      return { remove: jest.fn() };
    });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  jest.useRealTimers();
  jest.restoreAllMocks();
});
test('direct album selection shows its real origin and limitation without offering unsupported continuation', async () => {
  const selection = {
    kind: 'media_selection' as const,
    title: '旅行选材',
    assets: [],
    retrievalRunIds: [],
  };
  const workspace = agentWorkspace({
    executionMode: 'direct',
    status: 'succeeded',
    allowedActions: [],
    result: selection,
    origin: {
      kind: 'agent_conversation',
      threadId: 'album-thread',
      inputMessageId: 'input',
      agentId: 'album-manager',
      agentVersion: '1',
      capability: 'media.select',
    },
    steps: [
      workspaceStep({
        agentId: 'album-manager',
        agentVersion: '1',
        capability: 'media.select',
        result: selection,
      }),
    ],
  });
  const open = jest.fn();
  await mount(workspace, { onOpenSource: open });
  expect(button('workspace-continue')).toBeUndefined();
  const content = tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .join(' ');
  expect(content).toContain('来自专业 Agent 会话');
  expect(content).toContain('继续修改选材尚未接入');
  expect(button('workspace-new-task').props.disabled).toBe(false);
  await act(async () => button('workspace-new-task').props.onPress());
  expect(props.onNewTask).toHaveBeenCalledWith(workspace);
  await act(async () => button('workspace-open-source').props.onPress());
  expect(open).toHaveBeenCalledWith(workspace);
  expect(api.decide).not.toHaveBeenCalled();
});
test.each(['queued', 'running', 'failed'] as const)(
  'a direct album task without a result in %s state does not claim a selection exists',
  async status => {
    const workspace = agentWorkspace({
      executionMode: 'direct',
      status,
      allowedActions: status === 'failed' ? [] : ['cancel'],
      result: null,
      origin: {
        kind: 'agent_conversation',
        threadId: 'album-thread',
        inputMessageId: 'input',
        agentId: 'album-manager',
        agentVersion: '1',
        capability: 'media.select',
      },
      steps: [
        workspaceStep({
          agentId: 'album-manager',
          agentVersion: '1',
          capability: 'media.select',
          status,
          result: null,
        }),
      ],
    });
    await mount(workspace);
    const content = tree.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .flat(Infinity)
      .join(' ');
    expect(content).toContain('继续修改选材尚未接入');
    expect(content).not.toContain('保留了真实选材结果');
    expect(button('workspace-continue')).toBeUndefined();
    if (status === 'failed') {
      expect(button('workspace-new-task').props.disabled).toBe(false);
      await act(async () => button('workspace-new-task').props.onPress());
      expect(props.onNewTask).toHaveBeenCalledWith(workspace);
    } else {
      expect(button('workspace-new-task')).toBeUndefined();
      expect(props.onNewTask).not.toHaveBeenCalled();
    }
    expect(api.decide).not.toHaveBeenCalled();
  },
);
test('confirmation requires complete matching preview and invalidates on background', async () => {
  await mount(awaiting());
  expect(button('workspace-confirm').props.disabled).toBe(true);
  const previewButton = tree.root
    .findAllByType(WorkspaceButton)
    .find(b => b.props.label === '打开完整页面预览')!;
  await act(async () => previewButton.props.onPress());
  const preview = tree.root.findByType(SiteDocumentPreview);
  expect(preview.props.expected).toEqual({
    documentHash: 'a'.repeat(64),
    resourcesHash: 'b'.repeat(64),
  });
  await act(async () => preview.props.onReviewed());
  expect(button('workspace-confirm').props.disabled).toBe(false);
  await act(async () => preview.props.onInvalidated());
  expect(button('workspace-confirm').props.disabled).toBe(true);
  await act(async () => preview.props.onReviewed());
  await act(async () => state('background'));
  expect(button('workspace-confirm').props.disabled).toBe(true);
});
test('confirmation passes reviewed current workspace, no call before review', async () => {
  const w = awaiting();
  await mount(w);
  await act(async () => button('workspace-confirm').props.onPress());
  expect(api.decide).not.toHaveBeenCalled();
  await act(async () =>
    tree.root
      .findAllByType(WorkspaceButton)
      .find(b => b.props.label === '打开完整页面预览')!
      .props.onPress(),
  );
  await act(async () =>
    tree.root.findByType(SiteDocumentPreview).props.onReviewed(),
  );
  api.decide.mockResolvedValue(
    agentWorkspace({ status: 'succeeded', revision: 4, allowedActions: [] }),
  );
  await act(async () => button('workspace-confirm').props.onPress());
  expect(api.decide).toHaveBeenCalledWith('token', w, 'confirm', undefined);
});
test('a changed revision invalidates a previously reviewed proposal', async () => {
  await mount(awaiting());
  await act(async () =>
    tree.root
      .findAllByType(WorkspaceButton)
      .find(b => b.props.label === '打开完整页面预览')!
      .props.onPress(),
  );
  await act(async () =>
    tree.root.findByType(SiteDocumentPreview).props.onReviewed(),
  );
  api.get.mockResolvedValue(awaiting());
  api.get.mockResolvedValueOnce({ ...awaiting(), revision: 4 });
  await act(async () => {
    jest.advanceTimersByTime(3000);
  });
  expect(button('workspace-confirm').props.disabled).toBe(true);
});
test('clarification is explicit user input, not a generated answer', async () => {
  const w = agentWorkspace({
    status: 'waiting_input',
    question: '选择哪个相册？',
    inputRequest: { kind: 'clarification', question: '选择哪个相册？' },
    allowedActions: ['reply', 'cancel'],
  });
  await mount(w);
  expect(button('workspace-reply').props.disabled).toBe(true);
  await act(async () =>
    tree.root.findByType(TextInput).props.onChangeText('使用已选旅行相册'),
  );
  api.decide.mockResolvedValue(agentWorkspace({ revision: 4 }));
  await act(async () => button('workspace-reply').props.onPress());
  expect(api.decide).toHaveBeenCalledWith(
    'token',
    w,
    'reply',
    '使用已选旅行相册',
  );
});
test('current clarification appears once without repeating coordinator narration', async () => {
  const question = '选择哪个相册？';
  await mount(
    agentWorkspace({
      status: 'waiting_input',
      question,
      inputRequest: { kind: 'clarification', question },
      allowedActions: ['reply', 'cancel'],
      steps: [workspaceStep({ summary: question })],
    }),
  );
  const texts = tree.root.findAllByType(Text).map(node => node.props.children);
  expect(texts.filter(value => value === question)).toHaveLength(1);
  expect(texts.indexOf(question)).toBeLessThan(texts.indexOf('协作进展'));
  expect(texts).not.toContain('已提出补充问题，见当前待办。');
  expect(
    tree.root
      .findAllByType(WorkspaceButton)
      .some(item => item.props.label === '刷新协作进展'),
  ).toBe(true);
});

test('coordinator implementation node is hidden and final artifact is shown once', async () => {
  const artifact = {
    kind: 'site_draft' as const,
    id: 'draft',
    title: '页面草稿',
  };
  await mount(
    agentWorkspace({
      steps: [
        workspaceStep({ summary: '内部协调说明，不重复展示。' }),
        workspaceStep({
          id: 'album-node',
          key: 'album',
          agentId: 'album-manager',
          capability: 'media.select',
          result: {
            kind: 'media_selection',
            title: '素材选择',
            assets: [],
            retrievalRunIds: [],
          },
        }),
        workspaceStep({
          id: 'site-node',
          key: 'site',
          agentId: 'site-builder',
          capability: 'site.compose',
          dependencies: ['album'],
          result: artifact,
        }),
      ],
      result: artifact,
    }),
  );
  const texts = tree.root.findAllByType(Text).map(node => node.props.children);
  expect(texts).not.toContain('内部协调说明，不重复展示。');
  expect(texts.filter(value => value === '页面草稿')).toHaveLength(1);
  expect(JSON.stringify(texts)).toContain('相册管理 Agent');
});
test('two text Agents show their handoff and readable final result without a page-save flow', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const firstResult = {
    kind: 'text_result' as const,
    id: 'read-material',
    title: '资料里的安排',
  };
  const result = {
    kind: 'text_result' as const,
    id: 'write-story',
    title: '周末的故事',
  };
  const textAgents = ['file-preprocessor', 'comic-diary'].map((key, index) => ({
    ...props.agents[0],
    key,
    name: index === 0 ? '资料助手' : '漫画日记',
    category: index === 0 ? 'file-preprocessing' : 'comic-diary',
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
  }));
  const w = agentWorkspace({
    goal: '根据安排资料写一个周末故事',
    status: 'succeeded',
    contextRefs: [],
    allowedActions: [],
    summary: '周末故事已整理好。',
    steps: [
      workspaceStep(),
      workspaceStep({
        id: 'read-material',
        key: 'read',
        agentId: 'file-preprocessor',
        capability: 'text.summarize',
        goal: '整理安排资料中需要注意的内容',
        summary: '已整理开放时间与入场要求。',
        result: firstResult,
      }),
      workspaceStep({
        id: 'write-story',
        key: 'story',
        agentId: 'comic-diary',
        capability: 'comic.storyboard',
        goal: '用已整理的安排写一个周末故事',
        summary: '已完成故事。',
        dependencies: ['read'],
        result,
      }),
    ],
    result,
  });
  const bodies = [
    '展览开放到下午六点。\n\n- 提前准备入场码\n- 周日闭馆',
    '## 上午\n先去看展，留一点时间慢慢逛。\n\n午后到河边走走。\n\n- 带好**入场码**\n- 回家再整理照片\n\n![参考图](https://model.invalid/image.png)\n<video src="https://model.invalid/video.mp4"></video>\n[参观资料](http://model.invalid/visit)\n[本机文件](file:///private/data)',
  ];
  api.text.mockImplementation(async (_token, _workspace, id) => ({
    id,
    title: id === firstResult.id ? firstResult.title : result.title,
    content: id === firstResult.id ? bodies[0] : bodies[1],
  }));
  api.get.mockResolvedValue(w);
  await act(async () => {
    tree = TestRenderer.create(
      <AgentWorkspaceScreen {...props} agents={textAgents} workspace={w} />,
    );
  });
  expect(
    tree.root.findAllByType(MiaoTaskAgent).map(node => node.props.agentId),
  ).toEqual(['file-preprocessor', 'comic-diary']);
  const renderedResults = tree.root.findAllByType(ChatMessageText);
  expect(renderedResults.map(node => node.props.children)).toEqual(bodies);
  expect(api.text).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(w)).not.toContain(bodies[0]);
  expect(JSON.stringify(w)).not.toContain(bodies[1]);
  expect(renderedResults.every(node => node.props.formatted)).toBe(true);
  const text = tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .map(value =>
      Array.isArray(value)
        ? value.filter(child => typeof child === 'string').join('')
        : value,
    );
  expect(text.filter(value => value === result.title)).toHaveLength(1);
  expect(text).toContain('上午');
  expect(text).toContain('入场码');
  expect(JSON.stringify(text)).toContain('接收');
  expect(JSON.stringify(text)).toContain('交付给');
  expect(JSON.stringify(text)).toContain('资料助手');
  expect(JSON.stringify(text)).toContain('漫画日记');
  for (const internal of [
    'text_result',
    'text.summarize',
    'comic.storyboard',
    'file-preprocessor',
    'comic-diary',
    'sourceReferences',
  ])
    expect(JSON.stringify(text)).not.toContain(internal);
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  expect(tree.root.findAllByType(SiteDocumentPreview)).toHaveLength(0);
  expect(button('workspace-confirm')).toBeUndefined();
  expect(
    tree.root.findAllByType(WorkspaceButton).map(node => node.props.label),
  ).toEqual(['刷新协作进展']);
  const textNodes = tree.root.findAllByType(Text);
  const links = textNodes.filter(
    node => node.props.accessibilityRole === 'link',
  );
  const visibleText = textNodes
    .map(node => node.props.children)
    .flat(Infinity)
    .filter(value => typeof value === 'string')
    .join(' ');
  expect(links.map(node => node.props.accessibilityHint)).toEqual([
    'https://model.invalid/image.png',
    'http://model.invalid/visit',
  ]);
  expect(
    textNodes
      .filter(node => node.props.accessibilityRole !== 'link')
      .every(node => !node.props.onPress),
  ).toBe(true);
  expect(visibleText).toContain(
    '<video src="https://model.invalid/video.mp4"></video>',
  );
  expect(visibleText).toContain('本机文件');
  expect(open).not.toHaveBeenCalled();
  const stopPropagation = jest.fn();
  await act(async () => links[1].props.onPress({ stopPropagation }));
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith('http://model.invalid/visit');
  expect(
    tree.root
      .findAllByType(Image)
      .some(node =>
        JSON.stringify(node.props.source).includes('model.invalid'),
      ),
  ).toBe(false);
  expect(api.decide).not.toHaveBeenCalled();
  expect(api.media).not.toHaveBeenCalled();
  api.get.mockResolvedValue({ ...w, revision: w.revision + 1 });
  await act(async () => {
    jest.advanceTimersByTime(3000);
  });
  expect(api.text).toHaveBeenCalledTimes(2);
  await act(async () =>
    tree.root
      .findAllByType(WorkspaceButton)
      .find(node => node.props.label === '刷新协作进展')!
      .props.onPress(),
  );
  expect(api.text).toHaveBeenCalledTimes(4);
});
test.each(['manage_agents_then_restart', 'restart'] as const)(
  'access action %s never accepts a text reply or starts a task implicitly',
  async nextAction => {
    const reason =
      nextAction === 'restart' ? 'new_task_required' : 'authorization_required';
    const question = '当前任务不会扩大权限。';
    const w = agentWorkspace({
      status: 'waiting_input',
      question,
      inputRequest: {
        kind: 'agent_access',
        question,
        reason,
        nextAction,
        requirements: [
          {
            agentId: 'site-builder',
            agentName: '建站 Agent',
            capability: 'site.compose',
            requiredScopes: ['album:read'],
            reason,
          },
        ],
      },
      allowedActions: ['cancel'],
      followups: ['只选横图'],
    });
    await mount(w);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(button('workspace-reply')).toBeUndefined();
    if (nextAction === 'manage_agents_then_restart') {
      act(() => button('workspace-manage-access').props.onPress());
      expect(props.onManageAgents).toHaveBeenCalledTimes(1);
    } else expect(button('workspace-manage-access')).toBeUndefined();
    act(() => button('workspace-new-task').props.onPress());
    expect(props.onNewTask).toHaveBeenCalledWith(w);
    expect(api.decide).not.toHaveBeenCalled();
  },
);
test('media result loads an authorized real image preview then rechecks before opening media', async () => {
  const result = {
    kind: 'media_selection' as const,
    title: '素材',
    assets: [
      {
        id: 'asset',
        version: '1',
        kind: 'image' as const,
        matchedFrameTimestampMs: null,
      },
    ],
    retrievalRunIds: ['run'],
  };
  api.media.mockResolvedValue({
    id: 'asset',
    kind: 'image',
    status: 'uploaded',
    caption: '湖边',
    originalFilename: 'lake.jpg',
  } as never);
  await mount(
    agentWorkspace({
      steps: [
        workspaceStep({
          agentId: 'album-manager',
          capability: 'media.select',
          result,
        }),
      ],
    }),
  );
  expect(api.media).toHaveBeenCalledWith('token', 'workspace-1', 'asset');
  const image = tree.root.findByProps({ testID: 'workspace-media-asset' });
  expect(image.props.accessibilityRole).toBe('button');
  expect(
    tree.root.findAllByType(Text).map(node => node.props.children),
  ).toContain('湖边');
  await act(async () => image.props.onPress());
  expect(api.media).toHaveBeenCalledTimes(2);
  expect(
    tree.root.findByType(StationMediaPreviewScreen).props.timestampMs,
  ).toBeNull();
});

test('media permission failure remains visible and can be retried', async () => {
  const result = {
    kind: 'media_selection' as const,
    title: '素材',
    assets: [
      {
        id: 'asset',
        version: '1',
        kind: 'image' as const,
        matchedFrameTimestampMs: null,
      },
    ],
    retrievalRunIds: ['run'],
  };
  api.media
    .mockRejectedValueOnce(new Error('相册 Agent 授权已撤回。'))
    .mockResolvedValueOnce({
      id: 'asset',
      kind: 'image',
      status: 'uploaded',
      caption: '湖边',
    } as never);
  await mount(
    agentWorkspace({
      steps: [
        workspaceStep({
          agentId: 'album-manager',
          capability: 'media.select',
          result,
        }),
      ],
    }),
  );
  expect(
    tree.root.findAllByType(Text).map(node => node.props.children),
  ).toContain('相册 Agent 授权已撤回。');
  const retry = tree.root
    .findAllByType(WorkspaceButton)
    .find(item => item.props.label === '重新读取素材')!;
  await act(async () => retry.props.onPress());
  expect(api.media).toHaveBeenCalledTimes(2);
  expect(
    tree.root.findByProps({ testID: 'workspace-media-asset' }).props
      .accessibilityLabel,
  ).toContain('湖边');
});

test('failed Agent nodes never present residual media as a delivered result', async () => {
  const result = {
    kind: 'media_selection' as const,
    title: '素材',
    assets: [
      {
        id: 'asset',
        version: '1',
        kind: 'image' as const,
        matchedFrameTimestampMs: null,
      },
    ],
    retrievalRunIds: ['run'],
  };
  await mount(
    agentWorkspace({
      steps: [
        workspaceStep({
          agentId: 'album-manager',
          capability: 'media.select',
          status: 'failed',
          result,
        }),
      ],
    }),
  );
  expect(api.media).not.toHaveBeenCalled();
  expect(
    tree.root.findAllByProps({ testID: 'workspace-media-asset' }),
  ).toHaveLength(0);
});

const completed = () =>
  agentWorkspace({
    status: 'succeeded',
    allowedActions: ['continue'],
    result: { kind: 'site_draft', id: 'original-draft', title: '第一版页面' },
  });
const nextRound = (
  previous: AgentWorkspace,
  changes: Partial<AgentWorkspace> = {},
) => {
  const result = {
    kind: 'site_draft' as const,
    id: 'revised-draft',
    title: '修订页面',
  };
  const revisionStep = workspaceStep({
    id: 'revision-node',
    key: 'revision',
    round: 2,
    agentId: 'site-builder',
    capability: 'site.compose',
    result,
  });
  return agentWorkspace({
    ...previous,
    revision: previous.revision + 1,
    currentRound: 2,
    status: 'succeeded',
    steps: [...previous.steps, revisionStep],
    result,
    rounds: [
      previous.rounds[0],
      {
        ...previous.rounds[0],
        number: 2,
        instruction: '精简开头',
        baseResultNodeId: previous.rounds[0].resultNodeId,
        resultNodeId: revisionStep.id,
        result,
      },
    ],
    ...changes,
  });
};
const continuationInput = () =>
  tree.root.findByProps({ testID: 'workspace-continue-input' });
const beginContinuation = async (text = '精简开头') => {
  await act(async () => button('workspace-continue').props.onPress());
  await act(async () => continuationInput().props.onChangeText(text));
};

const linkedWorkspace = () => ({
  ...completed(),
  id: '45267cd7-549c-4f8f-8576-49d061cc335a',
});
const linkedDraft = (workspace: AgentWorkspace) => ({
  id: workspace.id,
  revision: workspace.revision,
  currentRound: workspace.currentRound,
  text: '管家讨论后准备的修改原文',
  draftId: 'navigation-only-draft',
});

test('an incoming discussion draft stays editable and never saves or executes before explicit submission', async () => {
  const workspace = linkedWorkspace();
  const incoming = linkedDraft(workspace);
  const consumed = jest.fn();
  await mount(workspace, {
    initialContinuationDraft: incoming,
    onContinuationDraftConsumed: consumed,
  });
  expect(consumed).toHaveBeenCalledTimes(1);
  expect(continuationInput().props.value).toBe(incoming.text);
  expect(api.decide).not.toHaveBeenCalled();
  expect(pendingStore.save).not.toHaveBeenCalled();
  await act(async () =>
    continuationInput().props.onChangeText('用户修改后的准确要求'),
  );
  expect(api.decide).not.toHaveBeenCalled();
  api.decide.mockResolvedValue(nextRound(workspace));
  await act(async () => button('workspace-continue-submit').props.onPress());
  expect(api.decide).toHaveBeenCalledWith(
    'token',
    workspace,
    'continue',
    '用户修改后的准确要求',
    expect.any(String),
  );
  expect(pendingStore.save).toHaveBeenCalledTimes(1);
});

test('a stale incoming discussion draft requires explicit current-result review and later polling blocks it again', async () => {
  const workspace = linkedWorkspace();
  await mount(workspace, {
    initialContinuationDraft: {
      ...linkedDraft(workspace),
      revision: workspace.revision - 1,
    },
  });
  expect(continuationInput().props.value).toBe(linkedDraft(workspace).text);
  expect(button('workspace-continue-submit').props.disabled).toBe(true);
  await act(async () => button('workspace-continue-submit').props.onPress());
  expect(api.decide).not.toHaveBeenCalled();
  await act(async () =>
    button('workspace-continue-accept-current').props.onPress(),
  );
  expect(button('workspace-continue-submit').props.disabled).toBe(false);
  expect(pendingStore.save).not.toHaveBeenCalled();
  api.get.mockResolvedValue({ ...workspace, revision: workspace.revision + 1 });
  await act(async () => jest.advanceTimersByTime(3000));
  expect(button('workspace-continue-submit').props.disabled).toBe(true);
  expect(api.decide).not.toHaveBeenCalled();
});

test('a pending stored attempt wins over an incoming discussion draft and a definite rejection preserves the original text until explicit replacement', async () => {
  const workspace = linkedWorkspace();
  const pending: WorkspaceContinuationAttempt = {
    workspaceId: workspace.id,
    revision: workspace.revision,
    currentRound: workspace.currentRound,
    text: '原来已经发出的修改内容',
    idempotencyKey: 'original-pending-key',
  };
  savedAttempts.set(attemptScope('owner', workspace.id), pending);
  const consumed = jest.fn();
  await mount(workspace, {
    initialContinuationDraft: linkedDraft(workspace),
    onContinuationDraftConsumed: consumed,
  });
  expect(consumed).not.toHaveBeenCalled();
  expect(button('workspace-continue-submit')).toBeUndefined();
  expect(pendingStore.save).not.toHaveBeenCalled();
  expect(api.recoverContinuation).not.toHaveBeenCalled();
  api.recoverContinuation.mockRejectedValue(
    new MiaoxunApiError('来源已变化', {
      status: 409,
      code: 'WORKSPACE_SOURCES_CHANGED',
    }),
  );
  await act(async () => button('workspace-continue-recover').props.onPress());
  expect(api.recoverContinuation).toHaveBeenCalledWith('token', pending);
  expect(continuationInput().props.value).toBe(pending.text);
  expect(consumed).not.toHaveBeenCalled();
  await act(async () =>
    button('workspace-continue-load-incoming').props.onPress(),
  );
  expect(continuationInput().props.value).toBe(linkedDraft(workspace).text);
  expect(consumed).toHaveBeenCalledTimes(1);
  expect(api.decide).not.toHaveBeenCalled();
  expect(pendingStore.save).not.toHaveBeenCalled();
});

test.each(['wrong-task', 'storage-failure'] as const)(
  '%s cannot load an incoming discussion draft for execution',
  async failure => {
    const workspace = linkedWorkspace();
    if (failure === 'storage-failure')
      pendingStore.read.mockRejectedValueOnce(new Error('无法读取安全存储'));
    const consumed = jest.fn();
    await mount(workspace, {
      initialContinuationDraft: {
        ...linkedDraft(workspace),
        ...(failure === 'wrong-task'
          ? { id: 'c4bc737f-19b9-43a2-a8a9-b7cd47777e07' }
          : {}),
      },
      onContinuationDraftConsumed: consumed,
    });
    expect(consumed).not.toHaveBeenCalled();
    expect(button('workspace-continue-submit')).toBeUndefined();
    expect(api.decide).not.toHaveBeenCalled();
    expect(pendingStore.save).not.toHaveBeenCalled();
  },
);

test('completed results continue only after an explicit instruction and keep the same workspace history', async () => {
  const w = completed();
  await mount(w);
  await act(async () => button('workspace-continue').props.onPress());
  expect(button('workspace-continue-submit').props.disabled).toBe(true);
  expect(api.decide).not.toHaveBeenCalled();
  await act(async () => continuationInput().props.onChangeText('  精简开头  '));
  api.decide.mockResolvedValue(nextRound(w));
  await act(async () => button('workspace-continue-submit').props.onPress());
  expect(api.decide).toHaveBeenCalledTimes(1);
  expect(api.decide).toHaveBeenCalledWith(
    'token',
    w,
    'continue',
    '精简开头',
    expect.any(String),
  );
  expect(api.decide.mock.calls[0][4]!.length).toBeGreaterThanOrEqual(8);
  expect(
    tree.root.findAllByProps({ testID: 'workspace-continue-input' }),
  ).toHaveLength(0);
  expect(button('workspace-history-round-1')).toBeDefined();
  expect(
    tree.root.findByProps({ testID: 'workspace-current-instruction' }).props
      .children,
  ).toBe('精简开头');
  expect(api.get.mock.calls.every(call => call[1] === w.id)).toBe(true);
});

test('an uncertain continuation replays the original request after polling advances and cannot submit the stale draft again', async () => {
  const w = completed();
  await mount(w);
  await beginContinuation();
  const later = nextRound(w);
  api.get.mockResolvedValue(later);
  api.decide.mockRejectedValueOnce(new Error('请求超时，尚未确认结果。'));
  await act(async () => button('workspace-continue-submit').props.onPress());
  const firstKey = api.decide.mock.calls[0][4];
  expect(button('workspace-continue-submit')).toBeUndefined();
  expect(
    tree.root.findAllByProps({ testID: 'workspace-continue-input' }),
  ).toHaveLength(0);
  expect(button('workspace-continue-recover')).toBeDefined();
  expect(api.decide).toHaveBeenCalledTimes(1);
  api.recoverContinuation.mockResolvedValue(later);
  await act(async () => button('workspace-continue-recover').props.onPress());
  expect(api.recoverContinuation.mock.calls[0]).toEqual([
    'token',
    {
      workspaceId: w.id,
      revision: w.revision,
      currentRound: w.currentRound,
      text: '精简开头',
      idempotencyKey: firstKey,
    },
  ]);
  expect(button('workspace-continue-recover')).toBeUndefined();
  await act(async () => button('workspace-continue').props.onPress());
  expect(continuationInput().props.value).toBe('');
});

test('recovery keeps the original key through repeated server failures and a subsequent permission failure', async () => {
  const w = completed();
  await mount(w);
  await beginContinuation();
  api.decide.mockRejectedValueOnce(
    new MiaoxunApiError('服务器暂不可用', { status: 503 }),
  );
  await act(async () => button('workspace-continue-submit').props.onPress());
  api.recoverContinuation.mockRejectedValueOnce(
    new MiaoxunApiError('授权已撤回', {
      status: 403,
      code: 'WORKSPACE_ACCESS_REVOKED',
    }),
  );
  await act(async () => button('workspace-continue-recover').props.onPress());
  expect(api.recoverContinuation.mock.calls[0][1]).toEqual({
    workspaceId: w.id,
    revision: w.revision,
    currentRound: w.currentRound,
    text: '精简开头',
    idempotencyKey: api.decide.mock.calls[0][4],
  });
  expect(button('workspace-continue-submit')).toBeUndefined();
  expect(button('workspace-continue-recover')).toBeDefined();
  expect(button('workspace-continue-manage-access')).toBeDefined();
  await act(async () =>
    button('workspace-continue-manage-access').props.onPress(),
  );
  expect(props.onManageAgents).toHaveBeenCalledTimes(1);
  expect(savedAttempts.size).toBe(1);
});

test('a revision conflict refreshes without automatically resubmitting or losing the instructions', async () => {
  const w = linkedWorkspace();
  await mount(w);
  await beginContinuation();
  api.get.mockResolvedValue({ ...w, revision: w.revision + 2 });
  api.decide.mockRejectedValue(
    new MiaoxunApiError('任务已更新，请刷新后重试。', {
      status: 409,
      code: 'WORKSPACE_REVISION_CONFLICT',
    }),
  );
  await act(async () => button('workspace-continue-submit').props.onPress());
  expect(api.decide).toHaveBeenCalledTimes(1);
  expect(continuationInput().props.value).toBe('精简开头');
  expect(
    tree.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .join(' '),
  ).toContain('任务已更新');
  expect(button('workspace-continue-submit').props.disabled).toBe(true);
  await act(async () => button('workspace-continue-submit').props.onPress());
  expect(api.decide).toHaveBeenCalledTimes(1);
  await act(async () =>
    button('workspace-continue-accept-current').props.onPress(),
  );
  await act(async () => button('workspace-continue-submit').props.onPress());
  expect(api.decide.mock.calls[1][1].revision).toBe(w.revision + 2);
  expect(api.decide.mock.calls[1][4]).not.toBe(api.decide.mock.calls[0][4]);
});

test('a recovered rejected continuation keeps its original base after leaving and reopening until explicit review', async () => {
  const w = linkedWorkspace();
  const incoming = linkedDraft(w);
  await mount(w, { initialContinuationDraft: incoming });
  api.decide.mockRejectedValueOnce(new Error('响应丢失'));
  await act(async () => button('workspace-continue-submit').props.onPress());
  const original = savedAttempts.get(attemptScope('owner', w.id))!;
  await act(async () => tree.unmount());
  const current = nextRound(w);
  await mount(current);
  api.recoverContinuation.mockRejectedValueOnce(
    new MiaoxunApiError('任务已更新', {
      status: 409,
      code: 'WORKSPACE_REVISION_CONFLICT',
    }),
  );
  await act(async () => button('workspace-continue-recover').props.onPress());
  expect(api.recoverContinuation).toHaveBeenCalledWith('token', original);
  expect(continuationInput().props.value).toBe(incoming.text);
  expect(button('workspace-continue-submit').props.disabled).toBe(true);
  await act(async () => jest.advanceTimersByTime(3000));
  await act(async () => button('workspace-continue-submit').props.onPress());
  expect(api.decide).toHaveBeenCalledTimes(1);
  await act(async () =>
    button('workspace-continue-accept-current').props.onPress(),
  );
  expect(button('workspace-continue-submit').props.disabled).toBe(false);
  expect(api.decide).toHaveBeenCalledTimes(1);
  api.decide.mockResolvedValue(current);
  await act(async () => button('workspace-continue-submit').props.onPress());
  expect(api.decide.mock.calls[1][1]).toEqual(current);
  expect(api.decide.mock.calls[1][4]).not.toBe(original.idempotencyKey);
});

test('continuation is disabled in background and duplicate taps cannot submit a second decision', async () => {
  await mount(completed());
  await beginContinuation();
  await act(async () => state('background'));
  expect(button('workspace-continue-submit').props.disabled).toBe(true);
  await act(async () => button('workspace-continue-submit').props.onPress());
  expect(api.decide).not.toHaveBeenCalled();
  await act(async () => state('active'));
  let reject!: (issue: Error) => void;
  api.decide.mockImplementation(
    () =>
      new Promise((_resolve, failed) => {
        reject = failed;
      }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = button('workspace-continue-submit').props.onPress();
  });
  expect(button('workspace-continue-submit')).toBeUndefined();
  expect(button('workspace-continue-recover').props.disabled).toBe(true);
  await act(async () => button('workspace-continue-recover').props.onPress());
  expect(api.decide).toHaveBeenCalledTimes(1);
  await act(async () => {
    reject(new Error('离线'));
    await pending;
  });
});

test('a historical page preview never unlocks confirmation of the current round', async () => {
  const previous = completed();
  const awaitingCurrent = awaiting();
  const w = nextRound(previous, {
    status: 'awaiting_confirmation',
    allowedActions: ['confirm', 'reject', 'continue'],
    approval: { ...awaitingCurrent.approval!, draftId: 'revised-draft' },
  });
  await mount(w);
  await act(async () => button('workspace-history-round-1').props.onPress());
  const previewButtons = tree.root
    .findAllByType(WorkspaceButton)
    .filter(node => node.props.label === '打开完整页面预览');
  expect(previewButtons).toHaveLength(2);
  await act(async () => previewButtons[1].props.onPress());
  const historical = tree.root.findByType(SiteDocumentPreview);
  expect(historical.props.draftId).toBe('original-draft');
  expect(historical.props.expected).toBeUndefined();
  await act(async () => historical.props.onReviewed());
  expect(button('workspace-confirm').props.disabled).toBe(true);
  await act(async () => historical.props.onClose());
  await act(async () => previewButtons[0].props.onPress());
  const current = tree.root.findByType(SiteDocumentPreview);
  expect(current.props.draftId).toBe('revised-draft');
  expect(current.props.expected).toEqual({
    documentHash: w.approval!.draftHash,
    resourcesHash: w.approval!.resourcesHash,
  });
  await act(async () => current.props.onReviewed());
  expect(button('workspace-confirm').props.disabled).toBe(false);
});

test('reopening a workspace reads retained historical text by its original node only when requested', async () => {
  const result = {
    kind: 'text_result' as const,
    id: 'historical-text',
    title: '原始安排',
  };
  const previous = agentWorkspace({
    status: 'succeeded',
    result,
    allowedActions: ['continue'],
    steps: [
      workspaceStep({ id: result.id, result, capability: 'text.summarize' }),
    ],
  });
  const w = nextRound(previous);
  api.text.mockResolvedValue({
    id: result.id,
    title: result.title,
    content: '保留的原始安排正文。',
  });
  await mount(w);
  expect(api.text).not.toHaveBeenCalled();
  await act(async () => button('workspace-history-round-1').props.onPress());
  expect(api.text).toHaveBeenCalledWith('token', w.id, result.id);
  expect(tree.root.findByType(ChatMessageText).props.children).toBe(
    '保留的原始安排正文。',
  );
  await act(async () => tree.unmount());
  api.text.mockClear();
  await mount(w);
  expect(api.text).not.toHaveBeenCalled();
  await act(async () => button('workspace-history-round-1').props.onPress());
  expect(tree.root.findByType(ChatMessageText).props.children).toBe(
    '保留的原始安排正文。',
  );
  expect(api.decide).not.toHaveBeenCalled();
});

test('a successful receipt arriving in background clears its own draft and never opens a new task', async () => {
  const w = completed();
  await mount(w);
  await beginContinuation();
  let resolve!: (workspace: AgentWorkspace) => void;
  api.decide.mockImplementation(
    () =>
      new Promise(accepted => {
        resolve = accepted;
      }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = button('workspace-continue-submit').props.onPress();
  });
  await act(async () => state('background'));
  const later = nextRound(w);
  api.get.mockResolvedValue(later);
  await act(async () => {
    resolve(later);
    await pending;
  });
  await act(async () => state('active'));
  expect(button('workspace-continue-recover')).toBeUndefined();
  expect(api.decide).toHaveBeenCalledTimes(1);
  await act(async () => button('workspace-continue').props.onPress());
  expect(continuationInput().props.value).toBe('');
});

test('a pending continuation survives closing and reopening without automatic execution or a new key', async () => {
  const w = completed();
  await mount(w);
  await beginContinuation();
  api.decide.mockRejectedValue(new Error('响应丢失'));
  await act(async () => button('workspace-continue-submit').props.onPress());
  const original = savedAttempts.get(attemptScope('owner', w.id))!;
  expect(original.idempotencyKey).toBe(api.decide.mock.calls[0][4]);
  await act(async () => tree.unmount());
  await mount(nextRound(w));
  expect(button('workspace-continue-submit')).toBeUndefined();
  expect(button('workspace-continue-recover')).toBeDefined();
  expect(api.decide).toHaveBeenCalledTimes(1);
  expect(api.recoverContinuation).not.toHaveBeenCalled();
  api.recoverContinuation.mockResolvedValue(nextRound(w));
  await act(async () => button('workspace-continue-recover').props.onPress());
  expect(api.recoverContinuation).toHaveBeenCalledWith('token', original);
  expect(savedAttempts.size).toBe(0);
});

test('failure to persist a continuation blocks dispatch and retains the editable instructions after storage is rechecked', async () => {
  await mount(completed());
  await beginContinuation();
  pendingStore.save.mockRejectedValueOnce(new Error('安全存储不可用'));
  await act(async () => button('workspace-continue-submit').props.onPress());
  expect(api.decide).not.toHaveBeenCalled();
  expect(api.recoverContinuation).not.toHaveBeenCalled();
  expect(button('workspace-continue-submit')).toBeUndefined();
  await act(async () =>
    button('workspace-continue-storage-retry').props.onPress(),
  );
  expect(continuationInput().props.value).toBe('精简开头');
  expect(api.decide).not.toHaveBeenCalled();
});

test('unreadable pending records block new continuations until explicitly re-read', async () => {
  pendingStore.read.mockRejectedValueOnce(new Error('修改记录损坏'));
  await mount(completed());
  expect(button('workspace-continue')).toBeUndefined();
  expect(button('workspace-continue-storage-retry')).toBeDefined();
  expect(api.decide).not.toHaveBeenCalled();
  await act(async () =>
    button('workspace-continue-storage-retry').props.onPress(),
  );
  expect(button('workspace-continue')).toBeDefined();
});

test('accepted requests stay locked until local cleanup succeeds and cleanup retry does not execute again', async () => {
  const w = completed();
  await mount(w);
  await beginContinuation();
  api.decide.mockResolvedValue(nextRound(w));
  pendingStore.clear.mockRejectedValueOnce(new Error('钥匙串暂不可写'));
  await act(async () => button('workspace-continue-submit').props.onPress());
  expect(button('workspace-continue')).toBeUndefined();
  expect(button('workspace-continue-recover')).toBeDefined();
  expect(savedAttempts.size).toBe(1);
  await act(async () => button('workspace-continue-recover').props.onPress());
  expect(api.decide).toHaveBeenCalledTimes(1);
  expect(api.recoverContinuation).not.toHaveBeenCalled();
  expect(savedAttempts.size).toBe(0);
  expect(button('workspace-continue-recover')).toBeUndefined();
});

test('a definite conflict cannot unlock another submission while deleting its pending record fails', async () => {
  const w = completed();
  await mount(w);
  await beginContinuation();
  api.decide.mockRejectedValue(
    new MiaoxunApiError('任务已更新', {
      status: 409,
      code: 'WORKSPACE_REVISION_CONFLICT',
    }),
  );
  pendingStore.clear.mockRejectedValueOnce(new Error('无法清理记录'));
  api.get.mockResolvedValue({ ...w, revision: w.revision + 1 });
  await act(async () => button('workspace-continue-submit').props.onPress());
  expect(button('workspace-continue-submit')).toBeUndefined();
  expect(button('workspace-continue-recover')).toBeDefined();
  await act(async () => button('workspace-continue-recover').props.onPress());
  expect(api.decide).toHaveBeenCalledTimes(1);
  expect(api.recoverContinuation).not.toHaveBeenCalled();
  expect(continuationInput().props.value).toBe('精简开头');
});

test('a different signed-in owner never restores another owner pending continuation', async () => {
  const w = completed();
  await mount(w);
  await beginContinuation();
  api.decide.mockRejectedValue(new Error('网络断开'));
  await act(async () => button('workspace-continue-submit').props.onPress());
  await act(async () => tree.unmount());
  await act(async () => {
    tree = TestRenderer.create(
      <AgentWorkspaceScreen
        {...props}
        token="other-token"
        userId="other-owner"
        workspace={w}
      />,
    );
  });
  expect(pendingStore.read).toHaveBeenLastCalledWith('other-owner', w.id);
  expect(button('workspace-continue-recover')).toBeUndefined();
  expect(button('workspace-continue')).toBeDefined();
  expect(api.recoverContinuation).not.toHaveBeenCalled();
  expect(savedAttempts.size).toBe(1);
});

test('a source-changed rejection clears only its pending request and unlocks the preserved instructions for editing', async () => {
  const w = completed();
  await mount(w);
  await beginContinuation();
  api.decide.mockRejectedValue(
    new MiaoxunApiError('交付资源已变化', {
      status: 409,
      code: 'WORKSPACE_SOURCES_CHANGED',
    }),
  );
  await act(async () => button('workspace-continue-submit').props.onPress());
  expect(savedAttempts.size).toBe(0);
  expect(pendingStore.clear).toHaveBeenCalledWith(
    'owner',
    w.id,
    api.decide.mock.calls[0][4],
  );
  expect(button('workspace-continue-recover')).toBeUndefined();
  expect(continuationInput().props.value).toBe('精简开头');
  await act(async () => continuationInput().props.onChangeText('调整新的要求'));
  expect(continuationInput().props.value).toBe('调整新的要求');
  expect(button('workspace-continue-submit').props.disabled).toBe(false);
  expect(
    tree.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .join(' '),
  ).toContain('本次修改未执行');
});

test('unavailable file sources show an explicit warning and retain history without a continuation action', async () => {
  const summary = '文件已删除、变化或授权不可用，历史成果正文不可读取。';
  const w = agentWorkspace({
    status: 'succeeded',
    summary,
    allowedActions: [],
    readAccess: {
      state: 'unavailable',
      code: 'WORKSPACE_FILE_SOURCE_UNAVAILABLE',
    },
    contextRefs: [{ kind: 'station-file', id: 'file-1', version: 'v1' }],
    steps: [workspaceStep({ summary })],
  });
  await mount(w);
  const content = tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .join(' ');
  expect(content).toContain('文件内容不可用');
  expect(content).toContain(summary);
  expect(button('workspace-continue')).toBeUndefined();
  expect(button('workspace-continue-submit')).toBeUndefined();
  expect(api.text).not.toHaveBeenCalled();
});

test('actual redacted two-round HTTP task opens with unavailable content and no revision action', async () => {
  const workspace: unknown = fileWorkspaceUnavailable;
  assertAgentWorkspace(workspace);
  await mount(workspace);
  const content = tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .join(' ');
  expect(content).toContain('文件内容不可用');
  expect(content).toContain(workspace.summary);
  expect(button('workspace-continue')).toBeUndefined();
  expect(api.text).not.toHaveBeenCalled();
});
