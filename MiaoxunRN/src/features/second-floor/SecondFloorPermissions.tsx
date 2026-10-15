import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, ShieldCheck } from 'lucide-react-native';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { workspaceStyles, workspaceTokens } from '../../shared/workspaceUi';
import { Language } from '../session/useMiaoxunSession';
import { workspacePalette } from '../../shared/workspacePalette';

export function SecondFloorPermissions({
  palette,
  language,
  onOpenSettings,
}: {
  palette: Palette;
  language: Language;
  onOpenSettings: () => void;
}) {
  const colors = workspacePalette(palette);
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.panel}
    >
      <View style={[s.overview, { backgroundColor: colors.text }]}>
        <ShieldCheck size={26} color={colors.surface} />
        <View style={s.copy}>
          <Text style={[s.heading, { color: colors.surface }]}>
            {textFor(language, '账号与隐私', 'Account & privacy')}
          </Text>
          <Text style={[s.overviewDetail, { color: colors.surface }]}>
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
        style={[s.settings, { borderColor: colors.border }]}
      >
        <Text style={[s.heading, { color: colors.text }]}>
          {textFor(language, '打开账号设置', 'Open account settings')}
        </Text>
        <ChevronRight size={17} color={colors.secondaryText} />
      </Pressable>
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
    minHeight: 68,
  },
  overviewDetail: {
    ...workspaceTokens.typography.caption,
    opacity: 0.7,
    marginTop: workspaceTokens.space.xs,
  },
  copy: { flex: 1, minWidth: 0, gap: workspaceTokens.space.xs },
  heading: workspaceTokens.typography.title,
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
