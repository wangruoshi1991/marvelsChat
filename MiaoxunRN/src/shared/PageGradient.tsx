import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { pageGradientStops } from './theme';

/**
 * The light theme's page background: a vertical mint-to-white wash, sampled off
 * the reference screens. Rendered once behind the root tab content, so the three
 * tabs share one continuous gradient rather than each painting its own flat fill.
 *
 * Screens sitting on top of it must not paint an opaque background in light mode;
 * cards and sheets still do, which is what makes the wash visible between them.
 */
export function PageGradient() {
  // Screens can be mounted side by side (a tab kept alive under another), so the
  // gradient id has to be unique per instance or one would borrow the other's stop list.
  const gradientId = `pageGradient-${useId().replace(/:/g, '')}`;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg height="100%" width="100%">
        <Defs>
          <LinearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            {pageGradientStops.map(stop => (
              <Stop
                key={stop.offset}
                offset={stop.offset}
                stopColor={stop.color}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect fill={`url(#${gradientId})`} height="100%" width="100%" />
      </Svg>
    </View>
  );
}
