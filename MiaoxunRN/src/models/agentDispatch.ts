// This list selects the client's protocol, never execution intent or authority.
// The authenticated service decides whether a message is a reply, clarification,
// or executable task and verifies the agent's current capabilities and access.
export function usesAgentDispatch(agentId?: string | null): boolean {
  return [
    'album-manager',
    'site-builder',
    'file-preprocessor',
    'comic-diary',
    'video-production',
    'virtual-character',
    'model-3d',
  ].includes(agentId || '');
}

export function isAgentDispatch(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'version' in value &&
      value.version === 1 &&
      'kind' in value &&
      ['reply', 'clarify', 'workspace'].includes(String(value.kind)),
  );
}
