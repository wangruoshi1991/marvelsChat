import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { StationComicDiaryDTO } from '../../models/api';
import { chatContentApi } from '../../services/api/chatContentApi';
import { Palette } from '../../shared/theme';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/sessionTypes';
import { Action } from './ContentPreviewMessageCard';
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
      <View style={s.header}>
        <Action
          label={t('返回聊天', 'Back to chat')}
          palette={palette}
          onPress={onBack}
        />
        <Text
          accessibilityRole="header"
          style={[s.title, { color: palette.text }]}
        >
          {t('我的漫画', 'My comics')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={s.body}>
        {loading ? (
          <Text style={{ color: palette.secondaryText }}>
            {t('正在读取作品', 'Loading comics')}
          </Text>
        ) : null}
        {error ? (
          <>
            <Text accessibilityRole="alert" style={{ color: palette.rose }}>
              {error}
            </Text>
            <Action
              label={t('重新读取', 'Reload')}
              palette={palette}
              onPress={() => setAttempt(value => value + 1)}
            />
          </>
        ) : null}
        {!loading && !error && !items.length ? (
          <Text style={{ color: palette.secondaryText }}>
            {t(
              '还没有漫画作品，可在聊天中开始创作。',
              'No comics yet. Start creating in chat.',
            )}
          </Text>
        ) : null}
        {items.map(item => (
          <View key={item.id} style={[s.item, { borderColor: palette.border }]}>
            <Text style={[s.title, { color: palette.text }]}>{item.title}</Text>
            <Text style={{ color: palette.secondaryText }}>
              {item.frames.length}
              {t('格', ' frames')} ·{' '}
              {item.createdAt
                ? new Date(item.createdAt).toLocaleDateString()
                : ''}
            </Text>
            <Action
              label={t('查看作品', 'View comic')}
              palette={palette}
              onPress={() => onOpen(item.id)}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1 },
  header: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { padding: 16, gap: 12 },
  title: { fontSize: 16, fontWeight: '600' },
  item: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
});
