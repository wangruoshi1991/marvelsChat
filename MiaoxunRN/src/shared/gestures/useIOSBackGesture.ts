import { useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import type { Animated, GestureResponderEvent } from 'react-native';
import { useStablePanResponder } from './useStablePanResponder';

export const iosBackEdge = StyleSheet.create({
  zone: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 24 },
}).zone;

export function useIOSBackGesture({
  enabled,
  onBack,
  onCancel,
  reduceMotion,
  translateX,
  width,
}: {
  enabled: boolean;
  onBack: () => void;
  onCancel: () => void;
  reduceMotion: boolean;
  translateX: Animated.Value;
  width: number;
}) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const origin = useRef<{ x: number; y: number } | null>(null);
  const displacement = (event: GestureResponderEvent, release = false) => {
    const start = origin.current;
    const touch = release
      ? event.nativeEvent.changedTouches[0]
      : event.nativeEvent.touches[0];
    return start && touch
      ? { x: touch.pageX - start.x, y: touch.pageY - start.y }
      : null;
  };
  const responder = useStablePanResponder(
    {
      onStartShouldSetPanResponder: event => {
        const touch = event.nativeEvent.touches[0];
        origin.current =
          event.nativeEvent.touches.length === 1
            ? { x: touch.pageX, y: touch.pageY }
            : null;
        return origin.current !== null;
      },
      onPanResponderGrant: () => translateX.stopAnimation(),
      onPanResponderMove: event => {
        const delta = displacement(event);
        if (delta && !reduceMotion) {
          const offset = delta.x > 1.7 * Math.abs(delta.y) ? delta.x : 0;
          translateX.setValue(Math.min(width, offset));
        }
      },
      onPanResponderRelease: (event, gesture) => {
        const delta = displacement(event, true);
        origin.current = null;
        if (
          delta &&
          delta.x > 1.7 * Math.abs(delta.y) &&
          (delta.x >= width * 0.32 || (delta.x >= 48 && gesture.vx >= 0.65))
        ) {
          onBackRef.current();
          return;
        }
        onCancel();
      },
      onPanResponderTerminate: () => {
        origin.current = null;
        onCancel();
      },
    },
    enabled && Platform.OS === 'ios',
  );
  return responder.panHandlers;
}
