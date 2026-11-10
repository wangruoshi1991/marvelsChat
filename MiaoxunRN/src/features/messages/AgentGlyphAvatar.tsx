import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { AgentIdentityInput, AgentIdentityUnavailable } from '../../models/api';
import {
  isCompleteAgentIdentity,
  unavailableAgentIdentity,
} from './agentIdentity';
import { buildApiUrl } from '../../services/api/http';
import { styles as sharedStyles } from '../../shared/styles';
import { agentGlyphColors } from '../../shared/theme';

function isUnavailable(
  identity: AgentIdentityInput,
): identity is AgentIdentityUnavailable {
  return 'status' in identity && identity.status === 'unavailable';
}

function identityDiscStyle(backgroundColor: string) {
  return { backgroundColor };
}

function AgentImageAvatar({
  uri,
  agentId,
  size,
  borderRadius,
  backgroundColor,
  ring,
  outlineColor,
  testID,
}: {
  uri: string;
  agentId: string;
  size: number;
  borderRadius: number;
  backgroundColor: string;
  ring: boolean;
  outlineColor?: string;
  testID?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <View
        accessibilityLabel={`Agent ${agentId} 头像加载失败`}
        style={[
          styles.contractError,
          { height: size, width: size, borderRadius },
        ]}
        testID={testID || `agent-avatar-image-error-${agentId}`}
      >
        <Text style={styles.contractErrorText}>!</Text>
      </View>
    );
  return (
    <View
      style={[
        styles.disc,
        ring && sharedStyles.avatarRing,
        { backgroundColor, borderRadius, height: size, width: size },
      ]}
      testID={`agent-avatar-frame-${agentId}`}
    >
      <Image
        accessibilityLabel={`Agent ${agentId} 已发布头像`}
        accessibilityIgnoresInvertColors
        source={{ uri }}
        onError={() => setFailed(true)}
        resizeMode="cover"
        style={styles.image}
        testID={testID || `agent-avatar-image-${agentId}`}
      />
      {outlineColor ? (
        <View
          pointerEvents="none"
          style={[
            styles.xunOverlay,
            { borderColor: outlineColor, borderRadius },
          ]}
        />
      ) : null}
    </View>
  );
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
  const resolvedIdentity =
    identity && (isUnavailable(identity) || isCompleteAgentIdentity(identity))
      ? identity
      : unavailableAgentIdentity(agentId);
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

  if (resolvedIdentity.avatarKind === 'agent-image') {
    const uri = buildApiUrl(resolvedIdentity.avatar.url);
    return (
      <AgentImageAvatar
        key={uri}
        uri={uri}
        agentId={agentId}
        size={size}
        borderRadius={borderRadius}
        backgroundColor={resolvedIdentity.colors.background}
        ring={!isXun && !isXunTask}
        outlineColor={isXun || isXunTask ? disc : undefined}
        testID={testID}
      />
    );
  }

  return (
    <View
      style={[
        styles.disc,
        !isXun && !isXunTask && sharedStyles.avatarRing,
        isXun || isXunTask
          ? styles.xunDisc
          : identityDiscStyle(resolvedIdentity.colors.background),
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
  image: { height: '100%', width: '100%' },
  xunDisc: { backgroundColor: '#f4f5fa' },
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
