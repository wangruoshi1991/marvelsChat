type ScrollFailure = {
  index: number;
  averageItemLength: number;
  highestMeasuredFrameIndex: number;
};
type ListHandle = {
  scrollToIndex: (options: {
    index: number;
    animated: boolean;
    viewPosition?: number;
  }) => void;
  scrollToOffset: (options: { offset: number; animated: boolean }) => void;
};
type Options = {
  scope: string;
  index: number;
  blocked: boolean;
  listRef: { current: ListHandle | null };
};
const maxFocusAttempts = 3;

export function useContributionFocus(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const alive = useRef(true);
  const frame = useRef<number | null>(null);
  const state = useRef({ scope: options.scope, attempts: 0, done: false });
  const cancelFrame = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  const focus = useCallback(() => {
    const current = latest.current;
    if (
      !alive.current ||
      frame.current !== null ||
      current.blocked ||
      current.index < 0 ||
      state.current.scope !== current.scope ||
      state.current.done ||
      state.current.attempts >= maxFocusAttempts
    )
      return;
    const scope = current.scope;
    const handle = requestAnimationFrame(() => {
      if (frame.current !== handle) return;
      frame.current = null;
      const target = latest.current;
      if (
        !alive.current ||
        target.scope !== scope ||
        target.blocked ||
        target.index < 0 ||
        state.current.scope !== scope ||
        state.current.done ||
        !target.listRef.current
      )
        return;
      state.current.attempts += 1;
      state.current.done = true;
      target.listRef.current.scrollToIndex({
        index: target.index,
        animated: true,
        viewPosition: 0.2,
      });
    });
    frame.current = handle;
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelFrame();
    };
  }, [cancelFrame]);
  useEffect(() => {
    state.current = { scope: options.scope, attempts: 0, done: false };
    focus();
    return cancelFrame;
  }, [options.scope, focus, cancelFrame]);
  useEffect(() => {
    focus();
  }, [options.index, options.blocked, focus]);
  const scope = options.scope;
  const onScrollToIndexFailed = useCallback(
    (info: ScrollFailure) => {
      const current = latest.current;
      if (!alive.current || current.scope !== scope || current.blocked) return;
      current.listRef.current?.scrollToOffset({
        offset: Math.max(0, info.averageItemLength * info.index),
        animated: true,
      });
      if (current.index !== info.index || state.current.scope !== scope) return;
      state.current.done = state.current.attempts >= maxFocusAttempts;
      focus();
    },
    [scope, focus],
  );
  return { focus, onScrollToIndexFailed };
}
import { useCallback, useEffect, useRef } from 'react';
