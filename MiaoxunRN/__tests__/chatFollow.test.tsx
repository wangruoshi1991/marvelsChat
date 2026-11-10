import React from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useChatFollow } from '../src/features/messages/useChatFollow';

let current: ReturnType<typeof useChatFollow>;
function Harness({
  scope,
  selected = false,
}: {
  scope: string;
  selected?: boolean;
}) {
  current = useChatFollow(scope, selected);
  return null;
}
const scroll = (y: number) =>
  ({
    nativeEvent: {
      contentOffset: { y },
      contentSize: { height: 1000 },
      layoutMeasurement: { height: 400 },
    },
  } as NativeSyntheticEvent<NativeScrollEvent>);

test('tracks the bottom threshold, sending, and a newly selected contribution', () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<Harness scope="chat" />);
  });
  expect(current.shouldFollow()).toBe(true);
  act(() => {
    current.onScroll(scroll(519));
  });
  expect(current.shouldFollow()).toBe(false);
  act(() => {
    current.onScroll(scroll(520));
  });
  expect(current.shouldFollow()).toBe(true);
  act(() => {
    current.onScroll(scroll(100));
    current.follow();
  });
  expect(current.shouldFollow()).toBe(true);
  act(() => {
    tree.update(<Harness scope="chat:node" selected />);
  });
  expect(current.shouldFollow()).toBe(false);
  act(() => {
    tree.update(<Harness scope="other" />);
  });
  expect(current.shouldFollow()).toBe(true);
  act(() => tree.unmount());
});
