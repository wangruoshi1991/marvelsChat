import React from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { IconComponent } from './ui';
import { styles } from './styles';
import { Palette } from './theme';

export function SettingGroup({
  title,
  palette,
  children,
}: {
  title: string;
  palette: Palette;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.settingGroup,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.settingTitle, { color: palette.secondaryText }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export function SettingsSegmentRow({
  title,
  palette,
  children,
}: {
  title: string;
  palette: Palette;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.settingsSegmentRow}>
      <Text
        style={[styles.settingsSegmentTitle, { color: palette.secondaryText }]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export function SettingsActionButton({
  title,
  palette,
  primary,
  disabled,
  onPress,
}: {
  title: string;
  palette: Palette;
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const textColor = primary ? '#ffffff' : palette.text;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.settingsActionButton,
        {
          backgroundColor: primary ? palette.mint : palette.soft,
          borderColor: palette.border,
        },
        disabled && styles.disabledButton,
      ]}
    >
      <Text style={[styles.settingsActionButtonText, { color: textColor }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function SettingsRow({
  title,
  value,
  palette,
  icon: Icon,
}: {
  title: string;
  value: string;
  palette: Palette;
  icon?: IconComponent;
}) {
  return (
    <View style={styles.settingsRow}>
      <View style={styles.settingsRowTitleWrap}>
        {Icon ? (
          <Icon color={palette.mint} size={16} strokeWidth={2.4} />
        ) : null}
        <Text style={[styles.settingsRowTitle, { color: palette.text }]}>
          {title}
        </Text>
      </View>
      <Text style={[styles.settingsRowValue, { color: palette.secondaryText }]}>
        {value}
      </Text>
    </View>
  );
}

export function SettingsSwitchRow({
  title,
  value,
  palette,
  onChange,
}: {
  title: string;
  value: boolean;
  palette: Palette;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingsRow}>
      <Text style={[styles.settingsRowTitle, { color: palette.text }]}>
        {title}
      </Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: palette.soft, true: `${palette.mint}66` }}
        thumbColor={value ? palette.mint : palette.secondaryText}
      />
    </View>
  );
}
