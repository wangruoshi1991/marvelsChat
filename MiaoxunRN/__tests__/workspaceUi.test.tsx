import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { WorkspaceButton, WorkspaceState } from '../src/shared/workspaceUi';
import { palettes } from '../src/shared/theme';
import { workspacePalette } from '../src/shared/workspacePalette';
import { resolveStationColors } from '../src/features/station/stationTheme';
import { resolveMessagePalette } from '../src/features/messages/messagePalette';
import { BottomBar, Header } from '../src/shared/ui';
import { ArrowLeft, ChevronDown } from 'lucide-react-native';
import { SearchScreen } from '../src/features/search/SearchScreen';
import { VoiceShortcutDock } from '../src/features/agents/VoiceShortcutDock';
import { xunV3Palette } from '../src/shared/xunPalette';
import { v6Palette } from '../src/shared/v6Palette';

let renderer: TestRenderer.ReactTestRenderer;
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
});

test.each(['light', 'dark'] as const)(
  '%s workspace navigation and nested album controls keep neutral action colors',
  appearance => {
    const palette = workspacePalette(palettes[appearance]);
    act(() => {
      renderer = TestRenderer.create(
        <Header palette={palette} title="协作工作空间" onBack={jest.fn()} />,
      );
    });
    expect(renderer.root.findByType(ChevronDown).props.color).toBe(
      palette.text,
    );
    expect(resolveStationColors(palette).accent).toBe(palette.text);
    expect(workspacePalette(palette)).toEqual(palette);
  },
);

test('chat controls use the V15 Xun accent independently from station controls', () => {
  const station = resolveStationColors(palettes.light);
  const chat = resolveMessagePalette(palettes.light);
  act(() => {
    renderer = TestRenderer.create(
      <Header palette={chat} title="对话" onBack={jest.fn()} />,
    );
  });
  expect(renderer.root.findByType(ArrowLeft).props.color).toBe(chat.text);
  expect(chat.mint).toBe('#00c7cb');
  expect(station.accent).toBe('#097363');
});

test('root navigation keeps one V15 layout across Miao, Xun, and Station palettes', () => {
  const paletteVariants = [
    palettes.light,
    v6Palette(palettes.light),
    xunV3Palette(palettes.light),
  ];
  const layouts = paletteVariants.map(palette => {
    if (renderer) act(() => renderer.unmount());
    act(() => {
      renderer = TestRenderer.create(
        <BottomBar
          palette={palette}
          language="zh"
          selectedTab="messages"
          onSelectTab={jest.fn()}
        />,
      );
    });
    const barStyle = StyleSheet.flatten(
      renderer.root.findByType(View).props.style,
    );
    const tabStyles = renderer.root
      .findAll(node => StyleSheet.flatten(node.props.style)?.gap === 3)
      .map(node => StyleSheet.flatten(node.props.style));
    expect(tabStyles.length).toBeGreaterThanOrEqual(3);
    return {
      bar: {
        height: barStyle.height,
        minHeight: barStyle.minHeight,
        paddingHorizontal: barStyle.paddingHorizontal,
      },
      tabs: tabStyles.slice(0, 3).map(style => ({
        gap: style.gap,
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
      })),
    };
  });

  expect(layouts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        bar: { height: 89, minHeight: 89, paddingHorizontal: 0 },
        tabs: [
          { gap: 3, paddingTop: 10, paddingBottom: 20 },
          { gap: 3, paddingTop: 10, paddingBottom: 20 },
          { gap: 3, paddingTop: 10, paddingBottom: 20 },
        ],
      }),
    ]),
  );
  expect(new Set(layouts.map(layout => JSON.stringify(layout))).size).toBe(1);
});

test('the V15 search canvas keeps result groups, query controls, and back navigation', async () => {
  const onBack = jest.fn();
  const onChangeQuery = jest.fn();
  const onComposeAssistant = jest.fn();
  const onOpenAssistant = jest.fn();
  const onOpenTasks = jest.fn();
  const onAssistantExpandedChange = jest.fn();
  await act(async () => {
    renderer = TestRenderer.create(
      <SearchScreen
        palette={resolveMessagePalette(xunV3Palette(palettes.light))}
        language="zh"
        query="出行"
        threads={[]}
        agents={[]}
        friends={[]}
        searchHistory={[]}
        renderUserAvatar={() => null}
        onBack={onBack}
        onChangeQuery={onChangeQuery}
        onOpenThread={jest.fn()}
        onOpenFriend={jest.fn()}
        onSaveSearch={jest.fn(async () => undefined)}
        onClearSearchHistory={jest.fn(async () => undefined)}
        onDeleteSearchHistory={jest.fn(async () => undefined)}
        onError={jest.fn()}
        onComposeAssistant={onComposeAssistant}
        onOpenAssistant={onOpenAssistant}
        onOpenTasks={onOpenTasks}
        onAssistantExpandedChange={onAssistantExpandedChange}
      />,
    );
  });
  const text = renderer.root
    .findAllByType(Text)
    .map(node => node.props.children);
  expect(text).toEqual(expect.arrayContaining(['搜索', 'Agent', '联系人']));
  expect(text).not.toContain('搜索记录');
  const assistantDock = renderer.root.findByType(VoiceShortcutDock);
  expect(assistantDock.props.tone).toBe('xun');
  expect(assistantDock.props.bottomOffset).toBe(153);
  act(() => assistantDock.props.onCompose('整理搜索结果'));
  expect(onComposeAssistant).toHaveBeenCalledWith('整理搜索结果');
  act(() => assistantDock.props.onOpenButler('总结搜索结果'));
  expect(onOpenAssistant).toHaveBeenCalledWith('总结搜索结果');
  act(() => assistantDock.props.onToggleFeed());
  expect(onOpenTasks).toHaveBeenCalledTimes(1);
  act(() => renderer.root.findByType(TextInput).props.onChangeText('周末'));
  expect(onChangeQuery).toHaveBeenLastCalledWith('周末');
  act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: '清空搜索' })
      .props.onPress(),
  );
  expect(onChangeQuery).toHaveBeenLastCalledWith('');
  act(() =>
    renderer.root.findByProps({ accessibilityLabel: '返回' }).props.onPress(),
  );
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('disabled and busy workspace actions block activation and expose their state', () => {
  const onPress = jest.fn();
  const props = {
    palette: palettes.light,
    label: '保存素材',
    onPress,
    accessibilityState: { expanded: true },
  };
  act(() => {
    renderer = TestRenderer.create(<WorkspaceButton {...props} disabled />);
  });
  const action = () =>
    renderer.root.findAll(
      node =>
        node.props.accessibilityRole === 'button' &&
        typeof node.props.onPress === 'function',
    )[0];
  act(() => action().props.onPress());
  expect(onPress).not.toHaveBeenCalled();
  expect(action().props.accessibilityState).toEqual({
    expanded: true,
    disabled: true,
    busy: false,
  });

  act(() => renderer.update(<WorkspaceButton {...props} busy />));
  act(() => action().props.onPress());
  expect(onPress).not.toHaveBeenCalled();
  expect(action().props.accessibilityState).toEqual({
    expanded: true,
    disabled: true,
    busy: true,
  });

  act(() => renderer.update(<WorkspaceButton {...props} />));
  act(() => action().props.onPress());
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(action().props.accessibilityLabel).toBe('保存素材');
});

test('retrying an explicit error preserves its message and blocks another retry while busy', () => {
  const onRetry = jest.fn();
  const props = {
    palette: palettes.dark,
    title: '流水读取失败',
    description: '网络连接中断，已有流水仍然保留。',
    tone: 'error' as const,
    retryLabel: '重新加载流水',
    onRetry,
  };
  act(() => {
    renderer = TestRenderer.create(<WorkspaceState {...props} />);
  });
  const alert = () =>
    renderer.root
      .findAllByType(Text)
      .find(node => node.props.accessibilityRole === 'alert')!;
  expect(alert().props.children).toBe('流水读取失败');
  expect(alert().props.accessibilityLiveRegion).toBe('polite');
  const action = () =>
    renderer.root.findAll(
      node =>
        node.props.accessibilityRole === 'button' &&
        typeof node.props.onPress === 'function',
    )[0];
  expect(action().props.accessibilityLabel).toBe('重新加载流水');
  act(() => action().props.onPress());
  expect(onRetry).toHaveBeenCalledTimes(1);

  act(() => renderer.update(<WorkspaceState {...props} busy />));
  act(() => action().props.onPress());
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(alert().props.children).toBe('流水读取失败');
  expect(alert().props.accessibilityState.busy).toBe(true);
});
