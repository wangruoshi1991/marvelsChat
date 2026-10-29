import React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { AIRequestComposer } from '../src/features/ai/AIRequestComposer';
import { persistentAssistReference } from '../src/features/ai/assistContext';
import {
  assistContextSummary,
  buildAssistMessage,
} from '../src/features/assist/assistRequest';
import { AIAssistObjectReference } from '../src/features/assist/aiAssistTypes';
import { WorkspaceButton } from '../src/shared/workspaceUi';
import { palettes } from '../src/shared/theme';
import { workspaceAssistContext } from '../src/features/assist/workspaceAssistContext';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';

test('workspace context includes only persisted participants and is independent from later mutations', () => {
  const workspace = agentWorkspace({
    steps: [
      workspaceStep(),
      workspaceStep({ id: 'node-2', key: 'coordinate-again' }),
      workspaceStep({
        id: 'node-3',
        key: 'retired-executor',
        agentId: 'retired-agent',
      }),
    ],
  });
  const agents = [
    {
      key: 'miaoxun-butler',
      name: '妙管家',
      version: '1',
      category: 'orchestrator',
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
      name: '没有参与的建站助手',
      version: '1',
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
      status: 'registered',
    },
  ];
  const object = workspaceAssistContext(workspace, agents, 'zh');
  workspace.status = 'cancelled';
  workspace.revision += 1;
  workspace.steps[0].agentId = 'changed-later';
  agents[0].name = 'Changed later';
  expect(object.scene!.workspace!.participants).toEqual([
    { agentId: 'miaoxun-butler', name: '妙管家' },
    { agentId: 'retired-agent', name: 'retired-agent' },
  ]);
  expect(buildAssistMessage('分析', object.scene, object, 'zh')).toBe('分析');
  const content = assistContextSummary(object.scene, object, 'zh');
  expect(content).toContain('选中时协作中');
  expect(content).toContain('参与者：妙管家、其他参与者');
  expect(content).not.toMatch(
    /miaoxun-butler|retired-agent|记录版本|所在模块|发起位置/,
  );
  expect(content).not.toContain('没有参与的建站助手');
  expect(content).not.toContain('Changed later');
  expect(content).not.toContain('changed-later');
  expect(persistentAssistReference(object)).toBeNull();
});

test('a workspace keeps its full display summary without copying that snapshot into the discussion body', () => {
  const goal = '旅'.repeat(1990);
  const object = workspaceAssistContext(agentWorkspace({ goal }), [], 'zh');
  const message = buildAssistMessage(
    '分析这个协作任务',
    object.scene,
    object,
    'zh',
  );
  const onContinue = jest.fn(() => true);
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AIRequestComposer
        palette={palettes.light}
        language="zh"
        draft="分析这个协作任务"
        context={object}
        scene={object.scene}
        onChangeDraft={jest.fn()}
        onClose={jest.fn()}
        onContinue={onContinue}
      />,
    );
  });
  expect(message).toBe('分析这个协作任务');
  expect(
    renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .flat()
      .join(' '),
  ).toContain(goal);
  expect(assistContextSummary(object.scene, object, 'zh')).toContain(
    '参与者：',
  );
  expect(
    renderer.root
      .findAllByType(WorkspaceButton)
      .find(node => node.props.label === '交给妙管家')!.props.disabled,
  ).toBe(false);
  expect(onContinue).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('task cards reference only the actual input message, never an unsupported task reference', () => {
  const object: AIAssistObjectReference = {
    kind: 'ai-task',
    id: 'task-1',
    title: '找照片',
    scene: {
      page: 'miao.feed',
      label: '妙',
      task: {
        id: 'task-1',
        goal: '找照片',
        status: 'running',
        phase: 'searching',
        agentId: 'album-manager',
        revision: 2,
        inputMessageId: 'message-1',
      },
    },
  };
  expect(persistentAssistReference(object)).toEqual({
    kind: 'chat-message',
    id: 'message-1',
    title: '找照片',
  });
  object.scene!.task!.inputMessageId = null;
  expect(persistentAssistReference(object)).toBeNull();
  object.scene!.task!.inputMessageId = 'local-unsent';
  expect(persistentAssistReference(object)).toBeNull();
});

test('restarted goals retain oversized followups for editing and cannot be sent until shortened', async () => {
  const draft =
    '原始目标'.repeat(400) + '\n已补充要求\n' + '补充说明'.repeat(200);
  const onContinue = jest.fn(() => true);
  let renderer!: TestRenderer.ReactTestRenderer;
  const render = (value: string) => (
    <AIRequestComposer
      palette={palettes.light}
      language="zh"
      draft={value}
      scene={{ page: 'miao.workspace', label: '妙 · 协作详情' }}
      onChangeDraft={jest.fn()}
      onClose={jest.fn()}
      onContinue={onContinue}
    />
  );
  act(() => {
    renderer = TestRenderer.create(render(draft));
  });
  const input = () => renderer.root.findByType(TextInput);
  const submit = () =>
    renderer.root
      .findAllByType(WorkspaceButton)
      .find(node => node.props.label === '交给妙管家')!;
  expect(input().props.value).toBe(draft);
  expect(input().props.maxLength).toBeUndefined();
  expect(input().props.editable).toBe(true);
  expect(submit().props.disabled).toBe(true);
  expect(onContinue).not.toHaveBeenCalled();
  act(() => renderer.update(render('保留全部要点后的精简目标')));
  expect(submit().props.disabled).toBe(false);
  await act(async () => submit().props.onPress());
  expect(onContinue).toHaveBeenCalledWith(
    expect.stringContaining('保留全部要点后的精简目标'),
  );
  act(() => renderer.unmount());
});

test('request length includes all selected context and never silently truncates it', () => {
  const object: AIAssistObjectReference = {
    kind: 'chat-draft',
    id: 'thread',
    title: '草稿',
    metadata: { content: '长'.repeat(1990) },
    scene: { page: 'messages.chat', label: '讯 · 对话' },
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AIRequestComposer
        palette={palettes.light}
        language="zh"
        draft="整理这段内容"
        context={object}
        scene={object.scene}
        onChangeDraft={jest.fn()}
        onClose={jest.fn()}
        onContinue={jest.fn(() => true)}
      />,
    );
  });
  const button = renderer.root
    .findAllByType(WorkspaceButton)
    .find(node => node.props.label === '交给妙管家')!;
  expect(button.props.disabled).toBe(true);
  expect(
    renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .join(''),
  ).toContain('请精简或移除选中内容');
  expect(buildAssistMessage('整理', object.scene, object, 'zh')).toContain(
    '长'.repeat(1990),
  );
  act(() => renderer.unmount());
});

test('authenticated references do not use local metadata as the resource body', () => {
  const object: AIAssistObjectReference = {
    kind: 'station-album',
    id: 'album-1',
    title: '旅行',
    metadata: { content: 'Forged resource body' },
    scene: { page: 'second-floor.albums', label: '相册' },
  };
  const content = buildAssistMessage('分析', object.scene, object, 'zh');
  expect(content).toBe('分析');
  expect(persistentAssistReference(object)?.title).toBe('旅行');
  expect(content).not.toContain('Forged resource body');
});

test('long display titles fit the API without truncating the visible goal or splitting emoji', () => {
  const title = '旅'.repeat(158) + '🌊'.repeat(20);
  const object: AIAssistObjectReference = {
    kind: 'station-album',
    id: 'album-1',
    title,
    scene: { page: 'second-floor.albums', label: '相册' },
  };
  const reference = persistentAssistReference(object)!;
  expect(reference.title!.length).toBeLessThanOrEqual(160);
  expect(reference.title).toBe('旅'.repeat(158) + '…');
  expect(buildAssistMessage('整理', object.scene, object, 'zh')).toBe('整理');
  const task: AIAssistObjectReference = {
    ...object,
    kind: 'ai-task',
    scene: {
      page: 'miao.feed',
      label: '妙',
      task: {
        id: 'task-1',
        goal: title,
        status: 'queued',
        phase: 'queued',
        agentId: 'album-manager',
        revision: 1,
        inputMessageId: 'message-1',
      },
    },
  };
  expect(persistentAssistReference(task)?.title).toBe(reference.title);
});
