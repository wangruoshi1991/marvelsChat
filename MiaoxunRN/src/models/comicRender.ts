export type ComicRenderStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partially_succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type ComicRenderPhase =
  | 'queued'
  | 'validating'
  | 'rendering'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type ComicRenderFrame = {
  frameIndex: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'skipped';
  mediaAssetId: string | null;
  errorCode: string | null;
};

export type ComicRenderProgress = {
  total: number;
  succeeded: number;
  failed: number;
  unknown: number;
};

export type ComicRenderTaskDTO = {
  id: string;
  contractVersion: 1;
  comicDiaryId: string;
  status: ComicRenderStatus;
  phase: ComicRenderPhase;
  revision: number;
  progress: ComicRenderProgress;
  frames: ComicRenderFrame[];
  error: { code: string; message: string } | null;
  allowedActions: Array<'cancel'>;
  createdAt: string;
  updatedAt: string;
};

export type ComicRenderEventPage = {
  task: ComicRenderTaskDTO;
  events: Array<{
    sequence: number;
    status: ComicRenderStatus;
    phase: ComicRenderPhase;
    progress: ComicRenderProgress;
    errorCode?: string;
    createdAt: string;
  }>;
  hasMore: boolean;
  nextSequence: number;
};

const invalid = () =>
  new Error('漫画画面任务数据格式不受支持，请刷新或联系管理员完成升级。');
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => key in value);
const integer = (value: unknown, minimum = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
const code = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z][A-Za-z0-9._-]{0,99}$/.test(value);
const date = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

const phases: Record<ComicRenderStatus, ComicRenderPhase[]> = {
  queued: ['queued'],
  running: ['validating', 'rendering'],
  succeeded: ['completed'],
  partially_succeeded: ['completed'],
  failed: ['failed'],
  cancelled: ['cancelled'],
  interrupted: ['interrupted'],
};

const state = (status: unknown, phase: unknown) =>
  typeof status === 'string' &&
  Object.prototype.hasOwnProperty.call(phases, status) &&
  phases[status as ComicRenderStatus].includes(phase as ComicRenderPhase);

const progress = (value: unknown): value is ComicRenderProgress =>
  object(value) &&
  exactKeys(value, ['total', 'succeeded', 'failed', 'unknown']) &&
  integer(value.total, 2) &&
  value.total <= 8 &&
  integer(value.succeeded) &&
  integer(value.failed) &&
  integer(value.unknown) &&
  value.succeeded + value.failed + value.unknown <= value.total;

export function isActiveComicRender(task: ComicRenderTaskDTO) {
  return task.status === 'queued' || task.status === 'running';
}

export function parseComicRenderTask(value: unknown): ComicRenderTaskDTO {
  if (
    !object(value) ||
    !exactKeys(value, [
      'id',
      'contractVersion',
      'comicDiaryId',
      'status',
      'phase',
      'revision',
      'progress',
      'frames',
      'error',
      'allowedActions',
      'createdAt',
      'updatedAt',
    ]) ||
    !identifier(value.id) ||
    !identifier(value.comicDiaryId) ||
    value.contractVersion !== 1 ||
    !state(value.status, value.phase) ||
    !integer(value.revision, 1) ||
    !progress(value.progress) ||
    !Array.isArray(value.frames) ||
    value.frames.length !== value.progress.total ||
    !date(value.createdAt) ||
    !date(value.updatedAt) ||
    !Array.isArray(value.allowedActions) ||
    (value.status === 'queued'
      ? value.allowedActions.length !== 1 ||
        value.allowedActions[0] !== 'cancel'
      : value.allowedActions.length !== 0)
  )
    throw invalid();

  for (const [index, frame] of value.frames.entries()) {
    if (
      !object(frame) ||
      !exactKeys(frame, [
        'frameIndex',
        'status',
        'mediaAssetId',
        'errorCode',
      ]) ||
      frame.frameIndex !== index + 1 ||
      ![
        'queued',
        'running',
        'succeeded',
        'failed',
        'unknown',
        'skipped',
      ].includes(String(frame.status)) ||
      (frame.mediaAssetId !== null &&
        (!identifier(frame.mediaAssetId) || frame.status !== 'succeeded')) ||
      (frame.errorCode !== null && !code(frame.errorCode))
    )
      throw invalid();
  }
  for (const counted of ['succeeded', 'failed', 'unknown'] as const) {
    if (
      value.progress[counted] !==
      value.frames.filter(frame => frame.status === counted).length
    )
      throw invalid();
  }
  if (
    value.error !== null &&
    (!object(value.error) ||
      !exactKeys(value.error, ['code', 'message']) ||
      !code(value.error.code) ||
      typeof value.error.message !== 'string' ||
      !value.error.message.trim() ||
      value.error.message.length > 2000 ||
      /(?:https?:\/\/|data:|file:\/\/)/i.test(value.error.message))
  )
    throw invalid();
  if (
    value.status === 'succeeded' &&
    value.progress.succeeded !== value.progress.total
  )
    throw invalid();
  if (
    value.status === 'partially_succeeded' &&
    (!value.progress.succeeded ||
      value.progress.succeeded >= value.progress.total ||
      value.progress.unknown ||
      value.frames.some(frame => ['queued', 'running'].includes(frame.status)))
  )
    throw invalid();
  return value as ComicRenderTaskDTO;
}

export function parseComicRenderEventPage(
  value: unknown,
  taskId: string,
  afterSequence: number,
  limit: number,
): ComicRenderEventPage {
  if (
    !object(value) ||
    !exactKeys(value, ['task', 'events', 'hasMore', 'nextSequence'])
  )
    throw invalid();
  const task = parseComicRenderTask(value.task);
  if (
    task.id !== taskId ||
    task.revision < afterSequence ||
    !Array.isArray(value.events) ||
    value.events.length > limit ||
    typeof value.hasMore !== 'boolean' ||
    !integer(value.nextSequence)
  )
    throw invalid();
  let previous = afterSequence;
  for (const event of value.events) {
    if (
      !object(event) ||
      !exactKeys(event, [
        'sequence',
        'status',
        'phase',
        'progress',
        'createdAt',
        ...('errorCode' in event ? ['errorCode'] : []),
      ]) ||
      event.sequence !== previous + 1 ||
      !integer(event.sequence, 1) ||
      event.sequence > task.revision ||
      !state(event.status, event.phase) ||
      !progress(event.progress) ||
      event.progress.total !== task.progress.total ||
      !date(event.createdAt) ||
      ('errorCode' in event && !code(event.errorCode))
    )
      throw invalid();
    const eventProgress = event.progress;
    if (
      event.sequence === task.revision &&
      (event.status !== task.status ||
        event.phase !== task.phase ||
        (['total', 'succeeded', 'failed', 'unknown'] as const).some(
          key => eventProgress[key] !== task.progress[key],
        ))
    )
      throw invalid();
    previous = event.sequence;
  }
  if (
    value.nextSequence !== previous ||
    value.hasMore !== previous < task.revision
  )
    throw invalid();
  return value as ComicRenderEventPage;
}
