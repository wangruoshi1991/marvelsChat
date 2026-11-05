import React from 'react';
import { FlatList, StyleSheet, Text } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { ThreadListScreen } from '../src/features/messages/ThreadListScreen';
import { NoticeList } from '../src/features/messages/NoticeList';
import { AITaskInbox } from '../src/features/ai/AITaskInbox';
import { defaultUIPreferences } from '../src/features/ui/uiPreferences';
import { palettes } from '../src/shared/theme';

jest.mock('../src/features/assist/AIAssistProvider', () => ({
  useAIAssist: () => ({ isActive: false }),
}));
jest.mock('../src/features/ai/AITaskInbox', () => ({
  AITaskInbox: () => null,
}));
jest.mock('../src/features/messages/NoticeList', () => ({
  NoticeList: () => null,
}));
let tree: Renderer.ReactTestRenderer;
const props = {
  palette: palettes.light,
  language: 'zh' as const,
  threads: [],
  agents: [],
  notices: [],
  unreadNoticeCount: 0,
  selectedMessageTab: 'chat' as const,
  renderUserAvatar: () => null,
  onOpenThread: jest.fn(),
  onOpenMessageActions: jest.fn(),
  onOpenSearch: jest.fn(),
  onSelectMessageTab: jest.fn(),
  onMarkNotificationRead: jest.fn(),
  onAcceptFriendRequest: jest.fn(),
  onRejectFriendRequest: jest.fn(),
};
afterEach(() => {
  if (tree) act(() => tree.unmount());
});

test.each(['chat', 'tasks'] as const)(
  'hiding %s content does not replace it with notifications',
  tab => {
    const prefs = defaultUIPreferences();
    prefs.hiddenModules.messages = [
      tab === 'chat' ? 'threadList' : 'taskInbox',
    ];
    act(() => {
      tree = Renderer.create(
        <ThreadListScreen
          {...props}
          selectedMessageTab={tab}
          uiPreferences={prefs}
        />,
      );
    });
    expect(tree.root.findAllByType(NoticeList)).toHaveLength(0);
    expect(tree.root.findAllByType(AITaskInbox)).toHaveLength(0);
    expect(tree.root.findAllByType(FlatList)).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ testID: 'messages-module-hidden' }).length,
    ).toBeGreaterThan(0);
  },
);

test('the second-floor accessibility entry uses the confirmed label', () => {
  const prefs = defaultUIPreferences();
  prefs.components.messages = {
    'xun.threadList.openSecondFloor': { label: '进入个人空间' },
    'xun.threadList.newThread': { label: '新增入口' },
  };
  act(() => {
    tree = Renderer.create(
      <ThreadListScreen
        {...props}
        uiPreferences={prefs}
        onOpenSecondFloor={jest.fn()}
      />,
    );
  });
  const button = tree.root.findAll(
    item =>
      item.props.accessibilityRole === 'button' &&
      item.props.accessibilityLabel === '新增入口',
  )[0];
  expect(button.props.accessibilityActions[0].label).toBe('进入个人空间');
});

test('shrinking the new-thread control preserves a 44 point touch target and scales the icon', () => {
  const prefs = defaultUIPreferences();
  prefs.surfaces.messages.buttonScale = 0.8;
  prefs.components.messages = {
    'xun.threadList.newThread': {
      sizeScale: 0.8,
      icon: '+',
      label: '新增入口',
    },
  };
  act(() => {
    tree = Renderer.create(
      <ThreadListScreen {...props} uiPreferences={prefs} />,
    );
  });
  const button = tree.root.findAll(
    item =>
      item.props.accessibilityRole === 'button' &&
      item.props.accessibilityLabel === '新增入口',
  )[0];
  const style = StyleSheet.flatten(button.props.style);
  expect(style.minWidth).toBeGreaterThanOrEqual(44);
  expect(style.minHeight).toBeGreaterThanOrEqual(44);
  expect(style.transform).toBeUndefined();
  const icon = button
    .findAllByType(Text)
    .find(item => item.props.children === '+')!;
  expect(StyleSheet.flatten(icon.props.style).fontSize).toBeLessThan(17);
});

test('required tabs remain accessible even in historical hidden state', () => {
  const prefs = defaultUIPreferences();
  prefs.hiddenModules.messages = ['tabs'];
  act(() => {
    tree = Renderer.create(
      <ThreadListScreen {...props} uiPreferences={prefs} />,
    );
  });
  expect(
    tree.root.findAll(item => item.props.accessibilityRole === 'tab').length,
  ).toBeGreaterThanOrEqual(2);
});

test('disabling the entrance gesture keeps an ordinary clickable second-floor control even with new-thread hidden', () => {
  const prefs = defaultUIPreferences();
  prefs.gestures['messages.pullToSecondFloor']!.enabled = false;
  prefs.components.messages = {
    'xun.threadList.newThread': { visible: false },
    'xun.threadList.openSecondFloor': { label: '个人空间' },
  };
  const open = jest.fn();
  act(() => {
    tree = Renderer.create(
      <ThreadListScreen
        {...props}
        uiPreferences={prefs}
        onOpenSecondFloor={open}
      />,
    );
  });
  const button = tree.root.findAll(
    item =>
      item.props.accessibilityRole === 'button' &&
      item.props.accessibilityLabel === '个人空间',
  )[0];
  expect(button).toBeDefined();
  act(() => button.props.onPress());
  expect(open).toHaveBeenCalledTimes(1);
});
