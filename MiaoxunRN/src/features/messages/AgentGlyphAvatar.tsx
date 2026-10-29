import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AgentIdentityInput, AgentIdentityUnavailable } from '../../models/api';
import { unavailableAgentIdentity } from './agentIdentity';
import { styles as sharedStyles } from '../../shared/styles';
import { agentGlyphColors } from '../../shared/theme';

function isUnavailable(
  identity: AgentIdentityInput,
): identity is AgentIdentityUnavailable {
  return 'status' in identity && identity.status === 'unavailable';
}

/** The one Agent visual used by every surface. Identity comes from the published directory. */
export function AgentGlyphAvatar({
  agentId,
  identity,
  size,
  testID,
  variant,
  radius,
}: {
  agentId: string;
  identity?: AgentIdentityInput | null;
  size: number;
  testID?: string;
  variant?: 'default' | 'xun' | 'xun-task';
  radius?: number;
}) {
  const resolvedIdentity = identity || unavailableAgentIdentity(agentId);
  if (isUnavailable(resolvedIdentity)) {
    return (
      <View
        accessibilityLabel={resolvedIdentity.message}
        style={[styles.contractError, { height: size, width: size }]}
        testID={testID || `agent-identity-error-${agentId}`}
      >
        <Text style={styles.contractErrorText}>!</Text>
      </View>
    );
  }

  const { disc, glyph } = agentGlyphColors(resolvedIdentity.colors.background);
  const isXun = variant === 'xun';
  const isXunTask = variant === 'xun-task';
  const borderRadius =
    radius ??
    (isXun || isXunTask
      ? isXunTask
        ? size / 2
        : Math.min(17, size / 2)
      : resolvedIdentity.shape === 'squircle'
      ? Math.min(16, size * 0.32)
      : resolvedIdentity.shape === 'rounded'
      ? Math.min(12, size * 0.24)
      : size / 2);

  return (
    <View
      style={[
        styles.disc,
        !isXun && !isXunTask && sharedStyles.avatarRing,
        {
          backgroundColor:
            isXun || isXunTask ? '#f4f5fa' : resolvedIdentity.colors.background,
        },
        { borderRadius, height: size, width: size },
      ]}
      testID={testID}
    >
      <Text
        accessibilityLabel={`${agentId} identity mark`}
        style={[
          styles.mark,
          {
            color:
              isXun || isXunTask ? glyph : resolvedIdentity.colors.foreground,
            fontSize: Math.round(size * 0.4),
          },
        ]}
      >
        {resolvedIdentity.mark}
      </Text>
      {isXun || isXunTask ? (
        <View
          pointerEvents="none"
          style={[styles.xunOverlay, { borderColor: disc, borderRadius }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  mark: { fontWeight: '800', textAlign: 'center' },
  xunOverlay: { ...StyleSheet.absoluteFill, borderWidth: 1 },
  contractError: {
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderColor: '#dc2626',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
  },
  contractErrorText: { color: '#b91c1c', fontSize: 18, fontWeight: '800' },
});
