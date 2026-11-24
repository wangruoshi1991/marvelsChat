import { useCallback, useEffect, useRef, useState } from 'react';

import { Avatar3DBootstrapDTO } from '../../models/api';
import { apiClient, MiaoxunApiError } from '../../services/apiClient';
import { useCurrentScope } from '../../shared/useCurrentScope';
import {
  avatar3dPollingDelayMs,
  shouldPollAvatar3dJob,
} from './avatar3dWorkflow';

export type Avatar3DLoadState = 'loading' | 'ready' | 'unavailable' | 'error';

export function useAvatar3d(token: string, pollingEnabled = true) {
  const [result, setResult] = useState<{
    owner: string;
    bootstrap: Avatar3DBootstrapDTO | null;
    status: Avatar3DLoadState;
    errorMessage?: string;
  } | null>(null);
  const current = result?.owner === token ? result : null;
  const bootstrap = current?.bootstrap ?? null;
  const status = current?.status ?? (token ? 'loading' : 'unavailable');
  const errorMessage = current?.errorMessage ?? '';
  const isCurrentSession = useCurrentScope(token);
  const isCurrentPolling = useCurrentScope(pollingEnabled);
  const generation = useRef(0);

  const load = useCallback(
    async (ownsPoll?: () => boolean) => {
      if (!isCurrentSession() || !token || ownsPoll?.() === false) return null;
      const request = ++generation.current;
      const ownsResult = () =>
        isCurrentSession() &&
        ownsPoll?.() !== false &&
        generation.current === request;
      setResult(previous =>
        previous?.owner === token && previous.status === 'ready'
          ? previous
          : { owner: token, bootstrap: null, status: 'loading' },
      );
      try {
        const next = await apiClient.avatar3dBootstrap(token);
        if (!ownsResult()) return null;
        setResult({ owner: token, bootstrap: next, status: 'ready' });
        return next;
      } catch (error) {
        if (!ownsResult()) return null;
        if (error instanceof MiaoxunApiError && error.status === 404) {
          setResult({ owner: token, bootstrap: null, status: 'unavailable' });
          return null;
        }
        setResult({
          owner: token,
          bootstrap: null,
          status: 'error',
          errorMessage:
            error instanceof Error ? error.message : '3D形象加载失败',
        });
        return null;
      }
    },
    [isCurrentSession, token],
  );
  const refresh = useCallback(() => load(), [load]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const activeJobId = bootstrap?.activeJob?.id;
  const activeJobStatus = bootstrap?.activeJob?.status;

  useEffect(() => {
    if (
      !pollingEnabled ||
      !activeJobId ||
      !activeJobStatus ||
      !shouldPollAvatar3dJob(activeJobStatus)
    ) {
      return undefined;
    }

    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const next = await load(() => active && isCurrentPolling());
      // If a manual refresh superseded this read, keep polling until its
      // accepted result changes the job or the screen disables polling.
      if (
        active &&
        isCurrentPolling() &&
        (!next || next.activeJob?.status === activeJobStatus)
      ) {
        timeout = setTimeout(poll, avatar3dPollingDelayMs(activeJobStatus));
      }
    };

    timeout = setTimeout(poll, avatar3dPollingDelayMs(activeJobStatus));
    return () => {
      active = false;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [activeJobId, activeJobStatus, isCurrentPolling, load, pollingEnabled]);

  return { bootstrap, errorMessage, refresh, status };
}
