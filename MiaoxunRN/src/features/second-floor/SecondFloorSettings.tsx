import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { appErrorText, textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { secondFloorPalette } from './secondFloorTheme';
import { SettingsScreen } from '../settings/SettingsScreen';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { SecondFloorPageScrollProps } from './secondFloorScroll';

/**
 * The settings panel lives on the second floor by the user's decision — the
 * prototype's floor holds six tools and its 我 page card has no settings entry.
 *
 * This is the *same* `SettingsScreen` the full-screen modal mounts, switched to
 * its `embedded` presentation so it takes the floor panel's body padding
 * (`.xun-floor-panel-body`: 14px 12px 12px) and gives up its large title and
 * dismiss button to the floor. Rows, fields and sync calls are unchanged.
 */
export function SecondFloorSettings({
  header,
  palette,
  language,
  session,
  onOpenDeleteAccount,
  scrollProps,
}: {
  header?: React.ReactNode;
  palette: Palette;
  language: Language;
  session: ReturnType<typeof useMiaoxunSession>;
  /** Account deletion keeps its own confirmation screen in the app shell. */
  onOpenDeleteAccount: () => void;
  scrollProps?: SecondFloorPageScrollProps;
}) {
  const colors = secondFloorPalette(palette);
  const [message, setMessage] = useState('');
  const footer = (
    <>
      {message ? (
        <Text
          accessibilityRole="alert"
          style={[s.hint, { color: palette.rose }]}
        >
          {appErrorText(
            language,
            message,
            '设置同步失败',
            'Setting sync failed',
          )}
        </Text>
      ) : null}
      <Text style={[s.hint, { color: colors.secondaryText }]}>
        {textFor(
          language,
          '展示社区与展示活动区域在这里调整。',
          'Community and activity-area visibility are set here.',
        )}
      </Text>
    </>
  );

  return (
    <View style={s.body}>
      <ScrollView
        {...scrollProps}
        scrollEnabled
        showsVerticalScrollIndicator={false}
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
      >
        <SettingsScreen
          header={header}
          footer={footer}
          appearance={session.appearance}
          embedded
          language={language}
          onActionError={error => setMessage(String(error))}
          onBack={() => undefined}
          onDeleteAccount={onOpenDeleteAccount}
          onSetAppearance={session.setAppearance}
          onSetLanguage={session.setLanguage}
          onSignOut={session.signOut}
          onUpdateProfileVisibility={session.updateProfileVisibility}
          palette={colors}
          profileVisibility={session.profileVisibility}
          uiPreferences={session.uiPreferences}
          onPreviewUIPreferences={session.previewUIPreferences}
          onConfirmUIPreferences={session.confirmUIPreferences}
          onResetUIPreferences={session.resetUIPreferences}
          onUndoUIPreferences={session.undoUIPreferences}
          scrollable={false}
          userName={session.user?.displayName || '未登录'}
          userRole={session.user?.role || 'user'}
        />
      </ScrollView>
    </View>
  );
}

const s = {
  body: { flex: 1, minHeight: 0 },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
  hint: {
    fontSize: 11,
    lineHeight: 16,
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
} as const;
