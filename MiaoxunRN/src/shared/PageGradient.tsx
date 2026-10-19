import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { pageGradientStops, pageGradientWash } from './theme';

/**
 * The light theme's page background, built from the reference rather than a
 * single straight ramp. Sampling the reference down one column gives mint at the
 * top, white through the middle, a faint second mint band low on the page, then
 * white again — and sampling across a row shows the left edge leaning teal and
 * the right edge leaning lime at every height.
 *
 * So it is two passes: a horizontal wash that carries the left/right hue shift,
 * and a vertical veil of white that opens and closes the two mint bands. A plain
 * top-to-bottom gradient loses both, which is what made the earlier attempts
 * read as "not quite the design".
 *
 * Rendered once behind the root tab content; screens on top must stay transparent
 * in light mode.
 */
export function PageGradient() {
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
        <Rect fill={`url(#${veilId})`} height="100%" width="100%" />
      </Svg>
    </View>
  );
}
