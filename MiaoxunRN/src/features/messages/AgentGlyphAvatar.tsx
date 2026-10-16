import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AgentIdentityDTO } from '../../models/api';
import { agentGlyphColors } from '../../shared/theme';
import { resolveAgentGlyph } from './threadIconRegistry';

/**
 * The single Agent visual used everywhere an Agent is shown — message threads,
 * the 妙 page task strip, 我 page Agent cards and the 妙 page partner grid. A
 * pale disc with one coloured vector glyph; both colours derive from the
 * Agent's brand colour, so all four call sites stay in step automatically.
 */
export function AgentGlyphAvatar({
  agentId,
  category,
  identity,
  size,
  testID,
}: {
  agentId: string;
  category?: string | null;
  identity?: AgentIdentityDTO | null;
  size: number;
  testID?: string;
}) {
  const spec = resolveAgentGlyph(agentId, category);
  const { Icon } = spec;
  // The Agent's own declared background wins when present; otherwise the
  // registry's brand colour for this key. Either way the disc and glyph are
  // derived from that one colour, never hand-picked per call site.
  const brandColor = identity?.colors?.background || spec.accent;
  const { disc, glyph } = agentGlyphColors(brandColor);
  const shape = identity?.shape || 'circle';
  const borderRadius =
    shape === 'circle'
      ? size / 2
      : shape === 'squircle'
      ? size * 0.32
      : size * 0.2;

  return (
    <View
      style={[
        styles.disc,
        {
          backgroundColor: disc,
          borderRadius,
          height: size,
          width: size,
        },
      ]}
      testID={testID}
    >
      <Icon color={glyph} size={Math.round(size * 0.46)} strokeWidth={2.1} />
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center' },
});
