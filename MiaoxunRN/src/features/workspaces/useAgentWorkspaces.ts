import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { AgentWorkspace } from '../../models/agentWorkspace';
import { agentWorkspaceApi } from '../../services/api/agentWorkspaceApi';
import { MiaoxunApiError } from '../../services/api/http';

export function useAgentWorkspaces({
  token,
  active,
}: {
  token: string;
  active: boolean;
}) {
  const [state, setState] = useState<{
    token: string;
    workspaces: AgentWorkspace[];
    error: string;
    loaded: boolean;
  }>({ token, workspaces: [], error: '', loaded: false });
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'inactive' &&
      AppState.currentState !== 'background',
  );
  const generation = useRef(0);
  const foregroundRef = useRef(foreground);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      foregroundRef.current = next === 'active';
      if (next !== 'active') generation.current += 1;
      setForeground(next === 'active');
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    const epoch = ++generation.current;
    let current = true;
    let request = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!active || !foreground || !token) return;
    const load = async () => {
      if (!current || !foregroundRef.current || epoch !== generation.current)
        return;
      const seq = ++request;
      try {
        const workspaces = await agentWorkspaceApi.list(token);
        if (!current || epoch !== generation.current || request !== seq) return;
        setState(old => ({
          token,
          workspaces: workspaces.map(w => {
            const previous =
              old.token === token
                ? old.workspaces.find(a => a.id === w.id)
                : null;
            return previous && previous.revision > w.revision ? previous : w;
          }),
          error: '',
          loaded: true,
        }));
      } catch (issue) {
        if (!current || epoch !== generation.current || request !== seq) return;
        setState(old => ({
          token,
          workspaces:
            old.token === token &&
            !(
              issue instanceof MiaoxunApiError &&
              [401, 403].includes(issue.status || 0)
            )
              ? old.workspaces
              : [],
          error:
            issue instanceof Error ? issue.message : '无法读取协作工作空间。',
          loaded: true,
        }));
      }
    };
    refreshRef.current = load;
    const poll = async () => {
      await load();
      if (current) timer = setTimeout(poll, 3000);
    };
    poll();
    return () => {
      current = false;
      generation.current += 1;
      if (timer) clearTimeout(timer);
      refreshRef.current = async () => {};
    };
  }, [active, foreground, token]);
  return {
    workspaces: state.token === token ? state.workspaces : [],
    error: state.token === token ? state.error : '',
    loaded: state.token === token && state.loaded,
    refresh: useCallback(() => refreshRef.current(), []),
  };
}
