import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { View } from 'react-native';
import { useStablePanResponder } from '../src/shared/gestures/useStablePanResponder';

function Harness({
  enabled = true,
  onRelease,
  onCancel,
}: {
  enabled?: boolean;
  onRelease: () => void;
  onCancel: () => void;
}) {
  const pan = useStablePanResponder(
    {
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        Math.abs(gesture.dx) > 8,
      onPanResponderRelease: onRelease,
      onPanResponderTerminate: onCancel,
    },
    enabled,
  );
  return <View testID="stable-gesture" {...pan.panHandlers} />;
}
function touch(x = 100, active = true, count = 1, timestamp = 1000) {
  return {
    nativeEvent: {
      touches: active
        ? Array.from({ length: count }, (_, identifier) => ({
            identifier,
            pageX: x,
            pageY: 100,
          }))
        : [],
    },
    touchHistory: {
      numberActiveTouches: active ? count : 0,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: timestamp,
      touchBank: Array.from(
        { length: Math.max(1, count) },
        (_, identifier) => ({
          touchActive: active,
          startTimeStamp: 1000,
          startPageX: 100 + identifier * 20,
          startPageY: 100,
          previousTimeStamp: timestamp - 20,
          previousPageX: 100 + identifier * 20,
          previousPageY: 100,
          currentTimeStamp: timestamp,
          currentPageX: x + identifier * 20,
          currentPageY: 100,
        }),
      ),
    },
  };
}
let tree: Renderer.ReactTestRenderer;
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
});

test('leaving and restoring a route cannot revive the old finger release', async () => {
  const release = jest.fn();
  const cancel = jest.fn();
  const screen = (enabled: boolean) => (
    <Harness enabled={enabled} onRelease={release} onCancel={cancel} />
  );
  await act(async () => {
    tree = Renderer.create(screen(true));
  });
  const surface = () => tree.root.findByProps({ testID: 'stable-gesture' });
  surface().props.onStartShouldSetResponderCapture(touch());
  act(() => surface().props.onResponderGrant(touch()));
  await act(async () => tree.update(screen(false)));
  await act(async () => tree.update(screen(true)));
  act(() => surface().props.onResponderRelease(touch(240, false)));
  expect(release).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledTimes(1);
  surface().props.onStartShouldSetResponderCapture(touch());
  act(() => {
    surface().props.onResponderGrant(touch());
    surface().props.onResponderRelease(touch(240, false));
  });
  expect(release).toHaveBeenCalledTimes(1);
});

test('an additional finger cancels the original gesture without invoking its action', async () => {
  const release = jest.fn();
  const cancel = jest.fn();
  await act(async () => {
    tree = Renderer.create(<Harness onRelease={release} onCancel={cancel} />);
  });
  const surface = () => tree.root.findByProps({ testID: 'stable-gesture' });
  surface().props.onStartShouldSetResponderCapture(touch());
  act(() => surface().props.onResponderGrant(touch()));
  act(() => surface().props.onResponderStart(touch(140, true, 2, 1020)));
  // Cancellation happens at the new finger's arrival, not at final release.
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(release).not.toHaveBeenCalled();
  act(() => {
    surface().props.onResponderEnd(touch(140, true, 1, 1040));
    surface().props.onResponderMove(touch(180, true, 1, 1060));
    surface().props.onResponderRelease(touch(240, false, 0, 1080));
    surface().props.onResponderTerminate(touch(240, false, 0, 1100));
  });
  expect(release).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledTimes(1);
});

test('disabled release and termination events cancel a granted touch only once', async () => {
  const release = jest.fn();
  const cancel = jest.fn();
  const screen = (enabled: boolean) => (
    <Harness enabled={enabled} onRelease={release} onCancel={cancel} />
  );
  await act(async () => {
    tree = Renderer.create(screen(true));
  });
  const surface = () => tree.root.findByProps({ testID: 'stable-gesture' });
  surface().props.onStartShouldSetResponderCapture(touch());
  act(() => surface().props.onResponderGrant(touch()));
  await act(async () => tree.update(screen(false)));
  act(() => surface().props.onResponderRelease(touch(200, false, 0, 1040)));
  expect(cancel).toHaveBeenCalledTimes(1);
  act(() => {
    surface().props.onResponderRelease(touch(200, false, 0, 1060));
    surface().props.onResponderTerminate(touch(200, false, 0, 1080));
  });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(release).not.toHaveBeenCalled();
});
