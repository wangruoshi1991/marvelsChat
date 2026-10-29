import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Sparkles,
} from 'lucide-react-native';
import { NoticeDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import {
  WorkspaceState,
  workspaceStyles,
  workspaceTokens,
} from '../../shared/workspaceUi';
import { Language } from '../session/sessionTypes';
import { secondFloorAccent, secondFloorPalette } from './secondFloorTheme';
import { isV6Palette } from '../../shared/v6Palette';
import { isXunPalette } from '../../shared/xunPalette';
import { SecondFloorXunSourceIcon } from './SecondFloorSourceIcon';
import { SecondFloorPageScrollProps } from './secondFloorScroll';

export function SecondFloorInformation({
  header,
  palette,
  language,
  notices,
  unreadCount,
  onOpenNotices,
  scrollProps,
}: {
  header?: React.ReactNode;
  palette: Palette;
  language: Language;
  notices: NoticeDTO[];
  unreadCount: number;
  onOpenNotices: () => void;
  scrollProps?: SecondFloorPageScrollProps;
}) {
  const colors = secondFloorPalette(palette);
  const v6 = isV6Palette(colors);
  const xun = isXunPalette(colors);
  const accent = secondFloorAccent(colors);
  const [expanded, setExpanded] = useState<string | null>(null);
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
          {textFor(language, '信息海', 'Information')}
        </Text>
        {!xun ? (
          <Text style={[s.body, { color: colors.secondaryText }]}>
            {textFor(
              language,
              '汇集你已接入的信息，并保留来源与处理状态。',
              'Review connected information with its source and status.',
            )}
          </Text>
        ) : null}
      </View>
      {xun ? (
        <View style={s.roomNotice}>
          <Sparkles
            accessible={false}
            color="#487879"
            size={12}
            strokeWidth={1.8}
          />
          <Text style={s.roomNoticeText}>
            {textFor(
              language,
              '汇集信息，筛出价值。\n来源信息由你掌控，AI 整理能力尚未开放。',
              'Bring information together and find its value.\nYou control each source. AI organization is not available yet.',
            )}
          </Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={textFor(
          language,
          `查看应用通知，${unreadCount} 条未读`,
          `View app notices, ${unreadCount} unread`,
        )}
        onPress={onOpenNotices}
        style={[
          s.overview,
          {
            backgroundColor: v6 || xun ? colors.surface : colors.text,
            borderColor: colors.border,
          },
          xun && s.cardXun,
        ]}
      >
        <Bell
          accessible={false}
          size={20}
          color={v6 || xun ? accent : colors.surface}
        />
        <View style={s.copy}>
          <Text
            style={[
              s.heading,
              xun && s.headingXun,
              { color: v6 || xun ? colors.text : colors.surface },
            ]}
          >
            {textFor(language, '妙讯应用通知', 'Miao app notices')}
          </Text>
          <Text
            style={[
              s.overviewDetail,
              xun && s.metaXun,
              { color: v6 || xun ? colors.secondaryText : colors.surface },
            ]}
          >
            {textFor(
              language,
              `${unreadCount} 条未读`,
              `${unreadCount} unread`,
            )}
          </Text>
        </View>
        <ChevronRight
          accessible={false}
          size={18}
          color={v6 || xun ? colors.secondaryText : colors.surface}
        />
      </Pressable>
      {notices.map(notice => {
        const isExpanded = expanded === notice.id;
        return (
          <View
            key={notice.id}
            style={[
              s.notice,
              xun && s.cardXun,
              {
                backgroundColor: v6 || xun ? colors.surface : colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={textFor(
                language,
                `${notice.title}，${notice.readAt ? '已读' : '未读'}`,
                `${notice.title}, ${notice.readAt ? 'Read' : 'Unread'}`,
              )}
              accessibilityState={{ expanded: isExpanded }}
              accessibilityHint={textFor(
                language,
                isExpanded ? '收起通知正文' : '展开通知正文',
                isExpanded
                  ? 'Collapse notice content'
                  : 'Expand notice content',
              )}
              onPress={() => setExpanded(isExpanded ? null : notice.id)}
              style={s.row}
            >
              {xun ? (
                <SecondFloorXunSourceIcon>
                  <Bell
                    accessible={false}
                    color="#f6f7fa"
                    size={19}
                    strokeWidth={1.8}
                  />
                </SecondFloorXunSourceIcon>
              ) : (
                <View style={[s.source, { backgroundColor: colors.soft }]}>
                  <Text style={[s.sourceLabel, { color: colors.text }]}>
                    {textFor(language, '妙讯', 'Miao')}
                  </Text>
                </View>
              )}
              <View style={s.copy}>
                <Text
                  numberOfLines={2}
                  style={[
                    s.heading,
                    xun && s.headingXun,
                    { color: colors.text },
                  ]}
                >
                  {notice.title}
                </Text>
                {!isExpanded ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      s.body,
                      xun && s.metaXun,
                      { color: colors.secondaryText },
                    ]}
                  >
                    {notice.body}
                  </Text>
                ) : null}
              </View>
              <View style={s.statusGroup}>
                <Text
                  ellipsizeMode="tail"
                  numberOfLines={1}
                  style={[
                    s.status,
                    xun && s.statusXun,
                    {
                      color:
                        (v6 || xun) && !notice.readAt
                          ? xun
                            ? '#007c82'
                            : colors.mint
                          : colors.secondaryText,
                    },
                    xun &&
                      (notice.readAt
                        ? { backgroundColor: colors.soft }
                        : s.statusUnreadXun),
                  ]}
                >
                  {textFor(
                    language,
                    notice.readAt ? '已读' : '未读',
                    notice.readAt ? 'Read' : 'Unread',
                  )}
                </Text>
                {isExpanded ? (
                  <ChevronUp
                    accessible={false}
                    size={14}
                    color={colors.secondaryText}
                  />
                ) : (
                  <ChevronDown
                    accessible={false}
                    size={14}
                    color={colors.secondaryText}
                  />
                )}
              </View>
            </Pressable>
            {isExpanded ? (
              <View
                style={[
                  s.detail,
                  xun && s.detailXun,
                  { borderColor: colors.border },
                ]}
              >
                {xun ? (
                  <View style={s.detailLabelRow}>
                    <Sparkles
                      accessible={false}
                      color="#007c82"
                      size={12}
                      strokeWidth={1.8}
                    />
                    <Text style={s.detailLabel}>
                      {textFor(language, '通知详情', 'NOTICE DETAILS')}
                    </Text>
                  </View>
                ) : null}
                <Text
                  selectable
                  style={[
                    s.body,
                    xun && s.expandedBodyXun,
                    { color: colors.text },
                  ]}
                >
                  {notice.body}
                </Text>
                {notice.createdAt &&
                !Number.isNaN(Date.parse(notice.createdAt)) ? (
                  <Text
                    style={[
                      s.body,
                      xun && s.metaXun,
                      { color: colors.secondaryText },
                    ]}
                  >
                    {new Date(notice.createdAt).toLocaleString(
                      language === 'zh' ? 'zh-CN' : 'en-US',
                    )}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
      {!notices.length ? (
        <WorkspaceState
          palette={colors}
          title={textFor(language, '暂无应用通知', 'No app notices yet')}
        />
      ) : null}
      <Text
        style={[
          s.body,
          xun && s.metaXun,
          s.availability,
          { color: colors.secondaryText },
        ]}
      >
        {textFor(
          language,
          '短信、邮件、微信和通话尚未接入，AI 信息整理尚未开放。',
          'SMS, email, WeChat and calls are not connected. AI inbox processing is not available yet.',
        )}
      </Text>
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
  pageHeader: { gap: workspaceTokens.space.xs, paddingBottom: 2 },
  pageTitle: { fontSize: 23, lineHeight: 29, fontWeight: '700' },
  overview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: workspaceTokens.space.sm,
    padding: workspaceTokens.space.md,
    borderRadius: workspaceTokens.radius.panel,
    minHeight: 62,
  },
  overviewDetail: {
    ...workspaceTokens.typography.caption,
    opacity: 0.7,
    marginTop: workspaceTokens.space.xs,
  },
  roomNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#e7f6f5',
    borderColor: '#c9e8e5',
    borderWidth: 1,
    padding: 13,
    borderRadius: 12,
  },
  roomNoticeText: {
    flex: 1,
    color: '#487879',
    fontSize: 11,
    lineHeight: 19,
  },
  cardXun: {
    borderWidth: 1,
    borderRadius: 23,
    paddingHorizontal: 17,
    paddingVertical: 20,
    shadowColor: '#263a50',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 1,
  },
  copy: { flex: 1, minWidth: 0, gap: workspaceTokens.space.xs },
  heading: workspaceTokens.typography.title,
  headingXun: { fontSize: 13, lineHeight: 22, fontWeight: '600' },
  body: workspaceTokens.typography.caption,
  expandedBodyXun: { fontSize: 13, lineHeight: 22 },
  metaXun: { fontSize: 11, lineHeight: 19 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: workspaceTokens.space.sm,
  },
  notice: { ...workspaceStyles.panel, minHeight: workspaceTokens.minTouch },
  source: {
    width: 45,
    height: 45,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceLabel: { ...workspaceTokens.typography.caption, fontWeight: '600' },
  statusGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: workspaceTokens.space.xs,
    maxWidth: '28%',
  },
  status: {
    backgroundColor: 'transparent',
    ...workspaceTokens.typography.caption,
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'right',
  },
  statusXun: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 10,
    lineHeight: 14,
  },
  statusUnreadXun: { backgroundColor: '#e0f5f3' },
  detail: {
    borderTopWidth: 1,
    marginTop: workspaceTokens.space.sm,
    paddingTop: workspaceTokens.space.sm,
    gap: workspaceTokens.space.sm,
  },
  detailXun: { marginTop: 17, paddingTop: 17 },
  detailLabel: { color: '#007c82', fontSize: 11, lineHeight: 19 },
  detailLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  availability: { marginTop: workspaceTokens.space.sm },
});
