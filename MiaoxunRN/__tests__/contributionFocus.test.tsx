import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useContributionFocus } from '../src/features/messages/useContributionFocus';

let controls: ReturnType<typeof useContributionFocus>;
const list = { scrollToIndex: jest.fn(), scrollToOffset: jest.fn() };
const listRef = { current: list };
let frames: Map<number, (time: number) => void>;
let frameId: number;
let tree: TestRenderer.ReactTestRenderer;
function Harness({
  scope = 'owner:thread:node',
  index = 3,
}: {
  scope?: string;
  index?: number;
}) {
  controls = useContributionFocus({ scope, index, listRef, blocked: false });
  return null;
}
const flushFrame = () => {
  const next = [...frames.entries()][0];
  if (!next) return;
  frames.delete(next[0]);
  act(() => next[1](0));
};
beforeEach(() => {
  jest.clearAllMocks();
  frames = new Map();
  frameId = 0;
  jest
    .spyOn(globalThis, 'requestAnimationFrame')
    .mockImplementation(callback => {
      frames.set(++frameId, callback);
      return frameId;
    });
  jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(id => {
    if (typeof id === 'number') frames.delete(id);
  });
});
afterEach(() => {
  act(() => tree?.unmount());
  jest.restoreAllMocks();
});

test('an unmeasured target estimates its offset then retries precisely, with a fixed three-attempt ceiling', () => {
  list.scrollToIndex.mockImplementation(({ index }) =>
    controls.onScrollToIndexFailed({
      index,
      averageItemLength: 60,
      highestMeasuredFrameIndex: 0,
    }),
  );
  act(() => {
    tree = TestRenderer.create(<Harness />);
  });
  flushFrame();
  flushFrame();
  flushFrame();
  expect(list.scrollToIndex).toHaveBeenCalledTimes(3);
  expect(list.scrollToOffset).toHaveBeenLastCalledWith({
    offset: 180,
    animated: true,
  });
  expect(frames.size).toBe(0);
  act(() => controls.focus());
  expect(frames.size).toBe(0);
});

test.each([
  'other-owner:thread:node',
  'owner:other-thread:node',
  'owner:thread:other-node',
])(
  'an already queued frame or failure never scrolls a changed scope %s',
  scope => {
    list.scrollToIndex.mockImplementation(() => undefined);
    act(() => {
      tree = TestRenderer.create(<Harness />);
    });
    const oldFrame = [...frames.values()][0];
    const oldFailure = controls.onScrollToIndexFailed;
    act(() => tree.update(<Harness scope={scope} index={7} />));
    act(() => oldFrame(0));
    oldFailure({
      index: 3,
      averageItemLength: 60,
      highestMeasuredFrameIndex: 0,
    });
    expect(list.scrollToIndex).not.toHaveBeenCalled();
    expect(list.scrollToOffset).not.toHaveBeenCalled();
    flushFrame();
    expect(list.scrollToIndex).toHaveBeenCalledWith({
      index: 7,
      animated: true,
      viewPosition: 0.2,
    });
  },
);

test('layout updates retry a pending focus but cannot schedule work after unmount', () => {
  list.scrollToIndex.mockImplementation(() => undefined);
  act(() => {
    tree = TestRenderer.create(<Harness index={-1} />);
  });
  expect(frames.size).toBe(0);
  act(() => tree.update(<Harness index={4} />));
  const queued = [...frames.values()][0];
  act(() => tree.unmount());
  act(() => queued(0));
  expect(list.scrollToIndex).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
});
