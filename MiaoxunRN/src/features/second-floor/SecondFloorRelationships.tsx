import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronRight, RefreshCw } from 'lucide-react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { appErrorText, textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import {
  WorkspaceButton,
  WorkspaceState,
  workspaceStyles,
  workspaceTokens,
} from '../../shared/workspaceUi';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { secondFloorPalette, secondFloorXunStyles } from './secondFloorTheme';
import { isV6Palette } from '../../shared/v6Palette';
import { isXunPalette } from '../../shared/xunPalette';
import { SecondFloorPageScrollProps } from './secondFloorScroll';

export function SecondFloorRelationships({
  header,
  palette,
  language,
  session,
  onOpenFriendThread,
  onOpenProfile,
  scrollProps,
}: {
  header?: React.ReactNode;
  palette: Palette;
  language: Language;
  session: ReturnType<typeof useMiaoxunSession>;
  onOpenFriendThread: (id: string) => void;
  onOpenProfile: (id: string) => void;
  scrollProps?: SecondFloorPageScrollProps;
}) {
  const colors = secondFloorPalette(palette);
  const v6 = isV6Palette(colors);
  const xun = isXunPalette(colors);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const pending = useRef(false);
  const [retry, setRetry] = useState(0);
  const refresh = session.refreshRelationships;
  useEffect(() => {
    let current = true;
    pending.current = true;
    setLoading(true);
    setError('');
    refresh()
      .then(() => {
        if (current) setError('');
      })
      .catch(cause => {
        if (current)
          setError(appErrorText(language, cause, '同步失败', 'Sync failed'));
      })
      .finally(() => {
        if (current) {
          pending.current = false;
          setLoading(false);
        }
      });
    return () => {
      current = false;
      pending.current = false;
    };
  }, [language, refresh, retry]);
  const reload = useCallback(() => {
    if (pending.current) return;
    pending.current = true;
    setRetry(value => value + 1);
  }, []);
  const relationCount = (key: 'friends' | 'following' | 'followers') =>
    session.relationships[key].length || (!loading && !error ? 0 : '—');
  return (
    <ScrollView
      {...scrollProps}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[s.panel, xun && s.panelXun]}
    >
      {header}
      <View style={s.pageHeader}>
        <Text
          accessibilityRole="header"
          style={[s.pageTitle, { color: colors.text }]}
        >
          {textFor(language, '关系', 'Relationships')}
        </Text>
        <Text style={[s.pageHint, { color: colors.secondaryText }]}>
          {textFor(
            language,
            '每一次真诚互动，都在积累信任。',
            'Every meaningful interaction builds trust.',
          )}
        </Text>
      </View>
      {xun ? (
        <View style={s.xunIntro}>
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient
                id="relationshipHeroBase"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <Stop offset="0" stopColor="#e0f5f3" />
                <Stop offset="1" stopColor="#ecf0f8" />
              </LinearGradient>
              <RadialGradient
                id="relationshipHeroGlow"
                cx="95%"
                cy="0%"
                rx="85%"
                ry="85%"
              >
                <Stop offset="0" stopColor="#00c7cb" stopOpacity={0.13} />
                <Stop offset="1" stopColor="#00c7cb" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect
              fill="url(#relationshipHeroBase)"
              width="100%"
              height="100%"
            />
            <Rect
              fill="url(#relationshipHeroGlow)"
              width="100%"
              height="100%"
            />
          </Svg>
          <Text
            accessibilityElementsHidden
            pointerEvents="none"
            style={s.introDecoration}
          >
            {/* Force text presentation so iOS does not render the symbol as an emoji. */}
            ✳︎
          </Text>
          <Text style={s.introLabel}>
            {textFor(language, '✧ 关系健康度', '✧ Relationship health')}
          </Text>
          <Text style={s.introTitle}>
            {textFor(
              language,
              '关系评估暂未开放',
              'Scoring is not available yet',
            )}
          </Text>
          <Text style={[s.pageHint, s.introBody]}>
            {textFor(
              language,
              '好友、关注与粉丝数据来自真实记录，关系评分将在功能开放后展示。',
              'Friends, following, and followers use your real records. Relationship scores will appear when scoring becomes available.',
            )}
          </Text>
        </View>
      ) : (
        <Text style={[s.body, { color: colors.secondaryText }]}>
          {textFor(
            language,
            '关系评估尚未开放。',
            'Relationship assessment is not available yet.',
          )}
        </Text>
      )}
      {xun ? (
        <View style={s.connectionsHeader}>
          <Text style={[s.heading, { color: colors.text }]}>
            {textFor(language, '你的小小连接', 'Your connections')}
          </Text>
          <Text style={[s.pageHint, { color: colors.secondaryText }]}>
            {textFor(
              language,
              '好友、关注与粉丝，记录你与世界的连接。',
              'Friends, following, and followers connect you to your world.',
            )}
          </Text>
        </View>
      ) : null}
      <View style={[s.overview, xun && s.overviewXun]}>
        {(['friends', 'following', 'followers'] as const).map((key, index) => (
          <View
            key={key}
            style={[
              s.stat,
              {
                backgroundColor: v6
                  ? colors.soft
                  : xun
                  ? colors.surface
                  : colors.background,
                borderColor: colors.border,
              },
              xun && s.statXun,
            ]}
          >
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.65}
              numberOfLines={1}
              style={[s.count, { color: colors.text }]}
            >
              {relationCount(key)}
            </Text>
            <Text style={[s.body, { color: colors.secondaryText }]}>
              {textFor(
                language,
                ['好友', '关注', '粉丝'][index],
                ['Friends', 'Following', 'Followers'][index],
              )}
            </Text>
          </View>
        ))}
      </View>
      {xun ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(
            language,
            loading ? '正在同步关系' : error ? '重试同步' : '刷新关系',
            loading
              ? 'Syncing relationships'
              : error
              ? 'Retry sync'
              : 'Refresh',
          )}
          accessibilityState={{ disabled: loading, busy: loading }}
          disabled={loading}
          onPress={reload}
          style={({ pressed }) => [
            s.refresh,
            s.refreshXun,
            loading && workspaceStyles.disabled,
            pressed && !loading && workspaceStyles.pressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator
              accessible={false}
              size="small"
              color={colors.secondaryText}
            />
          ) : (
            <RefreshCw
              accessible={false}
              size={14}
              color={colors.secondaryText}
            />
          )}
          <Text style={[s.refreshLabel, { color: colors.secondaryText }]}>
            {textFor(
              language,
              loading ? '正在同步' : error ? '重试同步' : '刷新关系',
              loading ? 'Syncing' : error ? 'Retry sync' : 'Refresh',
            )}
          </Text>
        </Pressable>
      ) : (
        <WorkspaceButton
          palette={colors}
          variant="secondary"
          label={textFor(
            language,
            loading ? '正在同步关系' : error ? '重试同步' : '刷新关系',
            loading
              ? 'Syncing relationships'
              : error
              ? 'Retry sync'
              : 'Refresh',
          )}
          onPress={reload}
          busy={loading}
          style={s.refresh}
        />
      )}
      {error ? (
        <WorkspaceState palette={colors} title={error} tone="error" />
      ) : null}
      {(['friends', 'following', 'followers'] as const).map((key, index) => (
        <View key={key} style={s.section}>
          <Text style={[s.heading, { color: colors.text }]}>
            {textFor(
              language,
              ['好友', '关注', '粉丝'][index],
              ['Friends', 'Following', 'Followers'][index],
            )}{' '}
            · {relationCount(key)}
          </Text>
          <View
            style={[
              xun && s.peopleXun,
              xun && {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            {session.relationships[key].length ? (
              session.relationships[key].map((item, personIndex) => (
                <View
                  key={item.user.id}
                  style={[
                    s.person,
                    (v6 || xun) && { backgroundColor: colors.surface },
                    { borderColor: colors.border },
                    xun &&
                      personIndex === session.relationships[key].length - 1 &&
                      s.lastPerson,
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={textFor(
                      language,
                      `查看${item.profile.nickname}的主页`,
                      `View ${item.profile.nickname}`,
                    )}
                    onPress={() => onOpenProfile(item.user.aiId)}
                    style={s.name}
                  >
                    <Text style={[s.personName, { color: colors.text }]}>
                      {item.profile.nickname}
                    </Text>
                    {xun ? (
                      <ChevronRight
                        accessible={false}
                        color={colors.secondaryText}
                        size={16}
                      />
                    ) : null}
                  </Pressable>
                  {key === 'friends' ? (
                    <WorkspaceButton
                      palette={colors}
                      variant="secondary"
                      accessibilityLabel={textFor(
                        language,
                        `和${item.profile.nickname}聊天`,
                        `Chat with ${item.profile.nickname}`,
                      )}
                      onPress={() => onOpenFriendThread(item.user.id)}
                      label={textFor(language, '聊天', 'Chat')}
                      labelStyle={
                        xun ? secondFloorXunStyles.secondaryLabel : undefined
                      }
                      style={[
                        xun && secondFloorXunStyles.secondaryButton,
                        xun && s.chatXun,
                      ]}
                    />
                  ) : null}
                </View>
              ))
            ) : (
              <WorkspaceState
                palette={colors}
                title={textFor(
                  language,
                  loading
                    ? '正在加载'
                    : error
                    ? '未能获取记录，请重试'
                    : '暂无记录',
                  loading
                    ? 'Loading'
                    : error
                    ? 'Unable to load entries. Try again.'
                    : 'No entries yet',
                )}
              />
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  panel: workspaceStyles.content,
  panelXun: {
    paddingHorizontal: 17,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
  pageHeader: { gap: 4, paddingBottom: 2 },
  pageTitle: { fontSize: 23, lineHeight: 29, fontWeight: '700' },
  pageHint: { fontSize: 13, lineHeight: 22 },
  introLabel: {
    alignSelf: 'flex-start',
    fontSize: 10,
    lineHeight: 16,
    color: '#007c82',
    backgroundColor: '#e0f5f3',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  introTitle: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '700',
    color: '#173d48',
  },
  introBody: { color: '#56717c' },
  connectionsHeader: { gap: 2, marginTop: 2 },
  introDecoration: {
    color: 'rgba(0,142,150,0.063)',
    fontSize: 120,
    fontWeight: '400',
    lineHeight: 120,
    position: 'absolute',
    right: -15,
    top: 0,
  },
  xunIntro: {
    backgroundColor: '#e0f5f3',
    borderColor: '#cce7e7',
    borderWidth: 1,
    borderRadius: 23,
    paddingHorizontal: 20,
    paddingVertical: 23,
    gap: 8,
    overflow: 'hidden',
  },
  heading: workspaceTokens.typography.title,
  body: workspaceTokens.typography.caption,
  overview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  overviewXun: { width: '100%', flexWrap: 'wrap', gap: 12 },
  stat: { ...workspaceStyles.panel, flexBasis: '47%', flexGrow: 0 },
  statXun: {
    flexBasis: '48%',
    minWidth: 0,
    alignItems: 'flex-start',
    borderRadius: 17,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
  },
  count: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  section: { gap: workspaceTokens.space.sm },
  peopleXun: {
    borderRadius: 23,
    borderWidth: 1,
    paddingHorizontal: 17,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  person: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  lastPerson: { borderBottomWidth: 0 },
  personName: { fontSize: 14, lineHeight: 20, flexShrink: 1 },
  name: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: workspaceTokens.minTouch,
    paddingVertical: workspaceTokens.space.lg,
  },
  refresh: { alignSelf: 'flex-end' },
  refreshXun: {
    minHeight: workspaceTokens.minTouch,
    minWidth: workspaceTokens.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 2,
  },
  refreshLabel: { fontSize: 13, lineHeight: 20 },
  chatXun: { marginLeft: 12, paddingHorizontal: 12, paddingVertical: 6 },
});
