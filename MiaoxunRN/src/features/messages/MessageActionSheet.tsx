import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Plus, QrCode, UserCircle } from 'lucide-react-native';

import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { IconComponent } from '../../shared/ui';
import { Language } from '../session/useMiaoxunSession';

export function MessageActionSheet({
  palette,
  language,
  onBack,
  onScanQRCode,
}: {
  palette: Palette;
  language: Language;
  onBack: () => void;
  onScanQRCode: () => void;
}) {
  return (
    <View style={[styles.messageMenuOverlay, styles.pointerEventsBoxNone]}>
      <Pressable style={styles.actionSheetBackdrop} onPress={onBack} />
      <View
        style={[
          styles.messageMenu,
          {
            backgroundColor: palette.background,
            borderColor: palette.border,
            shadowColor: palette.shadow,
          },
        ]}
      >
        <View
          style={[
            styles.messageMenuArrow,
            styles.pointerEventsNone,
            {
              backgroundColor: palette.background,
              borderLeftColor: palette.border,
              borderTopColor: palette.border,
            },
          ]}
        />
        <ActionSheetRow
          disabled
          icon={UserCircle}
          palette={palette}
          title={textFor(language, '创建群', 'Create group')}
        />
        <ActionSheetRow
          disabled
          icon={Plus}
          palette={palette}
          title={textFor(language, '添加好友', 'Add friend')}
        />
        <ActionSheetRow
          icon={QrCode}
          palette={palette}
          title={textFor(language, '扫码', 'Scan')}
          onPress={onScanQRCode}
        />
      </View>
    </View>
  );
}

function ActionSheetRow({
  icon: Icon,
  palette,
  title,
  detail,
  disabled,
  onPress,
}: {
  icon: IconComponent;
  palette: Palette;
  title: string;
  detail?: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionSheetRow,
        { backgroundColor: palette.surface, borderColor: palette.border },
        disabled && styles.disabledButton,
      ]}
    >
      <View
        style={[
          styles.actionSheetIcon,
          { backgroundColor: `${palette.mint}24` },
        ]}
      >
        <Icon color={palette.mint} size={19} strokeWidth={2.4} />
      </View>
      <View style={styles.actionSheetCopy}>
        <Text style={[styles.actionSheetRowTitle, { color: palette.text }]}>
          {title}
        </Text>
        {detail ? (
          <Text
            style={[
              styles.actionSheetRowDetail,
              { color: palette.secondaryText },
            ]}
          >
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
