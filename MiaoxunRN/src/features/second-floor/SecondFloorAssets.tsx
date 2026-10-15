import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MiaoPointLedgerEntryDTO } from '../../models/api';
import { appErrorText, textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import {
  WorkspaceButton,
  WorkspacePanel,
  WorkspaceState,
  workspaceStyles,
  workspaceTokens,
} from '../../shared/workspaceUi';
import { workspacePalette } from '../../shared/workspacePalette';
import { Language } from '../session/sessionTypes';

export function SecondFloorAssets({
  palette,
  language,
  miaoPoints,
  onLoadEntries,
}: {
  palette: Palette;
  language: Language;
  miaoPoints: number;
  onLoadEntries: () => Promise<MiaoPointLedgerEntryDTO[]>;
}) {
  const colors = workspacePalette(palette);
  const [entries, setEntries] = useState<MiaoPointLedgerEntryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const pending = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!alive.current || pending.current) return;
    const request = ++generation.current;
    pending.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await onLoadEntries();
      if (alive.current && request === generation.current) setEntries(result);
    } catch (cause) {
      if (alive.current && request === generation.current)
        setError(
          appErrorText(
            language,
            cause,
            '流水加载失败，请重试',
            'Unable to load transactions. Try again.',
          ),
        );
    } finally {
      if (alive.current && request === generation.current) {
        pending.current = false;
        setLoading(false);
      }
    }
  }, [language, onLoadEntries]);
  useEffect(() => {
    alive.current = true;
    pending.current = false;
    load();
    return () => {
      alive.current = false;
      generation.current += 1;
    };
  }, [load]);
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.panel}
    >
      <View style={[s.balance, { backgroundColor: colors.text }]}>
        <Text style={[s.body, s.balanceLabel, { color: colors.surface }]}>
          {textFor(language, '妙点余额', 'Miao points balance')}
        </Text>
        <Text style={[s.amount, { color: colors.surface }]}>
          {miaoPoints.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
        </Text>
      </View>
      <View style={s.heading}>
        <Text
          accessibilityRole="header"
          style={[s.name, { color: colors.text }]}
        >
          {textFor(language, '最近流水', 'Recent transactions')}
        </Text>
        <WorkspaceButton
          palette={colors}
          variant="secondary"
          accessibilityLabel={textFor(
            language,
            error ? '重试加载流水' : '刷新流水',
            error ? 'Retry transactions' : 'Refresh transactions',
          )}
          label={textFor(
            language,
            loading ? '加载中' : error ? '重试' : '刷新',
            loading ? 'Loading' : error ? 'Retry' : 'Refresh',
          )}
          busy={loading}
          onPress={load}
        />
      </View>
      {loading ? (
        <WorkspaceState
          palette={colors}
          busy
          title={textFor(language, '正在加载流水', 'Loading transactions')}
        />
      ) : null}
      {error ? (
        <WorkspaceState palette={colors} title={error} tone="error" />
      ) : null}
      {entries.map(entry => (
        <WorkspacePanel
          key={entry.id}
          palette={colors}
          style={{ backgroundColor: colors.background }}
        >
          <View style={s.heading}>
            <Text style={[s.entryTitle, { color: colors.text }]}>
              {entry.title}
            </Text>
            <Text style={[s.name, { color: colors.text }]}>
              {entry.amount > 0 ? '+' : ''}
              {entry.amount.toLocaleString(
                language === 'zh' ? 'zh-CN' : 'en-US',
              )}
            </Text>
          </View>
          {entry.description ? (
            <Text style={[s.body, { color: colors.secondaryText }]}>
              {entry.description}
            </Text>
          ) : null}
          <Text style={[s.body, { color: colors.secondaryText }]}>
            {Number.isNaN(Date.parse(entry.createdAt))
              ? textFor(language, '时间未知', 'Time unavailable')
              : new Date(entry.createdAt).toLocaleString(
                  language === 'zh' ? 'zh-CN' : 'en-US',
                )}
          </Text>
        </WorkspacePanel>
      ))}
      {!loading && !error && !entries.length ? (
        <WorkspaceState
          palette={colors}
          title={textFor(language, '暂无妙点流水', 'No transactions yet')}
        />
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  panel: workspaceStyles.content,
  name: workspaceTokens.typography.title,
  entryTitle: { ...workspaceTokens.typography.title, flex: 1 },
  body: workspaceTokens.typography.caption,
  amount: { fontSize: 29, fontWeight: '700' },
  balance: {
    borderRadius: workspaceTokens.radius.panel,
    padding: workspaceTokens.space.lg,
    gap: workspaceTokens.space.sm,
  },
  balanceLabel: { opacity: 0.7 },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: workspaceTokens.space.md,
  },
});
