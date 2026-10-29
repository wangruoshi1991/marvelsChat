import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
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
import { secondFloorAccent, secondFloorPalette } from './secondFloorTheme';
import { isV6Palette } from '../../shared/v6Palette';
import { isXunPalette } from '../../shared/xunPalette';
import { Language } from '../session/sessionTypes';
import { SecondFloorPageScrollProps } from './secondFloorScroll';

export function SecondFloorAssets({
  header,
  palette,
  language,
  miaoPoints,
  onLoadEntries,
  scrollProps,
}: {
  header?: React.ReactNode;
  palette: Palette;
  language: Language;
  miaoPoints: number;
  onLoadEntries: () => Promise<MiaoPointLedgerEntryDTO[]>;
  scrollProps?: SecondFloorPageScrollProps;
}) {
  const colors = secondFloorPalette(palette);
  const v6 = isV6Palette(colors);
  const xun = isXunPalette(colors);
  const accent = secondFloorAccent(colors);
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
          {textFor(language, '资产', 'Assets')}
        </Text>
        {!xun ? (
          <Text style={[s.pageHint, { color: colors.secondaryText }]}>
            {textFor(
              language,
              '查看妙点余额与真实流水。',
              'View your Miao points and transactions.',
            )}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          s.balance,
          {
            backgroundColor: v6 || xun ? colors.surface : colors.text,
          },
          xun && s.balanceXun,
        ]}
      >
        {xun ? (
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient
                id="assetHeroBase"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <Stop offset="0" stopColor="#e0f5f3" />
                <Stop offset="1" stopColor="#ecf0f8" />
              </LinearGradient>
              <RadialGradient
                id="assetHeroGlow"
                cx="95%"
                cy="0%"
                rx="85%"
                ry="85%"
              >
                <Stop offset="0" stopColor="#00c7cb" stopOpacity={0.13} />
                <Stop offset="1" stopColor="#00c7cb" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect fill="url(#assetHeroBase)" width="100%" height="100%" />
            <Rect fill="url(#assetHeroGlow)" width="100%" height="100%" />
          </Svg>
        ) : null}
        {xun ? (
          <Text
            accessibilityElementsHidden
            pointerEvents="none"
            style={s.balanceDecoration}
          >
            {/* Force text presentation so iOS does not render the symbol as an emoji. */}
            ✳︎
          </Text>
        ) : null}
        <Text
          style={[
            s.balanceLabel,
            {
              color: v6
                ? colors.secondaryText
                : xun
                ? '#748293'
                : colors.surface,
            },
          ]}
        >
          {textFor(language, xun ? '我的妙点' : '妙点余额', 'My Miao points')}
        </Text>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          numberOfLines={1}
          style={[
            s.amount,
            { color: v6 ? colors.mint : xun ? colors.text : colors.surface },
          ]}
        >
          {miaoPoints.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
          {xun ? (
            <Text style={[s.amountUnit, { color: colors.secondaryText }]}>
              {' '}
              点
            </Text>
          ) : null}
        </Text>
        <Text
          style={[
            xun ? s.balanceEcho : s.body,
            {
              color: v6 ? colors.secondaryText : xun ? accent : colors.surface,
            },
          ]}
        >
          {textFor(
            language,
            xun ? '每一个小小行动，都有回响' : '可用妙点',
            xun ? 'Every small action makes a difference' : 'Available points',
          )}
        </Text>
      </View>
      <View style={[s.heading, xun && s.ledgerHeading]}>
        <Text
          accessibilityRole="header"
          style={[s.name, { color: colors.text }]}
        >
          {textFor(language, '最近流水', 'Recent transactions')}
        </Text>
        {xun ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textFor(
              language,
              error ? '重试加载流水' : '刷新流水',
              error ? 'Retry transactions' : 'Refresh transactions',
            )}
            accessibilityState={{ disabled: loading, busy: loading }}
            disabled={loading}
            onPress={load}
            style={({ pressed }) => [
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
                loading ? '加载中' : error ? '重试' : '刷新',
                loading ? 'Loading' : error ? 'Retry' : 'Refresh',
              )}
            </Text>
          </Pressable>
        ) : (
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
        )}
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
      <View style={xun ? s.ledgerList : s.ledgerCards}>
        {entries.map((entry, index) => {
          const content = (
            <>
              <View style={s.heading}>
                <Text style={[s.entryTitle, { color: colors.text }]}>
                  {entry.title}
                </Text>
                <Text
                  style={[
                    s.name,
                    {
                      color:
                        (v6 || xun) && entry.amount > 0
                          ? accent
                          : xun && entry.amount < 0
                          ? colors.secondaryText
                          : colors.text,
                    },
                  ]}
                >
                  {entry.amount > 0 ? '+' : ''}
                  {entry.amount.toLocaleString(
                    language === 'zh' ? 'zh-CN' : 'en-US',
                  )}
                </Text>
              </View>
              {entry.description ? (
                <Text
                  style={[
                    s.body,
                    xun && s.metaXun,
                    { color: colors.secondaryText },
                  ]}
                >
                  {entry.description}
                </Text>
              ) : null}
              <Text
                style={[
                  s.body,
                  xun && s.metaXun,
                  { color: colors.secondaryText },
                ]}
              >
                {Number.isNaN(Date.parse(entry.createdAt))
                  ? textFor(language, '时间未知', 'Time unavailable')
                  : new Date(entry.createdAt).toLocaleString(
                      language === 'zh' ? 'zh-CN' : 'en-US',
                    )}
              </Text>
            </>
          );
          return xun ? (
            <View
              key={entry.id}
              style={[
                s.ledgerRow,
                { borderColor: colors.border },
                index === entries.length - 1 && s.lastLedgerRow,
              ]}
            >
              {content}
            </View>
          ) : (
            <WorkspacePanel
              key={entry.id}
              palette={colors}
              style={{
                backgroundColor: v6 ? colors.surface : colors.background,
              }}
            >
              {content}
            </WorkspacePanel>
          );
        })}
      </View>
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
  panelXun: {
    paddingHorizontal: 17,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
  pageHeader: { gap: 4, paddingBottom: 2 },
  pageTitle: { fontSize: 23, lineHeight: 29, fontWeight: '700' },
  pageHint: { fontSize: 13, lineHeight: 22 },
  name: workspaceTokens.typography.title,
  entryTitle: { ...workspaceTokens.typography.title, flex: 1 },
  body: workspaceTokens.typography.caption,
  metaXun: { fontSize: 11, lineHeight: 19 },
  amount: { fontSize: 49, lineHeight: 55, fontWeight: '700' },
  amountUnit: { fontSize: 13, lineHeight: 22, fontWeight: '400' },
  balance: {
    borderColor: 'transparent',
    borderRadius: 23,
    paddingHorizontal: 20,
    paddingVertical: 23,
    gap: workspaceTokens.space.sm,
    overflow: 'hidden',
  },
  balanceXun: {
    borderColor: '#cce7e7',
    borderWidth: 1,
    shadowColor: '#263a50',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 1,
  },
  balanceDecoration: {
    color: 'rgba(0,143,149,0.09)',
    fontSize: 120,
    fontWeight: '400',
    lineHeight: 120,
    position: 'absolute',
    right: -15,
    top: 0,
  },
  balanceLabel: { fontSize: 13, lineHeight: 22 },
  balanceEcho: { fontSize: 11, lineHeight: 19 },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: workspaceTokens.space.md,
  },
  ledgerHeading: { marginTop: 3 },
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
  ledgerList: { gap: 0 },
  ledgerCards: { gap: workspaceTokens.space.sm },
  ledgerRow: {
    paddingVertical: 17,
    borderBottomWidth: 1,
    gap: 5,
  },
  lastLedgerRow: { borderBottomWidth: 0 },
});
