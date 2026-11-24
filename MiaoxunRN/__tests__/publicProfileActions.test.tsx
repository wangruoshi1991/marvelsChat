import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { PublicProfileScreen } from '../src/features/profile/PublicProfileScreen';
import { PublicProfileDTO } from '../src/models/api';
import { palettes } from '../src/shared/theme';

const unrelated = {
  isSelf: false,
  isFollowing: false,
  isFriend: false,
  pendingFriendRequestId: null,
  incomingFriendRequestId: null,
};

const cases = [
  ['添加好友', 'request', unrelated],
  ['取消申请', 'cancel', { ...unrelated, pendingFriendRequestId: 'out' }],
  ['同意申请', 'accept', { ...unrelated, incomingFriendRequestId: 'in' }],
  ['发消息', 'message', { ...unrelated, isFriend: true }],
] as const;

function renderProfile(relation: PublicProfileDTO['relation']) {
  const callbacks = {
    request: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(undefined),
    accept: jest.fn().mockResolvedValue(undefined),
    message: jest.fn().mockResolvedValue(undefined),
    follow: jest.fn().mockResolvedValue(undefined),
    unfollow: jest.fn().mockResolvedValue(undefined),
  };
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(
      <PublicProfileScreen
        palette={palettes.light}
        language="zh"
        profile={{
          user: {
            id: 'peer',
            aiId: '123456789012',
            displayName: '测试资料',
          },
          profile: {
            userId: 'peer',
            nickname: '测试资料',
            avatarText: '测',
            avatarConfig: {},
            bio: '',
            community: '',
            activityArea: '',
            headline: '',
            publicLocation: '',
            experienceYears: null,
            languages: [],
            miaoPoints: 0,
            followingCount: 0,
            followersCount: 0,
            likesCount: 0,
            collectionsCount: 0,
          },
          relation,
        }}
        renderUserAvatar={() => null}
        onOpenFriendThread={callbacks.message}
        onRequestFriend={callbacks.request}
        onCancelFriendRequest={callbacks.cancel}
        onAcceptFriendRequest={callbacks.accept}
        onFollow={callbacks.follow}
        onUnfollow={callbacks.unfollow}
      />,
    );
  });
  return { callbacks, view };
}

test.each(cases)(
  'shows %s based on the relationship receipt',
  async (label, method, relation) => {
    const { callbacks, view } = renderProfile(relation);
    try {
      const actions = view.root.findAllByProps({
        accessibilityLabel: label,
        accessibilityRole: 'button',
      });
      expect(actions.length).toBeGreaterThan(0);
      await act(async () => {
        actions[0].props.onPress();
        actions[0].props.onPress();
      });
      expect(callbacks[method]).toHaveBeenCalledTimes(1);
      expect(callbacks.follow).not.toHaveBeenCalled();
    } finally {
      act(() => view.unmount());
    }
  },
);

test('a self scan has no relationship actions', () => {
  const { view } = renderProfile({ ...unrelated, isSelf: true });
  try {
    expect(
      view.root.findAllByProps({ accessibilityRole: 'button' }),
    ).toHaveLength(0);
  } finally {
    act(() => view.unmount());
  }
});
