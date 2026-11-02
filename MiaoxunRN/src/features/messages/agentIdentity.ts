import {
  AgentDTO,
  AgentAvatarAssetDTO,
  AgentIdentityDTO,
  AgentIdentityInput,
  OwnedAgentDTO,
} from '../../models/api';

export const AGENT_IDENTITY_CONTRACT_ERROR =
  'AGENT_IDENTITY_CONTRACT_ERROR' as const;

const assetIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const avatarFields = [
  'assetId',
  'url',
  'sha256',
  'mimeType',
  'width',
  'height',
];

export function isCompleteAgentAvatarAsset(
  value: unknown,
): value is AgentAvatarAssetDTO {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const avatar = value as AgentAvatarAssetDTO;
  return Boolean(
    Object.keys(avatar).length === avatarFields.length &&
      Object.keys(avatar).every(key => avatarFields.includes(key)) &&
      typeof avatar.assetId === 'string' &&
      assetIdPattern.test(avatar.assetId) &&
      typeof avatar.sha256 === 'string' &&
      /^[0-9a-f]{64}$/.test(avatar.sha256) &&
      avatar.url ===
        `/api/agent-avatar-assets/${avatar.assetId}/${avatar.sha256}.webp` &&
      avatar.mimeType === 'image/webp' &&
      Number.isInteger(avatar.width) &&
      avatar.width === 512 &&
      Number.isInteger(avatar.height) &&
      avatar.height === 512,
  );
}

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
      ((candidate.avatarKind === 'agent-mark' &&
        !Object.prototype.hasOwnProperty.call(candidate, 'avatar')) ||
        (candidate.avatarKind === 'agent-image' &&
          isCompleteAgentAvatarAsset(candidate.avatar))) &&
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
  // A server-declared identity conflict is an explicit per-Agent unavailable
  // state. Unknown/malformed identity failures still reject the snapshot.
  const conflictingKeys = new Set(
    registered
      .filter(
        agent =>
          agent.identity === null &&
          agent.published === false &&
          agent.identityError?.code === 'AGENT_PRODUCT_IDENTITY_CONFLICT' &&
          typeof agent.identityError.message === 'string' &&
          Boolean(agent.identityError.message.trim()),
      )
      .map(agent => agent.key),
  );
  const missing = [...registered, ...owned].find(
    agent =>
      !isCompleteAgentIdentity(agent.identity) &&
      !(
        agent.identity === null &&
        agent.published === false &&
        conflictingKeys.has('key' in agent ? agent.key : agent.id)
      ),
  );
  if (missing) {
    const agentId = 'key' in missing ? missing.key : missing.id;
    throw new AgentIdentityContractError(agentId);
  }
}
