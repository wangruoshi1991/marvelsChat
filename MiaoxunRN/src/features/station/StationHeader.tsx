import React, { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, Copy, QrCode } from 'lucide-react-native';

import { PresenceMode } from '../../models/api';
import { presenceModeText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { ProfileRegionRow } from './StationShared';
import { PresenceMenuAnchor } from './stationTypes';

export function StationProfileHeader({
  palette,
  language,
  nickname,
  aiId,
  presenceMode,
  miaoPoints,
  community,
  activityArea,
  onTogglePresenceMenu,
  onCopyAIID,
  onShowQRCode,
  onOpenLocation,
}: {
  palette: Palette;
  language: Language;
  nickname: string;
  aiId: string;
  presenceMode: PresenceMode;
  miaoPoints: number;
  community: string;
  activityArea: string;
  onTogglePresenceMenu: (anchor: PresenceMenuAnchor) => void;
  onCopyAIID: () => void;
  onShowQRCode: () => void;
  onOpenLocation: () => void;
}) {
  const presenceButtonRef = useRef<View>(null);

  const openPresenceMenu = () => {
    presenceButtonRef.current?.measureInWindow((x, y, width, height) => {
      onTogglePresenceMenu({ x, y, width, height });
    });
  };

  return (
    <View style={styles.profileCopy}>
      <View>
        <Pressable onPress={openPresenceMenu} style={styles.profileNameButton}>
          <Text
            style={[styles.profileName, { color: palette.text }]}
            numberOfLines={1}
          >
            {nickname}
          </Text>
          <View ref={presenceButtonRef} style={styles.presenceAnchor}>
            <View
              style={[
                styles.presencePill,
                {
                  backgroundColor:
                    presenceMode === 'online'
                      ? `${palette.mint}1f`
                      : palette.soft,
                  borderColor:
                    presenceMode === 'online'
                      ? `${palette.mint}55`
                      : palette.border,
                },
              ]}
            >
              <View
                style={[
                  styles.presenceDot,
                  {
                    backgroundColor:
                      presenceMode === 'online'
                        ? palette.mint
                        : palette.secondaryText,
                  },
                ]}
              />
              <Text
                style={[
                  styles.presencePillText,
                  {
                    color:
                      presenceMode === 'online'
                        ? palette.mint
                        : palette.secondaryText,
                  },
                ]}
              >
                {presenceModeText(language, presenceMode)}
              </Text>
              <ChevronDown
                color={
                  presenceMode === 'online'
                    ? palette.mint
                    : palette.secondaryText
                }
                size={13}
                strokeWidth={2.6}
              />
            </View>
          </View>
        </Pressable>
      </View>
      <View style={styles.aiIdRow}>
        <Text style={[styles.profileMeta, { color: palette.secondaryText }]}>
          AI ID：
        </Text>
        <Text
          style={[styles.profileMetaStrong, { color: palette.text }]}
          numberOfLines={1}
        >
          {aiId}
        </Text>
        <View style={styles.aiIdActions}>
          <Pressable onPress={onCopyAIID} style={styles.profileIconButton}>
            <Copy color={palette.text} size={14} strokeWidth={2.5} />
          </Pressable>
          <Pressable onPress={onShowQRCode} style={styles.profileIconButton}>
            <QrCode color={palette.text} size={14} strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>
      <View
        style={[
          styles.profilePointsPill,
          { backgroundColor: palette.soft, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.profilePointsText, { color: palette.text }]}>
          {textFor(language, `妙点 ${miaoPoints}`, `Points ${miaoPoints}`)}
        </Text>
        <Text style={[styles.profilePointsDetail, { color: palette.mint }]}>
          {textFor(language, '明细', 'Details')}
        </Text>
      </View>
      <ProfileRegionRow
        title={textFor(language, '我的社区', 'Community')}
        value={community}
        palette={palette}
        onPress={onOpenLocation}
      />
      <ProfileRegionRow
        title={textFor(language, '我的活动区域', 'Activity Area')}
        value={activityArea}
        palette={palette}
        onPress={onOpenLocation}
      />
    </View>
  );
}

export function PresenceMenu({
  palette,
  language,
  presenceMode,
  isUpdatingPresence,
  position,
  onSelectPresence,
}: {
  palette: Palette;
  language: Language;
  presenceMode: PresenceMode;
  isUpdatingPresence: boolean;
  position: { left: number; top: number };
  onSelectPresence: (mode: PresenceMode) => void;
}) {
  return (
    <View
      style={[
        styles.presenceFloatingMenu,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          left: position.left,
          shadowColor: palette.shadow,
          top: position.top,
        },
      ]}
    >
      {(['online', 'offline', 'hidden'] as PresenceMode[]).map(mode => {
        const isSelected = mode === presenceMode;
        const menuItemBackgroundColor = isSelected
          ? `${palette.mint}1f`
          : 'transparent';
        return (
          <Pressable
            key={mode}
            disabled={isUpdatingPresence}
            onPress={() => onSelectPresence(mode)}
            style={[
              styles.presenceMenuItem,
              { backgroundColor: menuItemBackgroundColor },
            ]}
          >
            <View
              style={[
                styles.presenceDot,
                {
                  backgroundColor:
                    mode === 'online' ? palette.mint : palette.secondaryText,
                },
              ]}
            />
            <Text
              style={[
                styles.presenceMenuText,
                { color: isSelected ? palette.mint : palette.text },
              ]}
            >
              {presenceModeText(language, mode)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
