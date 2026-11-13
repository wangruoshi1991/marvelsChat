import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { WorkspaceContributionNotice } from '../src/features/messages/WorkspaceContributionNotice';
import { emptyWorkspaceContributionUnavailableCounts } from '../src/models/agentWorkspace';
import { palettes } from '../src/shared/theme';

test.each(['authorization', 'source', 'version', 'unavailable'] as const)(
  'keeps %s historical failures separate from current messages with appropriate actions',
  async reason => {
    const onRetry = jest.fn(async () => {});
    const onOpenAgentAccess = jest.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    await act(() => {
      renderer = TestRenderer.create(
        <WorkspaceContributionNotice
          reasons={{
            ...emptyWorkspaceContributionUnavailableCounts(),
            [reason]: 2,
          }}
          palette={palettes.light}
          language="zh"
          loading={false}
          onRetry={onRetry}
          onOpenAgentAccess={onOpenAgentAccess}
        />,
      );
    });
    const text = () =>
      renderer!.root
        .findAllByType(Text)
        .map(node => node.props.children)
        .join('');
    expect(text()).toContain('历史协作成果 · 2 份不可读');
    expect(text()).not.toContain('重试历史成果');
    expect(
      renderer!.root.findAllByProps({
        accessibilityLabel: '重新核验历史协作成果',
      }),
    ).toHaveLength(0);
    const toggle = renderer!.root.findAllByProps({
      accessibilityLabel: '查看不可读协作成果的原因',
    })[0];
    expect(toggle.props.accessibilityState.expanded).toBe(false);
    await act(() => toggle.props.onPress());
    expect(text()).toContain('当前消息的授权与发送结果会单独显示');
    const access = renderer!.root.findAllByProps({
      accessibilityLabel: '查看 Agent 授权',
    });
    expect(access.length > 0).toBe(reason === 'authorization');
    const recheck = renderer!.root.findAllByProps({
      accessibilityLabel: '重新核验历史协作成果',
    });
    expect(recheck.length > 0).toBe(reason === 'unavailable');
    if (reason === 'unavailable') {
      await act(async () => recheck[0].props.onPress());
      expect(onRetry).toHaveBeenCalledTimes(1);
    } else expect(onRetry).not.toHaveBeenCalled();
    expect(onOpenAgentAccess).not.toHaveBeenCalled();
    if (reason === 'authorization') {
      act(() => access[0].props.onPress());
      expect(onOpenAgentAccess).toHaveBeenCalledTimes(1);
    }
    await act(() => renderer!.unmount());
  },
);

test('an empty history has no warning and a running recheck cannot be submitted twice', async () => {
  const onRetry = jest.fn(async () => {});
  let renderer!: TestRenderer.ReactTestRenderer;
  const props = { palette: palettes.light, language: 'zh' as const, onRetry };
  await act(() => {
    renderer = TestRenderer.create(
      <WorkspaceContributionNotice
        {...props}
        reasons={emptyWorkspaceContributionUnavailableCounts()}
        loading={false}
      />,
    );
  });
  expect(renderer.toJSON()).toBeNull();
  await act(() =>
    renderer.update(
      <WorkspaceContributionNotice
        {...props}
        reasons={{
          ...emptyWorkspaceContributionUnavailableCounts(),
          unavailable: 1,
        }}
        loading
      />,
    ),
  );
  await act(() =>
    renderer.root
      .findAllByProps({ accessibilityLabel: '查看不可读协作成果的原因' })[0]
      .props.onPress(),
  );
  const action = renderer.root.findAllByProps({
    accessibilityLabel: '重新核验历史协作成果',
  })[0];
  expect(action.props.disabled).toBe(true);
  expect(action.props.accessibilityState.disabled).toBe(true);
  expect(
    renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .join(''),
  ).toContain('正在核验');
  await act(() => renderer.unmount());
});
