import type { GestureResponderEvent } from 'react-native';

export function singleTouch(event: GestureResponderEvent, release = false) {
  const { touches, changedTouches } = event.nativeEvent;
  if (release ? touches.length !== 0 : touches.length !== 1) return null;
  const touch = release
    ? changedTouches.length === 1 && changedTouches[0]
    : touches[0];
  if (!touch || !Number.isFinite(touch.pageX) || !Number.isFinite(touch.pageY))
    return null;
  return touch;
}
