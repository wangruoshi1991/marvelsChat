import React from 'react';

import { AgentIdentityInput } from '../../models/api';
import { Palette } from '../../shared/theme';
import { AgentGlyphAvatar } from './AgentGlyphAvatar';

export function AgentIconAvatar({
  agentId,
  identity,
  small,
  size,
  variant,
  radius,
}: {
  agentId: string;
  identity: AgentIdentityInput;
  palette?: Palette;
  small?: boolean;
  size?: number;
  variant?: 'default' | 'xun' | 'xun-task';
  radius?: number;
}) {
  return (
    <AgentGlyphAvatar
      agentId={agentId}
      identity={identity}
      size={size ?? (small ? 36 : 54)}
      variant={variant}
      radius={radius}
      testID={`agent-icon-${agentId}`}
    />
  );
}
