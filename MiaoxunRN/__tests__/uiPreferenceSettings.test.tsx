import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { SettingsScreen } from '../src/features/settings/SettingsScreen';
import { defaultUIPreferences } from '../src/features/ui/uiPreferences';
import { palettes } from '../src/shared/theme';

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

test('settings clear an older preview when a new suggestion fails', async () => {
  const generate = jest
    .fn()
    .mockResolvedValueOnce(preview)
    .mockRejectedValueOnce(new Error('界面调整建议无效，请调整描述后重试。'));
  const confirm = jest.fn();
  let tree: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <SettingsScreen
        palette={palettes.light}
        userName="Tester"
        userRole="user"
        language="zh"
        appearance="light"
        profileVisibility={{
          showBio: true,
          showAiId: true,
          showCounts: true,
          showFollowingList: true,
          showFollowersList: true,
          showCommunity: true,
          showActivityArea: true,
          showCollections: true,
          showPosts: true,
          showAlbum: true,
          showDiary: true,
          showMusic: true,
          showFiles: true,
        }}
        onBack={jest.fn()}
        onSetLanguage={jest.fn()}
        onSetAppearance={jest.fn()}
        onUpdateProfileVisibility={jest.fn()}
        onActionError={jest.fn()}
        onSignOut={jest.fn()}
        onDeleteAccount={jest.fn()}
        uiPreferences={before}
        onPreviewUIPreferences={generate}
        onConfirmUIPreferences={confirm}
      />,
    );
  });
  act(() =>
    tree!.root
      .findByProps({ accessibilityLabel: '界面调整描述' })
      .props.onChangeText('放大文字'),
  );
  const pressPreview = () =>
    tree!.root.findByProps({ accessibilityLabel: '生成预览' }).props.onPress();
  await act(async () => {
    await pressPreview();
  });
  expect(
    tree!.root.findAllByProps({ accessibilityLabel: '界面调整前后对比' })
      .length,
  ).toBeGreaterThan(0);
  await act(async () => {
    await pressPreview();
  });
  expect(
    tree!.root.findAllByProps({ accessibilityLabel: '界面调整前后对比' }),
  ).toHaveLength(0);
  expect(
    tree!.root.findAllByProps({ accessibilityRole: 'alert' })[0].props.children,
  ).toContain('重试');
  expect(confirm).not.toHaveBeenCalled();
});
