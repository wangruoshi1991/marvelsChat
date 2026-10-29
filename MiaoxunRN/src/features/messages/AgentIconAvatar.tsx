import React from 'react';

import { AgentIdentityDTO } from '../../models/api';
import { Palette } from '../../shared/theme';
import { AgentGlyphAvatar } from './AgentGlyphAvatar';

export function AgentIconAvatar({
  agentId,
  category,
  identity,
  small,
  size,
  variant,
  radius,
}: {
  agentId: string;
  category?: string | null;
  identity: AgentIdentityDTO | null;
  /**
   * Accepted so existing call sites keep compiling: the icon is derived from the
   * Agent's own brand colour now, so the screen palette no longer decides it.
   */
  palette?: Palette;
  small?: boolean;
  size?: number;
  variant?: 'default' | 'xun' | 'xun-task';
  radius?: number;
}) {
  return (
    <AgentGlyphAvatar
      agentId={agentId}
      category={category}
      identity={identity}
      size={size ?? (small ? 36 : 54)}
      variant={variant}
      radius={radius}
      testID={`agent-icon-${agentId}`}
    />
  );
}
