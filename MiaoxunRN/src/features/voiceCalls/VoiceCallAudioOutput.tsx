import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Bluetooth,
  Check,
  ChevronDown,
  Headphones,
  Volume2,
} from 'lucide-react-native';
import { textFor } from '../../shared/i18n';
import type { Palette } from '../../shared/theme';
import type { Language } from '../session/sessionTypes';
import type { CallAudioDevice } from '../../services/voiceCall/voiceCallAudioRoute';
import { useCallAudioRoute } from './useCallAudioRoute';

const deviceLabels = {
  earpiece: ['听筒', 'Earpiece'],
  speaker: ['扬声器', 'Speaker'],
  bluetooth: ['蓝牙', 'Bluetooth'],
  wired: ['有线耳机', 'Wired headset'],
  other: ['外接设备', 'External device'],
} satisfies Record<CallAudioDevice['kind'], [string, string]>;

export function VoiceCallAudioOutput({
  connectedAt,
  disabled,
  language,
  palette,
  children,
}: React.PropsWithChildren<{
  connectedAt: number;
  disabled: boolean;
  language: Language;
  palette: Palette;
}>) {
  const { snapshot, loading, pendingId, error, select, reload } =
    useCallAudioRoute(connectedAt);
  const [showExternal, setShowExternal] = useState(false);
  const lastPrivateId = useRef<string | undefined>(undefined);
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const label = (device: CallAudioDevice) =>
    device.name?.trim() &&
    device.kind !== 'earpiece' &&
    device.kind !== 'speaker'
      ? device.name
      : t(...deviceLabels[device.kind]);
  const current = snapshot?.devices.find(
    device => device.id === snapshot.currentId,
  );
  const speaker = snapshot?.devices.find(device => device.kind === 'speaker');
  const earpiece = snapshot?.devices.find(device => device.kind === 'earpiece');
  const external = snapshot?.devices.filter(
    device => device.kind !== 'speaker' && device.kind !== 'earpiece',
  );
  useEffect(() => {
    if (current && current.kind !== 'speaker')
      lastPrivateId.current = current.id;
  }, [current]);

  const speakerActive = current?.kind === 'speaker';
  const privateDevice =
    snapshot?.devices.find(device => device.id === lastPrivateId.current) ??
    earpiece ??
    (external?.length === 1 ? external[0] : undefined);
  const target = speakerActive ? privateDevice : speaker;
  const blocked = disabled || loading || Boolean(pendingId);
  const speakerDisabled = blocked || !target;
  const singleExternal = external?.length === 1 ? external[0] : undefined;
  const menuOpen = showExternal && (external?.length ?? 0) > 1;
  const headsetsLabel = t('通话耳机', 'Call headsets');
  const singleSelected = Boolean(
    singleExternal && singleExternal.id === current?.id,
  );
  const ExternalIcon = external?.some(device => device.kind === 'bluetooth')
    ? Bluetooth
    : Headphones;
  const errorText =
    error === 'permission'
      ? t(
          '请允许妙讯访问附近设备，再选择蓝牙耳机。',
          'Allow Miaoxun to access nearby devices to use Bluetooth.',
        )
      : error === 'switch'
      ? t('未能切换音频，请重试。', 'Could not switch audio. Try again.')
      : t(
          '暂时无法读取音频设备。',
          'Audio devices are temporarily unavailable.',
        );
  return (
    <>
      <View style={s.controls}>
        {children}
        <Pressable
          testID="voice-call-speaker"
          accessibilityRole="button"
          accessibilityLabel={
            speakerActive
              ? t('关闭扬声器', 'Turn off speaker')
              : t('打开扬声器', 'Turn on speaker')
          }
          accessibilityState={{
            selected: speakerActive,
            disabled: speakerDisabled,
            busy: pendingId === target?.id && Boolean(pendingId),
          }}
          disabled={speakerDisabled}
          onPress={() => {
            if (target) select(target);
          }}
          style={({ pressed }) => [
            s.control,
            {
              borderColor: speakerActive ? palette.mint : palette.border,
              backgroundColor: speakerActive ? palette.soft : palette.surface,
              opacity: pressed || (!current && speakerDisabled) ? 0.65 : 1,
            },
          ]}
        >
          {loading || (pendingId && pendingId === target?.id) ? (
            <ActivityIndicator color={palette.text} />
          ) : (
            <Volume2 size={23} color={palette.text} />
          )}
          <Text style={[s.controlText, { color: palette.text }]}>
            {t('扬声器', 'Speaker')}
          </Text>
        </Pressable>
      </View>
      {external?.length ? (
        <View
          style={[
            s.devices,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <Pressable
            testID="voice-call-audio-devices"
            accessibilityRole="button"
            accessibilityLabel={
              singleExternal ? label(singleExternal) : headsetsLabel
            }
            accessibilityState={
              singleExternal
                ? {
                    selected: singleSelected,
                    disabled: blocked,
                    busy: pendingId === singleExternal.id,
                  }
                : { expanded: menuOpen, disabled }
            }
            disabled={singleExternal ? blocked : disabled}
            onPress={() => {
              if (singleExternal) select(singleExternal);
              else setShowExternal(open => !open);
            }}
            style={s.device}
          >
            <ExternalIcon size={18} color={palette.text} />
            <Text style={[s.name, { color: palette.text }]}>
              {singleExternal ? label(singleExternal) : headsetsLabel}
            </Text>
            {singleExternal ? (
              pendingId === singleExternal.id ? (
                <ActivityIndicator color={palette.text} />
              ) : singleSelected ? (
                <Check size={18} color={palette.text} />
              ) : null
            ) : (
              <ChevronDown size={18} color={palette.secondaryText} />
            )}
          </Pressable>
          {menuOpen
            ? external.map(device => {
                const active = device.id === snapshot?.currentId;
                const pending = device.id === pendingId;
                return (
                  <Pressable
                    key={device.id}
                    testID={`voice-call-audio-option-${device.id}`}
                    accessibilityRole="radio"
                    accessibilityLabel={label(device)}
                    accessibilityState={{
                      checked: active,
                      disabled: blocked,
                      busy: pending,
                    }}
                    disabled={blocked}
                    onPress={() => select(device)}
                    style={[
                      s.device,
                      {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: palette.border,
                      },
                    ]}
                  >
                    <Text style={[s.name, { color: palette.text }]}>
                      {label(device)}
                    </Text>
                    {pending ? (
                      <ActivityIndicator color={palette.text} />
                    ) : active ? (
                      <Check size={18} color={palette.text} />
                    ) : null}
                  </Pressable>
                );
              })
            : null}
        </View>
      ) : null}
      {current && current.kind !== 'speaker' ? (
        <Text
          testID="voice-call-audio-current"
          accessibilityLiveRegion="polite"
          style={[s.detail, { color: palette.secondaryText }]}
        >
          {t(`当前输出 · ${label(current)}`, `Output · ${label(current)}`)}
        </Text>
      ) : null}
      {error ? (
        <View>
          <Text
            testID="voice-call-audio-error"
            accessibilityRole="alert"
            style={[s.detail, { color: palette.text }]}
          >
            {errorText}
          </Text>
          {error === 'unavailable' ? (
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              style={s.retry}
              onPress={reload}
            >
              <Text style={[s.controlText, { color: palette.text }]}>
                {t('重试', 'Retry')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  control: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
    borderWidth: 1,
    borderRadius: 16,
  },
  controlText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  devices: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  device: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
  },
  name: { flex: 1, fontSize: 15 },
  detail: { fontSize: 14, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'center' },
});
