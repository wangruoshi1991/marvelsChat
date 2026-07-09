import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { ChevronRight, MessageCircle } from 'lucide-react-native';

import { PublicProfileDTO } from '../../models/api';
import {
  displayLocationText,
  displayText,
  publicPresenceText,
  textFor,
} from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { SettingGroup } from '../../shared/settingsUi';
import { Language } from '../session/useMiaoxunSession';
import { UserAvatarRenderer } from '../messages/MessagesScreen';

export function PublicProfileScreen({
  palette,
  language,
  profile,
  renderUserAvatar,
  renderHeader,
  onActionError,
  onOpenFriendThread,
  onFollow,
  onUnfollow,
  onRequestFriend,
  onCancelFriendRequest,
}: {
  palette: Palette;
  language: Language;
  profile: PublicProfileDTO;
  renderUserAvatar: UserAvatarRenderer;
  renderHeader: (title: string) => React.ReactNode;
  onActionError: (message: string) => void;
  onOpenFriendThread: () => Promise<void> | void;
  onFollow: () => Promise<void>;
  onUnfollow: () => Promise<void>;
  onRequestFriend: () => Promise<void>;
  onCancelFriendRequest: () => Promise<void>;
}) {
  const [submittingAction, setSubmittingAction] = useState<
    'follow' | 'friend' | 'message' | null
  >(null);
  const runAction = async (
    actionName: 'follow' | 'friend' | 'message',
    action: () => Promise<void> | void,
  ) => {
    if (submittingAction) {
      return;
    }
    setSubmittingAction(actionName);
    try {
      await action();
    } catch (error) {
      onActionError(
        error instanceof Error
          ? error.message
          : textFor(language, '操作失败', 'Action failed'),
      );
    } finally {
      setSubmittingAction(null);
    }
  };
  const isFollowSubmitting = submittingAction === 'follow';
  const isFriendSubmitting = submittingAction === 'friend';
  const isMessageSubmitting = submittingAction === 'message';
  const isSubmitting = submittingAction !== null;
  const isFollowing = profile.relation.isFollowing;
  const primaryActionTextColor = '#ffffff';
  const followButtonBackgroundColor = isFollowing
    ? palette.surface
    : palette.mint;
  const followButtonBorderColor = isFollowing ? palette.border : palette.mint;
  const followButtonBorderWidth = isFollowing ? 1 : 0;
  const followButtonTextColor = isFollowing
    ? palette.text
    : primaryActionTextColor;

  return (
    <ScrollView
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={styles.publicProfileContent}
    >
      {renderHeader(textFor(language, '用户主页', 'Profile'))}
      <View
        style={[
          styles.publicProfileHero,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        {renderUserAvatar({
          text: profile.profile.avatarText,
          config: profile.profile.avatarConfig,
        })}
        <View style={styles.publicProfileCopy}>
          <Text style={[styles.publicProfileName, { color: palette.text }]}>
            {displayText(language, profile.profile.nickname)}
          </Text>
          <Text
            style={[styles.publicProfileMeta, { color: palette.secondaryText }]}
          >
            AI ID: {profile.user.aiId} ·{' '}
            {publicPresenceText(language, profile.user.presenceStatus)}
          </Text>
          <Text
            style={[styles.publicProfileBio, { color: palette.secondaryText }]}
          >
            {displayText(language, profile.profile.bio) ||
              textFor(
                language,
                '这个人还没有填写小站简介。',
                'No station bio yet.',
              )}
          </Text>
        </View>
      </View>

      <View style={styles.publicProfileStats}>
        <PublicProfileStat
          palette={palette}
          title={textFor(language, '关注', 'Following')}
          value={profile.profile.followingCount}
        />
        <PublicProfileStat
          palette={palette}
          title={textFor(language, '粉丝', 'Followers')}
          value={profile.profile.followersCount}
        />
        <PublicProfileStat
          palette={palette}
          title={textFor(language, '收藏', 'Collections')}
          value={profile.profile.collectionsCount}
        />
      </View>

      <SettingGroup
        title={textFor(language, '小站信息', 'Station')}
        palette={palette}
      >
        <ProfileDataRow
          title={textFor(language, '社区', 'Community')}
          value={
            displayLocationText(language, profile.profile.community) ||
            textFor(language, '未设置', 'Not set')
          }
          palette={palette}
        />
        <ProfileDataRow
          title={textFor(language, '活动区域', 'Activity Area')}
          value={
            displayLocationText(language, profile.profile.activityArea) ||
            textFor(language, '未设置', 'Not set')
          }
          palette={palette}
        />
      </SettingGroup>

      {!profile.relation.isSelf ? (
        <View style={styles.publicProfileActions}>
          <Pressable
            disabled={isSubmitting}
            onPress={() => {
              runAction(
                'follow',
                profile.relation.isFollowing ? onUnfollow : onFollow,
              ).catch(() => undefined);
            }}
            style={[
              styles.publicProfileAction,
              {
                backgroundColor: followButtonBackgroundColor,
                borderColor: followButtonBorderColor,
                borderWidth: followButtonBorderWidth,
              },
            ]}
          >
            {isFollowSubmitting ? (
              <View style={styles.publicProfileActionContent}>
                <ActivityIndicator color="#ffffff" size="small" />
                <Text
                  style={[
                    styles.publicProfileActionText,
                    { color: primaryActionTextColor },
                  ]}
                >
                  {profile.relation.isFollowing
                    ? textFor(language, '取消中', 'Unfollowing')
                    : textFor(language, '关注中', 'Following')}
                </Text>
              </View>
            ) : (
              <Text
                style={[
                  styles.publicProfileActionText,
                  { color: followButtonTextColor },
                ]}
              >
                {profile.relation.isFollowing
                  ? textFor(language, '取消关注', 'Unfollow')
                  : textFor(language, '关注', 'Follow')}
              </Text>
            )}
          </Pressable>
          {profile.relation.isFriend ? (
            <Pressable
              disabled={isSubmitting}
              onPress={() => {
                runAction('message', onOpenFriendThread).catch(() => undefined);
              }}
              style={[
                styles.publicProfileAction,
                styles.publicProfileActionOutlined,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
            >
              {isMessageSubmitting ? (
                <View style={styles.publicProfileActionContent}>
                  <ActivityIndicator color={palette.text} size="small" />
                  <Text
                    style={[
                      styles.publicProfileActionText,
                      { color: palette.text },
                    ]}
                  >
                    {textFor(language, '打开中', 'Opening')}
                  </Text>
                </View>
              ) : (
                <View style={styles.publicProfileActionContent}>
                  <MessageCircle
                    color={palette.mint}
                    size={17}
                    strokeWidth={2.6}
                  />
                  <Text
                    style={[
                      styles.publicProfileActionText,
                      { color: palette.text },
                    ]}
                  >
                    {textFor(language, '发消息', 'Message')}
                  </Text>
                </View>
              )}
            </Pressable>
          ) : (
            <Pressable
              disabled={isSubmitting}
              onPress={() => {
                runAction(
                  'friend',
                  profile.relation.pendingFriendRequestId
                    ? onCancelFriendRequest
                    : onRequestFriend,
                ).catch(() => undefined);
              }}
              style={[
                styles.publicProfileAction,
                styles.publicProfileActionOutlined,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
            >
              {isFriendSubmitting ? (
                <View style={styles.publicProfileActionContent}>
                  <ActivityIndicator color={palette.text} size="small" />
                  <Text
                    style={[
                      styles.publicProfileActionText,
                      { color: palette.text },
                    ]}
                  >
                    {textFor(language, '发送中', 'Sending')}
                  </Text>
                </View>
              ) : (
                <Text
                  style={[
                    styles.publicProfileActionText,
                    { color: palette.text },
                  ]}
                >
                  {profile.relation.pendingFriendRequestId
                    ? textFor(language, '取消申请', 'Cancel request')
                    : textFor(language, '加好友', 'Add friend')}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

export function LoadingState({
  palette,
  message,
  renderHeader,
}: {
  palette: Palette;
  message: string;
  renderHeader: () => React.ReactNode;
}) {
  return (
    <View
      style={[styles.loadingState, { backgroundColor: palette.background }]}
    >
      {renderHeader()}
      <View style={styles.loadingStateBody}>
        <ActivityIndicator color={palette.mint} />
        <Text
          style={[styles.loadingStateText, { color: palette.secondaryText }]}
        >
          {message}
        </Text>
      </View>
    </View>
  );
}

function PublicProfileStat({
  palette,
  title,
  value,
}: {
  palette: Palette;
  title: string;
  value: number;
}) {
  return (
    <View
      style={[
        styles.publicProfileStat,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.publicProfileStatValue, { color: palette.text }]}>
        {value}
      </Text>
      <Text
        style={[
          styles.publicProfileStatTitle,
          { color: palette.secondaryText },
        ]}
      >
        {title}
      </Text>
    </View>
  );
}

function ProfileDataRow({
  title,
  value,
  palette,
  onPress,
}: {
  title: string;
  value: string;
  palette: Palette;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={[styles.profileDataTitle, { color: palette.secondaryText }]}>
        {title}
      </Text>
      <Text
        style={[styles.profileDataValue, { color: palette.text }]}
        numberOfLines={1}
      >
        {value}
      </Text>
      {onPress ? (
        <ChevronRight
          color={palette.secondaryText}
          size={16}
          strokeWidth={2.6}
        />
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={[styles.profileDataRow, { backgroundColor: palette.soft }]}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View style={[styles.profileDataRow, { backgroundColor: palette.soft }]}>
      {content}
    </View>
  );
}
