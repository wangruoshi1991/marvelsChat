jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));
jest.mock('../src/services/api/agentWorkspaceApi', () => ({
  agentWorkspaceApi: {
    get: jest.fn(),
    decide: jest.fn(),
    media: jest.fn(),
    text: jest.fn(),
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
import { AgentWorkspace } from '../src/models/agentWorkspace';
const api = jest.mocked(agentWorkspaceApi);
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
  workspace: agentWorkspace(),
  agents: [
    {
      key: 'album-manager',
      name: '相册管理 Agent',
      version: '0.3.2',
      category: 'media-management',
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
const mount = async (workspace: AgentWorkspace) => {
  api.get.mockResolvedValue(workspace);
  await act(async () => {
    tree = TestRenderer.create(
      <AgentWorkspaceScreen {...props} workspace={workspace} />,
    );
  });
};
const button = (id: string) =>
  tree.root.findAllByType(WorkspaceButton).find(b => b.props.testID === id)!;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
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
