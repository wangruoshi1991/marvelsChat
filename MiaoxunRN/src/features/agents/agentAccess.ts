import { AgentDTO, OwnedAgentDTO } from '../../models/api';

export function agentAccessMatchesDeclaration(
  agent: AgentDTO,
  owned?: OwnedAgentDTO,
) {
  if (!owned?.enabled) return false;
  const granted = new Set(owned.grantedScopes);
  const declared = new Set(agent.permissions);
  return (
    granted.size === declared.size &&
    [...declared].every(scope => granted.has(scope))
  );
}

// Used only in memory. Never persist or display the session identity or snapshot.
export function agentAccessSnapshot(
  agents: AgentDTO[],
  ownedAgents: OwnedAgentDTO[],
) {
  return JSON.stringify({ agents, ownedAgents });
}
