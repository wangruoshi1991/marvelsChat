import React, {useState} from 'react';
import {Modal, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {textFor} from '../../shared/i18n';
import {
  SettingGroup,
  SettingsActionButton,
  SettingsSwitchRow,
} from '../../shared/settingsUi';
import {styles} from '../../shared/styles';
import {Palette} from '../../shared/theme';
import {SheetHeader} from '../../shared/ui';
import {Language} from '../session/useMiaoxunSession';

export function ThreadSettingsSheet({
  visible,
  muted,
  palette,
  language,
  onClose,
  onSetMuted,
  onOpenProfile,
  onActionError,
}: {
  visible: boolean;
  muted: boolean;
  palette: Palette;
  language: Language;
  onClose: () => void;
  onSetMuted: (muted: boolean) => Promise<void>;
  onOpenProfile?: () => void;
  onActionError: (message: string) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);

  const updateMuted = (nextMuted: boolean) => {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    onSetMuted(nextMuted)
      .catch(error => {
        onActionError(
          error instanceof Error
            ? error.message
            : textFor(language, '设置同步失败', 'Setting sync failed'),
        );
      })
      .finally(() => setIsSaving(false));
  };

  const openProfile = () => {
    onClose();
    onOpenProfile?.();
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}>
      <SafeAreaView
        style={[styles.safeArea, {backgroundColor: palette.background}]}>
        <View style={styles.threadSettingsScreen}>
          <SheetHeader
            title={textFor(language, '聊天设置', 'Chat settings')}
            palette={palette}
            onBack={onClose}
          />
          <SettingGroup
            title={textFor(language, '消息', 'Messages')}
            palette={palette}>
            <SettingsSwitchRow
              title={textFor(language, '消息免打扰', 'Mute notifications')}
              value={muted}
              palette={palette}
              disabled={isSaving}
              onChange={updateMuted}
            />
          </SettingGroup>
          {onOpenProfile ? (
            <SettingGroup
              title={textFor(language, '联系人', 'Contact')}
              palette={palette}>
              <SettingsActionButton
                title={textFor(language, '查看主页', 'View profile')}
                palette={palette}
                onPress={openProfile}
              />
            </SettingGroup>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
