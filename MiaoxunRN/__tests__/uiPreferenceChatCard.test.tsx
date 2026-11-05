import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Pressable, Text } from 'react-native';
import { UIPreferenceChatCard } from '../src/features/messages/UIPreferenceChatCard';
import { defaultUIPreferences } from '../src/features/ui/uiPreferences';
import { uiPreferencesApi } from '../src/services/api/uiPreferencesApi';
import { palettes } from '../src/shared/theme';

jest.mock('../src/services/api/uiPreferencesApi', () => ({
  uiPreferencesApi: { getUIPreferencePreview: jest.fn() },
}));

const before = defaultUIPreferences();
const preview = {
  id: 'preview-1',
  status: 'pending' as const,
  baseRevision: 0,
  expiresAt: '2099-01-01T00:00:00.000Z',
  patch: { fontScale: 1.2 },
  beforePreferences: before,
  preferences: { ...before, fontScale: 1.2 },
  intent: '放大文字',
  rationale: '提高可读性',
  affectedSurfaces: ['miao' as const],
};

const contents = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .join(' ');

beforeEach(() => jest.resetAllMocks());

test('does not offer confirmation for a previously saved empty preview', async () => {
  (uiPreferencesApi.getUIPreferencePreview as jest.Mock).mockResolvedValue({
    ...preview,
    patch: {},
    preferences: before,
  });
  const confirm = jest.fn();
  let tree: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <UIPreferenceChatCard
        token="owner"
        previewId="preview-1"
        palette={palettes.light}
        language="zh"
        onConfirm={confirm}
      />,
    );
  });
  expect(contents(tree!)).toContain('没有检测到可应用的变化');
  expect(
    tree!.root.findAllByProps({ accessibilityLabel: '应用界面调整' }),
  ).toHaveLength(0);
  expect(confirm).not.toHaveBeenCalled();
});

test('loads an owner-scoped preview and confirms only when the user applies it', async () => {
  (uiPreferencesApi.getUIPreferencePreview as jest.Mock).mockResolvedValue(
    preview,
  );
  const confirm = jest.fn().mockResolvedValue(undefined);
  let tree: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <UIPreferenceChatCard
        token="owner"
        previewId="preview-1"
        palette={palettes.light}
        language="zh"
        onConfirm={confirm}
      />,
    );
  });
  expect(uiPreferencesApi.getUIPreferencePreview).toHaveBeenCalledWith(
    'owner',
    'preview-1',
  );
  expect(contents(tree!)).toContain('fontScale: 1 → 1.2');
  expect(confirm).not.toHaveBeenCalled();
  await act(async () => {
    tree!.root
      .findByProps({ accessibilityLabel: '应用界面调整' })
      .props.onPress();
  });
  expect(confirm).toHaveBeenCalledWith('preview-1', 0);
  expect(contents(tree!)).toContain('曾应用');
});

test('shows an undone preview without offering to apply it again', async () => {
  (uiPreferencesApi.getUIPreferencePreview as jest.Mock).mockResolvedValue({
    ...preview,
    status: 'undone',
  });
  const confirm = jest.fn();
  let tree: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <UIPreferenceChatCard
        token="owner"
        previewId="preview-1"
        palette={palettes.light}
        language="zh"
        onConfirm={confirm}
      />,
    );
  });
  expect(contents(tree!)).toContain('已撤销');
  expect(contents(tree!)).not.toContain('曾应用');
  expect(tree!.root.findAllByType(Pressable)).toHaveLength(0);
  expect(confirm).not.toHaveBeenCalled();
});

test('shows server failure and never enables confirmation for an expired preview', async () => {
  (uiPreferencesApi.getUIPreferencePreview as jest.Mock).mockResolvedValue({
    ...preview,
    status: 'expired',
  });
  const confirm = jest.fn();
  let tree: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <UIPreferenceChatCard
        token="owner"
        previewId="preview-1"
        palette={palettes.light}
        language="zh"
        onConfirm={confirm}
      />,
    );
  });
  expect(contents(tree!)).toContain('已过期');
  expect(
    tree!.root
      .findAllByType(Pressable)
      .filter(node => node.props.accessibilityLabel === '应用界面调整'),
  ).toHaveLength(0);
  expect(confirm).not.toHaveBeenCalled();
});

test('surfaces authorization and conflict errors without claiming success', async () => {
  (uiPreferencesApi.getUIPreferencePreview as jest.Mock).mockResolvedValue(
    preview,
  );
  const confirm = jest
    .fn()
    .mockRejectedValue(new Error('版本冲突，请重新生成预览'));
  let tree: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <UIPreferenceChatCard
        token="owner"
        previewId="preview-1"
        palette={palettes.light}
        language="zh"
        onConfirm={confirm}
      />,
    );
  });
  await act(async () => {
    tree!.root
      .findByProps({ accessibilityLabel: '应用界面调整' })
      .props.onPress();
  });
  expect(contents(tree!)).toContain('版本冲突');
  expect(contents(tree!)).not.toContain('曾应用');
});

test('prevents duplicate confirmation while the first request is pending', async () => {
  (uiPreferencesApi.getUIPreferencePreview as jest.Mock).mockResolvedValue(
    preview,
  );
  let resolveConfirm!: () => void;
  const confirm = jest.fn().mockImplementation(
    () =>
      new Promise<void>(resolve => {
        resolveConfirm = resolve;
      }),
  );
  let tree: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <UIPreferenceChatCard
        token="owner"
        previewId="preview-1"
        palette={palettes.light}
        language="zh"
        onConfirm={confirm}
      />,
    );
  });
  const press = tree!.root.findByProps({ accessibilityLabel: '应用界面调整' })
    .props.onPress;
  act(() => {
    press();
    press();
  });
  expect(confirm).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveConfirm();
  });
});
