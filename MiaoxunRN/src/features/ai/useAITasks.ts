import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  AITaskDTO,
  AITaskOperation,
  isTaskTerminal,
} from '../../models/aiTask';
import { aiTaskApi } from '../../services/api/aiTaskApi';

export function mergeTask(tasks: AITaskDTO[], incoming: AITaskDTO) {
  const old = tasks.find(task => task.id === incoming.id);
  if (old && old.revision > incoming.revision) return tasks;
  return [incoming, ...tasks.filter(task => task.id !== incoming.id)]
    .sort(
      (a, b) =>
        Number(isTaskTerminal(a)) - Number(isTaskTerminal(b)) ||
        b.createdAt.localeCompare(a.createdAt),
    )
    .slice(0, 30);
}

export function useAITasks({
  token,
  active = true,
  threadId,
  kind,
  onTaskReady,
}: {
  token: string;
  active?: boolean;
  threadId?: string;
  kind?: AITaskDTO['kind'];
  onTaskReady?: (task: AITaskDTO) => Promise<unknown> | void;
}) {
  const scope = `${token}:${kind || 'all'}:${threadId || ''}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    tasks: AITaskDTO[];
  }>({ scope, tasks: [] });
  const [error, setError] = useState('');
  const [loadState, setLoadState] = useState({
    scope,
    sequence: 0,
    loading: false,
    hasLoaded: false,
  });
  const [decisionError, setDecisionError] = useState('');
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  const generation = useRef(0);
  const sequence = useRef(0);
  const pending = useRef(false);
  const readyRef = useRef(onTaskReady);
  readyRef.current = onTaskReady;
  const notified = useRef(new Map<string, number>());
  const artifactRefresh = useRef<{
    generation: number;
    promise: Promise<unknown>;
  } | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  const tasks = snapshot.scope === scope ? snapshot.tasks : [];

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state =>
      setForeground(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  const notify = useCallback(
    async (task: AITaskDTO, expectedGeneration: number) => {
      if (!isTaskTerminal(task) && task.status !== 'awaiting_confirmation')
        return;
      if ((notified.current.get(task.id) ?? -1) >= task.revision) return;
      notified.current.set(task.id, task.revision);
      try {
        let refresh = artifactRefresh.current;
        if (!refresh || refresh.generation !== expectedGeneration) {
          const callback = readyRef.current;
          refresh = {
            generation: expectedGeneration,
            promise: Promise.resolve().then(() =>
              generation.current === expectedGeneration
                ? callback?.(task)
                : undefined,
            ),
          };
          artifactRefresh.current = refresh;
        }
        try {
          await refresh.promise;
        } finally {
          if (artifactRefresh.current === refresh)
            artifactRefresh.current = null;
        }
      } catch (issue) {
        if (generation.current !== expectedGeneration) return;
        notified.current.delete(task.id);
        setError(issue instanceof Error ? issue.message : '无法刷新任务成果。');
      }
    },
    [],
  );

  useEffect(() => {
    setSnapshot({ scope, tasks: [] });
    setError('');
    setLoadState({ scope, sequence: 0, loading: false, hasLoaded: false });
    setDecisionError('');
    setPendingTaskId(null);
    pending.current = false;
    notified.current.clear();
  }, [scope]);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    if (!token || !active || !foreground) {
      refreshRef.current = async () => undefined;
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const requestSequence = ++sequence.current;
      setLoadState(current => ({
        scope,
        sequence: requestSequence,
        loading: true,
        hasLoaded: current.scope === scope && current.hasLoaded,
      }));
      try {
        const incoming = await aiTaskApi.list(token, { threadId, kind });
        if (
          generation.current !== currentGeneration ||
          sequence.current !== requestSequence ||
          scopeRef.current !== scope
        )
          return;
        setSnapshot(current => ({
          scope,
          tasks: incoming.map(task => {
            const previous =
              current.scope === scope
                ? current.tasks.find(item => item.id === task.id)
                : undefined;
            return previous && previous.revision > task.revision
              ? previous
              : task;
          }),
        }));
        setError('');
        await Promise.all(
          incoming.map(task => notify(task, currentGeneration)),
        );
      } catch (issue) {
        if (
          generation.current === currentGeneration &&
          sequence.current === requestSequence &&
          scopeRef.current === scope
        ) {
          setError(issue instanceof Error ? issue.message : '无法读取任务。');
        }
      } finally {
        if (
          generation.current === currentGeneration &&
          scopeRef.current === scope
        ) {
          setLoadState(current =>
            current.scope === scope && current.sequence === requestSequence
              ? { ...current, loading: false, hasLoaded: true }
              : current,
          );
        }
      }
    };
    refreshRef.current = load;
    const poll = async () => {
      await load();
      if (generation.current === currentGeneration)
        timer = setTimeout(poll, 3000);
    };
    poll();
    return () => {
      generation.current += 1;
      if (timer) clearTimeout(timer);
      refreshRef.current = async () => undefined;
    };
  }, [active, foreground, kind, notify, scope, threadId, token]);

  const refresh = useCallback(() => refreshRef.current(), []);
  const track = useCallback(
    (task: AITaskDTO) => {
      if (scopeRef.current !== scope) return;
      sequence.current += 1;
      setSnapshot(current => ({
        scope,
        tasks: mergeTask(current.scope === scope ? current.tasks : [], task),
      }));
      notify(task, generation.current);
    },
    [notify, scope],
  );
  const decide = useCallback(
    async (task: AITaskDTO, operation: AITaskOperation) => {
      if (
        pending.current ||
        !active ||
        !foreground ||
        scopeRef.current !== scope ||
        !task.allowedActions.includes(operation)
      )
        return;
      const currentGeneration = generation.current;
      pending.current = true;
      setPendingTaskId(task.id);
      setDecisionError('');
      sequence.current += 1;
      try {
        const updated = await aiTaskApi.decide(token, task, operation);
        if (
          generation.current !== currentGeneration ||
          scopeRef.current !== scope
        )
          return;
        track(updated);
      } catch (issue) {
        if (
          generation.current !== currentGeneration ||
          scopeRef.current !== scope
        )
          return;
        setDecisionError(
          issue instanceof Error ? issue.message : '任务操作失败。',
        );
        await refresh();
      } finally {
        if (scopeRef.current === scope) {
          pending.current = false;
          setPendingTaskId(null);
        }
      }
    },
    [active, foreground, refresh, scope, token, track],
  );
  return {
    tasks,
    loading:
      Boolean(token && active && foreground) &&
      loadState.scope === scope &&
      loadState.loading,
    hasLoaded: loadState.scope === scope && loadState.hasLoaded,
    error: snapshot.scope === scope ? error : '',
    decisionError: snapshot.scope === scope ? decisionError : '',
    pendingTaskId: snapshot.scope === scope ? pendingTaskId : null,
    refresh,
    track,
    decide,
  };
}
