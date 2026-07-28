import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { contactIconAssets, pointIconAssets } from '../../assets/icons';
import { MiaoPointLedgerEntryDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';

export function MiaoPointsScreen({
  palette,
  language,
  isDark,
  miaoPoints,
  onBack,
  onLoadEntries,
}: {
  palette: Palette;
  language: Language;
  isDark: boolean;
  miaoPoints: number;
  onBack: () => void;
  onLoadEntries: () => Promise<MiaoPointLedgerEntryDTO[]>;
}) {
  const [entries, setEntries] = useState<MiaoPointLedgerEntryDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [contentWidth, setContentWidth] = useState(0);
  const requestIdRef = useRef(0);
  const heroWidth = Math.max(contentWidth - 16, 0);
  const pageBackgroundColor = isDark ? palette.background : '#F8F7FD';
  const surfaceColor = isDark ? palette.surface : '#FFFFFF';
  const textColor = isDark ? palette.text : '#000000';
  const secondaryTextColor = isDark
    ? palette.secondaryText
    : 'rgba(0,0,0,0.60)';
  const accentColor = isDark ? palette.mint : '#2012D9';

  const loadEntries = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setErrorMessage('');
    try {
      const nextEntries = await onLoadEntries();
      if (requestId === requestIdRef.current) {
        setEntries(nextEntries);
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : textFor(language, '加载失败', 'Unable to load'),
        );
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [language, onLoadEntries]);

  useEffect(() => {
    loadEntries().catch(() => undefined);
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadEntries]);

  const handleContentLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setContentWidth(currentWidth =>
      Math.abs(currentWidth - nextWidth) < 0.5 ? currentWidth : nextWidth,
    );
  }, []);

  return (
    <View
      style={[
        styles.miaoPointsScreen,
        { backgroundColor: pageBackgroundColor },
      ]}
    >
      {!isDark ? (
        <View pointerEvents="none" style={styles.miaoPointsBackground}>
          <Svg height="100%" width="100%">
            <Defs>
              <SvgLinearGradient
                id="miaoPointsBackground"
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <Stop offset="0" stopColor="#F8F7FD" />
                <Stop offset="0.62" stopColor="#FFFFFF" />
                <Stop offset="1" stopColor="#F8F7FD" />
              </SvgLinearGradient>
            </Defs>
            <Rect
              fill="url(#miaoPointsBackground)"
              height="100%"
              width="100%"
            />
          </Svg>
        </View>
      ) : null}

      <View
        style={[
          styles.miaoPointsHeader,
          { backgroundColor: surfaceColor },
        ]}
      >
        <Pressable
          accessibilityLabel={textFor(language, '返回', 'Back')}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={styles.miaoPointsBackButton}
        >
          <Image
            source={contactIconAssets.back}
            style={styles.miaoPointsBackIcon}
          />
        </Pressable>
        <Text style={[styles.miaoPointsHeaderTitle, { color: textColor }]}>
          {textFor(language, '妙点明细', 'Point details')}
        </Text>
        <View style={styles.miaoPointsHeaderSpacer} />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            colors={[accentColor]}
            onRefresh={() => loadEntries().catch(() => undefined)}
            refreshing={isLoading && entries.length > 0}
            tintColor={accentColor}
          />
        }
        contentContainerStyle={styles.miaoPointsContent}
        onLayout={handleContentLayout}
      >
        {heroWidth > 0 ? (
          <View
            style={[
              styles.miaoPointsHero,
              { height: heroWidth / 2.4, width: heroWidth },
            ]}
          >
            <Image
              resizeMode="contain"
              source={pointIconAssets.banner}
              style={styles.miaoPointsHeroImage}
            />
            <View style={styles.miaoPointsHeroCopy}>
              <Text style={styles.miaoPointsHeroLabel}>
                {textFor(language, '当前妙点', 'Current points')}
              </Text>
              <Text style={styles.miaoPointsHeroValue}>{miaoPoints}</Text>
              <Text style={styles.miaoPointsHeroDescription}>
                {textFor(
                  language,
                  '用于记录小站活跃、可信互动和 Agent 协作贡献。',
                  'Tracks station activity, trusted interactions, and Agent contributions.',
                )}
              </Text>
            </View>
          </View>
        ) : null}

        {isLoading && entries.length === 0 ? (
          <View style={styles.miaoPointsState}>
            <ActivityIndicator color={accentColor} />
          </View>
        ) : errorMessage ? (
          <View
            style={[styles.miaoPointsState, { backgroundColor: surfaceColor }]}
          >
            <Text style={[styles.miaoPointsStateTitle, { color: textColor }]}>
              {textFor(
                language,
                '妙点明细加载失败',
                'Unable to load point details',
              )}
            </Text>
            <Text
              style={[
                styles.miaoPointsStateMessage,
                { color: secondaryTextColor },
              ]}
            >
              {errorMessage}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => loadEntries().catch(() => undefined)}
              style={[
                styles.miaoPointsRetryButton,
                { backgroundColor: accentColor },
              ]}
            >
              <Text style={styles.miaoPointsRetryText}>
                {textFor(language, '重试', 'Retry')}
              </Text>
            </Pressable>
          </View>
        ) : entries.length === 0 ? (
          <View
            style={[
              styles.miaoPointsEmptyRow,
              { backgroundColor: surfaceColor },
            ]}
          >
            <ImageBackground
              source={pointIconAssets.increase}
              style={styles.miaoPointAmountBadge}
            >
              <Text style={styles.miaoPointsEmptyAmount}>--</Text>
            </ImageBackground>
            <View style={styles.miaoPointsEmptyCopy}>
              <Text
                style={[styles.miaoPointsEmptyTitle, { color: textColor }]}
              >
                {textFor(language, '暂无妙点明细', 'No point activity yet')}
              </Text>
              <Text
                style={[
                  styles.miaoPointsEmptyMessage,
                  { color: secondaryTextColor },
                ]}
              >
                {textFor(
                  language,
                  '妙点变化会显示在这里',
                  'Point activity will appear here',
                )}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.miaoPointsList}>
            {entries.map(entry => (
              <PointLedgerRow
                entry={entry}
                isDark={isDark}
                key={entry.id}
                language={language}
                palette={palette}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function PointLedgerRow({
  entry,
  palette,
  language,
  isDark,
}: {
  entry: MiaoPointLedgerEntryDTO;
  palette: Palette;
  language: Language;
  isDark: boolean;
}) {
  const isIncrease = entry.amount > 0;
  const textColor = isDark ? palette.text : '#000000';
  const secondaryTextColor = isDark
    ? palette.secondaryText
    : 'rgba(0,0,0,0.60)';
  const surfaceColor = isDark ? palette.surface : '#FFFFFF';
  const amountColor = isIncrease ? '#2012D9' : '#D94A61';

  return (
    <View style={[styles.miaoPointRow, { backgroundColor: surfaceColor }]}>
      <ImageBackground
        source={
          isIncrease ? pointIconAssets.increase : pointIconAssets.decrease
        }
        style={styles.miaoPointAmountBadge}
      >
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.78}
          numberOfLines={1}
          style={[styles.miaoPointAmount, { color: amountColor }]}
        >
          {formatPointAmount(entry.amount)}
        </Text>
      </ImageBackground>
      <View style={styles.miaoPointRowCopy}>
        <Text
          numberOfLines={1}
          style={[styles.miaoPointTitle, { color: textColor }]}
        >
          {entry.title}
        </Text>
        {entry.description ? (
          <Text
            numberOfLines={1}
            style={[styles.miaoPointDescription, { color: secondaryTextColor }]}
          >
            {entry.description}
          </Text>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        style={[styles.miaoPointTime, { color: secondaryTextColor }]}
      >
        {formatPointTime(entry.createdAt, language)}
      </Text>
    </View>
  );
}

const formatPointAmount = (amount: number) =>
  amount > 0 ? `+${amount}` : String(amount);

function formatPointTime(value: string, language: Language) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayDifference = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86400000,
  );
  const time = date.toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  if (dayDifference === 0) {
    return textFor(language, `今天 ${time}`, `Today ${time}`);
  }
  if (dayDifference === 1) {
    return textFor(language, `昨天 ${time}`, `Yesterday ${time}`);
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
  return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
