import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, PanelsTopLeft } from 'lucide-react-native';
import { StationComicDiaryDTO } from '../../models/api';
import { chatContentApi } from '../../services/api/chatContentApi';
import { Palette } from '../../shared/theme';
import { textFor } from '../../shared/i18n';
import { Header } from '../../shared/ui';
import {
  WorkspacePanel,
  WorkspaceState,
  workspaceTokens,
} from '../../shared/workspaceUi';
import { Language } from '../session/sessionTypes';
export function MyComicsScreen({
  token,
  palette,
  language,
  onBack,
  onOpen,
}: {
  token: string;
  palette: Palette;
  language: Language;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const [items, setItems] = useState<StationComicDiaryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setItems([]);
    setLoading(true);
    setError('');
    chatContentApi
      .comics(token)
      .then(
        result => {
          if (active) setItems(result);
        },
        issue => {
          if (active)
            setError(
              issue instanceof Error ? issue.message : '作品列表读取失败。',
            );
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, attempt]);
  const t = (zh: string, en: string) => textFor(language, zh, en);
  return (
    <View
      testID="my-comics-screen"
      style={[s.screen, { backgroundColor: palette.background }]}
    >
      <Header
        title={t('我的漫画', 'My comics')}
        palette={palette}
        onBack={onBack}
        backAccessibilityLabel={t('返回聊天', 'Back to chat')}
      />
      <ScrollView contentContainerStyle={s.body}>
        {loading ? (
          <WorkspaceState
            palette={palette}
            title={t('正在读取作品', 'Loading comics')}
            busy
          />
        ) : null}
        {error ? (
          <WorkspacePanel palette={palette}>
            <WorkspaceState
              palette={palette}
              title={t('作品暂时无法读取', 'Unable to load comics')}
              description={error}
              tone="error"
              retryLabel={t('重新读取', 'Reload')}
              onRetry={() => setAttempt(value => value + 1)}
            />
          </WorkspacePanel>
        ) : null}
        {!loading && !error && !items.length ? (
          <WorkspacePanel palette={palette}>
            <WorkspaceState
              palette={palette}
              title={t('还没有漫画作品', 'No comics yet')}
              description={t(
                '在漫画 Agent 聊天中开始创作，确认生成后可在这里查看。',
                'Create in your comic Agent chat. Confirmed comics appear here.',
              )}
            />
          </WorkspacePanel>
        ) : null}
        {items.length ? (
          <View style={s.intro}>
            <Text style={[s.heading, { color: palette.text }]}>
              {t('作品集', 'Collection')}
            </Text>
            <Text style={[s.caption, { color: palette.secondaryText }]}>
              {t(
                '聊天创作与历史漫画，点击查看画面和生成状态。',
                'Comics from chat and earlier creations. Open to view images and status.',
              )}
            </Text>
          </View>
        ) : null}
        {items.map(item => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={t(
              `查看作品：${item.title}`,
              `View comic: ${item.title}`,
            )}
            onPress={() => onOpen(item.id)}
            style={({ pressed }) => pressed && s.pressed}
          >
            <WorkspacePanel palette={palette} style={s.item}>
              <View style={[s.symbol, { backgroundColor: palette.soft }]}>
                <PanelsTopLeft
                  color={palette.mint}
                  size={25}
                  strokeWidth={1.6}
                />
              </View>
              <View style={s.itemContent}>
                <Text
                  numberOfLines={2}
                  style={[s.title, { color: palette.text }]}
                >
                  {item.title}
                </Text>
                {item.summary ? (
                  <Text
                    numberOfLines={2}
                    style={[s.summary, { color: palette.secondaryText }]}
                  >
                    {item.summary}
                  </Text>
                ) : null}
                <Text style={[s.caption, { color: palette.secondaryText }]}>
                  {item.frames.length}
                  {t('格', ' frames')}
                  {item.createdAt
                    ? ` · ${new Date(item.createdAt).toLocaleDateString()}`
                    : ''}
                </Text>
              </View>
              <ChevronRight color={palette.secondaryText} size={18} />
            </WorkspacePanel>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: workspaceTokens.space.lg, gap: workspaceTokens.space.md },
  intro: {
    gap: workspaceTokens.space.xs,
    paddingBottom: workspaceTokens.space.xs,
  },
  heading: workspaceTokens.typography.heading,
  title: workspaceTokens.typography.title,
  caption: workspaceTokens.typography.caption,
  summary: workspaceTokens.typography.body,
  item: { flexDirection: 'row', alignItems: 'center', minHeight: 104 },
  itemContent: { flex: 1, gap: workspaceTokens.space.xs },
  symbol: {
    width: 48,
    height: 56,
    borderRadius: workspaceTokens.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
