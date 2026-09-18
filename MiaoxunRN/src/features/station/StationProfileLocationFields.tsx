import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LocateFixed } from 'lucide-react-native';
import { LocationResolveDTO } from '../../models/api';
import { getCurrentLocation } from '../../services/location';
import { MiaoxunApiError } from '../../services/api/http';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { StationProfileSection } from './StationProfileSection';
import { StationProfileLocationChoices } from './StationProfileLocationChoices';
import { profileDisplayRegionCandidates } from './stationProfileIdentity';
import { resolveStationColors } from './stationTheme';

export function StationProfileLocationFields({
  palette,
  language,
  disabled,
  publicLocation,
  community,
  activityArea,
  onLocationChange,
  onCommunityChange,
  onActivityAreaChange,
  onResolveLocation,
  onResolvingChange,
}: {
  palette: Palette;
  language: Language;
  disabled: boolean;
  publicLocation: string;
  community: string;
  activityArea: string;
  onLocationChange: (value: string) => void;
  onCommunityChange: (value: string) => void;
  onActivityAreaChange: (value: string) => void;
  onResolveLocation: ReturnType<typeof useMiaoxunSession>['resolveLocation'];
  onResolvingChange: (value: boolean) => void;
}) {
  const colors = resolveStationColors(palette);
  const [resolved, setResolved] = useState<LocationResolveDTO | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [deviceLocationError, setDeviceLocationError] = useState(false);
  const locating = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const locate = async () => {
    if (locating.current || disabled) return;
    locating.current = true;
    setIsLocating(true);
    onResolvingChange(true);
    setLocationError('');
    setDeviceLocationError(false);
    setResolved(null);
    try {
      const coordinates = await getCurrentLocation();
      if (!mounted.current) return;
      const result = await onResolveLocation({
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      });
      if (!mounted.current) return;
      setResolved(result);
      if (!profileDisplayRegionCandidates(result).length) {
        setLocationError(
          textFor(
            language,
            '当前位置没有可展示的城市或省份，请重新定位。',
            'No city or region was returned. Please locate again.',
          ),
        );
      }
    } catch (error) {
      if (!mounted.current) return;
      setDeviceLocationError(!(error instanceof MiaoxunApiError));
      setLocationError(
        error instanceof MiaoxunApiError
          ? error.status === 422
            ? textFor(
                language,
                '当前位置没有可用的地区信息，请更换位置后重试。',
                'No region information is available here. Try another location.',
              )
            : textFor(
                language,
                '暂时无法获取地区信息，请检查网络后重试。',
                'Unable to load region information. Check your connection and retry.',
              )
          : error instanceof Error
          ? error.message
          : textFor(
              language,
              '定位失败，请重试。',
              'Location failed. Please retry.',
            ),
      );
    } finally {
      locating.current = false;
      if (mounted.current) {
        setIsLocating(false);
        onResolvingChange(false);
      }
    }
  };
  const isDisabled = disabled || isLocating;
  const cityCandidates = resolved
    ? profileDisplayRegionCandidates(resolved)
    : [];
  return (
    <StationProfileSection
      title={textFor(language, '展示地区', 'Display region')}
      summary={
        publicLocation ||
        textFor(
          language,
          '选填 · 定位后选择城市或省份',
          'Optional · Locate to choose a city or region',
        )
      }
      palette={palette}
      disabled={disabled}
      initiallyExpanded
    >
      <Text style={[styles.hint, { color: colors.secondaryText }]}>
        {textFor(
          language,
          '定位后由你选择展示地区，保存后生效。不会自动展示详细地址。',
          'Choose the region to display after locating, then save. A street address is never selected automatically.',
        )}
      </Text>
      <Pressable
        accessibilityLabel={textFor(
          language,
          '定位选择地区',
          'Locate to choose a region',
        )}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: isLocating }}
        disabled={isDisabled}
        onPress={locate}
        style={[styles.locate, { backgroundColor: colors.soft }]}
      >
        {isLocating ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <LocateFixed color={colors.accent} size={18} />
        )}
        <Text style={[styles.actionText, { color: colors.accent }]}>
          {isLocating
            ? textFor(language, '正在定位…', 'Locating…')
            : textFor(language, '定位选择地区', 'Locate to choose a region')}
        </Text>
      </Pressable>
      {locationError ? (
        <View style={styles.error}>
          <Text
            accessibilityRole="alert"
            style={[styles.hint, { color: palette.rose }]}
          >
            {locationError}
          </Text>
          {deviceLocationError ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                Linking.openSettings().catch(() =>
                  setLocationError(
                    textFor(
                      language,
                      '无法打开系统设置，请从设备设置中管理妙讯定位权限。',
                      'Open your device settings to manage location permission.',
                    ),
                  ),
                )
              }
              style={styles.textButton}
            >
              <Text style={[styles.actionText, { color: colors.accent }]}>
                {textFor(
                  language,
                  '管理定位权限',
                  'Location permission settings',
                )}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {cityCandidates.length ? (
        <StationProfileLocationChoices
          title={textFor(language, '选择展示地区', 'Choose display region')}
          candidates={cityCandidates}
          selected={publicLocation}
          disabled={isDisabled}
          palette={palette}
          onSelect={onLocationChange}
        />
      ) : null}
      {publicLocation ? (
        <Pressable
          accessibilityLabel={textFor(
            language,
            '不展示地区',
            'Hide display region',
          )}
          accessibilityRole="button"
          disabled={isDisabled}
          onPress={() => onLocationChange('')}
          style={styles.textButton}
        >
          <Text style={[styles.hint, { color: colors.secondaryText }]}>
            {textFor(language, '不展示地区', 'Hide display region')}
          </Text>
        </Pressable>
      ) : null}
      <StationProfileSection
        title={textFor(
          language,
          '社区与活动区域',
          'Community and activity area',
        )}
        summary={
          [community, activityArea].filter(Boolean).join(' · ') ||
          textFor(
            language,
            '按需设置，用于附近社交',
            'Optional · Used for nearby connections',
          )
        }
        palette={palette}
        disabled={disabled}
      >
        <Text style={[styles.hint, { color: colors.secondaryText }]}>
          {textFor(
            language,
            '这两项与展示地区分别设置，公开范围可在隐私设置中调整。',
            'These are separate from your display region. Control their visibility in privacy settings.',
          )}
        </Text>
        {resolved ? (
          <>
            <StationProfileLocationChoices
              title={textFor(language, '所属社区', 'Community')}
              candidates={resolved.communityCandidates}
              selected={community}
              disabled={isDisabled}
              palette={palette}
              onSelect={onCommunityChange}
            />
            <StationProfileLocationChoices
              title={textFor(language, '活动区域', 'Activity area')}
              candidates={resolved.activityAreaCandidates}
              selected={activityArea}
              disabled={isDisabled}
              palette={palette}
              onSelect={onActivityAreaChange}
            />
          </>
        ) : (
          <Text style={[styles.hint, { color: colors.secondaryText }]}>
            {textFor(
              language,
              '点击上方定位按钮，选择附近社区与活动区域。',
              'Use the locate button above to choose nearby places.',
            )}
          </Text>
        )}
        {community || activityArea ? (
          <Pressable
            accessibilityRole="button"
            disabled={isDisabled}
            onPress={() => {
              onCommunityChange('');
              onActivityAreaChange('');
            }}
            style={styles.textButton}
          >
            <Text style={[styles.hint, { color: colors.secondaryText }]}>
              {textFor(
                language,
                '清除社区与活动区域',
                'Clear community and activity area',
              )}
            </Text>
          </Pressable>
        ) : null}
      </StationProfileSection>
    </StationProfileSection>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, lineHeight: 19 },
  locate: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 12,
  },
  actionText: { fontSize: 14, fontWeight: '600', lineHeight: 21 },
  error: { gap: 4 },
  textButton: { justifyContent: 'center', minHeight: 44 },
});
