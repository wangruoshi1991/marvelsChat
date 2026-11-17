import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { GroupChatCreateScreen } from '../src/features/messages/GroupChatCreateScreen';
import { socialApi } from '../src/services/api/socialApi';
import { groupChatApi } from '../src/services/api/groupChatApi';
import { palettes } from '../src/shared/theme';

jest.mock('../src/services/api/socialApi', () => ({
  socialApi: { relationships: jest.fn() },
}));
jest.mock('../src/services/api/groupChatApi', () => ({
  groupChatApi: { create: jest.fn() },
}));

const social = jest.mocked(socialApi);
const groups = jest.mocked(groupChatApi);
const friend = (id: string, name: string) => ({
  user: { id, displayName: name, aiId: id },
  profile: {
    userId: id,
    nickname: name,
    avatarText: name.slice(0, 1),
    avatarConfig: null,
    bio: '',
    community: '',
    activityArea: '',
    followersCount: 0,
    followingCount: 0,
    likesCount: 0,
    collectionsCount: 0,
  },
  relationType: 'friend',
});
const props = {
  token: 'token',
  palette: palettes.light,
  language: 'zh' as const,
  onBack: jest.fn(),
  onCreated: jest.fn(),
  onActionError: jest.fn(),
};

const settle = async () => act(async () => Promise.resolve());
const button = (tree: TestRenderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAllByProps({ accessibilityRole: 'button' })
    .find(item => item.props.accessibilityLabel?.includes(label));

describe('GroupChatCreateScreen', () => {
  beforeEach(() => {
    social.relationships.mockReset();
    groups.create.mockReset();
    props.onBack.mockReset();
    props.onCreated.mockReset();
    props.onActionError.mockReset();
  });

  test('loads real friends, allows selection, and submits selected ids', async () => {
    social.relationships.mockResolvedValue([
      friend('friend-1', '小林'),
      friend('friend-2', '阿敏'),
    ] as never);
    groups.create.mockResolvedValue({
      thread: { id: 'thread', groupId: 'group-id' },
      messages: [],
    } as never);
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<GroupChatCreateScreen {...props} />);
    });

    expect(social.relationships).toHaveBeenCalledWith('friends', 'token');
    await act(async () => button(tree, '小林')?.props.onPress());
    await act(async () => button(tree, '阿敏')?.props.onPress());
    const input = tree.root.findByType(TextInput);
    await act(async () => input.props.onChangeText('周末计划'));
    await act(async () => button(tree, '创建群聊')?.props.onPress());

    expect(groups.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '周末计划',
        memberUserIds: ['friend-1', 'friend-2'],
        idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
      'token',
    );
    expect(props.onCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        thread: expect.objectContaining({ groupId: 'group-id' }),
      }),
    );
  });

  test('keeps an empty state when the real friends list is empty', async () => {
    social.relationships.mockResolvedValue([]);
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<GroupChatCreateScreen {...props} />);
    });
    expect(
      tree.root.findAllByProps({ testID: 'group-create-empty' }).length,
    ).toBeGreaterThan(0);
    expect(groups.create).not.toHaveBeenCalled();
  });

  test('reports friend loading errors without presenting placeholder friends', async () => {
    social.relationships.mockRejectedValue(new Error('好友列表读取失败'));
    await act(async () => {
      TestRenderer.create(<GroupChatCreateScreen {...props} />);
    });
    expect(props.onActionError).toHaveBeenCalledWith('好友列表读取失败');
  });

  test('does not reload when the error callback changes and retries with the latest callback', async () => {
    social.relationships.mockRejectedValue(new Error('好友列表读取失败'));
    const latestError = jest.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<GroupChatCreateScreen {...props} />);
    });
    await act(async () => {
      tree.update(
        <GroupChatCreateScreen {...props} onActionError={latestError} />,
      );
    });

    expect(social.relationships).toHaveBeenCalledTimes(1);
    expect(latestError).not.toHaveBeenCalled();
    await act(async () => button(tree, '重试')?.props.onPress());
    expect(social.relationships).toHaveBeenCalledTimes(2);
    expect(latestError).toHaveBeenCalledTimes(1);
    expect(props.onActionError).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  test.each(['success', 'failure'] as const)(
    'ignores an old account friend request that finishes with %s',
    async outcome => {
      let resolveOld!: (value: never) => void;
      let rejectOld!: (error: Error) => void;
      social.relationships
        .mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              resolveOld = resolve;
              rejectOld = reject;
            }),
        )
        .mockResolvedValueOnce([friend('new-friend', '新账号好友')] as never);
      let tree!: TestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = TestRenderer.create(<GroupChatCreateScreen {...props} />);
      });
      await act(async () => {
        tree.update(<GroupChatCreateScreen {...props} token="new-account" />);
      });
      expect(button(tree, '新账号好友')).toBeTruthy();

      await act(async () => {
        if (outcome === 'success')
          resolveOld([friend('old-friend', '旧账号好友')] as never);
        else rejectOld(new Error('旧账号读取失败'));
      });

      expect(button(tree, '新账号好友')).toBeTruthy();
      expect(button(tree, '旧账号好友')).toBeUndefined();
      expect(
        tree.root.findAllByProps({ testID: 'group-create-error' }),
      ).toHaveLength(0);
      expect(props.onActionError).not.toHaveBeenCalled();
      act(() => tree.unmount());
    },
  );

  test('discards a pending friend loading error after the screen is closed', async () => {
    let rejectRead!: (error: Error) => void;
    social.relationships.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectRead = reject;
        }),
    );
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<GroupChatCreateScreen {...props} />);
    });
    act(() => tree.unmount());
    await act(async () => rejectRead(new Error('页面关闭后的旧错误')));
    expect(props.onActionError).not.toHaveBeenCalled();
  });

  test('keeps the latest retry result when an earlier retry finishes later', async () => {
    let resolveEarlier!: (value: never) => void;
    social.relationships
      .mockRejectedValueOnce(new Error('首次读取失败'))
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveEarlier = resolve;
          }),
      )
      .mockResolvedValueOnce([friend('latest-friend', '最新好友')] as never);
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<GroupChatCreateScreen {...props} />);
    });
    const retry = button(tree, '重试');
    await act(async () => {
      retry?.props.onPress();
      retry?.props.onPress();
    });
    expect(button(tree, '最新好友')).toBeTruthy();
    await act(async () =>
      resolveEarlier([friend('earlier-friend', '旧重试好友')] as never),
    );
    expect(button(tree, '最新好友')).toBeTruthy();
    expect(button(tree, '旧重试好友')).toBeUndefined();
    act(() => tree.unmount());
  });

  test('clears the old account group draft and member selection on account change', async () => {
    const friends = [friend('friend-1', '小林'), friend('friend-2', '阿敏')];
    social.relationships.mockResolvedValue(friends as never);
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<GroupChatCreateScreen {...props} />);
    });
    await act(async () => button(tree, '小林')?.props.onPress());
    await act(async () => button(tree, '阿敏')?.props.onPress());
    await act(async () =>
      tree.root.findByType(TextInput).props.onChangeText('旧账号群聊名称'),
    );
    expect(button(tree, '创建群聊')?.props.disabled).toBe(false);

    await act(async () => {
      tree.update(<GroupChatCreateScreen {...props} token="new-account" />);
    });

    expect(tree.root.findByType(TextInput).props.value).toBe('');
    expect(button(tree, '小林')?.props.accessibilityState.selected).toBe(false);
    expect(button(tree, '阿敏')?.props.accessibilityState.selected).toBe(false);
    expect(button(tree, '创建群聊')?.props.disabled).toBe(true);
    expect(groups.create).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  test('locks repeat submissions and reuses the same idempotency key after failure', async () => {
    social.relationships.mockResolvedValue([
      friend('friend-1', '小林'),
      friend('friend-2', '阿敏'),
    ] as never);
    let rejectCreate!: (error: Error) => void;
    groups.create.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectCreate = reject;
        }) as never,
    );
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<GroupChatCreateScreen {...props} />);
    });
    await act(async () => button(tree, '小林')?.props.onPress());
    await act(async () => button(tree, '阿敏')?.props.onPress());
    await act(async () =>
      tree.root.findByType(TextInput).props.onChangeText('周末计划'),
    );
    let createButton = button(tree, '创建群聊');
    await act(async () => {
      createButton?.props.onPress();
    });
    const firstKey = groups.create.mock.calls[0][0].idempotencyKey;
    await act(async () => {
      createButton?.props.onPress();
    });
    expect(groups.create).toHaveBeenCalledTimes(1);
    await act(async () => rejectCreate(new Error('网络暂不可用')));
    await settle();
    await act(async () => {
      button(tree, '创建群聊')?.props.onPress();
    });
    expect(groups.create.mock.calls[1][0].idempotencyKey).toBe(firstKey);
  });
});
