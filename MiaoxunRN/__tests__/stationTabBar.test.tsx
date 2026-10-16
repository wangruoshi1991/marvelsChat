import { CircleDot } from 'lucide-react-native';
import React from 'react';
import { ScrollView } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {
  StationTabBar,
  StationTabBarItem,
} from '../src/features/station/StationTabBar';
import type { StationTab } from '../src/features/station/stationTypes';
import { palettes } from '../src/shared/theme';

// The bar is a generic horizontal scroller. Five synthetic options exercise
// scrolling that the current two station tabs never trigger.
const tab = (value: string) => value as StationTab;
const items: StationTabBarItem[] = ['a', 'b', 'c', 'd', 'e'].map(value => ({
  value: tab(value),
  label: value,
  Icon: CircleDot,
}));

function layout(x: number, width: number) {
  return { nativeEvent: { layout: { x, y: 0, width, height: 46 } } };
}

describe('Station tab navigation', () => {
  it('scrolls its options horizontally and selects the intended tab', () => {
    const onChange = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <StationTabBar
          items={items}
          onChange={onChange}
          palette={palettes.light}
          value={tab('a')}
        />,
      );
    });
    expect(renderer!.root.findByType(ScrollView).props.horizontal).toBe(true);
    ReactTestRenderer.act(() => {
      renderer!.root.findByProps({ testID: 'station-tab-e' }).props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith('e');
    expect(
      renderer!.root.findByProps({ testID: 'station-tab-a' }).props
        .accessibilityState,
    ).toEqual({ selected: true });
  });

  it('reveals the selected option after a selection or viewport resize', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    const renderTabs = (value: StationTab) => (
      <StationTabBar
        items={items}
        onChange={jest.fn()}
        palette={palettes.light}
        value={value}
      />
    );
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(renderTabs(tab('a')));
    });
    const scroll = renderer!.root.findByType(ScrollView);
    const scrollTo = jest.spyOn(scroll.instance, 'scrollTo');
    ReactTestRenderer.act(() => {
      renderer!.root
        .findByProps({ testID: 'station-tab-viewport' })
        .props.onLayout(layout(0, 280));
      items.forEach((item, index) => {
        renderer!.root
          .findByProps({ testID: `station-tab-${item.value}` })
          .props.onLayout(layout(index * 90, 88));
      });
      scroll.props.onContentSizeChange(450, 46);
    });
    ReactTestRenderer.act(() => {
      renderer!.update(renderTabs(tab('e')));
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 170, animated: true });
    ReactTestRenderer.act(() => {
      renderer!.root
        .findByProps({ testID: 'station-tab-viewport' })
        .props.onLayout(layout(0, 400));
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 50, animated: true });
    ReactTestRenderer.act(() => {
      renderer!.update(renderTabs(tab('a')));
    });
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 0, animated: true });
    scrollTo.mockRestore();
  });
});
