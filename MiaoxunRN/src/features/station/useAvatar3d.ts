import { useCallback, useEffect, useState } from 'react';

import { Avatar3DBootstrapDTO } from '../../models/api';
import { apiClient, MiaoxunApiError } from '../../services/apiClient';
import {
  avatar3dPollingDelayMs,
  shouldPollAvatar3dJob,
} from './avatar3dWorkflow';

export type Avatar3DLoadState =
  | 'loading'
  | 'ready'
  | 'unavailable'
  | 'error';

export function useAvatar3d(token: string, pollingEnabled = true) {
  const [bootstrap, setBootstrap] = useState<Avatar3DBootstrapDTO | null>(null);
  const [status, setStatus] = useState<Avatar3DLoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const refresh = useCallback(async () => {
    if (!token) {
      setBootstrap(null);
      setStatus('unavailable');
      setErrorMessage('');
      return null;
    }

    setStatus(current => (current === 'ready' ? current : 'loading'));
    setErrorMessage('');
    try {
      const next = await apiClient.avatar3dBootstrap(token);
      setBootstrap(next);
      setStatus('ready');
      return next;
    } catch (error) {
      setBootstrap(null);
      if (error instanceof MiaoxunApiError && error.status === 404) {
        setStatus('unavailable');
        return null;
      }
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '3D形象加载失败');
      return null;
    }
  }, [token]);

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
      const next = await refresh();
      const nextStatus = next?.activeJob?.status;
      if (active && nextStatus && shouldPollAvatar3dJob(nextStatus)) {
        timeout = setTimeout(poll, avatar3dPollingDelayMs(nextStatus));
      }
    };

    timeout = setTimeout(poll, avatar3dPollingDelayMs(activeJobStatus));
    return () => {
      active = false;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [
    activeJobId,
    activeJobStatus,
    pollingEnabled,
    refresh,
  ]);

  return { bootstrap, errorMessage, refresh, status };
}
