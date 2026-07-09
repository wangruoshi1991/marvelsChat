import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {ChevronRight, Sparkles} from 'lucide-react-native';

import {styles} from '../../shared/styles';
import {Palette} from '../../shared/theme';

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
    <View style={[styles.stationCard, {backgroundColor: palette.surface, borderColor: palette.border, shadowColor: palette.shadow}]}>
      <View style={styles.stationCardHeader}>
        <Text style={[styles.stationCardTitle, {color: palette.text}]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.stationCardDetail, {color: palette.secondaryText}]} numberOfLines={1}>
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
  onPress,
}: {
  title: string;
  value: string;
  palette: Palette;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={styles.profileRegionCopy}>
        <Text style={[styles.profileRegionTitle, {color: palette.secondaryText}]}>{title}</Text>
        <Text style={[styles.profileRegionValue, {color: palette.text}]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {onPress ? <ChevronRight color={palette.secondaryText} size={16} strokeWidth={2.6} /> : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[styles.profileRegionRow, {backgroundColor: palette.surface, borderColor: palette.border}]}>
        {content}
      </Pressable>
    );
  }
  return (
    <View style={[styles.profileRegionRow, {backgroundColor: palette.surface, borderColor: palette.border}]}>
      {content}
    </View>
  );
}

export function ProfileDataRow({
  title,
  value,
  palette,
  onPress,
}: {
  title: string;
  value: string;
  palette: Palette;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={[styles.profileDataTitle, {color: palette.secondaryText}]}>{title}</Text>
      <Text style={[styles.profileDataValue, {color: palette.text}]} numberOfLines={1}>
        {value}
      </Text>
      {onPress ? <ChevronRight color={palette.secondaryText} size={16} strokeWidth={2.6} /> : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[styles.profileDataRow, {backgroundColor: palette.soft}]}>
        {content}
      </Pressable>
    );
  }
  return (
    <View style={[styles.profileDataRow, {backgroundColor: palette.soft}]}>
      {content}
    </View>
  );
}

export function StationPlaceholder({title, message, palette}: {title: string; message: string; palette: Palette}) {
  return (
    <View style={[styles.stationPlaceholder, {backgroundColor: palette.soft}]}>
      <Sparkles color={palette.mint} size={30} strokeWidth={2.5} />
      <Text style={[styles.placeholderTitle, {color: palette.text}]}>{title}</Text>
      <Text style={[styles.placeholderBody, {color: palette.secondaryText}]}>{message}</Text>
    </View>
  );
}

export function Stat({
  value,
  label,
  palette,
  onPress,
}: {
  value: number;
  label: string;
  palette: Palette;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={[styles.statValue, {color: palette.text}]}>{value}</Text>
      <Text style={[styles.statLabel, {color: palette.secondaryText}]}>{label}</Text>
    </>
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={[styles.statCell, {backgroundColor: palette.surface, borderColor: palette.border}]}>
        {content}
      </Pressable>
    );
  }
  return (
    <View style={[styles.statCell, {backgroundColor: palette.surface, borderColor: palette.border}]}>
      {content}
    </View>
  );
}
