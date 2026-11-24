import { useCallback, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const bottomThreshold = 80;

export function useChatFollow(scope: string, selectedContribution: boolean) {
  const initialState = () => ({
    scope,
    nearBottom: !selectedContribution,
    pendingLayoutFollow: null as boolean | null,
    scrollViewport: null as number | null,
    layoutViewport: null as number | null,
    contentHeight: null as number | null,
    offsetY: null as number | null,
    dragging: false,
  });
  const state = useRef(initialState());
  if (state.current.scope !== scope) {
    const layoutViewport = state.current.layoutViewport;
    state.current = { ...initialState(), layoutViewport };
  }
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      const current = state.current;
      const nearBottom =
        contentSize.height -
          contentOffset.y -
          (current.layoutViewport ?? layoutMeasurement.height) <=
        bottomThreshold;
      const resized =
        current.scrollViewport !== null &&
        current.scrollViewport !== layoutMeasurement.height;
      const firstStaleViewport =
        current.scrollViewport === null &&
        current.layoutViewport !== null &&
        current.layoutViewport !== layoutMeasurement.height;
      if ((resized || firstStaleViewport) && !current.dragging) {
        // Resizing the composer/keyboard changes distance to the bottom
        // before native scrolling compensates. Retain the prior intent.
        if (
          !firstStaleViewport &&
          current.layoutViewport !== layoutMeasurement.height
        )
          current.pendingLayoutFollow ??= current.nearBottom;
      } else if (
        current.dragging ||
        current.offsetY !== contentOffset.y ||
        nearBottom
      ) {
        current.nearBottom = nearBottom;
      }
      current.scrollViewport = layoutMeasurement.height;
      current.offsetY = contentOffset.y;
    },
    [],
  );
  const prepareLayoutChange = useCallback(() => {
    if (!state.current.dragging)
      state.current.pendingLayoutFollow ??= state.current.nearBottom;
  }, []);
  const followLayout = useCallback((viewportHeight?: number) => {
    const current = state.current;
    const following = current.pendingLayoutFollow ?? current.nearBottom;
    current.pendingLayoutFollow = null;
    if (viewportHeight !== undefined) current.layoutViewport = viewportHeight;
    if (current.dragging) return false;
    current.nearBottom = following;
    return following;
  }, []);
  const onScrollBeginDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      state.current.pendingLayoutFollow = null;
      state.current.dragging = true;
      onScroll(event);
    },
    [onScroll],
  );
  const onScrollEndDrag = useCallback(() => {
    state.current.dragging = false;
  }, []);
  const shouldFollow = useCallback(
    () =>
      !state.current.dragging &&
      (state.current.pendingLayoutFollow ?? state.current.nearBottom),
    [],
  );
  const follow = useCallback(() => {
    state.current.nearBottom = true;
    state.current.pendingLayoutFollow = null;
  }, []);
  const pauseFollowing = useCallback(() => {
    state.current.nearBottom = false;
    state.current.pendingLayoutFollow = null;
  }, []);
  const measureContent = useCallback((height: number) => {
    state.current.contentHeight = height;
  }, []);
  const bottomOffset = useCallback(() => {
    const { contentHeight, layoutViewport } = state.current;
    if (contentHeight === null || layoutViewport === null) return null;
    return Math.max(0, contentHeight - layoutViewport);
  }, []);
  return {
    onScroll,
    onScrollBeginDrag,
    onScrollEndDrag,
    prepareLayoutChange,
    followLayout,
    measureContent,
    bottomOffset,
    shouldFollow,
    follow,
    pauseFollowing,
  };
}
