import { AIContextReference, isContextReference } from './aiTask';

export type WorkspaceOperation =
  | 'cancel'
  | 'confirm'
  | 'reject'
  | 'reply'
  | 'continue';
export type WorkspaceStatus =
  | 'queued'
  | 'running'
  | 'waiting_input'
  | 'awaiting_confirmation'
  | 'succeeded'
  | 'failed'
  | 'interrupted'
  | 'cancelling'
  | 'cancelled';
export type WorkspaceArtifact =
  | {
      kind: 'media_selection';
      title: string;
      assets: {
        id: string;
        version: string;
        kind: 'image' | 'video';
        matchedFrameTimestampMs: number | null;
      }[];
      retrievalRunIds: string[];
    }
  | { kind: 'site_draft'; id: string; title: string }
  | { kind: 'text_result'; id: string; title: string };
export type WorkspaceTextDocument = {
  id: string;
  title: string;
  content: string;
};
export type WorkspaceStep = {
  id: string;
  round: number;
  key: string;
  agentId: string;
  agentVersion: string;
  capability: string;
  goal: string;
  dependencies: string[];
  status:
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'interrupted'
    | 'cancelled';
  summary: string;
  error: { code: string; message: string } | null;
  result: WorkspaceArtifact | null;
  createdAt: string;
  updatedAt: string;
};
export type WorkspaceRequest = {
  goal: string;
  contextRefs: AIContextReference[];
  source: { page: string; module: string | null };
};
export type WorkspaceInputRequest =
  | { kind: 'clarification'; question: string }
  | {
      kind: 'agent_access';
      question: string;
      reason: 'authorization_required' | 'new_task_required';
      requirements: {
        agentId: string;
        agentName: string;
        capability: string;
        requiredScopes: string[];
        reason: 'authorization_required' | 'new_task_required';
      }[];
      nextAction: 'manage_agents_then_restart' | 'restart';
    };
export type WorkspaceContinuationAttempt = {
  workspaceId: string;
  revision: number;
  currentRound: number;
  text: string;
  idempotencyKey: string;
};
export type WorkspaceRound = {
  number: number;
  instruction: string;
  baseResultNodeId: string | null;
  resultNodeId: string | null;
  status: WorkspaceStatus;
  summary: string;
  result: WorkspaceArtifact | null;
  createdAt: string;
  completedAt: string | null;
};
export type AgentWorkspace = WorkspaceRequest & {
  readAccess?: {
    state: 'unavailable';
    code: 'WORKSPACE_FILE_SOURCE_UNAVAILABLE';
  };
  id: string;
  executionMode: 'coordinated' | 'direct';
  origin: {
    kind: 'agent_conversation';
    threadId: string;
    inputMessageId: string;
    agentId: string;
    agentVersion: string;
    capability: string;
  } | null;
  status: WorkspaceStatus;
  revision: number;
  currentRound: number;
  rounds: WorkspaceRound[];
  summary: string;
  question: string | null;
  inputRequest: WorkspaceInputRequest | null;
  followups: string[];
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
  allowedActions: WorkspaceOperation[];
  limits: {
    deadlineSeconds: number;
  };
  usage: { modelCalls: number; coordinatorTurns: number };
  steps: WorkspaceStep[];
  result: WorkspaceArtifact | null;
  approval: {
    id: string;
    draftId: string;
    draftHash: string;
    profileHash: string;
    resourcesHash: string;
    expiresAt: string;
  } | null;
};
const string = (v: unknown): v is string => typeof v === 'string';
const nonempty = (v: unknown): v is string => string(v) && Boolean(v.trim());
const record = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === 'object' && !Array.isArray(v));
const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
const date = (v: unknown) => string(v) && Number.isFinite(Date.parse(v));
const digest = (v: unknown) => string(v) && /^[a-f0-9]{64}$/.test(v);
const error = (v: unknown) =>
  v === null || (record(v) && nonempty(v.code) && nonempty(v.message));
const unique = (v: unknown[]): boolean => new Set(v).size === v.length;
const exactKeys = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).length === keys.length && keys.every(key => key in v);
export function isWorkspaceContinuationAttempt(
  value: unknown,
): value is WorkspaceContinuationAttempt {
  return (
    record(value) &&
    exactKeys(value, [
      'workspaceId',
      'revision',
      'currentRound',
      'text',
      'idempotencyKey',
    ]) &&
    nonempty(value.workspaceId) &&
    integer(value.revision) &&
    Number(value.revision) > 0 &&
    integer(value.currentRound) &&
    Number(value.currentRound) > 0 &&
    nonempty(value.text) &&
    value.text === value.text.trim() &&
    value.text.length <= 2000 &&
    nonempty(value.idempotencyKey) &&
    value.idempotencyKey.length >= 8 &&
    value.idempotencyKey.length <= 160
  );
}
export function isWorkspaceInputRequest(
  v: unknown,
): v is WorkspaceInputRequest {
  if (!record(v) || !nonempty(v.question)) return false;
  if (v.kind === 'clarification') return exactKeys(v, ['kind', 'question']);
  if (
    v.kind !== 'agent_access' ||
    !exactKeys(v, [
      'kind',
      'question',
      'reason',
      'requirements',
      'nextAction',
    ]) ||
    !Array.isArray(v.requirements) ||
    !v.requirements.length ||
    v.requirements.length > 20 ||
    !v.requirements.every(
      r =>
        record(r) &&
        exactKeys(r, [
          'agentId',
          'agentName',
          'capability',
          'requiredScopes',
          'reason',
        ]) &&
        nonempty(r.agentId) &&
        r.agentId.length <= 120 &&
        nonempty(r.agentName) &&
        r.agentName.length <= 160 &&
        nonempty(r.capability) &&
        r.capability.length <= 120 &&
        Array.isArray(r.requiredScopes) &&
        r.requiredScopes.length > 0 &&
        r.requiredScopes.length <= 40 &&
        r.requiredScopes.every(
          scope => nonempty(scope) && scope.length <= 120,
        ) &&
        unique(r.requiredScopes) &&
        ['authorization_required', 'new_task_required'].includes(
          String(r.reason),
        ),
    ) ||
    !unique(v.requirements.map(r => `${r.agentId}:${r.capability}`))
  )
    return false;
  const needsAccess = v.requirements.some(
    r => r.reason === 'authorization_required',
  );
  return (
    v.reason ===
      (needsAccess ? 'authorization_required' : 'new_task_required') &&
    v.nextAction === (needsAccess ? 'manage_agents_then_restart' : 'restart')
  );
}
const statuses = [
  'queued',
  'running',
  'waiting_input',
  'awaiting_confirmation',
  'succeeded',
  'failed',
  'interrupted',
  'cancelling',
  'cancelled',
];
export function isWorkspaceArtifact(v: unknown): v is WorkspaceArtifact {
  if (!record(v) || !nonempty(v.title) || v.title.length > 160) return false;
  if (v.kind === 'text_result')
    return exactKeys(v, ['kind', 'id', 'title']) && nonempty(v.id);
  if (v.kind === 'site_draft')
    return exactKeys(v, ['kind', 'id', 'title']) && nonempty(v.id);
  return (
    v.kind === 'media_selection' &&
    exactKeys(v, ['kind', 'title', 'assets', 'retrievalRunIds']) &&
    Array.isArray(v.assets) &&
    v.assets.every(
      a =>
        record(a) &&
        exactKeys(a, ['id', 'version', 'kind', 'matchedFrameTimestampMs']) &&
        nonempty(a.id) &&
        nonempty(a.version) &&
        ['image', 'video'].includes(String(a.kind)) &&
        (a.matchedFrameTimestampMs === null ||
          (typeof a.matchedFrameTimestampMs === 'number' &&
            Number.isFinite(a.matchedFrameTimestampMs) &&
            a.matchedFrameTimestampMs >= 0)),
    ) &&
    unique(v.assets.map(a => a.id)) &&
    Array.isArray(v.retrievalRunIds) &&
    v.retrievalRunIds.every(nonempty)
  );
}
// Object property order is not part of the wire contract. Compare only the
// validated public artifact fields, while preserving meaningful array order.
export function workspaceArtifactsMatch(
  left: WorkspaceArtifact | null,
  right: WorkspaceArtifact | null,
) {
  const fields = [
    'kind',
    'title',
    'id',
    'assets',
    'version',
    'matchedFrameTimestampMs',
    'retrievalRunIds',
  ];
  return JSON.stringify(left, fields) === JSON.stringify(right, fields);
}
export function assertWorkspaceTextDocument(
  value: unknown,
  expectedId: string,
): asserts value is WorkspaceTextDocument {
  if (
    !record(value) ||
    !exactKeys(value, ['id', 'title', 'content']) ||
    value.id !== expectedId ||
    !nonempty(value.title) ||
    value.title.length > 160 ||
    !nonempty(value.content) ||
    value.content.length > 16000 ||
    value.content !== value.content.trim()
  )
    throw new Error('文字成果数据格式不受支持，请重新读取。');
}
export function isWorkspaceRequest(v: unknown): v is WorkspaceRequest {
  return (
    record(v) &&
    nonempty(v.goal) &&
    v.goal.length <= 2000 &&
    record(v.source) &&
    nonempty(v.source.page) &&
    (v.source.module === null || nonempty(v.source.module)) &&
    Array.isArray(v.contextRefs) &&
    v.contextRefs.every(isContextReference)
  );
}
export function assertAgentWorkspace(v: unknown): asserts v is AgentWorkspace {
  const invalid = () =>
    new Error('协作工作空间数据格式不受支持，请刷新或联系支持。');
  if (!isWorkspaceRequest(v) || !record(v)) throw invalid();
  const w = v as unknown as AgentWorkspace;
  if (
    !nonempty(w.id) ||
    !['coordinated', 'direct'].includes(w.executionMode) ||
    (w.executionMode === 'coordinated'
      ? w.origin !== null
      : !record(w.origin) ||
        !exactKeys(w.origin, [
          'kind',
          'threadId',
          'inputMessageId',
          'agentId',
          'agentVersion',
          'capability',
        ]) ||
        w.origin.kind !== 'agent_conversation' ||
        ![
          'threadId',
          'inputMessageId',
          'agentId',
          'agentVersion',
          'capability',
        ].every(key =>
          nonempty(
            w.origin?.[key as keyof NonNullable<AgentWorkspace['origin']>],
          ),
        )) ||
    !statuses.includes(w.status) ||
    !integer(w.revision) ||
    !integer(w.currentRound) ||
    w.currentRound < 1 ||
    !Array.isArray(w.rounds) ||
    w.rounds.length !== w.currentRound ||
    !string(w.summary) ||
    !(w.question === null || nonempty(w.question)) ||
    !(w.inputRequest === null || isWorkspaceInputRequest(w.inputRequest)) ||
    !Array.isArray(w.followups) ||
    !w.followups.every(nonempty) ||
    !error(w.error) ||
    !date(w.createdAt) ||
    !date(w.updatedAt) ||
    !Array.isArray(w.allowedActions) ||
    !unique(w.allowedActions) ||
    !w.allowedActions.every(a =>
      ['cancel', 'confirm', 'reject', 'reply', 'continue'].includes(a),
    ) ||
    'remainingLimits' in v ||
    !record(w.limits) ||
    Object.keys(w.limits).length !== 1 ||
    !integer(w.limits.deadlineSeconds) ||
    !record(w.usage) ||
    !integer(w.usage.modelCalls) ||
    !integer(w.usage.coordinatorTurns) ||
    !Array.isArray(w.steps) ||
    !unique(w.steps.map(s => s?.key)) ||
    !unique(w.steps.map(s => s?.id)) ||
    (w.result !== null && !isWorkspaceArtifact(w.result))
  )
    throw invalid();
  const unavailable = w.readAccess !== undefined;
  if (
    unavailable &&
    (!record(w.readAccess) ||
      !exactKeys(w.readAccess, ['state', 'code']) ||
      w.readAccess.state !== 'unavailable' ||
      w.readAccess.code !== 'WORKSPACE_FILE_SOURCE_UNAVAILABLE' ||
      !w.contextRefs.some(ref => ref.kind === 'station-file') ||
      w.result !== null ||
      w.steps.some(
        step =>
          !record(step) || step.result !== null || step.summary !== w.summary,
      ) ||
      w.rounds.some(
        round =>
          !record(round) ||
          round.result !== null ||
          round.summary !== w.summary,
      ) ||
      w.allowedActions.includes('continue') ||
      !nonempty(w.summary))
  )
    throw invalid();
  for (const s of w.steps) {
    if (
      !record(s) ||
      (w.executionMode === 'direct' &&
        (s.agentId !== w.origin?.agentId ||
          s.agentVersion !== w.origin.agentVersion ||
          s.capability !== w.origin.capability)) ||
      !integer(s.round) ||
      s.round < 1 ||
      s.round > w.currentRound ||
      !['id', 'key', 'agentId', 'agentVersion', 'capability', 'goal'].every(k =>
        nonempty(s[k as keyof WorkspaceStep]),
      ) ||
      !Array.isArray(s.dependencies) ||
      !s.dependencies.every(nonempty) ||
      !unique(s.dependencies) ||
      ![
        'queued',
        'running',
        'succeeded',
        'failed',
        'interrupted',
        'cancelled',
      ].includes(s.status) ||
      !string(s.summary) ||
      !error(s.error) ||
      !date(s.createdAt) ||
      !date(s.updatedAt) ||
      (s.result !== null && !isWorkspaceArtifact(s.result)) ||
      (s.result?.kind === 'text_result' && s.result.id !== s.id)
    )
      throw invalid();
    if (
      s.dependencies.some(
        key => key === s.key || !w.steps.some(other => other.key === key),
      )
    )
      throw invalid();
  }
  for (const [index, round] of w.rounds.entries()) {
    if (
      !record(round) ||
      round.number !== index + 1 ||
      !nonempty(round.instruction) ||
      round.instruction.length > 2000 ||
      !(round.baseResultNodeId === null || nonempty(round.baseResultNodeId)) ||
      !(round.resultNodeId === null || nonempty(round.resultNodeId)) ||
      !statuses.includes(round.status) ||
      !string(round.summary) ||
      !date(round.createdAt) ||
      !(round.completedAt === null || date(round.completedAt)) ||
      (round.result !== null && !isWorkspaceArtifact(round.result)) ||
      (!unavailable &&
        (round.result === null) !== (round.resultNodeId === null))
    )
      throw invalid();
    if (
      unavailable &&
      round.resultNodeId !== null &&
      !w.steps.some(
        step =>
          step.id === round.resultNodeId &&
          step.round === round.number &&
          step.status === 'succeeded',
      )
    )
      throw invalid();
    if (
      round.result !== null &&
      !w.steps.some(
        step =>
          step.id === round.resultNodeId &&
          step.round === round.number &&
          step.status === 'succeeded' &&
          workspaceArtifactsMatch(step.result, round.result),
      )
    )
      throw invalid();
    if (
      round.baseResultNodeId !==
      (index === 0 ? null : w.rounds[index - 1].resultNodeId)
    )
      throw invalid();
  }
  const latestRound = w.rounds[w.currentRound - 1];
  if (
    latestRound.status !== w.status ||
    latestRound.summary !== w.summary ||
    !workspaceArtifactsMatch(latestRound.result, w.result)
  )
    throw invalid();
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const byKey = new Map(w.steps.map(step => [step.key, step]));
  const visit = (key: string) => {
    if (visiting.has(key)) throw invalid();
    if (visited.has(key)) return;
    visiting.add(key);
    byKey.get(key)!.dependencies.forEach(visit);
    visiting.delete(key);
    visited.add(key);
  };
  w.steps.forEach(step => visit(step.key));
  const a = w.approval;
  if (
    a !== null &&
    (!record(a) ||
      !nonempty(a.id) ||
      !nonempty(a.draftId) ||
      !digest(a.draftHash) ||
      !digest(a.profileHash) ||
      !digest(a.resourcesHash) ||
      !date(a.expiresAt))
  )
    throw invalid();
  const finalArtifact = w.result;
  if (
    finalArtifact?.kind === 'text_result' &&
    (w.approval !== null ||
      w.status === 'awaiting_confirmation' ||
      w.allowedActions.some(action => ['confirm', 'reject'].includes(action)) ||
      !w.steps.some(
        step =>
          step.status === 'succeeded' &&
          step.result?.kind === 'text_result' &&
          step.id === finalArtifact.id &&
          step.result.title === finalArtifact.title,
      ))
  )
    throw invalid();
  if (
    w.allowedActions.includes('confirm') &&
    (w.status !== 'awaiting_confirmation' ||
      !a ||
      w.result?.kind !== 'site_draft' ||
      w.result.id !== a.draftId)
  )
    throw invalid();
  if (
    w.allowedActions.includes('reply') &&
    (w.status !== 'waiting_input' || w.inputRequest?.kind !== 'clarification')
  )
    throw invalid();
  if (
    w.allowedActions.includes('continue') &&
    (!['succeeded', 'awaiting_confirmation'].includes(w.status) || !w.result)
  )
    throw invalid();
  if (w.status === 'waiting_input') {
    if (!w.inputRequest || w.question !== w.inputRequest.question)
      throw invalid();
  } else if (w.inputRequest !== null || w.question !== null) throw invalid();
}
export const workspaceReviewKey = (w: AgentWorkspace) =>
  w.approval
    ? `${w.id}:${w.revision}:${w.approval.id}:${w.approval.draftHash}:${w.approval.resourcesHash}`
    : '';
