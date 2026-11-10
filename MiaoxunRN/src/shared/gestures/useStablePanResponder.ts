import { useRef } from 'react';
import {
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
} from 'react-native';

type Callbacks = Parameters<typeof PanResponder.create>[0];
type Callback = (
  event: GestureResponderEvent,
  gesture: PanResponderGestureState,
) => boolean | void;

/**
 * Preserve RN's accumulated touch history across polling renders. A granted
 * touch uses the callbacks/configuration it started with; the next touch reads
 * the latest configuration. Current route availability still cancels a touch.
 */
export function useStablePanResponder(callbacks: Callbacks, enabled = true) {
  const latest = useRef({ callbacks, enabled });
  latest.current = { callbacks, enabled };
  const granted = useRef<Callbacks | null>(null);
  const cancelled = useRef(false);
  if (!enabled) cancelled.current = true;
  const responder = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  if (!responder.current) {
    const keys = new Set<keyof Callbacks>([
      ...(Object.keys(callbacks) as (keyof Callbacks)[]),
      'onStartShouldSetPanResponderCapture',
      'onPanResponderGrant',
      'onPanResponderStart',
      'onPanResponderMove',
      'onPanResponderRelease',
      'onPanResponderTerminate',
    ]);
    const stable: Callbacks = {};
    for (const key of keys) {
      const dispatch: Callback = (event, gesture) => {
        const current = latest.current;
        const starting = key === 'onStartShouldSetPanResponderCapture';
        const touches = event.nativeEvent?.touches;
        if (starting && touches?.length === 1) {
          granted.current = null;
          cancelled.current = !current.enabled;
        }
        if (touches && touches.length > 1 && !cancelled.current) {
          cancelled.current = true;
          (granted.current || current.callbacks).onPanResponderTerminate?.(
            event,
            gesture,
          );
          granted.current = null;
        }
        if (!current.enabled || cancelled.current) {
          if (
            key === 'onPanResponderRelease' ||
            key === 'onPanResponderTerminate'
          ) {
            const previous = granted.current;
            granted.current = null;
            previous?.onPanResponderTerminate?.(event, gesture);
          }
          return false;
        }
        if (key === 'onPanResponderGrant') granted.current = current.callbacks;
        const config = granted.current || current.callbacks;
        const callback = config[key] as Callback | undefined;
        const result = callback?.(event, gesture);
        if (
          key === 'onPanResponderRelease' ||
          key === 'onPanResponderTerminate'
        )
          granted.current = null;
        if (result !== undefined) return result;
        if (
          key === 'onShouldBlockNativeResponder' ||
          key === 'onPanResponderTerminationRequest'
        )
          return true;
        return false;
      };
      stable[key] = dispatch as never;
    }
    responder.current = PanResponder.create(stable);
  }
  return responder.current;
}
