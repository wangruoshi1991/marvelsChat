import type { LucideIcon } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { resolveStationColors } from './stationTheme';
import type { StationTab } from './stationTypes';

export type StationTabBarItem = {
  Icon: LucideIcon;
  label: string;
  value: StationTab;
};

/**
 * Horizontally scrollable station navigation. Item geometry is measured so a
 * selected tab remains visible when the list grows beyond the viewport.
 */
export function StationTabBar({
  palette,
  items,
  value,
  onChange,
}: {
  palette: Palette;
  items: StationTabBarItem[];
  value: StationTab;
  onChange: (tab: StationTab) => void;
}) {
  const colors = resolveStationColors(palette);
  const secondaryTextColor = colors.isLight
    ? 'rgba(0,0,0,0.52)'
    : colors.secondaryText;
  const scrollRef = useRef<ScrollView>(null);
  const itemLayouts = useRef(
    new Map<StationTab, { x: number; width: number }>(),
  );
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);

  const revealItem = useCallback(
    (itemValue: StationTab) => {
      const layout = itemLayouts.current.get(itemValue);
      if (!layout || containerWidth <= 0 || contentWidth <= 0) return;
      const desiredX = layout.x - (containerWidth - layout.width) / 2;
      const maximumX = Math.max(0, contentWidth - containerWidth);
      scrollRef.current?.scrollTo({
        x: Math.max(0, Math.min(desiredX, maximumX)),
        animated: true,
      });
    },
    [containerWidth, contentWidth],
  );

  useEffect(() => {
    revealItem(value);
  }, [revealItem, value]);

  return (
    <View
      style={styles.stationTabsViewport}
      onLayout={event => setContainerWidth(event.nativeEvent.layout.width)}
      testID="station-tab-viewport"
    >
      <ScrollView
        ref={scrollRef}
        accessibilityRole="tablist"
        contentContainerStyle={styles.stationTabs}
        horizontal
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={width => setContentWidth(width)}
        showsHorizontalScrollIndicator={false}
        testID="station-tab-scroll"
      >
        {items.map(item => {
          const isSelected = item.value === value;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              key={item.value}
              onLayout={event => {
                const { x, width } = event.nativeEvent.layout;
                itemLayouts.current.set(item.value, { x, width });
                if (item.value === value) revealItem(value);
              }}
              onPress={() => {
                revealItem(item.value);
                onChange(item.value);
              }}
              style={styles.stationTabButton}
              testID={`station-tab-${item.value}`}
            >
              <View style={styles.stationTabLabelRow}>
                <item.Icon
                  color={isSelected ? colors.text : secondaryTextColor}
                  size={12}
                  strokeWidth={isSelected ? 2.4 : 1.9}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.stationTabText,
                    isSelected
                      ? styles.stationTabTextActive
                      : styles.stationTabTextInactive,
                    {
                      color: isSelected ? colors.text : secondaryTextColor,
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </View>
              {isSelected ? <View style={styles.stationTabIndicator} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
