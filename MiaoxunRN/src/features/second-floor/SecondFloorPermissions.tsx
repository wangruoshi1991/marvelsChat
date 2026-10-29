import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, ShieldCheck } from 'lucide-react-native';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { workspaceStyles, workspaceTokens } from '../../shared/workspaceUi';
import { Language } from '../session/useMiaoxunSession';
import { secondFloorAccent, secondFloorPalette } from './secondFloorTheme';
import { isV6Palette } from '../../shared/v6Palette';
import { isXunPalette } from '../../shared/xunPalette';
import { SecondFloorPageScrollProps } from './secondFloorScroll';

export function SecondFloorPermissions({
  header,
  palette,
  language,
  onOpenSettings,
  scrollProps,
}: {
  header?: React.ReactNode;
  palette: Palette;
  language: Language;
  onOpenSettings: () => void;
  scrollProps?: SecondFloorPageScrollProps;
}) {
  const colors = secondFloorPalette(palette);
  const v6 = isV6Palette(colors);
  const xun = isXunPalette(colors);
  const accent = secondFloorAccent(colors);
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
          {textFor(language, '权限', 'Permissions')}
        </Text>
        {!xun ? (
          <Text style={[s.body, { color: colors.secondaryText }]}>
            {textFor(
              language,
              '查看当前可管理的账号与隐私范围。',
              'Review the account and privacy controls available now.',
            )}
          </Text>
        ) : null}
      </View>
      {xun ? (
        <View style={s.roomNotice}>
          <Text style={s.roomNoticeText}>
            {textFor(
              language,
              '⚿  你的信息，由你决定。\n你可以随时查看当前可管理的授权范围。',
              '⚿  Your information is yours to control.\nReview the permissions currently available at any time.',
            )}
          </Text>
        </View>
      ) : null}
      <View
        style={[
          s.overview,
          {
            backgroundColor: v6 || xun ? colors.surface : colors.text,
            borderColor: colors.border,
          },
          xun && s.cardXun,
        ]}
      >
        <ShieldCheck size={26} color={v6 || xun ? accent : colors.surface} />
        <View style={s.copy}>
          <Text
            style={[
              s.heading,
              xun && s.headingXun,
              { color: v6 || xun ? colors.text : colors.surface },
            ]}
          >
            {textFor(language, '账号与隐私', 'Account & privacy')}
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
              '管理个人资料的展示范围。',
              'Control what appears on your profile.',
            )}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onOpenSettings}
        style={[
          s.settings,
          (v6 || xun) && { backgroundColor: colors.surface },
          { borderColor: colors.border },
          xun && s.cardXun,
        ]}
      >
        <Text style={[s.heading, xun && s.headingXun, { color: colors.text }]}>
          {textFor(language, '打开账号设置', 'Open account settings')}
        </Text>
        <ChevronRight size={17} color={colors.secondaryText} />
      </Pressable>
      <View style={[s.section, xun && s.sectionXun]}>
        <Text
          style={[
            s.sectionTitle,
            xun && s.sectionTitleXun,
            { color: colors.text },
          ]}
        >
          {textFor(language, '第三方服务授权', 'Third-party services')}
        </Text>
        {[
          ['微信 · 消息与联系人', 'WeChat · messages and contacts'],
          ['邮箱 · 邮件读取与整理', 'Email · reading and organization'],
          ['日历 · 日程读取与提醒', 'Calendar · schedules and reminders'],
        ].map(([label, english]) => (
          <View
            key={label}
            style={[
              s.serviceCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
              xun && s.cardXun,
            ]}
          >
            <View style={s.serviceCopy}>
              <Text
                style={[s.heading, xun && s.headingXun, { color: colors.text }]}
              >
                {textFor(language, label, english)}
              </Text>
              <Text
                style={[
                  s.body,
                  xun && s.metaXun,
                  { color: colors.secondaryText },
                ]}
              >
                {textFor(
                  language,
                  '尚未接入 · 暂不可管理',
                  'Not connected · unavailable',
                )}
              </Text>
            </View>
            <View
              accessible
              accessibilityRole="switch"
              accessibilityLabel={textFor(language, label, english)}
              accessibilityState={{ disabled: true, checked: false }}
              style={s.disabledSwitch}
            >
              <View style={s.disabledSwitchKnob} />
            </View>
          </View>
        ))}
        <Text
          style={[
            s.unavailableHint,
            xun && s.metaXun,
            { color: colors.secondaryText },
          ]}
        >
          {textFor(
            language,
            '接入后会在这里展示真实授权范围和撤回入口。',
            'Connected scopes and revoke actions will appear here.',
          )}
        </Text>
      </View>
      <View style={[s.section, xun && s.sectionXun]}>
        <Text
          style={[
            s.sectionTitle,
            xun && s.sectionTitleXun,
            { color: colors.text },
          ]}
        >
          {textFor(language, '支付权限', 'Payment permissions')}
        </Text>
        <View
          style={[
            s.paymentCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
            xun && s.cardXun,
          ]}
        >
          <View style={s.paymentRow}>
            <View style={s.serviceCopy}>
              <Text
                style={[s.heading, xun && s.headingXun, { color: colors.text }]}
              >
                {textFor(language, '单次支付限额', 'Single payment limit')}
              </Text>
              <Text
                style={[
                  s.body,
                  xun && s.metaXun,
                  { color: colors.secondaryText },
                ]}
              >
                {textFor(language, '支付能力尚未开放', 'Payments unavailable')}
              </Text>
            </View>
            <Text style={[s.limitValue, { color: colors.secondaryText }]}>
              —
            </Text>
          </View>
          <View style={s.disabledSlider} accessibilityElementsHidden>
            <View style={s.disabledSliderTrack} />
            <View style={s.disabledSliderThumb} />
          </View>
          <Text
            style={[s.body, xun && s.metaXun, { color: colors.secondaryText }]}
          >
            {textFor(
              language,
              '接入支付服务后，超过限额时必须由你单独确认。',
              'After payments are connected, amounts above the limit will require your confirmation.',
            )}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textFor(language, '保存设置', 'Save settings')}
            accessibilityState={{ disabled: true }}
            disabled
            style={[s.saveButton, { borderColor: colors.border }]}
          >
            <Text style={[s.saveButtonLabel, { color: colors.secondaryText }]}>
              {textFor(language, '保存设置', 'Save settings')}
            </Text>
          </Pressable>
        </View>
      </View>
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
    minHeight: 68,
  },
  overviewDetail: {
    ...workspaceTokens.typography.caption,
    opacity: 0.7,
    marginTop: workspaceTokens.space.xs,
  },
  roomNotice: {
    backgroundColor: '#e7f6f5',
    borderColor: '#c9e8e5',
    borderWidth: 1,
    padding: 13,
    borderRadius: 12,
  },
  roomNoticeText: { color: '#487879', fontSize: 11, lineHeight: 19 },
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
  metaXun: { fontSize: 11, lineHeight: 19 },
  section: {
    gap: workspaceTokens.space.sm,
    marginTop: workspaceTokens.space.sm,
  },
  sectionXun: { gap: 12, marginTop: 12 },
  sectionTitle: { fontSize: 17, lineHeight: 23, fontWeight: '600' },
  sectionTitleXun: { fontSize: 14, lineHeight: 20 },
  serviceCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: workspaceTokens.radius.panel,
    paddingHorizontal: workspaceTokens.space.md,
    paddingVertical: workspaceTokens.space.sm,
    gap: workspaceTokens.space.sm,
  },
  serviceCopy: { flex: 1, minWidth: 0, gap: workspaceTokens.space.xs },
  unavailableHint: { fontSize: 11, lineHeight: 19, paddingHorizontal: 4 },
  disabledSwitch: {
    width: 38,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    paddingHorizontal: 3,
    backgroundColor: '#ccd6e0',
    opacity: 0.95,
  },
  disabledSwitchKnob: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  paymentCard: {
    borderWidth: 1,
    borderRadius: workspaceTokens.radius.panel,
    padding: workspaceTokens.space.md,
    gap: workspaceTokens.space.sm,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: workspaceTokens.space.sm,
  },
  limitValue: { fontSize: 17, lineHeight: 23, fontWeight: '600' },
  disabledSlider: { height: 22, justifyContent: 'center', opacity: 0.65 },
  disabledSliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ccd6e0',
  },
  disabledSliderThumb: {
    position: 'absolute',
    left: '30%',
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    backgroundColor: '#aebdca',
  },
  saveButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 13,
  },
  saveButtonLabel: { fontSize: 13, lineHeight: 20, fontWeight: '600' },
  settings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: workspaceTokens.minTouch,
    paddingHorizontal: workspaceTokens.space.sm,
    borderBottomWidth: 1,
  },
});
