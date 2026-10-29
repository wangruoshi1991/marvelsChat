/**
 * Agent visuals are directory data. This module intentionally contains no
 * registry-key, category or fallback glyph mapping. It remains as a small
 * compatibility boundary for stale imports so they fail loudly rather than
 * rendering an identity that was not published by the server.
 */
import type { LucideIcon } from 'lucide-react-native';

export type AgentGlyphSpec = { Icon: LucideIcon; accent: string };

export function resolveAgentGlyph(
  _agentId?: string,
  _category?: string | null,
): AgentGlyphSpec {
  throw new Error(
    'AGENT_IDENTITY_CONTRACT_ERROR: glyph requires published identity',
  );
}
