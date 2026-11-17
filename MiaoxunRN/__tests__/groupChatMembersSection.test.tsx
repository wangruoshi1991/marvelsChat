import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import { GroupChatMembersSection } from '../src/features/messages/GroupChatMembersSection';
import { groupChatApi } from '../src/services/api/groupChatApi';
import { palettes } from '../src/shared/theme';

jest.mock('../src/services/api/groupChatApi', () => ({
  groupChatApi: { members: jest.fn(), leave: jest.fn() },
}));

const api = jest.mocked(groupChatApi);
const props = {
  groupId: 'group-id',
  token: 'token',
  palette: palettes.light,
  language: 'zh' as const,
  onGroupLeft: jest.fn(),
  onActionError: jest.fn(),
};
const member = { id: 'user-1', name: '小林', avatarText: '林' };
describe('GroupChatMembersSection', () => {
  beforeEach(() => {
    api.members.mockReset();
    api.leave.mockReset();
    props.onGroupLeft.mockReset();
    props.onActionError.mockReset();
  });

  test('loads and displays the server member list', async () => {
    api.members.mockResolvedValue([member]);
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<GroupChatMembersSection {...props} />);
    });
    expect(api.members).toHaveBeenCalledWith('group-id', 'token');
    expect(
      tree.root.findAllByProps({ testID: 'group-member-user-1' }).length,
    ).toBeGreaterThan(0);
  });

  test('reports a member loading failure and keeps the failure state visible', async () => {
    api.members.mockRejectedValue(new Error('成员读取失败'));
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<GroupChatMembersSection {...props} />);
    });
    expect(props.onActionError).toHaveBeenCalledWith('成员读取失败');
    expect(
      tree.root.findAllByProps({ testID: 'group-members-error' }).length,
    ).toBeGreaterThan(0);
  });

  test('restores the exited state from the persisted thread status', async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <GroupChatMembersSection {...props} hasLeft />,
      );
    });
    expect(api.members).not.toHaveBeenCalled();
    expect(
      tree.root.findAllByProps({ testID: 'group-history-retained' }).length,
    ).toBeGreaterThan(0);
  });

  test('does not reload on error callback changes and uses the latest handler for manual retries', async () => {
    api.members.mockRejectedValue(new Error('成员读取失败'));
    const firstError = jest.fn();
    const nextError = jest.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    try {
      await act(async () => {
        tree = TestRenderer.create(
          <GroupChatMembersSection {...props} onActionError={firstError} />,
        );
      });
      expect(api.members).toHaveBeenCalledTimes(1);
      expect(firstError).toHaveBeenCalledWith('成员读取失败');
      await act(async () => {
        tree.update(
          <GroupChatMembersSection {...props} onActionError={nextError} />,
        );
      });
      expect(api.members).toHaveBeenCalledTimes(1);
      expect(nextError).not.toHaveBeenCalled();
      await act(async () =>
        tree.root
          .findByProps({ accessibilityLabel: '重试读取成员' })
          .props.onPress(),
      );
      expect(api.members).toHaveBeenCalledTimes(2);
      expect(nextError).toHaveBeenCalledWith('成员读取失败');
    } finally {
      await act(async () => tree?.unmount());
    }
  });

  test('ignores a member response that arrives after the group becomes read only', async () => {
    let resolveMembers!: (value: (typeof member)[]) => void;
    api.members.mockReturnValue(
      new Promise(resolve => {
        resolveMembers = resolve;
      }),
    );
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<GroupChatMembersSection {...props} />);
    });
    await act(async () => {
      tree.update(<GroupChatMembersSection {...props} hasLeft />);
    });
    await act(async () => {
      resolveMembers([member]);
    });

    expect(
      tree.root.findAllByProps({ testID: 'group-history-retained' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'group-member-user-1' }),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ accessibilityLabel: '退出群聊' }),
    ).toHaveLength(0);
  });

  test('does not load members while the settings surface is hidden', async () => {
    await act(async () => {
      TestRenderer.create(
        <GroupChatMembersSection {...props} enabled={false} />,
      );
    });
    expect(api.members).not.toHaveBeenCalled();
    expect(props.onActionError).not.toHaveBeenCalled();
  });

  test('confirms before leaving and retains history through the callback', async () => {
    api.members.mockResolvedValue([member]);
    api.leave.mockResolvedValue({ ok: true });
    const alert = jest.spyOn(Alert, 'alert');
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<GroupChatMembersSection {...props} />);
    });
    const leaveButton = tree.root.findByProps({
      accessibilityLabel: '退出群聊',
    });
    await act(async () => leaveButton?.props.onPress());
    expect(api.leave).not.toHaveBeenCalled();
    const confirm =
      alert.mock.calls[alert.mock.calls.length - 1]?.[2]?.[1]?.onPress;
    await act(async () => confirm?.());
    expect(api.leave).toHaveBeenCalledWith('group-id', 'token');
    expect(props.onGroupLeft).toHaveBeenCalled();
    expect(
      tree.root.findAllByProps({ testID: 'group-history-retained' }).length,
    ).toBeGreaterThan(0);
    alert.mockRestore();
  });

  test('keeps the member state active and reports a failed leave', async () => {
    api.members.mockResolvedValue([member]);
    api.leave.mockRejectedValue(new Error('退出失败'));
    const alert = jest.spyOn(Alert, 'alert');
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<GroupChatMembersSection {...props} />);
    });
    const leaveButton = tree.root.findByProps({
      accessibilityLabel: '退出群聊',
    });
    await act(async () => leaveButton?.props.onPress());
    const confirm =
      alert.mock.calls[alert.mock.calls.length - 1]?.[2]?.[1]?.onPress;
    await act(async () => confirm?.());
    expect(props.onActionError).toHaveBeenCalledWith('退出失败');
    expect(props.onGroupLeft).not.toHaveBeenCalled();
    expect(
      tree.root.findAllByProps({ testID: 'group-members-error' }),
    ).toHaveLength(0);
    alert.mockRestore();
  });
});
