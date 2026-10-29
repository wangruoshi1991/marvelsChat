import {
  AgentDTO,
  AgentIdentityDTO,
  AgentIdentityInput,
  OwnedAgentDTO,
} from '../../models/api';

export const AGENT_IDENTITY_CONTRACT_ERROR =
  'AGENT_IDENTITY_CONTRACT_ERROR' as const;

export class AgentIdentityContractError extends Error {
  readonly code = AGENT_IDENTITY_CONTRACT_ERROR;

  constructor(agentId?: string | null) {
    super(
      agentId
        ? `Agent ${agentId} 缺少已发布 identity。`
        : 'Agent 缺少已发布 identity。',
    );
    this.name = 'AgentIdentityContractError';
  }
}

export function isCompleteAgentIdentity(
  identity: unknown,
): identity is AgentIdentityDTO {
  const candidate = identity as AgentIdentityDTO | null | undefined;
  return Boolean(
    candidate &&
      candidate.avatarKind === 'agent-mark' &&
      typeof candidate.mark === 'string' &&
      candidate.mark.trim() &&
      ['circle', 'squircle', 'rounded'].includes(candidate.shape) &&
      typeof candidate.colors?.background === 'string' &&
      typeof candidate.colors?.foreground === 'string' &&
      typeof candidate.colors?.accent === 'string',
  );
}

export function unavailableAgentIdentity(
  agentId?: string | null,
): AgentIdentityInput {
  return {
    status: 'unavailable',
    code: AGENT_IDENTITY_CONTRACT_ERROR,
    message: new AgentIdentityContractError(agentId).message,
  };
}

export function identityForAgent(
  agent:
    | { key: string; identity?: AgentIdentityDTO | null }
    | { id: string; identity?: AgentIdentityDTO | null }
    | null
    | undefined,
): AgentIdentityInput {
  if (agent && isCompleteAgentIdentity(agent.identity)) return agent.identity;
  const agentId = agent && ('key' in agent ? agent.key : agent.id);
  return unavailableAgentIdentity(agentId);
}

/** Validate a bootstrap/sync directory before replacing the current snapshot. */
export function assertAgentDirectoryIdentity(
  registered: AgentDTO[],
  owned: OwnedAgentDTO[],
): void {
  const missing = [...registered, ...owned].find(
    agent => !isCompleteAgentIdentity(agent.identity),
  );
  if (missing) {
    const agentId = 'key' in missing ? missing.key : missing.id;
    throw new AgentIdentityContractError(agentId);
  }
}
