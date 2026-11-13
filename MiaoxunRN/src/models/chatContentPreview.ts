import type { MessageDTO, StationComicDiaryDTO } from './api';
import { ComicRenderTaskDTO, parseComicRenderTask } from './comicRender';

export type ContentPreviewRef = { version: 1; id: string };
export type ContentPreviewContext = { id: string; revision: number };
export type ComicFrame = {
  index: number;
  title: string;
  scene: string;
  caption: string;
  dialogue: string;
  mood: string;
  camera: string;
  mediaAssetIds: string[];
};
export type ComicSnapshot = {
  title: string;
  summary: string;
  style: string;
  frameCount: number;
  frames: ComicFrame[];
};
export type DiarySnapshot = { title: string; body: string; mood: string };
type PreviewBase = {
  id: string;
  version: 1;
  revision: number;
  snapshotHash: string;
  status:
    | 'pending'
    | 'confirmed'
    | 'rejected'
    | 'expired'
    | 'superseded'
    | 'revoked';
  threadId: string;
  inputMessageId: string;
  outputMessageId: string;
  sources: { type: string; id: string; title: string; mediaAssetId?: string }[];
  allowedActions: ('confirm' | 'reject')[];
  expiresAt: string;
};
export type ContentPreview = PreviewBase &
  (
    | {
        kind: 'comic';
        snapshot: ComicSnapshot;
        result: { comicDiaryId: string; comicRenderTaskId: string } | null;
      }
    | {
        kind: 'diary';
        snapshot: DiarySnapshot;
        result: { diaryEntryId: string } | null;
      }
  );
export type ComicDetail = {
  comicDiary: StationComicDiaryDTO;
  tasks: ComicRenderTaskDTO[];
};
export type ComicPublishDraft = { body: string; mediaAssetIds: string[] };
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const keys = (
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) =>
  required.every(key => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    key => required.includes(key) || optional.includes(key),
  );
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;
// Reject invisible control characters in server-provided plain text.
// eslint-disable-next-line no-control-regex
const invisibleControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const plain = (
  value: unknown,
  max: number,
  required = false,
): value is string =>
  typeof value === 'string' &&
  value.length <= max &&
  (!required || Boolean(value.trim())) &&
  !invisibleControls.test(value) &&
  !/<\/?[a-z][^>]*>/i.test(value);
const invalid = () =>
  new Error('创作预览数据不受支持，请刷新或联系管理员完成升级。');

export function parseComicSnapshot(value: unknown): ComicSnapshot {
  if (
    !object(value) ||
    !keys(value, ['title', 'summary', 'style', 'frameCount', 'frames']) ||
    !plain(value.title, 120, true) ||
    !plain(value.summary, 280, true) ||
    !['slice-of-life', 'cute', 'manga', 'storyboard'].includes(
      String(value.style),
    ) ||
    !integer(value.frameCount) ||
    value.frameCount < 2 ||
    value.frameCount > 8 ||
    !Array.isArray(value.frames) ||
    value.frames.length !== value.frameCount
  )
    throw invalid();
  value.frames.forEach((frame, index) => {
    if (
      !object(frame) ||
      !keys(frame, [
        'index',
        'title',
        'scene',
        'caption',
        'dialogue',
        'mood',
        'camera',
        'mediaAssetIds',
      ]) ||
      frame.index !== index + 1 ||
      !plain(frame.title, 80, true) ||
      !plain(frame.scene, 220) ||
      !plain(frame.caption, 220) ||
      !plain(frame.dialogue, 160) ||
      !plain(frame.mood, 40) ||
      !plain(frame.camera, 40) ||
      !(frame.scene || frame.caption || frame.dialogue) ||
      !Array.isArray(frame.mediaAssetIds) ||
      frame.mediaAssetIds.length > 4 ||
      frame.mediaAssetIds.some(id => !uuid(id)) ||
      new Set(frame.mediaAssetIds).size !== frame.mediaAssetIds.length
    )
      throw invalid();
  });
  return value as ComicSnapshot;
}

export function parseContentPreview(value: unknown): ContentPreview {
  if (
    !object(value) ||
    !keys(value, [
      'id',
      'version',
      'revision',
      'snapshotHash',
      'kind',
      'status',
      'threadId',
      'inputMessageId',
      'outputMessageId',
      'snapshot',
      'sources',
      'allowedActions',
      'expiresAt',
      'result',
    ]) ||
    !uuid(value.id) ||
    value.version !== 1 ||
    !integer(value.revision) ||
    typeof value.snapshotHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.snapshotHash) ||
    !uuid(value.threadId) ||
    !uuid(value.inputMessageId) ||
    !uuid(value.outputMessageId) ||
    ![
      'pending',
      'confirmed',
      'rejected',
      'expired',
      'superseded',
      'revoked',
    ].includes(String(value.status)) ||
    !Array.isArray(value.allowedActions) ||
    value.allowedActions.some(
      action => !['confirm', 'reject'].includes(action),
    ) ||
    new Set(value.allowedActions).size !== value.allowedActions.length ||
    (value.status !== 'pending' && value.allowedActions.length > 0) ||
    typeof value.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    !Array.isArray(value.sources) ||
    value.sources.length > 6
  )
    throw invalid();
  for (const source of value.sources)
    if (
      !object(source) ||
      !keys(source, ['type', 'id', 'title'], ['mediaAssetId']) ||
      !plain(source.type, 80, true) ||
      !uuid(source.id) ||
      !plain(source.title, 512) ||
      (source.mediaAssetId !== undefined && !uuid(source.mediaAssetId))
    )
      throw invalid();
  if (value.kind === 'comic') {
    const snapshot = parseComicSnapshot(value.snapshot);
    const selected = new Set(
      value.sources.flatMap(source =>
        object(source) && typeof source.mediaAssetId === 'string'
          ? [source.mediaAssetId]
          : [],
      ),
    );
    if (
      value.status === 'pending' &&
      snapshot.frames.some(frame =>
        frame.mediaAssetIds.some(id => !selected.has(id)),
      )
    )
      throw invalid();
    if (
      value.result !== null &&
      (!object(value.result) ||
        Object.keys(value.result).length !== 2 ||
        !uuid(value.result.comicDiaryId) ||
        !uuid(value.result.comicRenderTaskId))
    )
      throw invalid();
  } else if (value.kind === 'diary') {
    if (
      !object(value.snapshot) ||
      !keys(value.snapshot, ['title', 'body', 'mood']) ||
      !plain(value.snapshot.title, 120, true) ||
      !plain(value.snapshot.body, 20000, true) ||
      !plain(value.snapshot.mood, 40) ||
      (value.result !== null &&
        (!object(value.result) ||
          Object.keys(value.result).length !== 1 ||
          !uuid(value.result.diaryEntryId)))
    )
      throw invalid();
  } else throw invalid();
  if ((value.status === 'confirmed') !== (value.result !== null))
    throw invalid();
  return value as ContentPreview;
}

export function contentPreviewReference(
  message: Pick<
    MessageDTO,
    'threadId' | 'senderType' | 'metadata' | 'deletedAt' | 'recalledAt'
  > & { localStatus?: string },
  threadId: string,
  agentId?: string | null,
): ContentPreviewRef | null {
  const ref = message.metadata?.contentPreview;
  return agentId === 'comic-diary' &&
    message.threadId === threadId &&
    message.senderType === 'agent' &&
    !message.deletedAt &&
    !message.recalledAt &&
    !message.localStatus &&
    object(ref) &&
    ref.version === 1 &&
    uuid(ref.id)
    ? { version: 1, id: ref.id }
    : null;
}

export function parseComicDetail(value: unknown, id: string): ComicDetail {
  if (
    !object(value) ||
    !object(value.comicDiary) ||
    value.comicDiary.id !== id ||
    !plain(value.comicDiary.title, 160, true) ||
    !Array.isArray(value.comicDiary.frames) ||
    !Array.isArray(value.tasks) ||
    value.tasks.length > 50
  )
    throw invalid();
  const tasks = value.tasks.map(parseComicRenderTask);
  if (
    tasks.some(task => task.comicDiaryId !== id) ||
    new Set(tasks.map(task => task.id)).size !== tasks.length
  )
    throw invalid();
  return { comicDiary: value.comicDiary as StationComicDiaryDTO, tasks };
}
