import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  CallAudioRouteError,
  observeCallAudioRoute,
  readCallAudioRoute,
  selectCallAudioRoute,
  type CallAudioDevice,
  type CallAudioSnapshot,
} from '../../services/voiceCall/voiceCallAudioRoute';

type RouteError = CallAudioRouteError['reason'] | 'switch';
type Selection = {
  id: string;
  timer?: ReturnType<typeof setTimeout>;
};
type RouteSession = {
  pending?: Selection;
  revision: number;
  snapshot?: CallAudioSnapshot;
  publish: (snapshot: CallAudioSnapshot) => void;
};
const nativeFailure = (error: unknown, fallback: RouteError) =>
  error instanceof CallAudioRouteError ? error.reason : fallback;

export function useCallAudioRoute(connectedAt?: number) {
  const session = useRef<RouteSession | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<CallAudioSnapshot>();
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string>();
  const [error, setError] = useState<RouteError>();

  const load = useCallback(async (owner: RouteSession) => {
    const revision = owner.revision;
    setLoading(true);
    setError(undefined);
    try {
      const data = await readCallAudioRoute();
      if (session.current === owner && owner.revision === revision)
        owner.publish(data);
    } catch (failure) {
      if (session.current === owner && owner.revision === revision)
        setError(nativeFailure(failure, 'unavailable'));
    } finally {
      if (session.current === owner) setLoading(false);
    }
  }, []);

  useLayoutEffect(() => {
    setSnapshot(undefined);
    setPendingId(undefined);
    setError(undefined);
    setLoading(false);
    if (!connectedAt) return;

    const owner: RouteSession = {
      revision: 0,
      publish(data) {
        if (session.current !== owner) return;
        owner.revision++;
        owner.snapshot = data;
        setSnapshot(data);
        if (owner.pending && data.currentId === owner.pending.id) {
          clearTimeout(owner.pending.timer);
          owner.pending = undefined;
          setPendingId(undefined);
          setError(undefined);
        }
      },
    };
    session.current = owner;
    const listener = observeCallAudioRoute(owner.publish);
    load(owner);
    return () => {
      clearTimeout(owner.pending?.timer);
      session.current = undefined;
      listener?.remove();
    };
  }, [connectedAt, load]);

  const select = async (device: CallAudioDevice) => {
    const owner = session.current;
    if (!owner || owner.pending || owner.snapshot?.currentId === device.id)
      return;
    const selection: Selection = { id: device.id };
    owner.pending = selection;
    setPendingId(device.id);
    setError(undefined);
    const isCurrent = () =>
      session.current === owner && owner.pending === selection;
    const failed = (failure: RouteError) => {
      if (!isCurrent()) return;
      owner.pending = undefined;
      setPendingId(undefined);
      setError(failure);
    };
    const revision = owner.revision;
    try {
      const result = await selectCallAudioRoute(device, isCurrent);
      if (!isCurrent()) return;
      if (!result) {
        failed('switch');
        return;
      }
      if (owner.revision === revision) owner.publish(result);
      if (!isCurrent()) return;
      const confirmationMs =
        Platform.OS === 'android' && device.kind === 'bluetooth' ? 8000 : 2500;
      selection.timer = setTimeout(async () => {
        try {
          const refreshRevision = owner.revision;
          const confirmed = await readCallAudioRoute();
          if (isCurrent() && owner.revision === refreshRevision)
            owner.publish(confirmed);
        } catch {
          // Keep the last device the system actually confirmed.
        }
        failed('switch');
      }, confirmationMs);
    } catch (failure) {
      failed(nativeFailure(failure, 'switch'));
    }
  };

  return {
    snapshot,
    loading,
    pendingId,
    error,
    select,
    reload: () => {
      const owner = session.current;
      if (owner && !loading && !owner.pending) load(owner);
    },
  };
}
