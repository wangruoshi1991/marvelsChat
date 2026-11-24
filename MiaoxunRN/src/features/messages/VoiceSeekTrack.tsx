import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import { singleTouch } from '../../shared/gestures/singleTouch';
import { useStablePanResponder } from '../../shared/gestures/useStablePanResponder';
import { textFor } from '../../shared/i18n';
import type { Palette } from '../../shared/theme';
import type { Language } from '../session/sessionTypes';

const emptyTrack = Array<number>(32).fill(0);
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const elapsedLabel = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
};

type Drag = {
  x: number;
  y: number;
  localX: number;
  width: number;
  identifier: string;
  moved: boolean;
  cancelled: boolean;
};

export function VoiceSeekTrack({
  canSeek,
  durationMs,
  positionMs,
  waveform,
  palette,
  language,
  durationLabel,
  showElapsed,
  largeText = false,
  onSeek,
  onLongPress,
}: {
  canSeek: boolean;
  durationMs: number;
  positionMs: number;
  waveform: number[];
  palette: Palette;
  language: Language;
  durationLabel: string;
  showElapsed: boolean;
  largeText?: boolean;
  onSeek: (fraction: number) => Promise<void>;
  onLongPress?: (event: GestureResponderEvent) => void;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const width = useRef(0);
  const drag = useRef<Drag | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ canSeek, onSeek });
  latest.current = { canSeek, onSeek };
  const clearHold = useCallback(() => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  }, []);
  const cancel = useCallback(() => {
    clearHold();
    drag.current = null;
    setPreview(null);
  }, [clearHold]);
  useEffect(() => {
    if (!canSeek) cancel();
    // A command or playback completion invalidates an in-progress seek.
  }, [canSeek, cancel]);
  useEffect(() => () => clearHold(), [clearHold]);
  const responder = useStablePanResponder({
    onStartShouldSetPanResponder: event =>
      Boolean(
        (latest.current.canSeek || onLongPress) &&
          singleTouch(event) &&
          width.current > 0,
      ),
    onPanResponderGrant: event => {
      clearHold();
      const point = singleTouch(event);
      const localX = event.nativeEvent.locationX;
      if (!point || !Number.isFinite(localX) || width.current <= 0) return;
      const gesture: Drag = {
        x: point.pageX,
        y: point.pageY,
        localX,
        width: width.current,
        identifier: point.identifier,
        moved: false,
        cancelled: false,
      };
      drag.current = gesture;
      if (latest.current.canSeek) setPreview(clamp(localX / gesture.width));
      if (onLongPress) {
        event.persist?.();
        hold.current = setTimeout(() => {
          if (drag.current !== gesture || gesture.moved || gesture.cancelled)
            return;
          gesture.cancelled = true;
          setPreview(null);
          onLongPress(event);
        }, 500);
      }
    },
    onPanResponderMove: event => {
      const gesture = drag.current;
      const point = singleTouch(event);
      if (!gesture) return;
      if (!point || point.identifier !== gesture.identifier) {
        cancel();
        return;
      }
      const dx = point.pageX - gesture.x;
      const dy = point.pageY - gesture.y;
      if (Math.hypot(dx, dy) > 8) {
        gesture.moved = true;
        clearHold();
      }
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        gesture.cancelled = true;
        setPreview(null);
      }
      if (!gesture.cancelled && latest.current.canSeek)
        setPreview(clamp((gesture.localX + dx) / gesture.width));
    },
    onPanResponderRelease: event => {
      const gesture = drag.current;
      const point = singleTouch(event, true);
      const shouldSeek =
        gesture &&
        !gesture.cancelled &&
        point?.identifier === gesture.identifier &&
        latest.current.canSeek &&
        (Math.abs(point.pageY - gesture.y) <= 12 ||
          Math.abs(point.pageX - gesture.x) >=
            Math.abs(point.pageY - gesture.y));
      const fraction =
        shouldSeek && gesture && point
          ? clamp((gesture.localX + point.pageX - gesture.x) / gesture.width)
          : null;
      cancel();
      if (fraction !== null) latest.current.onSeek(fraction);
    },
    onPanResponderTerminate: cancel,
    onPanResponderTerminationRequest: () => true,
    onShouldBlockNativeResponder: () => false,
  });
  const actual = durationMs > 0 ? clamp(positionMs / durationMs) : 0;
  const progress = preview ?? actual;
  const shownPosition = preview === null ? positionMs : preview * durationMs;
  const hasWaveform = waveform.length === 32;
  const t = (zh: string, en: string) => textFor(language, zh, en);
  return (
    <View
      {...responder.panHandlers}
      testID="chat-voice-seek"
      style={s.track}
      onLayout={event => {
        width.current = event.nativeEvent.layout.width;
      }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t('语音播放进度', 'Voice playback position')}
      accessibilityHint={
        canSeek
          ? t('上下轻扫前进或后退五秒', 'Swipe up or down to move five seconds')
          : t('播放后可调整进度', 'Start playback to adjust position')
      }
      accessibilityState={{ disabled: !canSeek }}
      accessibilityValue={{
        min: 0,
        max: Math.ceil(durationMs / 1000),
        now: Math.max(
          0,
          Math.min(Math.ceil(durationMs / 1000), Math.floor(positionMs / 1000)),
        ),
        text: elapsedLabel(positionMs) + ' / ' + durationLabel,
      }}
      accessibilityActions={
        canSeek ? [{ name: 'increment' }, { name: 'decrement' }] : []
      }
      onAccessibilityAction={event => {
        if (!latest.current.canSeek || durationMs <= 0) return;
        const action = event.nativeEvent.actionName;
        if (action !== 'increment' && action !== 'decrement') return;
        latest.current.onSeek(
          clamp(
            (positionMs + (action === 'increment' ? 5000 : -5000)) / durationMs,
          ),
        );
      }}
    >
      <View
        style={s.waveform}
        pointerEvents="none"
        testID={hasWaveform ? 'chat-voice-waveform' : 'chat-voice-empty-track'}
      >
        {(hasWaveform ? waveform : emptyTrack).map((value, index) => {
          const played = index / 32 < progress;
          const height = hasWaveform ? 3 + Math.sqrt(value) * 23 : 14;
          const opacity = played ? 1 : hasWaveform ? 0.45 : 0.38;
          const backgroundColor = played ? palette.mint : palette.secondaryText;
          return (
            <View
              key={index}
              style={[s.bar, { height, opacity, backgroundColor }]}
            />
          );
        })}
      </View>
      <Text
        testID="chat-voice-time"
        pointerEvents="none"
        numberOfLines={largeText ? undefined : 1}
        style={[s.duration, { color: palette.secondaryText }]}
      >
        {showElapsed || preview !== null
          ? elapsedLabel(shownPosition) + (largeText ? ' /\n' : ' / ')
          : largeText
          ? '\n'
          : ''}
        {durationLabel}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  track: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    justifyContent: 'center',
    gap: 2,
  },
  waveform: { height: 27, flexDirection: 'row', alignItems: 'center', gap: 1 },
  bar: { flex: 1, borderRadius: 2 },
  duration: { fontSize: 11, fontVariant: ['tabular-nums'] },
});
