import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  ComicRenderTaskDTO,
  isActiveComicRender,
} from '../../models/comicRender';
import { supportsComicRenders } from '../../services/aiContract';
import { comicRenderApi } from '../../services/api/comicRenderApi';

type State = {
  identity: string;
  tasks: ComicRenderTaskDTO[];
  loaded: boolean;
  error: string;
  busy: boolean;
};
type Context = {
  current: () => boolean;
  mutate: (
    operation: () => Promise<ComicRenderTaskDTO>,
  ) => Promise<ComicRenderTaskDTO | undefined>;
};

export function useComicRenderTasks(token: string, comicDiaryId: string) {
  const identity = `${token}:${comicDiaryId}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const supported = supportsComicRenders(token);
  const [activation, setActivation] = useState(0);
  const foregroundRef = useRef(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  const [foreground, setForeground] = useState(foregroundRef.current);
  const generation = useRef(0);
  const contextRef = useRef<Context | null>(null);
  const [state, setState] = useState<State>({
    identity,
    tasks: [],
    loaded: false,
    error: '',
    busy: false,
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      generation.current += 1;
      foregroundRef.current = next === 'active';
      setForeground(next === 'active');
      setState(old => ({
        ...old,
        tasks: [],
        loaded: false,
        error: '',
        busy: false,
      }));
      // A same-batch background -> active transition still starts a fresh read.
      if (next === 'active') setActivation(value => value + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const epoch = ++generation.current;
    let alive = true;
    let requestSequence = 0;
    let mutating = false;
    let tasks: ComicRenderTaskDTO[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () =>
      alive &&
      epoch === generation.current &&
      identityRef.current === identity &&
      foregroundRef.current &&
      supportsComicRenders(token);
    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    const fail = (issue: unknown) => {
      clearTimer();
      tasks = [];
      setState({
        identity,
        tasks: [],
        loaded: true,
        busy: false,
        error:
          issue instanceof Error ? issue.message : '无法读取漫画画面任务。',
      });
    };
    const publish = () =>
      setState(old => ({ ...old, identity, tasks, loaded: true, error: '' }));
    const merge = (next: ComicRenderTaskDTO) => {
      const previous = tasks.find(task => task.id === next.id);
      const accepted =
        previous && previous.revision > next.revision ? previous : next;
      tasks = previous
        ? tasks.map(task => (task.id === accepted.id ? accepted : task))
        : [accepted, ...tasks];
    };
    const schedule = () => {
      clearTimer();
      if (current() && !mutating && tasks.some(isActiveComicRender))
        timer = setTimeout(poll, 3000);
    };
    const poll = async () => {
      if (!current() || mutating) return;
      const sequence = ++requestSequence;
      try {
        const next = await Promise.all(
          tasks
            .filter(isActiveComicRender)
            .map(task => comicRenderApi.get(token, task.id)),
        );
        if (!current() || sequence !== requestSequence) return;
        next.forEach(merge);
        publish();
        schedule();
      } catch (issue) {
        if (current() && sequence === requestSequence) fail(issue);
      }
    };
    const context: Context = {
      current,
      async mutate(operation) {
        if (!current() || mutating) return;
        mutating = true;
        requestSequence += 1;
        clearTimer();
        setState(old => ({ ...old, busy: true, error: '' }));
        try {
          const task = await operation();
          if (!current()) return;
          merge(task);
          publish();
          return task;
        } catch (issue) {
          if (current()) {
            fail(issue);
            throw issue;
          }
        } finally {
          mutating = false;
          if (current()) {
            setState(old => ({ ...old, busy: false }));
            schedule();
          }
        }
      },
    };
    contextRef.current = context;
    setState({ identity, tasks: [], loaded: false, error: '', busy: false });
    if (supported && foreground && token) {
      const sequence = ++requestSequence;
      comicRenderApi.list(token, comicDiaryId).then(
        next => {
          if (!current() || sequence !== requestSequence) return;
          tasks = next;
          publish();
          schedule();
        },
        issue => {
          if (current() && sequence === requestSequence) fail(issue);
        },
      );
    }
    return () => {
      alive = false;
      clearTimer();
      if (contextRef.current === context) contextRef.current = null;
    };
  }, [identity, token, comicDiaryId, supported, foreground, activation]);

  const create = useCallback(
    (idempotencyKey: string) =>
      contextRef.current?.mutate(() =>
        comicRenderApi.create(token, comicDiaryId, idempotencyKey),
      ) ?? Promise.resolve(undefined),
    [token, comicDiaryId],
  );
  const cancel = useCallback(
    (task: ComicRenderTaskDTO) =>
      contextRef.current?.mutate(() => comicRenderApi.cancel(token, task)) ??
      Promise.resolve(undefined),
    [token],
  );
  const isCurrent = useCallback(
    () =>
      identityRef.current === identity &&
      Boolean(contextRef.current?.current()),
    [identity],
  );
  const captureCurrent = useCallback(() => {
    const context = contextRef.current;
    return () =>
      Boolean(context && contextRef.current === context && context.current());
  }, []);
  const visible = supported && foreground && state.identity === identity;
  return {
    tasks: visible ? state.tasks : [],
    loaded: visible && state.loaded,
    error: visible ? state.error : '',
    busy: visible && state.busy,
    supported,
    foreground,
    create,
    cancel,
    isCurrent,
    captureCurrent,
    refresh: () => {
      if (isCurrent()) setActivation(value => value + 1);
    },
  };
}
