import { useEffect, useRef } from 'react';
import { Animated, PanResponderGestureState } from 'react-native';
import { useStablePanResponder } from '../../shared/gestures/useStablePanResponder';

type Options = {
  enabled: boolean;
  width: number;
  translation: Animated.Value;
  finish: (dx: number, dy: number, vx: number) => void;
  reset: () => void;
};

/** The feed owns vertical reading; a granted horizontal touch stays continuous. */
export function useMiaoCardGesture(options: Options) {
  const axis = useRef<'horizontal' | 'vertical' | null>(null);
  const enabled = useRef(options.enabled);
  enabled.current = options.enabled;
  const drag = useRef<{ base: number | null; dx: number } | null>(null);
  useEffect(() => {
    if (options.enabled) return;
    drag.current = null;
    options.translation.stopAnimation();
    options.translation.setValue(0);
  }, [options.enabled, options.translation]);
  useEffect(
    () => () => {
      drag.current = null;
      options.translation.stopAnimation();
    },
    [options.translation],
  );
  const move = (touch: NonNullable<typeof drag.current>) => {
    if (touch.base === null) return;
    const limit = Math.max(120, Math.min(options.width * 0.72, 300));
    options.translation.setValue(
      Math.max(-limit, Math.min(limit, touch.base + touch.dx)),
    );
  };
  const shouldCapture = (
    _event: unknown,
    gesture: PanResponderGestureState,
  ) => {
    if (axis.current === 'vertical') return false;
    if (axis.current === 'horizontal') return true;
    const x = Math.abs(gesture.dx);
    const y = Math.abs(gesture.dy);
    if (y > 8 && y >= x) {
      axis.current = 'vertical';
      return false;
    }
    if (x > 8 && x > y * 1.25) {
      axis.current = 'horizontal';
      return true;
    }
    return false;
  };
  return useStablePanResponder(
    {
      onStartShouldSetPanResponderCapture: () => {
        axis.current = null;
        drag.current = null;
        return false;
      },
      onMoveShouldSetPanResponder: shouldCapture,
      onMoveShouldSetPanResponderCapture: shouldCapture,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const touch = { base: null as number | null, dx: 0 };
        drag.current = touch;
        // Native animations report their stopped position asynchronously.
        // Preserve that frame while waiting, and ignore a previous finger's
        // receipt after release, route changes or a newer grant.
        options.translation.stopAnimation(value => {
          if (!enabled.current || drag.current !== touch) return;
          touch.base = value;
          move(touch);
        });
      },
      onPanResponderMove: (_event, gesture) => {
        if (!drag.current) return;
        drag.current.dx = gesture.dx;
        move(drag.current);
      },
      onPanResponderRelease: (_event, gesture) => {
        drag.current = null;
        options.finish(gesture.dx, gesture.dy, gesture.vx);
      },
      onPanResponderTerminate: () => {
        drag.current = null;
        options.reset();
      },
    },
    options.enabled,
  ).panHandlers;
}
