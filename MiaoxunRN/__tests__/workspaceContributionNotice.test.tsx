import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { WorkspaceContributionNotice } from '../src/features/messages/WorkspaceContributionNotice';
import { emptyWorkspaceContributionUnavailableCounts } from '../src/models/agentWorkspace';
import { palettes } from '../src/shared/theme';

test.each(['authorization', 'source', 'version', 'unavailable'] as const)(
  'explains %s historical failures and offers access only for a confirmed authorization failure',
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
    const text = renderer!.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .join('');
    expect(text).toContain('有 2 份历史协作成果暂不可读');
    expect(text).toContain('可继续编辑消息');
    const access = renderer!.root.findAllByProps({
      accessibilityLabel: '查看 Agent 授权',
    });
    expect(access.length > 0).toBe(reason === 'authorization');
    await act(async () =>
      renderer!.root
        .findAllByProps({ accessibilityLabel: '重试历史成果' })[0]
        .props.onPress(),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onOpenAgentAccess).not.toHaveBeenCalled();
    if (reason === 'authorization') {
      act(() => access[0].props.onPress());
      expect(onOpenAgentAccess).toHaveBeenCalledTimes(1);
    }
    await act(() => renderer!.unmount());
  },
);
