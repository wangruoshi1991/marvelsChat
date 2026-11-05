import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { WorkspaceContribution } from '../../models/agentWorkspace';
import { agentWorkspaceApi } from '../../services/api/agentWorkspaceApi';

type State = {
  token: string;
  agentId: string;
  contributions: WorkspaceContribution[];
  unavailable: number;
  hasMore: boolean;
  error: string;
};

export type WorkspaceContributionsState = Omit<State, 'token' | 'agentId'>;

export function useWorkspaceContributions(
  token?: string,
  agentId?: string,
): WorkspaceContributionsState {
  const [state, setState] = useState<State>();
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const foregroundRef = useRef(foreground);
  const generation = useRef(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', value => {
      foregroundRef.current = value === 'active';
      if (value !== 'active') {
        generation.current += 1;
        setState(undefined);
      }
      setForeground(value === 'active');
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!token || !agentId || !foreground) return;
    let active = true;
    const epoch = ++generation.current;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let interval = 15000;
      try {
        const result = await agentWorkspaceApi.contributions(token, agentId);
        if (
          result.contributions.some(item =>
            ['queued', 'running'].includes(item.step.status),
          )
        )
          interval = 3000;
        if (active && foregroundRef.current && epoch === generation.current)
          setState({ token, agentId, ...result, error: '' });
      } catch (error) {
        if (active && foregroundRef.current && epoch === generation.current)
          setState({
            token,
            agentId,
            contributions: [],
            unavailable: 0,
            hasMore: false,
            error:
              error instanceof Error ? error.message : '无法读取协作贡献。',
          });
      }
      if (active) timer = setTimeout(poll, interval);
    };
    poll();
    return () => {
      active = false;
      generation.current += 1;
      clearTimeout(timer);
    };
  }, [token, agentId, foreground]);
  return state &&
    state.token === token &&
    state.agentId === agentId &&
    foreground
    ? state
    : { contributions: [], unavailable: 0, hasMore: false, error: '' };
}
