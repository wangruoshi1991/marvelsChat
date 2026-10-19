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
  // Every Agent avatar in the prototype is a full circle — `.agent-avatar`,
  // `.me-agent-avatar` and `.xun-avatar` all carry `border-radius: 50%`. The
  // server's `identity.shape` used to decide between circle/squircle/rounded
  // here, which is what made these discs read as squares; the design has one
  // shape, so the field no longer decides the outline.
  const borderRadius = size / 2;

  return (
    <View
      style={[
        styles.disc,
        styles.ring,
        { backgroundColor: disc, borderRadius, height: size, width: size },
      ]}
      testID={testID}
    >
      <Icon color={glyph} size={Math.round(size * 0.4)} strokeWidth={2.1} />
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center' },
  // Prototype `.agent-avatar` / `.xun-avatar`: `border: 3px solid #fff` with a
  // soft shadow. The white ring is what reads as a transparent halo against the
  // pale page; without it the disc sits flat on the card.
  ring: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
    shadowColor: '#1E1E2A',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
  },
});
