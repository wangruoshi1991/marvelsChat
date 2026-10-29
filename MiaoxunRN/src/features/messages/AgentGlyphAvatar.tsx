import React from 'react';
import {
  Image,
  ImageSourcePropType,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { AgentIdentityDTO } from '../../models/api';
import { styles as sharedStyles } from '../../shared/styles';
import { agentGlyphColors } from '../../shared/theme';
import { resolveAgentGlyph } from './threadIconRegistry';

/**
 * The single Agent visual used everywhere an Agent is shown — message threads,
 * the 妙 page task strip, 我 page Agent cards and the 妙 page partner grid. A
 * pale avatar with one coloured vector glyph; both colours derive from the
 * Agent's brand colour, so all call sites stay in step automatically. The
 * Xun list/search variant uses the V15 rounded-square treatment locally.
 */
export function AgentGlyphAvatar({
  agentId,
  category,
  identity,
  size,
  testID,
  variant,
  radius,
}: {
  agentId: string;
  category?: string | null;
  identity?: AgentIdentityDTO | null;
  size: number;
  testID?: string;
  /** `xun` is the rounded-square portrait used by conversations; `xun-task`
   * is the circular glyph treatment used by the task cards in V20. */
  variant?: 'default' | 'xun' | 'xun-task';
  /** Allows the V20 conversation detail to use its tighter 13pt corner. */
  radius?: number;
}) {
  const spec = resolveAgentGlyph(agentId, category);
  const { Icon } = spec;
  // The Agent's own declared background wins when present; otherwise the
  // registry's brand colour for this key. Either way the disc and glyph are
  // derived from that one colour, never hand-picked per call site.
  const brandColor = identity?.colors?.background || spec.accent;
  const { disc, glyph } = agentGlyphColors(brandColor);
  const isXun = variant === 'xun';
  const isXunTask = variant === 'xun-task';
  const hasXunPortrait = isXun && Boolean(xunAvatarSource(agentId));
  const borderRadius =
    radius ??
    (isXun
      ? Math.min(17, size / 2)
      : isXunTask
      ? size / 2
      : identity?.shape === 'squircle'
      ? Math.min(16, size * 0.32)
      : identity?.shape === 'rounded'
      ? Math.min(12, size * 0.24)
      : size / 2);
  const mark = identity?.mark?.trim() || '';
  const identityBackground = identity?.colors.background;
  const gradientId = `agent-avatar-${testID || agentId}`.replace(
    /[^a-zA-Z0-9_-]/g,
    '-',
  );

  return (
    <View
      style={[
        styles.disc,
        !isXun && !isXunTask && sharedStyles.avatarRing,
        isXun || isXunTask
          ? hasXunPortrait
            ? styles.xunPortrait
            : styles.xunDisc
          : { backgroundColor: identityBackground || disc },
        {
          borderRadius,
          height: size,
          width: size,
        },
      ]}
      testID={testID}
    >
      {hasXunPortrait ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={xunAvatarSource(agentId)!}
          style={{ borderRadius, height: size, width: size }}
        />
      ) : isXun || isXunTask ? (
        <Svg
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#ffffff" />
              <Stop offset="1" stopColor="#eaeaf2" />
            </LinearGradient>
          </Defs>
          <Rect
            x="0.5"
            y="0.5"
            width={size - 1}
            height={size - 1}
            rx={borderRadius}
            fill={`url(#${gradientId})`}
          />
        </Svg>
      ) : null}
      {!hasXunPortrait && !isXunTask && mark ? (
        <Text
          accessibilityElementsHidden
          style={[
            styles.mark,
            {
              color: identity?.colors.foreground || glyph,
              fontSize: Math.round(size * 0.4),
            },
          ]}
        >
          {mark}
        </Text>
      ) : !hasXunPortrait ? (
        <Icon color={glyph} size={Math.round(size * 0.4)} strokeWidth={2.1} />
      ) : null}
    </View>
  );
}

/** V20's supplied Xun portraits, keyed by the registered Agent id. */
const xunAvatarAssets: Record<string, ImageSourcePropType> = {
  'miaoxun-butler': require('../../assets/v20/xun-agent-0.png'),
  'nearby-stories': require('../../assets/v20/xun-agent-1.png'),
  'global-scout': require('../../assets/v20/xun-agent-2.png'),
  'friendship-expert': require('../../assets/v20/xun-agent-3.png'),
  'neighborhood-helper': require('../../assets/v20/xun-agent-4.png'),
};

function xunAvatarSource(agentId: string): ImageSourcePropType | undefined {
  return xunAvatarAssets[agentId];
}

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center' },
  mark: { fontWeight: '800', textAlign: 'center' },
  xunDisc: {
    backgroundColor: '#f4f5fa',
    borderColor: '#cad3df',
    borderWidth: 1,
    overflow: 'hidden',
  },
  // The portrait crop already contains the V20 frame; adding another border
  // here makes the 44pt conversation avatar visibly heavier than the design.
  xunPortrait: {
    backgroundColor: '#f4f5fa',
    overflow: 'hidden',
  },
});
