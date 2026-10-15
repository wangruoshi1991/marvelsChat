import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { appErrorText, textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import {
  WorkspaceButton,
  WorkspaceState,
  workspaceStyles,
  workspaceTokens,
} from '../../shared/workspaceUi';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { workspacePalette } from '../../shared/workspacePalette';

export function SecondFloorRelationships({
  palette,
  language,
  session,
  onOpenFriendThread,
  onOpenProfile,
}: {
  palette: Palette;
  language: Language;
  session: ReturnType<typeof useMiaoxunSession>;
  onOpenFriendThread: (id: string) => void;
  onOpenProfile: (id: string) => void;
}) {
  const colors = workspacePalette(palette);
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
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.panel}
    >
      <Text style={[s.body, { color: colors.secondaryText }]}>
        {textFor(
          language,
          '关系评估尚未开放。以下是你在妙讯中的真实好友、关注与粉丝。',
          'Relationship assessment is not available yet. View your Miao friends, following and followers below.',
        )}
      </Text>
      <View style={s.overview}>
        {(['friends', 'following', 'followers'] as const).map((key, index) => (
          <View
            key={key}
            style={[
              s.stat,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[s.body, { color: colors.secondaryText }]}>
              {textFor(
                language,
                ['好友', '关注', '粉丝'][index],
                ['Friends', 'Following', 'Followers'][index],
              )}
            </Text>
            <Text style={[s.count, { color: colors.text }]}>
              {relationCount(key)}
            </Text>
          </View>
        ))}
      </View>
      <WorkspaceButton
        palette={colors}
        variant="secondary"
        label={textFor(
          language,
          loading ? '正在同步关系' : error ? '重试同步' : '刷新关系',
          loading ? 'Syncing relationships' : error ? 'Retry sync' : 'Refresh',
        )}
        onPress={reload}
        busy={loading}
        style={s.refresh}
      />
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
          {session.relationships[key].length ? (
            session.relationships[key].map(item => (
              <View
                key={item.user.id}
                style={[s.person, { borderColor: colors.border }]}
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
                  <Text style={[s.body, { color: colors.text }]}>
                    {item.profile.nickname}
                  </Text>
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
      ))}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  panel: workspaceStyles.content,
  heading: workspaceTokens.typography.title,
  body: workspaceTokens.typography.caption,
  overview: { flexDirection: 'row', gap: workspaceTokens.space.sm },
  stat: { ...workspaceStyles.panel, flex: 1 },
  count: { fontSize: 23, fontWeight: '600' },
  section: { gap: workspaceTokens.space.sm },
  person: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  name: {
    flex: 1,
    minHeight: workspaceTokens.minTouch,
    paddingVertical: workspaceTokens.space.lg,
  },
  refresh: { alignSelf: 'flex-end' },
});
