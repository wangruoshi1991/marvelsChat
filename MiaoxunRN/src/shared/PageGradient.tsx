import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { pageGradientStops, pageGradientWash } from './theme';

/**
 * The light theme's shared page background. A horizontal wash supplies the
 * existing left/right hue shift, while a white veil fades near the top and
 * bottom without covering the main content area in white.
 *
 * So it is two passes: a horizontal wash that carries the left/right hue shift,
 * and a vertical veil of white that opens and closes the two mint bands. A plain
 * top-to-bottom gradient loses both, which is what made the earlier attempts
 * read as "not quite the design".
 *
 * Rendered once behind the root tabs and their safe areas; screens on top stay
 * transparent in light mode.
 */
export function PageGradient({
  verticalFade = true,
}: {
  /** False for sticky header backplates that must stay opaque while scrolling. */
  verticalFade?: boolean;
} = {}) {
  // Screens can be mounted side by side (a tab kept alive under another), so the
  // ids have to be unique per instance or one would borrow the other's stops.
  const id = useId().replace(/:/g, '');
  const washId = `pageGradientWash-${id}`;
  const veilId = `pageGradientVeil-${id}`;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg height="100%" width="100%">
        <Defs>
          <LinearGradient id={washId} x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor={pageGradientWash.left} />
            <Stop offset="1" stopColor={pageGradientWash.right} />
          </LinearGradient>
          <LinearGradient id={veilId} x1="0" x2="0" y1="0" y2="1">
            {pageGradientStops.map(stop => (
              <Stop
                key={stop.offset}
                offset={stop.offset}
                stopColor={stop.color}
                stopOpacity={stop.opacity}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect fill={`url(#${washId})`} height="100%" width="100%" />
        {verticalFade ? (
          <Rect fill={`url(#${veilId})`} height="100%" width="100%" />
        ) : null}
      </Svg>
    </View>
  );
}
