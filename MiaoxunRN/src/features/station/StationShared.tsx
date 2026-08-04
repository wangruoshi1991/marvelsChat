import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';

export function StationCard({
  title,
  detail,
  palette,
  children,
}: {
  title: string;
  detail: string;
  palette: Palette;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.stationCard,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          shadowColor: palette.shadow,
        },
      ]}
    >
      <View style={styles.stationCardHeader}>
        <Text
          style={[styles.stationCardTitle, { color: palette.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={[styles.stationCardDetail, { color: palette.secondaryText }]}
          numberOfLines={1}
        >
          {detail}
        </Text>
      </View>
      {children}
    </View>
  );
}

export function ProfileRegionRow({
  title,
  value,
  palette,
  backgroundColor,
  borderColor,
  textColor,
  secondaryTextColor,
  showChevron = true,
  onPress,
}: {
  title: string;
  value: string;
  palette: Palette;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  secondaryTextColor?: string;
  showChevron?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={styles.profileRegionCopy}>
        <Text
          style={[
            styles.profileRegionTitle,
            { color: secondaryTextColor || palette.secondaryText },
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.profileRegionValue,
            { color: textColor || palette.text },
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
      {onPress && showChevron ? (
        <ChevronRight
          color={secondaryTextColor || palette.secondaryText}
          size={15}
          strokeWidth={2.2}
        />
      ) : null}
    </>
  );
  const rowColors = {
    backgroundColor: backgroundColor || palette.surface,
    borderColor: borderColor || palette.border,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[styles.profileRegionRow, rowColors]}>
        {content}
      </Pressable>
    );
  }
  return <View style={[styles.profileRegionRow, rowColors]}>{content}</View>;
}

export function Stat({
  value,
  label,
  palette,
  textColor,
  secondaryTextColor,
  onPress,
}: {
  value: number;
  label: string;
  palette: Palette;
  textColor?: string;
  secondaryTextColor?: string;
  onPress?: () => void;
}) {
  const displayValue = Number.isFinite(value) ? value : 0;
  const content = (
    <>
      <Text style={[styles.statValue, { color: textColor || palette.text }]}>
        {displayValue}
      </Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        numberOfLines={1}
        style={[
          styles.statLabel,
          { color: secondaryTextColor || palette.secondaryText },
        ]}
      >
        {label}
      </Text>
    </>
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={styles.statCell}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={styles.statCell}>{content}</View>;
}
