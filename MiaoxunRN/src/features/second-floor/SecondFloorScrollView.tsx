import React from 'react';
import {
  NativeSyntheticEvent,
  Platform,
  requireNativeComponent,
  ScrollView,
  StyleSheet,
  ViewProps,
} from 'react-native';
import { FloorTouch, SecondFloorPageScrollProps } from './secondFloorScroll';

const AndroidTouchSurface =
  Platform.OS === 'android'
    ? requireNativeComponent<
        ViewProps & {
          onFloorTouch: (event: NativeSyntheticEvent<FloorTouch>) => void;
        }
      >('MiaoxunSecondFloorTouchSurface')
    : null;

export function SecondFloorScrollView({
  onFloorTouch,
  ...props
}: React.ComponentProps<typeof ScrollView> & SecondFloorPageScrollProps) {
  const scroll = <ScrollView {...props} />;
  if (!AndroidTouchSurface || !onFloorTouch) return scroll;

  return (
    <AndroidTouchSurface
      style={styles.viewport}
      onFloorTouch={event => onFloorTouch(event.nativeEvent)}
    >
      {scroll}
    </AndroidTouchSurface>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
});
