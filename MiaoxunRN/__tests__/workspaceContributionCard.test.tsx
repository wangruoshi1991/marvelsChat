import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { WorkspaceContributionCard } from '../src/features/messages/WorkspaceContributionCard';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';
import { palettes } from '../src/shared/theme';
import { agentWorkspaceApi } from '../src/services/api/agentWorkspaceApi';

jest.mock('../src/services/api/agentWorkspaceApi', () => ({
  agentWorkspaceApi: { text: jest.fn() },
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
});
