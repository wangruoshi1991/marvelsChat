import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { MicOff, Phone, RotateCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { textFor } from '../../shared/i18n';
import type { Palette } from '../../shared/theme';
import type { Language } from '../session/sessionTypes';
import {
  canMinimizeVoiceCall,
  type VoiceCallDisplay,
} from './voiceCallPresentation';

/** Coordinates within the available safe movement area, each between 0 and 1. */
export type VoiceCallPosition = { x: number; y: number };
const handleSize = 56;
const margin = 12;
const dragThreshold = 6;
const initialPosition: VoiceCallPosition = { x: 1, y: 1 / 3 };
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const normalized = (value?: VoiceCallPosition): VoiceCallPosition => ({
  x: Number.isFinite(value?.x) ? clamp(value!.x, 0, 1) : initialPosition.x,
  y: Number.isFinite(value?.y) ? clamp(value!.y, 0, 1) : initialPosition.y,
});

/** Absolute overlay; only the small handle intercepts touches, never the page. */
export function VoiceCallBar({
  display,
  palette,
  language,
  onRestore,
  position,
  onPositionChange,
  topInset = true,
}: {
  display: VoiceCallDisplay | null;
  palette: Palette;
  language: Language;
  onRestore: () => void;
  position?: VoiceCallPosition;
  onPositionChange?: (position: VoiceCallPosition) => void;
  topInset?: boolean;
}) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [frame, setFrame] = useState<{ width: number; height: number }>();
  const [savedPosition, setSavedPosition] = useState(() =>
    normalized(position),
  );
  const [dragPosition, setDragPosition] = useState<VoiceCallPosition | null>(
    null,
  );
  const positionX = position?.x;
  const positionY = position?.y;
  useEffect(() => {
    if (positionX !== undefined && positionY !== undefined)
      setSavedPosition(normalized({ x: positionX, y: positionY }));
  }, [positionX, positionY]);
  const width = frame?.width ?? window.width;
  const height = frame?.height ?? window.height;
  const left = Math.min(insets.left + margin, Math.max(0, width - handleSize));
  const right = Math.max(left, width - insets.right - margin - handleSize);
  const top = Math.min(
    (topInset ? insets.top : 0) + margin,
    Math.max(0, height - handleSize),
  );
  const bottom = Math.max(top, height - insets.bottom - margin - handleSize);
  const current = {
    x: clamp(
      dragPosition?.x ?? left + savedPosition.x * (right - left),
      left,
      right,
    ),
    y: clamp(
      dragPosition?.y ?? top + savedPosition.y * (bottom - top),
      top,
      bottom,
    ),
  };
  const latest = useRef({
    current,
    bounds: { left, right, top, bottom },
    onPositionChange,
  });
  latest.current = {
    current,
    bounds: { left, right, top, bottom },
    onPositionChange,
  };
  const origin = useRef(current);
  const dragPoint = useRef(current);
  const dragged = useRef(false);
  const responder = useMemo(() => {
    const point = (dx: number, dy: number) => {
      const bounds = latest.current.bounds;
      return {
        x: clamp(origin.current.x + dx, bounds.left, bounds.right),
        y: clamp(origin.current.y + dy, bounds.top, bounds.bottom),
      };
    };
    const save = () => {
      const bounds = latest.current.bounds;
      const next = normalized({
        x:
          bounds.right > bounds.left
            ? (dragPoint.current.x - bounds.left) / (bounds.right - bounds.left)
            : 0,
        y:
          bounds.bottom > bounds.top
            ? (dragPoint.current.y - bounds.top) / (bounds.bottom - bounds.top)
            : 0,
      });
      setSavedPosition(next);
      setDragPosition(null);
      latest.current.onPositionChange?.(next);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        gesture.numberActiveTouches === 1 &&
        Math.hypot(gesture.dx, gesture.dy) > dragThreshold,
      onPanResponderGrant: () => {
        dragged.current = true;
        origin.current = latest.current.current;
        dragPoint.current = origin.current;
      },
      onPanResponderMove: (_event, gesture) => {
        if (gesture.numberActiveTouches !== 1) return;
        dragPoint.current = point(gesture.dx, gesture.dy);
        setDragPosition(dragPoint.current);
      },
      onPanResponderRelease: (_event, gesture) => {
        dragPoint.current = point(gesture.dx, gesture.dy);
        save();
      },
      onPanResponderTerminate: save,
      onPanResponderTerminationRequest: () => true,
    });
  }, []);
  if (!display || !canMinimizeVoiceCall(display)) return null;
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const status =
    display.phase === 'connecting'
      ? t('正在恢复连接', 'Reconnecting')
      : t('通话中', 'In call');
  const microphone = display.muted
    ? t('麦克风已静音', 'Microphone muted')
    : t('麦克风已开启', 'Microphone on');
  const Icon =
    display.phase === 'connecting' ? RotateCw : display.muted ? MicOff : Phone;
  return (
    <View
      testID="voice-call-floating-overlay"
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
      onLayout={event => {
        const { width: nextWidth, height: nextHeight } =
          event.nativeEvent.layout;
        if (nextWidth > 0 && nextHeight > 0)
          setFrame(previous =>
            previous?.width === nextWidth && previous.height === nextHeight
              ? previous
              : { width: nextWidth, height: nextHeight },
          );
      }}
    >
      <View
        testID="voice-call-handle-position"
        {...responder.panHandlers}
        style={[s.position, { left: current.x, top: current.y }]}
      >
        <Pressable
          testID="voice-call-bar"
          accessibilityRole="button"
          accessibilityLabel={`${status}，${display.peerName}，${microphone}`}
          accessibilityHint={t(
            '点按返回通话控制；可拖动悬浮按钮',
            'Tap to return to call controls. Drag to reposition.',
          )}
          accessibilityActions={[
            {
              name: 'activate',
              label: t('返回通话控制', 'Return to call controls'),
            },
          ]}
          onAccessibilityAction={event => {
            if (event.nativeEvent.actionName === 'activate') onRestore();
          }}
          onPressIn={() => {
            dragged.current = false;
          }}
          onPress={() => {
            if (!dragged.current) onRestore();
          }}
          style={[
            s.handle,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              shadowColor: palette.shadow,
            },
          ]}
        >
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <Icon size={25} color={palette.mint} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  position: { position: 'absolute', width: handleSize, height: handleSize },
  handle: {
    width: handleSize,
    height: handleSize,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
});
