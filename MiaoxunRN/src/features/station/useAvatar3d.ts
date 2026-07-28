import { useCallback, useEffect, useState } from 'react';

import { Avatar3DBootstrapDTO } from '../../models/api';
import { apiClient, MiaoxunApiError } from '../../services/apiClient';

export type Avatar3DLoadState =
  | 'loading'
  | 'ready'
  | 'unavailable'
  | 'error';

export function useAvatar3d(token: string) {
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

  return { bootstrap, errorMessage, refresh, status };
}
