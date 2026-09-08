import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight, MessageCircle } from 'lucide-react-native';

import { RelationshipProfileDTO } from '../../models/api';
import { displayText, publicPresenceText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { UserAvatar } from '../avatar/AvatarBadges';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { StationCard } from './StationShared';
import { StationMetricBox } from './StationMetricBox';
import { StationPageHeading } from './StationPageHeading';
import { resolveStationColors } from './stationTheme';

export function StationSocialPanel({
  palette,
  language,
  relationships,
  status,
  onOpenFriendThread,
  onOpenPublicProfileByAiId,
}: {
  palette: Palette;
  language: Language;
  relationships: ReturnType<typeof useMiaoxunSession>['relationships'];
  status: string;
  onOpenFriendThread: (friendUserId: string) => void;
  onOpenPublicProfileByAiId: (aiId: string) => void;
}) {
  const colors = resolveStationColors(palette);

  return (
    <View style={styles.stationPanelStack}>
      <StationPageHeading
        detail={textFor(language, '关系与连接', 'Relationships')}
        palette={palette}
        title={textFor(language, '其他', 'More')}
        watermark="CONNECTIONS"
      />
      <View
        style={[
          styles.stationRadarCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.stationSectionTitleRow}>
          <Text style={[styles.stationSectionTitle, { color: colors.text }]}>
            {textFor(language, '关系概览', 'Relationship Overview')}
          </Text>
          <Text
            style={[
              styles.stationSectionDetail,
              { color: colors.secondaryText },
            ]}
          >
            {status}
          </Text>
        </View>
        <View style={styles.stationRadarMetrics}>
          <StationMetricBox
            palette={palette}
            value={relationships.friends.length}
            label={textFor(language, '好友', 'Friends')}
          />
          <StationMetricBox
            palette={palette}
            value={relationships.following.length}
            label={textFor(language, '关注', 'Following')}
          />
          <StationMetricBox
            palette={palette}
            value={relationships.followers.length}
            label={textFor(language, '粉丝', 'Followers')}
          />
        </View>
      </View>

      <StationCard
        title={textFor(language, '社交网络', 'Social')}
        detail={status}
        palette={palette}
      >
        <View style={styles.relationshipStack}>
          <RelationshipSection
            palette={palette}
            language={language}
            title={textFor(language, '好友', 'Friends')}
            empty={textFor(language, '暂无好友', 'No friends yet')}
            items={relationships.friends}
            action="chat"
            onItemPress={item => onOpenPublicProfileByAiId(item.user.aiId)}
            onChatPress={item => onOpenFriendThread(item.user.id)}
          />
          <RelationshipSection
            palette={palette}
            language={language}
            title={textFor(language, '关注', 'Following')}
            empty={textFor(language, '暂无关注', 'No following yet')}
            items={relationships.following}
            action="profile"
            onItemPress={item => onOpenPublicProfileByAiId(item.user.aiId)}
          />
          <RelationshipSection
            palette={palette}
            language={language}
            title={textFor(language, '粉丝', 'Followers')}
            empty={textFor(language, '暂无粉丝', 'No followers yet')}
            items={relationships.followers}
            action="profile"
            onItemPress={item => onOpenPublicProfileByAiId(item.user.aiId)}
          />
        </View>
      </StationCard>
    </View>
  );
}

function RelationshipSection({
  palette,
  language,
  title,
  empty,
  items,
  action,
  onItemPress,
  onChatPress,
}: {
  palette: Palette;
  language: Language;
  title: string;
  empty: string;
  items: RelationshipProfileDTO[];
  action: 'chat' | 'profile';
  onItemPress: (item: RelationshipProfileDTO) => void;
  onChatPress?: (item: RelationshipProfileDTO) => void;
}) {
  const colors = resolveStationColors(palette);

  return (
    <View style={styles.relationshipSection}>
      <Text
        style={[
          styles.relationshipSectionTitle,
          { color: colors.secondaryText },
        ]}
      >
        {title}
      </Text>
      {items.length ? (
        items.map(item => (
          <View
            key={`${title}-${item.user.id}`}
            style={[styles.relationshipRow, { backgroundColor: colors.soft }]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={textFor(
                language,
                '查看用户主页',
                'View profile',
              )}
              onPress={() => onItemPress(item)}
              style={styles.relationshipProfileButton}
            >
              <UserAvatar
                text={item.profile.avatarText}
                config={item.profile.avatarConfig}
                palette={palette}
                small
              />
              <View style={styles.relationshipCopy}>
                <Text
                  style={[styles.relationshipName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {displayText(language, item.profile.nickname)}
                </Text>
                <Text
                  style={[
                    styles.relationshipMeta,
                    { color: colors.secondaryText },
                  ]}
                  numberOfLines={1}
                >
                  {`AI ID ${item.user.aiId} · ${publicPresenceText(
                    language,
                    item.user.presenceStatus,
                  )}`}
                </Text>
              </View>
            </Pressable>
            {action === 'chat' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={textFor(language, '发消息', 'Message')}
                hitSlop={8}
                onPress={() => onChatPress?.(item)}
                style={styles.relationshipChatButton}
              >
                <MessageCircle
                  color={colors.accent}
                  size={18}
                  strokeWidth={2.5}
                />
              </Pressable>
            ) : (
              <ChevronRight
                color={colors.secondaryText}
                size={17}
                strokeWidth={2.6}
              />
            )}
          </View>
        ))
      ) : (
        <Text
          style={[styles.relationshipEmpty, { color: colors.secondaryText }]}
        >
          {empty}
        </Text>
      )}
    </View>
  );
}
