import {
  Box,
  Clapperboard,
  FileText,
  Images,
  Sparkles,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { StationContentDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { StationMetricBox } from './StationMetricBox';
import { StationPageHeading } from './StationPageHeading';
import { resolveStationColors } from './stationTheme';

type OutcomeFilter = 'all' | 'site' | 'comic' | 'video' | 'outfit';

export function StationOutcomesPanel({
  language,
  palette,
  stationContent,
}: {
  language: Language;
  palette: Palette;
  stationContent: StationContentDTO;
}) {
  const [filter, setFilter] = useState<OutcomeFilter>('all');
  const colors = resolveStationColors(palette);
  const outcomes = useMemo(
    () => [
      ...stationContent.siteDrafts.map(item => ({
        id: `site-${item.id}`,
        kind: 'site' as const,
        title:
          item.draft.title || textFor(language, '小站方案', 'Station plan'),
        summary: item.draft.summary || item.prompt,
        createdAt: item.createdAt,
        Icon: FileText,
      })),
      ...stationContent.comicDiaries.map(item => ({
        id: `comic-${item.id}`,
        kind: 'comic' as const,
        title: item.title,
        summary: item.summary || item.prompt,
        createdAt: item.createdAt,
        Icon: Images,
      })),
      ...stationContent.videoDrafts.map(item => ({
        id: `video-${item.id}`,
        kind: 'video' as const,
        title: item.title,
        summary: item.summary || item.prompt,
        createdAt: item.createdAt,
        Icon: Clapperboard,
      })),
      ...stationContent.outfits.map(item => ({
        id: `outfit-${item.id}`,
        kind: 'outfit' as const,
        title: item.title,
        summary: item.note,
        createdAt: item.createdAt,
        Icon: Box,
      })),
    ],
    [language, stationContent],
  );
  const visibleOutcomes =
    filter === 'all' ? outcomes : outcomes.filter(item => item.kind === filter);
  const generatedCount =
    stationContent.comicDiaries.length +
    stationContent.siteDrafts.length +
    stationContent.videoDrafts.length;

  return (
    <View style={styles.stationPanelStack}>
      <StationPageHeading
        detail={textFor(language, '创作与沉淀', 'Work and archive')}
        palette={palette}
        title={textFor(language, '我的成果', 'My Outcomes')}
        watermark="OUTCOMES"
      />
      <View
        style={[
          styles.stationOutcomeHero,
          !colors.isLight && { backgroundColor: colors.soft },
        ]}
      >
        <View style={styles.stationOutcomeHeroCopy}>
          <Text
            style={[styles.stationOutcomeHeroLabel, { color: colors.text }]}
          >
            {textFor(language, '累计成果', 'Total outcomes')}
          </Text>
          <Text
            style={[styles.stationOutcomeHeroValue, { color: colors.accent }]}
          >
            {outcomes.length}
          </Text>
          <View style={styles.stationOutcomeHeroTrend}>
            <Sparkles color={colors.accent} size={14} strokeWidth={2.2} />
            <Text
              style={[
                styles.stationOutcomeHeroTrendText,
                { color: colors.secondaryText },
              ]}
            >
              {textFor(
                language,
                '均来自真实创作记录',
                'Built from real records',
              )}
            </Text>
          </View>
        </View>
        <View style={styles.stationOutcomeHeroMark}>
          <AwardMark />
        </View>
      </View>
      <View
        style={[
          styles.stationOutcomeMetrics,
          { backgroundColor: colors.surface },
        ]}
      >
        <StationMetricBox
          label={textFor(language, '生活动态', 'Life posts')}
          palette={palette}
          value={stationContent.posts.length}
        />
        <StationMetricBox
          label={textFor(language, 'AI 产出', 'AI outputs')}
          palette={palette}
          value={generatedCount}
        />
        <StationMetricBox
          label={textFor(language, '形象穿搭', 'Outfits')}
          palette={palette}
          value={stationContent.outfits.length}
        />
      </View>

      <View style={styles.stationOutcomeSectionHead}>
        <Text style={[styles.stationSectionTitle, { color: colors.text }]}>
          {textFor(language, '精选成果', 'Selected outcomes')}
        </Text>
        <Text style={[styles.stationSectionDetail, { color: colors.accent }]}>
          {textFor(
            language,
            `${outcomes.length} 项`,
            `${outcomes.length} items`,
          )}
        </Text>
      </View>
      <View style={styles.stationOutcomeFilters}>
        {outcomeFilters(language).map(item => (
          <Pressable
            accessibilityRole="button"
            key={item.value}
            onPress={() => setFilter(item.value)}
            style={[
              styles.stationOutcomeFilter,
              { backgroundColor: colors.surface },
              filter === item.value && styles.stationOutcomeFilterActive,
            ]}
          >
            <Text
              style={[
                styles.stationOutcomeFilterText,
                filter === item.value && styles.stationOutcomeFilterTextActive,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {visibleOutcomes.length ? (
        <View style={styles.stationOutcomeGrid}>
          {visibleOutcomes.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.stationOutcomeCard,
                { backgroundColor: colors.surface },
                index === 0 && styles.stationOutcomeCardFeatured,
              ]}
            >
              <View
                style={[
                  styles.stationOutcomeVisual,
                  index % 2
                    ? styles.stationOutcomeVisualRose
                    : styles.stationOutcomeVisualBlue,
                ]}
              >
                <item.Icon color="#2012D9" size={32} strokeWidth={1.6} />
              </View>
              <Text
                style={[
                  styles.stationOutcomeKind,
                  { color: colors.secondaryText },
                ]}
              >
                {outcomeKindLabel(language, item.kind)}
              </Text>
              <Text
                numberOfLines={2}
                style={[styles.stationOutcomeTitle, { color: colors.text }]}
              >
                {item.title}
              </Text>
              {item.summary ? (
                <Text
                  numberOfLines={2}
                  style={[
                    styles.stationOutcomeSummary,
                    { color: colors.secondaryText },
                  ]}
                >
                  {item.summary}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <View
          style={[
            styles.stationOutcomeEmpty,
            { backgroundColor: colors.surface },
          ]}
        >
          <Text
            style={[styles.stationOutcomeEmptyTitle, { color: colors.text }]}
          >
            {textFor(language, '暂无成果', 'No outcomes yet')}
          </Text>
          <Text
            style={[
              styles.stationOutcomeEmptyBody,
              { color: colors.secondaryText },
            ]}
          >
            {textFor(
              language,
              '完成并保存的小站方案、漫画、视频和穿搭会展示在这里。',
              'Saved station plans, comics, videos, and outfits appear here.',
            )}
          </Text>
        </View>
      )}
    </View>
  );
}

function AwardMark() {
  return (
    <View style={styles.stationOutcomeAwardOuter}>
      <View style={styles.stationOutcomeAwardInner}>
        <Sparkles color="#FFFFFF" size={28} strokeWidth={2.2} />
      </View>
    </View>
  );
}

function outcomeFilters(
  language: Language,
): Array<{ label: string; value: OutcomeFilter }> {
  return [
    { label: textFor(language, '全部', 'All'), value: 'all' },
    { label: textFor(language, '小站', 'Station'), value: 'site' },
    { label: textFor(language, '漫画', 'Comic'), value: 'comic' },
    { label: textFor(language, '视频', 'Video'), value: 'video' },
    { label: textFor(language, '形象', 'Avatar'), value: 'outfit' },
  ];
}

function outcomeKindLabel(
  language: Language,
  kind: Exclude<OutcomeFilter, 'all'>,
) {
  const labels = {
    site: textFor(language, '小站方案', 'Station plan'),
    comic: textFor(language, '漫画日记', 'Comic diary'),
    video: textFor(language, '视频草稿', 'Video draft'),
    outfit: textFor(language, '形象穿搭', 'Avatar outfit'),
  };
  return labels[kind];
}
