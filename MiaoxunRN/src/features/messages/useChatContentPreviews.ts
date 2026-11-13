import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  ContentPreview,
  contentPreviewReference,
} from '../../models/chatContentPreview';
import {
  ComicRenderTaskDTO,
  isActiveComicRender,
} from '../../models/comicRender';
import { chatContentApi } from '../../services/api/chatContentApi';
import { MiaoxunApiError } from '../../services/api/http';
import { comicRenderApi } from '../../services/api/comicRenderApi';
import { supportsChatContent } from '../../services/aiContract';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';
import { ChatMessage } from '../session/sessionTypes';

export type PreviewEntry = {
  preview?: ContentPreview;
  task?: ComicRenderTaskDTO;
  loading?: boolean;
  imageRevision?: number;
  busy?: boolean;
  error?: string;
};
type Operations = {
  refresh: (id: string) => Promise<void>;
  confirm: (id: string) => Promise<void>;
  reject: (id: string) => Promise<void>;
};
const noop = async () => {};
const isDefiniteRejection = (issue: unknown) =>
  issue instanceof MiaoxunApiError &&
  !issue.isNetworkError &&
  !issue.isTimeout &&
  ((Boolean(issue.status) && issue.status! >= 400 && issue.status! < 500) ||
    (issue.status === 503 && issue.code === 'COMIC_RENDER_NOT_READY'));

// One owner per visible conversation; historical cards never start their own
// timers. Read recovery cannot dispatch a provider or repeat a confirmation.
export function useChatContentPreviews({
  token,
  userId,
  threadId,
  agentId,
  messages,
  visibleMessageIds,
  active,
}: {
  token: string;
  userId: string;
  threadId: string;
  agentId?: string | null;
  messages: ChatMessage[];
  visibleMessageIds: string[];
  active: boolean;
}) {
  const identity = `${token}:${userId}:${threadId}`;
  const supported = supportsChatContent(token);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const refs = messages.flatMap(message => {
    const ref = contentPreviewReference(message, threadId, agentId);
    return ref && visibleMessageIds.includes(message.id)
      ? [{ id: ref.id, messageId: message.id }]
      : [];
  });
  const selection = refs
    .map(ref => `${ref.id}:${ref.messageId}`)
    .sort()
    .join('|');
  const selected = useMemo(() => refs, [selection]); // eslint-disable-line react-hooks/exhaustive-deps
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  const foregroundRef = useRef(foreground);
  foregroundRef.current = foreground;
  const [activation, setActivation] = useState(0);
  const [state, setState] = useState<{
    identity: string;
    entries: Record<string, PreviewEntry>;
  }>({ identity, entries: {} });
  const epoch = useRef(0);
  const operations = useRef<Operations>({
    refresh: noop,
    confirm: noop,
    reject: noop,
  });
  const keys = useRef(new Map<string, string>());
  const uncertain = useRef(new Set<string>());
  const revisions = useRef(new Map<string, number>());
  useEffect(() => {
    const listener = AppState.addEventListener('change', next => {
      foregroundRef.current = next === 'active';
      epoch.current += 1;
      setForeground(next === 'active');
      setActivation(value => value + 1);
    });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    const version = ++epoch.current;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const entries: Record<string, PreviewEntry> = {};
    const pending = new Set<string>();
    const current = () =>
      alive &&
      epoch.current === version &&
      identityRef.current === identity &&
      foregroundRef.current &&
      active &&
      supported;
    const publish = () => {
      if (current()) setState({ identity, entries: { ...entries } });
    };
    const accept = (id: string, preview: ContentPreview) => {
      const ref = selected.find(item => item.id === id);
      if (
        !ref ||
        preview.id !== id ||
        preview.threadId !== threadId ||
        preview.outputMessageId !== ref.messageId
      )
        throw new Error('创作预览与当前会话消息不一致。');
      const previousRevision = revisions.current.get(`${identity}:${id}`) || 0;
      if (previousRevision > preview.revision)
        throw new Error('创作预览版本已更新，请刷新查看。');
      revisions.current.set(`${identity}:${id}`, preview.revision);
      entries[id] = { ...entries[id], preview, loading: false, error: '' };
    };
    const readTask = async (id: string) => {
      const preview = entries[id]?.preview;
      if (!preview || preview.kind !== 'comic' || !preview.result) return;
      const task = await comicRenderApi.get(
        token,
        preview.result.comicRenderTaskId,
      );
      if (!current()) return;
      if (task.comicDiaryId !== preview.result.comicDiaryId)
        throw new Error('漫画任务与当前作品不一致。');
      const previous = entries[id]?.task;
      if (!previous || task.revision >= previous.revision)
        entries[id] = { ...entries[id], task };
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (
        current() &&
        Object.values(entries).some(
          entry => entry.task && isActiveComicRender(entry.task),
        )
      )
        timer = setTimeout(poll, 3000);
    };
    const poll = async () => {
      if (!current()) return;
      await Promise.all(
        Object.entries(entries)
          .filter(([, entry]) => entry.task && isActiveComicRender(entry.task))
          .map(async ([id]) => {
            try {
              await readTask(id);
            } catch (issue) {
              if (current())
                entries[id] = {
                  ...entries[id],
                  task: undefined,
                  error:
                    issue instanceof Error
                      ? issue.message
                      : '无法读取任务，请刷新查看。',
                };
            }
          }),
      );
      publish();
      schedule();
    };
    const refresh = async (id: string) => {
      if (!current() || pending.has(id)) return;
      entries[id] = { ...entries[id], loading: true, error: '' };
      publish();
      try {
        const preview = await chatContentApi.get(token, id);
        if (!current()) return;
        accept(id, preview);
        entries[id] = {
          ...entries[id],
          imageRevision: (entries[id].imageRevision || 0) + 1,
        };
        if (preview.status !== 'pending')
          uncertain.current.delete(`${identity}:${id}`);
        else if (uncertain.current.has(`${identity}:${id}`))
          entries[id] = {
            ...entries[id],
            error: '确认结果仍未核实，请继续刷新查看原结果，不要重复生成。',
          };
        await readTask(id);
      } catch (issue) {
        if (current())
          entries[id] = {
            loading: false,
            error:
              issue instanceof Error ? issue.message : '无法读取创作预览。',
          };
      }
      publish();
      schedule();
    };
    const mutate = async (id: string, operation: 'confirm' | 'reject') => {
      const preview = entries[id]?.preview;
      if (
        !current() ||
        !preview ||
        pending.has(id) ||
        uncertain.current.has(`${identity}:${id}`) ||
        !preview.allowedActions.includes(operation)
      )
        return;
      pending.add(id);
      uncertain.current.add(`${identity}:${id}`);
      entries[id] = { ...entries[id], busy: true, error: '' };
      publish();
      try {
        const key =
          keys.current.get(`${identity}:${id}`) || createIdempotencyKey();
        keys.current.set(`${identity}:${id}`, key);
        const next =
          operation === 'confirm'
            ? await chatContentApi.confirm(token, preview, key)
            : await chatContentApi.reject(token, preview);
        if (!current()) return;
        accept(id, next);
        uncertain.current.delete(`${identity}:${id}`);
        keys.current.delete(`${identity}:${id}`);
        await readTask(id);
      } catch (issue) {
        if (current()) {
          const definite = isDefiniteRejection(issue);
          if (definite) uncertain.current.delete(`${identity}:${id}`);
          else uncertain.current.add(`${identity}:${id}`);
          entries[id] = {
            ...entries[id],
            error: `${
              issue instanceof Error ? issue.message : '确认结果暂未核实。'
            } ${
              definite
                ? '请刷新查看当前提案状态。'
                : '请刷新查看原结果，不要重复生成。'
            }`,
          };
        }
      } finally {
        pending.delete(id);
        if (current()) {
          entries[id] = { ...entries[id], busy: false };
          publish();
          schedule();
        }
      }
    };
    const context: Operations = {
      refresh,
      confirm: id => mutate(id, 'confirm'),
      reject: id => mutate(id, 'reject'),
    };
    operations.current = context;
    setState({ identity, entries: {} });
    if (current())
      Promise.all(selected.map(ref => refresh(ref.id))).catch(() => undefined);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      if (operations.current === context)
        operations.current = { refresh: noop, confirm: noop, reject: noop };
    };
  }, [
    identity,
    token,
    userId,
    threadId,
    selected,
    active,
    supported,
    foreground,
    activation,
  ]);
  const refresh = useCallback(
    (id: string) => operations.current.refresh(id),
    [],
  );
  const confirm = useCallback(
    (id: string) => operations.current.confirm(id),
    [],
  );
  const reject = useCallback((id: string) => operations.current.reject(id), []);
  return {
    entries:
      state.identity === identity && foreground && active ? state.entries : {},
    refresh,
    confirm,
    reject,
  };
}
