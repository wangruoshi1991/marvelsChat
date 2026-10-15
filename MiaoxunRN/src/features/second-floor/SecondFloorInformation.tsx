import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bell, ChevronDown, ChevronRight } from 'lucide-react-native';
import { NoticeDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import {
  WorkspaceState,
  workspaceStyles,
  workspaceTokens,
} from '../../shared/workspaceUi';
import { Language } from '../session/sessionTypes';
import { workspacePalette } from '../../shared/workspacePalette';

export function SecondFloorInformation({
  palette,
  language,
  notices,
  unreadCount,
  onOpenNotices,
}: {
  palette: Palette;
  language: Language;
  notices: NoticeDTO[];
  unreadCount: number;
  onOpenNotices: () => void;
}) {
  const colors = workspacePalette(palette);
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.panel}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={textFor(
          language,
          '查看应用通知',
          'View app notices',
        )}
        onPress={onOpenNotices}
        style={[s.overview, { backgroundColor: colors.text }]}
      >
        <Bell size={20} color={colors.surface} />
        <View style={s.copy}>
          <Text style={[s.heading, { color: colors.surface }]}>
            {textFor(language, '妙讯应用通知', 'Miao app notices')}
          </Text>
          <Text style={[s.overviewDetail, { color: colors.surface }]}>
            {textFor(
              language,
              `${unreadCount} 条未读`,
              `${unreadCount} unread`,
            )}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.surface} />
      </Pressable>
      {notices.map(notice => {
        const isExpanded = expanded === notice.id;
        return (
          <Pressable
            key={notice.id}
            accessibilityRole="button"
            accessibilityLabel={notice.title}
            accessibilityState={{ expanded: isExpanded }}
            onPress={() => setExpanded(isExpanded ? null : notice.id)}
            style={[
              s.notice,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={s.row}>
              <View style={[s.source, { backgroundColor: colors.soft }]}>
                <Text style={[s.sourceLabel, { color: colors.text }]}>
                  {textFor(language, '妙讯', 'Miao')}
                </Text>
              </View>
              <View style={s.copy}>
                <Text
                  numberOfLines={2}
                  style={[s.heading, { color: colors.text }]}
                >
                  {notice.title}
                </Text>
                {!isExpanded ? (
                  <Text
                    numberOfLines={1}
                    style={[s.body, { color: colors.secondaryText }]}
                  >
                    {notice.body}
                  </Text>
                ) : null}
              </View>
              <Text style={[s.status, { color: colors.secondaryText }]}>
                {textFor(
                  language,
                  notice.readAt ? '已读' : '未读',
                  notice.readAt ? 'Read' : 'Unread',
                )}
              </Text>
              <ChevronDown size={14} color={colors.secondaryText} />
            </View>
            {isExpanded ? (
              <View style={[s.detail, { borderColor: colors.border }]}>
                <Text selectable style={[s.body, { color: colors.text }]}>
                  {notice.body}
                </Text>
                {notice.createdAt &&
                !Number.isNaN(Date.parse(notice.createdAt)) ? (
                  <Text style={[s.body, { color: colors.secondaryText }]}>
                    {new Date(notice.createdAt).toLocaleString(
                      language === 'zh' ? 'zh-CN' : 'en-US',
                    )}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </Pressable>
        );
      })}
      {!notices.length ? (
        <WorkspaceState
          palette={colors}
          title={textFor(language, '暂无应用通知', 'No app notices yet')}
        />
      ) : null}
      <Text style={[s.body, s.availability, { color: colors.secondaryText }]}>
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
  copy: { flex: 1, minWidth: 0, gap: workspaceTokens.space.xs },
  heading: workspaceTokens.typography.title,
  body: workspaceTokens.typography.caption,
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: workspaceTokens.space.sm,
  },
  notice: { ...workspaceStyles.panel, minHeight: workspaceTokens.minTouch },
  source: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceLabel: { ...workspaceTokens.typography.caption, fontWeight: '600' },
  status: workspaceTokens.typography.caption,
  detail: {
    borderTopWidth: 1,
    marginTop: workspaceTokens.space.sm,
    paddingTop: workspaceTokens.space.sm,
    gap: workspaceTokens.space.sm,
  },
  availability: { marginTop: workspaceTokens.space.sm },
});
