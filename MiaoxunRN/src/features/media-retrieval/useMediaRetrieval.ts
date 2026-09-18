import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { MediaRetrievalController } from './MediaRetrievalController';
import { mediaRetrievalJournal } from './mediaRetrievalJournal';

export function useMediaRetrieval(
  token: string,
  registeredAvailability: boolean,
  userId: string,
) {
  const controller = useMemo(
    () =>
      new MediaRetrievalController(
        token,
        false,
        undefined,
        mediaRetrievalJournal(userId),
      ),
    [token, userId],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
  useEffect(() => {
    controller.setRegistered(registeredAvailability);
  }, [controller, registeredAvailability]);
  useEffect(() => {
    controller.setForeground(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', next =>
      controller.setForeground(next === 'active'),
    );
    return () => {
      subscription.remove();
      controller.dispose();
    };
  }, [controller]);
  return { state, controller };
}
