import { AgentWorkspace, WorkspaceStep } from '../../models/agentWorkspace';
import { AgentDTO } from '../../models/api';

/** The three local visual states described by the Miao page interaction spec. */
export type MiaoCardViewState = 'summary' | 'agents' | 'detail';
export type MiaoCardSwipeDirection = 'left' | 'right';

/**
 * Applies one completed horizontal gesture to a card's local visual state.
 *
 * A horizontal gesture is accepted only when it reaches the threshold and is
 * clearly more horizontal than vertical. This keeps the parent feed's normal
 * vertical scrolling from accidentally opening a card.
 */
export function nextMiaoCardState(
  state: MiaoCardViewState,
  direction: MiaoCardSwipeDirection,
  dx: number,
  dy: number,
  threshold = 80,
  directions: {
    participants: 'left' | 'right' | 'up' | 'down';
    details: 'left' | 'right' | 'up' | 'down';
  } = { participants: 'right', details: 'left' },
): MiaoCardViewState {
  const distance = Math.abs(dx);
  const verticalDistance = Math.abs(dy);
  const safeThreshold = Number.isFinite(threshold)
    ? Math.max(0, threshold)
    : 80;
  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(verticalDistance) ||
    distance < safeThreshold ||
    distance <= verticalDistance * 1.2
  ) {
    return state;
  }

  if (state === 'summary') {
    if (direction === directions.participants) return 'agents';
    if (direction === directions.details) return 'detail';
    return state;
  }
  if (
    state === 'agents' &&
    ((directions.participants === 'left' && direction === 'right') ||
      (directions.participants === 'right' && direction === 'left'))
  )
    return 'summary';
  if (
    state === 'detail' &&
    ((directions.details === 'left' && direction === 'right') ||
      (directions.details === 'right' && direction === 'left'))
  )
    return 'summary';
  return state;
}

export type MiaoParticipantProjection = {
  agentId: string;
  agent: AgentDTO | null;
  step: WorkspaceStep;
};

/**
 * Projects the real workspace steps into the Agent participants shown by the
 * card. Steps are ordered by first participation; duplicate steps for one
 * Agent collapse to the most recently updated step. Missing published
 * identity is kept explicit as `agent: null` so callers cannot invent a
 * fallback avatar or display name.
 */
export function participantProjection(
  workspace: AgentWorkspace,
  agents: AgentDTO[],
): MiaoParticipantProjection[] {
  const positions = new Map<string, number>();
  const latest = new Map<string, WorkspaceStep>();

  for (const step of workspace.steps) {
    if (!positions.has(step.agentId))
      positions.set(step.agentId, positions.size);
    const previous = latest.get(step.agentId);
    if (!previous || isLaterStep(step, previous))
      latest.set(step.agentId, step);
  }

  return [...latest.entries()]
    .sort(
      ([left], [right]) =>
        (positions.get(left) || 0) - (positions.get(right) || 0),
    )
    .map(([agentId, step]) => ({
      agentId,
      agent: agents.find(candidate => candidate.key === agentId) || null,
      step,
    }));
}

function isLaterStep(candidate: WorkspaceStep, previous: WorkspaceStep) {
  const candidateTime = Date.parse(candidate.updatedAt);
  const previousTime = Date.parse(previous.updatedAt);
  if (Number.isFinite(candidateTime) && Number.isFinite(previousTime)) {
    return candidateTime > previousTime;
  }
  if (Number.isFinite(candidateTime)) return true;
  if (Number.isFinite(previousTime)) return false;
  return candidate.id.localeCompare(previous.id) > 0;
}
