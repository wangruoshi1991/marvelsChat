import {useCallback, useEffect, useRef, useState} from 'react';
import {type LayoutChangeEvent, useWindowDimensions} from 'react-native';

import type {SearchHistoryDTO} from '../../models/api';

const COLLAPSED_ROWS = 3;
const DEFAULT_COLLAPSED_HEIGHT = 114;

export type SearchHistoryItemLayout = {
  height: number;
  y: number;
};

export function calculateCollapsedHistoryLayout(
  layouts: SearchHistoryItemLayout[],
  maxRows = COLLAPSED_ROWS,
) {
  const rowTops = Array.from(
    new Set(layouts.map(layout => Math.round(layout.y))),
  ).sort((left, right) => left - right);
  const lastVisibleRowTop = rowTops[Math.min(maxRows, rowTops.length) - 1];
  if (lastVisibleRowTop === undefined) {
    return {count: 0, height: 0};
  }
  const visibleLayouts = layouts.filter(
    layout => Math.round(layout.y) <= lastVisibleRowTop,
  );
  return {
    count: visibleLayouts.length,
    height: Math.max(
      ...visibleLayouts.map(layout => layout.y + layout.height),
    ),
  };
}

export function useSearchHistoryLayout(searchHistory: SearchHistoryDTO[]) {
  const {width: windowWidth} = useWindowDimensions();
  const [collapsedCount, setCollapsedCount] = useState(searchHistory.length);
  const [collapsedHeight, setCollapsedHeight] = useState(
    DEFAULT_COLLAPSED_HEIGHT,
  );
  const layouts = useRef(new Map<string, SearchHistoryItemLayout>());

  useEffect(() => {
    layouts.current.clear();
    setCollapsedCount(searchHistory.length);
  }, [searchHistory, windowWidth]);

  const onItemLayout = useCallback(
    (itemId: string, event: LayoutChangeEvent) => {
      const {height, y} = event.nativeEvent.layout;
      layouts.current.set(itemId, {height, y});
      const measuredLayouts = searchHistory.map(item =>
        layouts.current.get(item.id),
      );
      if (measuredLayouts.some(layout => !layout)) {
        return;
      }
      const next = calculateCollapsedHistoryLayout(
        measuredLayouts as SearchHistoryItemLayout[],
      );
      setCollapsedCount(current =>
        current === next.count ? current : next.count,
      );
      setCollapsedHeight(current =>
        Math.abs(current - next.height) < 0.5 ? current : next.height,
      );
    },
    [searchHistory],
  );

  return {collapsedCount, collapsedHeight, onItemLayout};
}
