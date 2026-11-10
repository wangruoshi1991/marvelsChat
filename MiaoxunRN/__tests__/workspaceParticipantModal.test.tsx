import React from 'react';
import { Modal, ScrollView, StyleSheet, Text } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';
import { AIAssistProvider } from '../src/features/assist/AIAssistProvider';
import { AgentWorkspaceCard } from '../src/features/workspaces/AgentWorkspaceCard';
import { palettes } from '../src/shared/theme';

const step = workspaceStep({
  goal: '根据真实需求整理专业建议。'.repeat(70),
  summary: '本 Agent 已完成本轮分析，保留完整贡献内容。'.repeat(70),
});
let renderer: Renderer.ReactTestRenderer;
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
});

const modal = () => renderer.root.findByType(Modal);
const button = (label: string) =>
  renderer.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];

function openParticipant() {
  act(() => button('查看 执行 Agent 详情').props.onPress());
  expect(modal().props.visible).toBe(true);
}

async function renderCard(onOpenParticipant?: jest.Mock) {
  const onOpen = jest.fn();
  await act(async () => {
    renderer = Renderer.create(
      <AIAssistProvider routeKey="miao-modal-test" onAskButler={jest.fn()}>
        <AgentWorkspaceCard
          workspace={agentWorkspace({ steps: [step] })}
          token="local-test"
          active
          agents={[]}
          palette={palettes.light}
          language="zh"
          onOpen={onOpen}
          onOpenParticipant={onOpenParticipant}
          grid={false}
        />
      </AIAssistProvider>,
    );
  });
  act(() =>
    renderer.root
      .findByProps({ testID: 'miao-card-participants-action' })
      .props.onPress({ stopPropagation: jest.fn() }),
  );
  openParticipant();
  return onOpen;
}

test('participant actions and text are not grouped inside a dismiss button', async () => {
  await renderCard(jest.fn());
  const backdrop = button('关闭 Agent 详情');
  const close = button('关闭');
  const chat = button('打开 Agent 对话');
  expect(backdrop).toBeDefined();
  expect(close).toBeDefined();
  expect(chat).toBeDefined();
  expect(
    backdrop.findAll(
      node => node.props.accessibilityLabel === '打开 Agent 对话',
    ),
  ).toHaveLength(0);
  for (const action of [close, chat]) {
    let parent = action.parent;
    while (parent && parent !== modal()) {
      expect(parent.props.onPress).toBeUndefined();
      expect(parent.props.accessible).not.toBe(true);
      parent = parent.parent;
    }
  }
  const closeStyle = StyleSheet.flatten(close.props.style);
  expect(closeStyle.minHeight ?? closeStyle.height).toBeGreaterThanOrEqual(44);
  expect(closeStyle.minWidth ?? closeStyle.width).toBeGreaterThanOrEqual(44);
});

test('long participant goals and summaries have a bounded scroll reader', async () => {
  await renderCard(jest.fn());
  const readers = modal().findAllByType(ScrollView);
  expect(readers).toHaveLength(1);
  const reader = readers[0];
  expect(reader.props.scrollEnabled).not.toBe(false);
  expect(reader.props.directionalLockEnabled).toBe(true);
  const sheetStyle = StyleSheet.flatten(reader.parent!.props.style);
  expect(sheetStyle.maxHeight).toMatch(/^\d+%$/);
  expect(Number.parseFloat(sheetStyle.maxHeight)).toBeLessThan(100);
  for (const content of [step.goal, step.summary]) {
    const text = reader
      .findAllByType(Text)
      .find(node => node.props.children === content);
    expect(text).toBeDefined();
    expect(text!.props.numberOfLines).toBeUndefined();
  }
  const chat = button('打开 Agent 对话');
  expect(reader.findAll(node => node === chat)).toHaveLength(0);
  expect(modal().props.visible).toBe(true);
});

test('backdrop, explicit close, and system back dismiss without opening a chat', async () => {
  const onOpenParticipant = jest.fn();
  const onOpen = await renderCard(onOpenParticipant);
  act(() => button('关闭 Agent 详情').props.onPress());
  expect(modal().props.visible).toBe(false);
  openParticipant();
  act(() => button('关闭').props.onPress());
  expect(modal().props.visible).toBe(false);
  openParticipant();
  act(() => modal().props.onRequestClose());
  expect(modal().props.visible).toBe(false);
  expect(onOpenParticipant).not.toHaveBeenCalled();
  expect(onOpen).not.toHaveBeenCalled();
});

test('opening Agent chat preserves the selected real step and closes the modal', async () => {
  const onOpenParticipant = jest.fn();
  const onOpen = await renderCard(onOpenParticipant);
  act(() => button('打开 Agent 对话').props.onPress());
  expect(onOpenParticipant).toHaveBeenCalledWith(step);
  expect(onOpenParticipant).toHaveBeenCalledTimes(1);
  expect(onOpen).not.toHaveBeenCalled();
  expect(modal().props.visible).toBe(false);
});

test('the collaboration action remains available when no Agent chat handler exists', async () => {
  const onOpen = await renderCard();
  act(() => button('查看协作详情').props.onPress());
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(modal().props.visible).toBe(false);
});
