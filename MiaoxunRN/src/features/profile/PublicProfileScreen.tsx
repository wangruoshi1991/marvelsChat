import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { PublicProfileDTO } from '../../models/api';
import { profileIdentityTags } from '../station/stationProfileIdentity';
import {
  appErrorText,
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
  onOpenFriendThread,
  onFollow,
  onUnfollow,
  onRequestFriend,
  onCancelFriendRequest,
  onAcceptFriendRequest,
}: {
  palette: Palette;
  language: Language;
  profile: PublicProfileDTO;
  renderUserAvatar: UserAvatarRenderer;
  onOpenFriendThread: () => Promise<void> | void;
  onFollow: () => Promise<void>;
  onUnfollow: () => Promise<void>;
  onRequestFriend: () => Promise<void>;
  onCancelFriendRequest: () => Promise<void>;
  onAcceptFriendRequest: () => Promise<void>;
}) {
  const [submittingAction, setSubmittingAction] = useState<
    'follow' | 'friend' | 'cancel' | null
  >(null);
  const actionInFlight = useRef(false);
  const [actionError, setActionError] = useState('');
  const runAction = async (
    actionName: Exclude<typeof submittingAction, null>,
    action: () => Promise<void> | void,
  ) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setSubmittingAction(actionName);
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(
        appErrorText(language, error, '操作失败', 'Action failed'),
      );
    } finally {
      actionInFlight.current = false;
      setSubmittingAction(null);
    }
  };

  const {
    isSelf,
    isFriend,
    isFollowing,
    pendingFriendRequestId,
    incomingFriendRequestId,
  } = profile.relation;
  const isOutgoingPending =
    !isFriend && !incomingFriendRequestId && Boolean(pendingFriendRequestId);
  const primaryAction = isFriend
    ? {
        title: textFor(language, '发消息', 'Message'),
        status: textFor(language, '已是好友', 'Friends'),
        onPress: onOpenFriendThread,
      }
    : incomingFriendRequestId
    ? {
        title: textFor(language, '同意申请', 'Accept request'),
        status: textFor(
          language,
          '对方申请加你为好友',
          'They sent you a friend request',
        ),
        onPress: onAcceptFriendRequest,
      }
    : {
        title: textFor(language, '添加好友', 'Add friend'),
        status: isOutgoingPending
          ? textFor(language, '申请已发送，等待对方同意', 'Friend request sent')
          : null,
        onPress: onRequestFriend,
      };

  return (
    <ScrollView
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={styles.publicProfileContent}
    >
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
          {profile.profile.headline ? (
            <Text style={[styles.publicProfileBio, { color: palette.text }]}>
              {profile.profile.headline}
            </Text>
          ) : null}
          <Text
            style={[styles.publicProfileBio, { color: palette.secondaryText }]}
          >
            {displayText(language, profile.profile.bio) ||
              (profile.visibility?.showBio === false
                ? textFor(
                    language,
                    '对方未公开职业资料与简介',
                    'Professional profile and bio are private',
                  )
                : textFor(
                    language,
                    '这个人还没有填写小站简介。',
                    'No station bio yet.',
                  ))}
          </Text>
          {profileIdentityTags(profile.profile, language).length ? (
            <Text
              style={[
                styles.publicProfileMeta,
                { color: palette.secondaryText },
              ]}
            >
              {profileIdentityTags(profile.profile, language).join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>

      {!isSelf ? (
        <View style={profileActionsStyles.group}>
          {primaryAction.status ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[
                profileActionsStyles.status,
                { color: palette.secondaryText },
              ]}
            >
              {primaryAction.status}
            </Text>
          ) : null}
          <View style={styles.publicProfileActions}>
            <ProfileAction
              palette={palette}
              label={
                isOutgoingPending
                  ? textFor(language, '取消申请', 'Cancel request')
                  : primaryAction.title
              }
              primary={!isOutgoingPending}
              busy={
                submittingAction === (isOutgoingPending ? 'cancel' : 'friend')
              }
              disabled={submittingAction !== null}
              onPress={() => {
                if (isOutgoingPending) {
                  runAction('cancel', onCancelFriendRequest).catch(
                    () => undefined,
                  );
                } else {
                  runAction('friend', primaryAction.onPress).catch(
                    () => undefined,
                  );
                }
              }}
            />
            <ProfileAction
              palette={palette}
              label={
                isFollowing
                  ? textFor(language, '取消关注', 'Unfollow')
                  : textFor(language, '关注', 'Follow')
              }
              busy={submittingAction === 'follow'}
              disabled={submittingAction !== null}
              onPress={() => {
                runAction('follow', isFollowing ? onUnfollow : onFollow).catch(
                  () => undefined,
                );
              }}
            />
          </View>
          {actionError ? (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[profileActionsStyles.status, { color: palette.rose }]}
            >
              {actionError}
            </Text>
          ) : null}
        </View>
      ) : null}

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
    </ScrollView>
  );
}

function ProfileAction({
  palette,
  label,
  primary,
  busy,
  disabled,
  onPress,
}: {
  palette: Palette;
  label: string;
  primary?: boolean;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const color = primary ? palette.background : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.publicProfileAction,
        styles.publicProfileActionOutlined,
        {
          backgroundColor: primary ? palette.mint : palette.surface,
          borderColor: primary ? palette.mint : palette.border,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.publicProfileActionText, { color }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const profileActionsStyles = StyleSheet.create({
  group: { gap: 8 },
  status: {
    paddingHorizontal: 14,
    fontSize: 13,
    fontWeight: '600',
  },
});

export function LoadingState({
  palette,
  message,
}: {
  palette: Palette;
  message: string;
}) {
  return (
    <View
      style={[styles.loadingState, { backgroundColor: palette.background }]}
    >
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
