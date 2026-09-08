import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { contactIconAssets } from '../../assets/icons';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';

export function StationContentEditorHeader({
  title,
  action,
  actionDisabled,
  palette,
  onBack,
  onAction,
}: {
  title: string;
  action: string;
  actionDisabled?: boolean;
  palette: Palette;
  onBack: () => void;
  onAction: () => void;
}) {
  return (
    <View
      style={[
        styles.stationEditorHeader,
        { backgroundColor: palette.surface, borderBottomColor: palette.border },
      ]}
    >
      <Pressable
        accessibilityLabel="返回"
        accessibilityRole="button"
        onPress={onBack}
        style={styles.stationEditorHeaderSide}
      >
        <Image
          resizeMode="contain"
          source={contactIconAssets.back}
          style={styles.stationEditorBackIcon}
        />
      </Pressable>
      <Text
        numberOfLines={1}
        style={[styles.stationEditorHeaderTitle, { color: palette.text }]}
      >
        {title}
      </Text>
      <View style={styles.stationEditorHeaderSide}>
        <Pressable
          accessibilityLabel={action}
          accessibilityRole="button"
          disabled={actionDisabled}
          onPress={onAction}
          style={[
            styles.stationEditorSaveButton,
            styles.stationEditorPrimaryBackground,
            actionDisabled && styles.disabledButton,
          ]}
        >
          <Text style={styles.stationEditorSaveText}>{action}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function StationContentEditorSection({
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
        styles.stationEditorSection,
        { backgroundColor: palette.surface, borderBottomColor: palette.border },
      ]}
    >
      <Text style={[styles.stationEditorSectionTitle, { color: palette.text }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export function StationContentEditorField({
  label,
  palette,
  children,
}: {
  label: string;
  palette: Palette;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.stationEditorField}>
      <Text
        style={[
          styles.stationEditorFieldLabel,
          { color: palette.secondaryText },
        ]}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}
