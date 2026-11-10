import { useCallback, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const bottomThreshold = 80;

export function useChatFollow(scope: string, selectedContribution: boolean) {
  const state = useRef({ scope, nearBottom: !selectedContribution });
  if (state.current.scope !== scope)
    state.current = { scope, nearBottom: !selectedContribution };
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      state.current.nearBottom =
        contentSize.height - contentOffset.y - layoutMeasurement.height <=
        bottomThreshold;
    },
    [],
  );
  const shouldFollow = useCallback(() => state.current.nearBottom, []);
  const follow = useCallback(() => {
    state.current.nearBottom = true;
  }, []);
  return { onScroll, shouldFollow, follow };
}
