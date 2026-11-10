import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState, Text } from 'react-native';
import { WorkspaceContributionCard } from '../src/features/messages/WorkspaceContributionCard';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';
import { palettes } from '../src/shared/theme';
import { agentWorkspaceApi } from '../src/services/api/agentWorkspaceApi';
import { WorkspaceButton, WorkspaceState } from '../src/shared/workspaceUi';

jest.mock('../src/services/api/agentWorkspaceApi', () => ({
  agentWorkspaceApi: { text: jest.fn(), get: jest.fn() },
}));

test('shows the real workspace node contribution without creating a chat message', () => {
  const workspace = agentWorkspace({
    goal: '整理一组旅行照片',
    status: 'running',
    steps: [
      workspaceStep({
        agentId: 'album-manager',
        goal: '筛选适合发布的照片',
        status: 'succeeded',
        summary: '已筛出 8 张候选照片。',
        result: {
          kind: 'media_selection',
          title: '旅行照片候选',
          assets: [],
          retrievalRunIds: [],
        },
      }),
    ],
  });
  let tree: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <WorkspaceContributionCard
        contribution={{ workspace, step: workspace.steps[0] }}
        agents={[
          {
            key: 'album-manager',
            name: '相册管理 Agent',
            version: '0.3.2',
            category: 'media-management',
            identity: {
              avatarKind: 'agent-mark',
              mark: '相',
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
        ]}
        token="owner-token"
        palette={palettes.light}
        language="zh"
      />,
    );
  });
  const content = tree!.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .join(' ');
  expect(content).toContain('筛选适合发布的照片');
  expect(content).toContain('已筛出 8 张候选照片。');
  expect(content).toContain('旅行照片候选');
});

const nodeId = '12a41286-e950-42a7-b482-1d1c56414e89';
const selectedWorkspace = () =>
  agentWorkspace({
    id: '45267cd7-549c-4f8f-8576-49d061cc335a',
    steps: [
      workspaceStep({
        id: nodeId,
        agentId: 'comic-diary',
        status: 'succeeded',
        result: { kind: 'text_result', id: nodeId, title: '成果' },
      }),
    ],
  });
test('a contribution verifies the latest task before selecting its node or returning to its source', async () => {
  AppState.currentState = 'active';
  const workspace = selectedWorkspace();
  jest.mocked(agentWorkspaceApi.get).mockResolvedValue(workspace);
  jest
    .mocked(agentWorkspaceApi.text)
    .mockResolvedValue({ id: nodeId, title: '成果', content: '正文' });
  const onDiscuss = jest.fn(),
    onOpenWorkspace = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <WorkspaceContributionCard
        contribution={{ workspace, step: workspace.steps[0] }}
        agents={[]}
        agentId="comic-diary"
        token="owner"
        palette={palettes.light}
        language="zh"
        onDiscuss={onDiscuss}
        onOpenWorkspace={onOpenWorkspace}
      />,
    );
  });
  const press = (label: string) =>
    tree.root
      .findAllByType(WorkspaceButton)
      .find(item => item.props.label === label)!
      .props.onPress();
  await act(async () => {
    await press('就此继续聊');
  });
  expect(onDiscuss).toHaveBeenCalledWith({
    id: workspace.id,
    revision: workspace.revision,
    currentRound: 1,
    nodeId,
    goal: workspace.goal,
  });
  await act(async () => {
    await press('查看原任务');
  });
  expect(onOpenWorkspace).toHaveBeenCalledWith(workspace);
  await act(async () => tree.unmount());
});

test('revoked or advanced-round contributions cannot become a discussion selection', async () => {
  const workspace = selectedWorkspace(),
    onDiscuss = jest.fn();
  jest
    .mocked(agentWorkspaceApi.get)
    .mockResolvedValue({ ...workspace, currentRound: 2 });
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <WorkspaceContributionCard
        contribution={{ workspace, step: workspace.steps[0] }}
        agents={[]}
        agentId="comic-diary"
        token="owner"
        palette={palettes.light}
        language="zh"
        onDiscuss={onDiscuss}
      />,
    );
  });
  await act(async () => {
    await tree.root
      .findAllByType(WorkspaceButton)
      .find(item => item.props.label === '就此继续聊')!
      .props.onPress();
  });
  expect(onDiscuss).not.toHaveBeenCalled();
  expect(tree.root.findByType(WorkspaceState).props.title).toContain(
    '重新选择',
  );
  await act(async () => tree.unmount());
});

test('reads the real text body for a participating Agent in its chat', async () => {
  const text = agentWorkspace({
    status: 'succeeded',
    steps: [
      workspaceStep({
        agentId: 'file-preprocessor',
        status: 'succeeded',
        goal: '整理旅行计划文字',
        summary: '已完成文字整理。',
        result: { kind: 'text_result', id: 'node-text', title: '旅行计划摘要' },
      }),
    ],
    result: { kind: 'text_result', id: 'node-text', title: '旅行计划摘要' },
  });
  (agentWorkspaceApi.text as jest.Mock).mockResolvedValueOnce({
    id: 'node-text',
    title: '旅行计划摘要',
    content: '真实 Agent 贡献正文，来自受保护的协作成果接口。',
  });
  let tree: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <WorkspaceContributionCard
        contribution={{ workspace: text, step: text.steps[0] }}
        agents={[]}
        token="owner-token"
        palette={palettes.light}
        language="zh"
      />,
    );
  });
  await act(async () => Promise.resolve());
  expect(agentWorkspaceApi.text).toHaveBeenCalledWith(
    'owner-token',
    text.id,
    'node-text',
  );
  const content = tree!.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .join(' ');
  expect(content).toContain('真实 Agent 贡献正文');
  const beforeRead = jest.mocked(agentWorkspaceApi.text).mock.calls.length;
  await act(async () => {
    tree!.update(
      <WorkspaceContributionCard
        contribution={{
          workspace: { ...text, revision: text.revision + 1 },
          step: text.steps[0],
        }}
        agents={[]}
        token="owner-token"
        palette={palettes.light}
        language="zh"
      />,
    );
  });
  expect(jest.mocked(agentWorkspaceApi.text).mock.calls).toHaveLength(
    beforeRead,
  );
  expect(
    tree!.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .flat(Infinity)
      .join(' '),
  ).toContain('真实 Agent 贡献正文');
});
