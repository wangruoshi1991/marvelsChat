import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Language } from '../features/session/useMiaoxunSession';
import { textFor } from '../shared/i18n';
import { styles } from '../shared/styles';
import { Palette } from '../shared/theme';

type RestoreErrorScreenProps = {
  palette: Palette;
  language: Language;
  message: string | null;
  isBusy: boolean;
  onRetry: () => void;
  onSignOut: () => void;
};

export function RestoreErrorScreen({
  palette,
  language,
  message,
  isBusy,
  onRetry,
  onSignOut,
}: RestoreErrorScreenProps) {
  return (
    <View
      style={[styles.restoreScreen, { backgroundColor: palette.background }]}
    >
      <View style={styles.restorePanel}>
        <Text style={[styles.restoreTitle, { color: palette.text }]}>
          {textFor(
            language,
            '账号空间暂时无法同步',
            'Account space cannot sync yet',
          )}
        </Text>
        <Text style={[styles.restoreMessage, { color: palette.secondaryText }]}>
          {message ||
            textFor(
              language,
              '网络连接暂时不可用，请检查手机网络后重试。',
              'The network connection is unavailable. Check the phone network and retry.',
            )}
        </Text>
        <Pressable
          disabled={isBusy}
          onPress={onRetry}
          style={[
            styles.restorePrimaryButton,
            { backgroundColor: palette.mint },
            isBusy && styles.disabledButton,
          ]}
        >
          <Text style={styles.restorePrimaryText}>
            {isBusy
              ? textFor(language, '正在同步', 'Syncing')
              : textFor(language, '重试同步', 'Retry sync')}
          </Text>
        </Pressable>
        <Pressable
          disabled={isBusy}
          onPress={onSignOut}
          style={styles.restoreSecondaryButton}
        >
          <Text
            style={[
              styles.restoreSecondaryText,
              { color: palette.secondaryText },
            ]}
          >
            {textFor(language, '退出登录', 'Log out')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
