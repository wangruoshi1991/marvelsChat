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

let tree: TestRenderer.ReactTestRenderer;
afterEach(() => {
  if (tree) act(() => tree.unmount());
});

async function renderSettings() {
  const generate = jest.fn().mockResolvedValue(preview);
  const confirm = jest.fn().mockResolvedValue(undefined);
  const reset = jest.fn().mockResolvedValue(undefined);
  const undo = jest.fn().mockResolvedValue(undefined);
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
        onResetUIPreferences={reset}
        onUndoUIPreferences={undo}
      />,
    );
  });
  act(() =>
    tree.root
      .findByProps({ accessibilityLabel: '界面调整描述' })
      .props.onChangeText('放大文字'),
  );
  return { generate, confirm, reset, undo };
}

const actionLabels = {
  generate: '生成预览',
  confirm: '应用调整',
  reset: '恢复界面默认设置',
  undo: '撤销上一次已应用调整',
};

const actionButton = (label: string) =>
  tree.root.findAll(button => {
    if (typeof button.props.onPress !== 'function') return false;
    if (button.props.accessibilityLabel === label) return true;
    return button.findAll(node => node.props.children === label).length > 0;
  })[0];

const hasPreview = () =>
  tree.root.findAllByProps({ accessibilityLabel: '界面调整前后对比' }).length >
  0;

async function generatePreview() {
  await act(async () => {
    await actionButton(actionLabels.generate).props.onPress();
  });
}

test('settings clear an older preview when a new suggestion fails', async () => {
  const { generate, confirm } = await renderSettings();
  generate
    .mockResolvedValueOnce(preview)
    .mockRejectedValueOnce(new Error('界面调整建议无效，请调整描述后重试。'));
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

test.each(['generate', 'confirm', 'reset', 'undo'] as const)(
  '%s blocks duplicate and competing preference operations while pending',
  async operation => {
    const callbacks = await renderSettings();
    await generatePreview();
    Object.values(callbacks).forEach(callback => callback.mockClear());
    let resolveRequest!: () => void;
    const pending = new Promise<void>(resolve => {
      resolveRequest = resolve;
    });
    callbacks[operation].mockImplementation(() =>
      pending.then(() => (operation === 'generate' ? preview : undefined)),
    );
    const press = actionButton(actionLabels[operation]).props.onPress;
    const competingOperation = operation === 'reset' ? 'undo' : 'reset';
    const compete = actionButton(actionLabels[competingOperation]).props
      .onPress;
    let request!: Promise<void>;
    act(() => {
      request = press();
      press();
      compete();
    });
    expect(callbacks[operation]).toHaveBeenCalledTimes(1);
    expect(callbacks[competingOperation]).not.toHaveBeenCalled();
    for (const label of Object.values(actionLabels)) {
      const button = actionButton(label);
      if (button) {
        expect(button.props.disabled).toBe(true);
        expect(button.props.accessibilityState).toMatchObject({
          disabled: true,
          busy: true,
        });
      }
    }
    await act(async () => {
      resolveRequest();
      await request;
    });
    expect(actionButton(actionLabels.reset).props.disabled).toBe(false);
    expect(actionButton(actionLabels.undo).props.disabled).toBe(false);
  },
);

test.each(['reset', 'undo'] as const)(
  'successful %s clears a preview generated from the old revision',
  async operation => {
    const callbacks = await renderSettings();
    await generatePreview();
    expect(hasPreview()).toBe(true);
    await act(async () => {
      await actionButton(actionLabels[operation]).props.onPress();
    });
    expect(callbacks[operation]).toHaveBeenCalledWith(0);
    expect(hasPreview()).toBe(false);
    expect(actionButton(actionLabels.confirm)).toBeUndefined();
  },
);

test.each(['reset', 'undo'] as const)(
  'failed %s shows the server error and preserves the unapplied preview',
  async operation => {
    const callbacks = await renderSettings();
    await generatePreview();
    callbacks[operation].mockRejectedValueOnce(new Error('授权已撤回'));
    await act(async () => {
      await actionButton(actionLabels[operation]).props.onPress();
    });
    expect(hasPreview()).toBe(true);
    expect(
      tree.root.findByProps({ accessibilityRole: 'alert' }).props.children,
    ).toContain('授权已撤回');
    expect(callbacks.confirm).not.toHaveBeenCalled();
  },
);
