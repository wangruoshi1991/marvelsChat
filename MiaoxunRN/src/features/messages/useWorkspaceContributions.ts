import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { WorkspaceContribution } from '../../models/agentWorkspace';
import { agentWorkspaceApi } from '../../services/api/agentWorkspaceApi';

type State = {
  token: string;
  agentId: string;
  selectionKey: string;
  contributions: WorkspaceContribution[];
  unavailable: number;
  hasMore: boolean;
  error: string;
  loading: boolean;
  historyLoaded: boolean;
};

export type WorkspaceContributionsState = Omit<
  State,
  'token' | 'agentId' | 'selectionKey'
> & { loadMore: () => Promise<void>; retry: () => Promise<void> };

export function useWorkspaceContributions(
  token?: string,
  agentId?: string,
  selected?: { id: string; nodeId: string },
): WorkspaceContributionsState {
  const selectedWorkspaceId = selected?.id;
  const selectedNodeId = selected?.nodeId;
  const selectionKey = `${selectedWorkspaceId || ''}:${selectedNodeId || ''}`;
  const [state, setState] = useState<State>();
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const [activation, setActivation] = useState(0);
  const foregroundRef = useRef(foreground);
  const generation = useRef(0);
  const action = useRef<(more: boolean) => Promise<void>>(async () => {});
  const loadMore = useCallback(() => action.current(true), []);
  const retry = useCallback(() => action.current(false), []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', value => {
      const wasForeground = foregroundRef.current;
      foregroundRef.current = value === 'active';
      if (value !== 'active') {
        generation.current += 1;
        setState(undefined);
      } else if (!wasForeground) {
        setActivation(previous => previous + 1);
      }
      setForeground(value === 'active');
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!token || !agentId || !foreground) return;
    let active = true;
    let busy = false;
    let pendingMore = false;
    let pageCount = 1;
    let oldestLoadedId: string | undefined;
    let requestId = 0;
    let timer: ReturnType<typeof setTimeout>;
    let staleTimer: ReturnType<typeof setTimeout>;
    let deadline: ReturnType<typeof setTimeout>;
    const epoch = ++generation.current;
    const valid = () =>
      active && foregroundRef.current && epoch === generation.current;
    const expire = () => {
      if (!valid()) return;
      requestId += 1;
      busy = false;
      pendingMore = false;
      clearTimeout(timer);
      clearTimeout(deadline);
      clearTimeout(staleTimer);
      setState({
        token,
        agentId,
        selectionKey,
        contributions: [],
        unavailable: 0,
        hasMore: false,
        error: '协作贡献校验超时，请重试。',
        loading: false,
        historyLoaded: pageCount > 1,
      });
    };
    const refresh = async (more: boolean) => {
      if (!valid()) return;
      if (busy) {
        if (more) {
          pendingMore = true;
          setState(previous =>
            previous ? { ...previous, loading: true } : previous,
          );
        }
        return;
      }
      busy = true;
      const run = ++requestId;
      const validRun = () => valid() && requestId === run;
      clearTimeout(timer);
      clearTimeout(deadline);
      deadline = setTimeout(expire, 15000);
      if (more)
        setState(previous =>
          previous ? { ...previous, loading: true, error: '' } : previous,
        );
      let interval = 10000;
      let paused = false;
      try {
        const items = new Map<string, WorkspaceContribution>();
        let unavailable = 0;
        let before: string | undefined;
        let hasMore = false;
        let fetched = 0;
        const cursors = new Set<string>();
        const boundary = more || pageCount > 1 ? oldestLoadedId : undefined;
        let boundaryFound = !boundary;
        let extraPage = more && Boolean(boundary);
        let lastId: string | undefined;
        while (true) {
          if (fetched >= pageCount + 50) {
            oldestLoadedId = undefined;
            throw Object.assign(
              new Error('协作贡献历史变化过多，请重新加载。'),
              {
                code: 'WORKSPACE_CONTRIBUTION_CURSOR_INVALID',
              },
            );
          }
          const page = before
            ? await agentWorkspaceApi.contributions(token, agentId, before)
            : await agentWorkspaceApi.contributions(token, agentId);
          if (!validRun()) return;
          fetched += 1;
          lastId = page.scannedIds[page.scannedIds.length - 1] || lastId;
          page.contributions.forEach(item => items.set(item.step.id, item));
          unavailable += page.unavailable;
          hasMore = page.hasMore;
          const foundHere = Boolean(
            boundary && page.scannedIds.includes(boundary),
          );
          boundaryFound ||= foundHere;
          if (boundaryFound && (!extraPage || !hasMore)) break;
          if (foundHere) extraPage = false;
          if (!hasMore) break;
          if (!page.nextCursor || cursors.has(page.nextCursor))
            throw new Error('协作贡献分页游标无效，请重试。');
          cursors.add(page.nextCursor);
          before = page.nextCursor;
        }
        if (!boundaryFound) {
          pageCount = 1;
          oldestLoadedId = undefined;
          throw Object.assign(new Error('协作贡献历史已变化，请重新加载。'), {
            code: 'WORKSPACE_CONTRIBUTION_CURSOR_INVALID',
          });
        }
        pageCount = fetched;
        oldestLoadedId = lastId;
        let selectionError = '';
        if (
          selectedWorkspaceId &&
          selectedNodeId &&
          items.get(selectedNodeId)?.workspace.id !== selectedWorkspaceId
        ) {
          items.delete(selectedNodeId);
          try {
            const contribution = await agentWorkspaceApi.contribution(
              token,
              agentId,
              selectedNodeId,
            );
            if (
              !contribution ||
              contribution.workspace.id !== selectedWorkspaceId
            )
              throw new Error('这份贡献已变化，请返回原任务重新选择。');
            items.set(contribution.step.id, contribution);
          } catch (issue) {
            selectionError =
              issue instanceof Error ? issue.message : '无法读取所选协作贡献。';
          }
        }
        const visibleContributions = [...items.values()];
        if (
          visibleContributions.some(item =>
            ['queued', 'running'].includes(item.step.status),
          )
        )
          interval = 3000;
        if (validRun()) {
          setState({
            token,
            agentId,
            selectionKey,
            contributions: visibleContributions,
            unavailable,
            hasMore,
            error: selectionError,
            loading: pendingMore,
            historyLoaded: pageCount > 1,
          });
          clearTimeout(staleTimer);
          staleTimer = setTimeout(expire, 15000);
        }
      } catch (error) {
        if (validRun()) {
          clearTimeout(staleTimer);
          paused = Boolean(
            error &&
              typeof error === 'object' &&
              'code' in error &&
              error.code === 'WORKSPACE_CONTRIBUTION_CURSOR_INVALID',
          );
          if (paused) pageCount = 1;
          if (paused) pendingMore = false;
          setState({
            token,
            agentId,
            selectionKey,
            contributions: [],
            unavailable: 0,
            hasMore: false,
            error:
              error instanceof Error ? error.message : '无法读取协作贡献。',
            loading: false,
            historyLoaded: pageCount > 1,
          });
        }
      } finally {
        if (validRun()) {
          clearTimeout(deadline);
          busy = false;
          if (pendingMore && !paused) {
            pendingMore = false;
            refresh(true);
          } else if (!paused)
            timer = setTimeout(() => {
              refresh(false);
            }, interval);
        }
      }
    };
    action.current = refresh;
    refresh(false);
    return () => {
      active = false;
      generation.current += 1;
      clearTimeout(timer);
      clearTimeout(staleTimer);
      clearTimeout(deadline);
    };
  }, [
    token,
    agentId,
    foreground,
    activation,
    selectedWorkspaceId,
    selectedNodeId,
    selectionKey,
  ]);
  const visible =
    state &&
    state.token === token &&
    state.agentId === agentId &&
    state.selectionKey === selectionKey &&
    foreground
      ? state
      : {
          contributions: [],
          unavailable: 0,
          hasMore: false,
          error: '',
          loading: false,
          historyLoaded: false,
        };
  return { ...visible, loadMore, retry };
}
