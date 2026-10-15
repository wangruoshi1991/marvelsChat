import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { WorkspaceButton, WorkspaceState } from '../src/shared/workspaceUi';
import { palettes } from '../src/shared/theme';
import { workspacePalette } from '../src/shared/workspacePalette';
import { resolveStationColors } from '../src/features/station/stationTheme';
import { resolveMessagePalette } from '../src/features/messages/messagePalette';
import { Header } from '../src/shared/ui';
import { ChevronDown } from 'lucide-react-native';

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

test('chat controls and station controls share the established product accent', () => {
  const station = resolveStationColors(palettes.light);
  const chat = resolveMessagePalette(palettes.light);
  act(() => {
    renderer = TestRenderer.create(
      <Header palette={chat} title="对话" onBack={jest.fn()} />,
    );
  });
  expect(renderer.root.findByType(ChevronDown).props.color).toBe(
    station.accent,
  );
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
