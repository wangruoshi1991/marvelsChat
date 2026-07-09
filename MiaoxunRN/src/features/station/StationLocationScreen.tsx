import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { normalizeAvatarConfig } from '../avatar/avatarConfig';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { LocationResolveDTO } from '../../models/api';
import { getCurrentLocation } from '../../services/location';
import { displayText, normalizeLocationText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { SettingsActionButton } from '../../shared/settingsUi';
import { SheetHeader } from '../../shared/ui';
import { LocationCandidateSection } from './StationLocationFields';

type Coordinates = {
  latitude: number;
  longitude: number;
};

const locationResolveErrorText = (language: Language, error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('AMAP_WEB_SERVICE_KEY')) {
    return textFor(
      language,
      '定位解析服务暂时不可用，请稍后重试。',
      'Location lookup is temporarily unavailable. Try again later.',
    );
  }
  if (
    message.includes('Geocoding request timed out') ||
    message.includes('Geocoding service is unavailable')
  ) {
    return textFor(
      language,
      '定位解析服务暂时不可用，请稍后重试。',
      'Location lookup is temporarily unavailable. Try again later.',
    );
  }
  if (message.includes('did not return usable')) {
    return textFor(
      language,
      '当前位置没有返回可用的社区或活动区域，请稍后重试或换到网络更好的位置。',
      'No usable nearby community was returned. Try again later or from a better network location.',
    );
  }
  return message || textFor(language, '定位失败', 'Location failed');
};

export function StationLocationScreen({
  palette,
  language,
  profile,
  onBack,
  onResolveLocation,
  onUpdateProfile,
  onActionError,
}: {
  palette: Palette;
  language: Language;
  profile: ReturnType<typeof useMiaoxunSession>['profile'];
  onBack: () => void;
  onResolveLocation: ReturnType<typeof useMiaoxunSession>['resolveLocation'];
  onUpdateProfile: ReturnType<typeof useMiaoxunSession>['updateProfile'];
  onActionError: (message: string) => void;
}) {
  const [resolvedLocation, setResolvedLocation] =
    useState<LocationResolveDTO | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState(
    normalizeLocationText(profile.community),
  );
  const [selectedActivityArea, setSelectedActivityArea] = useState(
    normalizeLocationText(profile.activityArea),
  );
  const [statusMessage, setStatusMessage] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelectedCommunity(normalizeLocationText(profile.community));
    setSelectedActivityArea(normalizeLocationText(profile.activityArea));
  }, [profile.activityArea, profile.community]);

  const resolveCoordinate = async (coordinate: Coordinates, status: string) => {
    if (isResolving) {
      return;
    }
    setIsResolving(true);
    setStatusMessage(status);
    try {
      const resolved = await onResolveLocation({
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
      });
      setResolvedLocation(resolved);
      setSelectedCommunity(
        resolved.community || resolved.communityCandidates[0]?.name || '',
      );
      setSelectedActivityArea(
        resolved.activityArea || resolved.activityAreaCandidates[0]?.name || '',
      );
      setStatusMessage(
        textFor(
          language,
          '请选择所属社区和常用活动区域',
          'Choose the parent community and activity area',
        ),
      );
    } catch (error) {
      const message = locationResolveErrorText(language, error);
      setStatusMessage(message);
      onActionError(message);
    } finally {
      setIsResolving(false);
    }
  };

  const locate = async () => {
    if (isResolving) {
      return;
    }
    setIsResolving(true);
    setStatusMessage(
      textFor(language, '正在获取当前位置', 'Getting current location'),
    );
    try {
      const location = await getCurrentLocation();
      setIsResolving(false);
      await resolveCoordinate(
        { latitude: location.latitude, longitude: location.longitude },
        textFor(language, '正在解析社区和附近区域', 'Resolving nearby areas'),
      );
    } catch (error) {
      setIsResolving(false);
      const message =
        error instanceof Error
          ? error.message
          : textFor(language, '定位失败', 'Location failed');
      setStatusMessage(message);
      onActionError(message);
    }
  };

  const save = async () => {
    if (isSaving || !selectedCommunity || !selectedActivityArea) {
      if (!selectedCommunity || !selectedActivityArea) {
        onActionError(
          textFor(
            language,
            '请先选择所属社区和活动区域',
            'Choose parent community and activity area first',
          ),
        );
      }
      return;
    }
    setIsSaving(true);
    try {
      await onUpdateProfile({
        nickname: profile.nickname,
        avatarText: profile.avatarText,
        bio: profile.bio,
        community: selectedCommunity,
        activityArea: selectedActivityArea,
        avatarConfig: normalizeAvatarConfig(profile.avatarConfig),
      });
      onActionError(textFor(language, '位置已更新', 'Location updated'));
      onBack();
    } catch (error) {
      onActionError(
        error instanceof Error
          ? error.message
          : textFor(language, '位置保存失败', 'Location save failed'),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const communityCandidates = resolvedLocation?.communityCandidates?.length
    ? resolvedLocation.communityCandidates
    : selectedCommunity
    ? [
        {
          id: 'current-community',
          type: 'current',
          name: selectedCommunity,
          detail: textFor(language, '当前社区', 'Current community'),
        },
      ]
    : [];
  const activityAreaCandidates = resolvedLocation?.activityAreaCandidates
    ?.length
    ? resolvedLocation.activityAreaCandidates
    : selectedActivityArea
    ? [
        {
          id: 'current-area',
          type: 'current',
          name: selectedActivityArea,
          detail: textFor(language, '当前活动区域', 'Current activity area'),
        },
      ]
    : [];

  return (
    <ScrollView
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={styles.settingsContent}
    >
      <SheetHeader
        title={textFor(language, '我的位置', 'My Location')}
        palette={palette}
        onBack={onBack}
      />
      <View
        style={[
          styles.locationHero,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
            shadowColor: palette.shadow,
          },
        ]}
      >
        <Text style={[styles.locationHeroTitle, { color: palette.text }]}>
          {displayText(language, selectedActivityArea) ||
            textFor(language, '未设置活动区域', 'Activity area not set')}
        </Text>
        <Text
          style={[styles.locationHeroDetail, { color: palette.secondaryText }]}
        >
          {displayText(language, selectedCommunity)
            ? textFor(
                language,
                `所属社区：${displayText(language, selectedCommunity)}`,
                `Parent community: ${displayText(language, selectedCommunity)}`,
              )
            : textFor(language, '未设置所属社区', 'Parent community not set')}
        </Text>
        {statusMessage ? (
          <Text
            style={[
              styles.locationStatusText,
              { color: palette.secondaryText },
            ]}
          >
            {statusMessage}
          </Text>
        ) : null}
        <SettingsActionButton
          title={
            isResolving
              ? textFor(language, '定位中', 'Locating')
              : textFor(language, '自动定位', 'Locate')
          }
          palette={palette}
          primary
          disabled={isResolving}
          onPress={locate}
        />
      </View>
      <LocationCandidateSection
        title={textFor(language, '所属社区', 'Parent Community')}
        empty={textFor(
          language,
          '定位后显示所属社区',
          'Locate to show parent community',
        )}
        candidates={communityCandidates}
        selectedName={selectedCommunity}
        palette={palette}
        onSelect={setSelectedCommunity}
      />
      <LocationCandidateSection
        title={textFor(language, '活动区域', 'Activity Area')}
        empty={textFor(
          language,
          '定位后显示附近活动区域',
          'Locate to show nearby activity areas',
        )}
        candidates={activityAreaCandidates}
        selectedName={selectedActivityArea}
        palette={palette}
        onSelect={setSelectedActivityArea}
      />
      <SettingsActionButton
        title={
          isSaving
            ? textFor(language, '保存中', 'Saving')
            : textFor(language, '保存', 'Save')
        }
        palette={palette}
        primary
        disabled={isSaving}
        onPress={save}
      />
    </ScrollView>
  );
}
