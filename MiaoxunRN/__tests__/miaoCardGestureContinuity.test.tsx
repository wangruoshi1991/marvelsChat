import React from 'react';
import Renderer from 'react-test-renderer';
import { Animated, StyleSheet, Text } from 'react-native';
import { AIAssistProvider } from '../src/features/assist/AIAssistProvider';
import { MiaoTaskCard } from '../src/features/miao/MiaoTaskCard';
import { palettes } from '../src/shared/theme';
import { defaultUIPreferences } from '../src/features/ui/uiPreferences';
import { useMiaoCardGesture } from '../src/features/miao/useMiaoCardGesture';
const valueOf = (value: Animated.Value) =>
  (value as Animated.Value & { __getValue: () => number }).__getValue();
const ui = (preferences = defaultUIPreferences(), active = true) => (
  <AIAssistProvider routeKey="jitter-review" onAskButler={() => {}}>
    <MiaoTaskCard
      object={{ kind: 'ai-task', id: 'task', title: 'Title' }}
      goal="Task"
      status="running"
      participantIds={[]}
      agents={[]}
      palette={palettes.light}
      language="zh"
      grid={false}
      failed={false}
      onOpen={() => {}}
      openLabel="open"
      uiPreferences={preferences}
      active={active}
      renderState={state => <Text testID="continuity-state">{state}</Text>}
    />
  </AIAssistProvider>
);

function GestureHarness({
  translation,
  enabled = true,
  finish = () => {},
}: {
  translation: Animated.Value;
  enabled?: boolean;
  finish?: (dx: number, dy: number, vx: number) => void;
}) {
  const handlers = useMiaoCardGesture({
    translation,
    enabled,
    width: 400,
    finish,
    reset: () => translation.setValue(0),
  });
  return <Animated.View testID="regrab-gesture" {...handlers} />;
}

test('regrabbing a returning card preserves its native offset and accumulates new movement', async () => {
  const translation = new Animated.Value(-45);
  const finish = jest.fn();
  const stopped: ((value: number) => void)[] = [];
  jest.spyOn(translation, 'stopAnimation').mockImplementation(callback => {
    if (callback) stopped.push(callback);
  });
  let tree: Renderer.ReactTestRenderer | undefined;
  try {
    await Renderer.act(async () => {
      tree = Renderer.create(
        <GestureHarness translation={translation} finish={finish} />,
      );
    });
    const handlers = tree!.root.findByProps({ testID: 'regrab-gesture' }).props;
    handlers.onStartShouldSetResponderCapture(touch(300, 300, 1000));
    Renderer.act(() => handlers.onResponderGrant(touch(300, 280, 1020)));
    expect(valueOf(translation)).toBe(-45);
    Renderer.act(() => handlers.onResponderMove(touch(280, 260, 1040)));
    // Native getValue is asynchronous. Keep the frozen frame until its offset
    // arrives, then replay the latest finger movement without a zero frame.
    expect(valueOf(translation)).toBe(-45);
    Renderer.act(() => stopped[0](-45));
    expect(valueOf(translation)).toBe(-65);
    Renderer.act(() => handlers.onResponderMove(touch(260, 250, 1060)));
    expect(valueOf(translation)).toBe(-75);
    Renderer.act(() =>
      handlers.onResponderRelease(touch(250, 250, 1080, false)),
    );
    // The previous animation's offset affects only presentation, not whether
    // this new finger has travelled far enough to change the card state.
    expect(finish.mock.calls[0][0]).toBe(-30);
  } finally {
    if (tree) await Renderer.act(async () => tree!.unmount());
    jest.restoreAllMocks();
  }
});

test('an old native offset receipt cannot overwrite a newer drag or its completed transition', async () => {
  const translation = new Animated.Value(-45);
  const stopped: ((value: number) => void)[] = [];
  const finish = jest.fn();
  jest.spyOn(translation, 'stopAnimation').mockImplementation(callback => {
    if (callback) stopped.push(callback);
  });
  let tree: Renderer.ReactTestRenderer | undefined;
  try {
    await Renderer.act(async () => {
      tree = Renderer.create(
        <GestureHarness translation={translation} finish={finish} />,
      );
    });
    const handlers = tree!.root.findByProps({ testID: 'regrab-gesture' }).props;
    handlers.onStartShouldSetResponderCapture(touch(300, 300, 1000));
    Renderer.act(() => handlers.onResponderGrant(touch(300, 280, 1020)));
    Renderer.act(() =>
      handlers.onResponderRelease(touch(280, 280, 1040, false)),
    );
    translation.setValue(-12);
    handlers.onStartShouldSetResponderCapture(touch(300, 300, 2000));
    Renderer.act(() => handlers.onResponderGrant(touch(300, 280, 2020)));
    Renderer.act(() => handlers.onResponderMove(touch(280, 260, 2040)));
    expect(stopped).toHaveLength(2);
    Renderer.act(() => stopped[0](-45));
    expect(valueOf(translation)).toBe(-12);
    Renderer.act(() => stopped[1](-12));
    expect(valueOf(translation)).toBe(-32);
    Renderer.act(() =>
      handlers.onResponderRelease(touch(260, 260, 2060, false)),
    );
    translation.setValue(0);
    Renderer.act(() => stopped[1](-12));
    expect(valueOf(translation)).toBe(0);
    expect(finish).toHaveBeenCalledTimes(2);
  } finally {
    if (tree) await Renderer.act(async () => tree!.unmount());
    jest.restoreAllMocks();
  }
});

test.each(['disable', 'unmount'] as const)(
  'a queued native offset cannot change the card after %s',
  async ending => {
    const translation = new Animated.Value(-45);
    const stopped: ((value: number) => void)[] = [];
    const finish = jest.fn();
    jest.spyOn(translation, 'stopAnimation').mockImplementation(callback => {
      if (callback) stopped.push(callback);
    });
    let tree: Renderer.ReactTestRenderer | undefined;
    try {
      await Renderer.act(async () => {
        tree = Renderer.create(
          <GestureHarness translation={translation} finish={finish} />,
        );
      });
      const handlers = tree!.root.findByProps({
        testID: 'regrab-gesture',
      }).props;
      handlers.onStartShouldSetResponderCapture(touch(300, 300, 1000));
      Renderer.act(() => handlers.onResponderGrant(touch(300, 280, 1020)));
      expect(stopped).toHaveLength(1);
      if (ending === 'disable') {
        await Renderer.act(async () =>
          tree!.update(
            <GestureHarness
              translation={translation}
              enabled={false}
              finish={finish}
            />,
          ),
        );
      } else {
        await Renderer.act(async () => tree!.unmount());
        tree = undefined;
      }
      translation.setValue(9);
      Renderer.act(() => stopped[0](-45));
      expect(valueOf(translation)).toBe(9);
      expect(finish).not.toHaveBeenCalled();
    } finally {
      if (tree) await Renderer.act(async () => tree!.unmount());
      jest.restoreAllMocks();
    }
  },
);

test('a retained inactive card cancels its finger and cannot revive it when shown again', async () => {
  let tree: Renderer.ReactTestRenderer | undefined;
  try {
    await Renderer.act(async () => {
      tree = Renderer.create(ui());
    });
    const surface = () =>
      tree!.root
        .findAllByType(Animated.View)
        .find(node => node.props.onResponderMove)!;
    surface().props.onStartShouldSetResponderCapture(touch(300, 300, 1000));
    Renderer.act(() => {
      surface().props.onResponderGrant(touch(300, 280, 1020));
      surface().props.onResponderMove(touch(280, 150, 1100));
    });
    await Renderer.act(async () => tree!.update(ui(undefined, false)));
    await Renderer.act(async () => tree!.update(ui()));
    Renderer.act(() =>
      surface().props.onResponderRelease(touch(150, 150, 1120, false)),
    );
    expect(
      tree!.root.findAllByProps({ testID: 'continuity-state' }),
    ).toHaveLength(0);
    expect(
      tree!.root.findByProps({ testID: 'miao-card-details-action' }).props
        .accessibilityState.expanded,
    ).toBe(false);
    surface().props.onStartShouldSetResponderCapture(touch(300, 300, 2000));
    Renderer.act(() => {
      surface().props.onResponderGrant(touch(300, 280, 2020));
      surface().props.onResponderMove(touch(280, 150, 2100));
      surface().props.onResponderRelease(touch(150, 150, 2120, false));
    });
    expect(
      tree!.root.findByProps({ testID: 'continuity-state' }).props.children,
    ).toBe('detail');
  } finally {
    if (tree) await Renderer.act(async () => tree!.unmount());
  }
});
const touch = (
  previousX: number,
  currentX: number,
  timestamp: number,
  active = true,
) => ({
  nativeEvent: {
    timestamp,
    touches: active ? [{ identifier: 0, pageX: currentX, pageY: 100 }] : [],
  },
  touchHistory: {
    numberActiveTouches: active ? 1 : 0,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: timestamp,
    touchBank: [
      {
        touchActive: active,
        startTimeStamp: 1000,
        startPageX: 300,
        startPageY: 100,
        previousTimeStamp: timestamp - 20,
        previousPageX: previousX,
        previousPageY: 100,
        currentTimeStamp: timestamp,
        currentPageX: currentX,
        currentPageY: 100,
      },
    ],
  },
});
test('same card rerender during active drag keeps dx accumulated', async () => {
  let tree: any;
  try {
    await Renderer.act(async () => {
      tree = Renderer.create(ui());
    });
    const surface = () =>
      tree.root
        .findAllByType(Animated.View)
        .find((n: any) => n.props.onResponderMove);
    const dx = () => {
      const body = tree.root
        .findAllByType(Animated.View)
        .find(
          (node: any) => node.props.testID === 'miao-card-animated-content',
        );
      const v = StyleSheet.flatten(body.props.style).transform[0].translateX;
      return typeof v === 'number' ? v : v.__getValue();
    };
    surface().props.onStartShouldSetResponderCapture(touch(300, 300, 1000));
    expect(
      surface().props.onMoveShouldSetResponderCapture(touch(300, 280, 1020)),
    ).toBe(true);
    Renderer.act(() => {
      surface().props.onResponderGrant(touch(300, 280, 1020));
      surface().props.onResponderMove(touch(280, 150, 1100));
    });
    expect(dx()).toBe(-130);
    await Renderer.act(async () => tree.update(ui()));
    Renderer.act(() => surface().props.onResponderMove(touch(150, 145, 1120)));
    expect(dx()).toBe(-135);
  } finally {
    if (tree) await Renderer.act(async () => tree.unmount());
  }
});

test('preference refresh does not change the active swipe threshold halfway through', async () => {
  let tree: any;
  try {
    await Renderer.act(async () => {
      tree = Renderer.create(ui());
    });
    const surface = () =>
      tree.root
        .findAllByType(Animated.View)
        .find((n: any) => n.props.onResponderMove);
    surface().props.onStartShouldSetResponderCapture(touch(300, 300, 1000));
    expect(
      surface().props.onMoveShouldSetResponderCapture(touch(300, 280, 1020)),
    ).toBe(true);
    Renderer.act(() => {
      surface().props.onResponderGrant(touch(300, 280, 1020));
      surface().props.onResponderMove(touch(280, 150, 1620));
    });
    const refreshed = defaultUIPreferences();
    refreshed.gestures['miao.taskCard.detailsSwipe']!.distance = 200;
    await Renderer.act(async () => tree.update(ui(refreshed)));
    Renderer.act(() => {
      surface().props.onResponderMove(touch(150, 145, 1720));
      surface().props.onResponderRelease(touch(145, 145, 1740, false));
    });
    expect(
      tree.root.findByProps({ testID: 'continuity-state' }).props.children,
    ).toBe('detail');
  } finally {
    if (tree) await Renderer.act(async () => tree.unmount());
  }
});

test('vertical reading stays owned by the feed even if the finger later drifts horizontally', async () => {
  let tree: any;
  try {
    await Renderer.act(async () => {
      tree = Renderer.create(ui());
    });
    const surface = () =>
      tree.root
        .findAllByType(Animated.View)
        .find((n: any) => n.props.onResponderMove);
    const vertical = (
      previousX: number,
      currentX: number,
      previousY: number,
      currentY: number,
      timestamp: number,
    ) => {
      const event = touch(previousX, currentX, timestamp);
      event.nativeEvent.touches[0].pageY = currentY;
      event.touchHistory.touchBank[0].previousPageY = previousY;
      event.touchHistory.touchBank[0].currentPageY = currentY;
      return event;
    };
    surface().props.onStartShouldSetResponderCapture(touch(300, 300, 1000));
    expect(
      surface().props.onMoveShouldSetResponderCapture(
        vertical(300, 305, 100, 125, 1020),
      ),
    ).toBe(false);
    // Once vertical reading wins, subsequent x movement cannot steal the
    // parent list's gesture. A fresh touch may choose a new axis.
    expect(
      surface().props.onMoveShouldSetResponderCapture(
        vertical(305, 400, 125, 130, 1120),
      ),
    ).toBe(false);
    surface().props.onStartShouldSetResponderCapture(touch(300, 300, 2000));
    expect(
      surface().props.onMoveShouldSetResponderCapture(touch(300, 280, 2020)),
    ).toBe(true);
  } finally {
    if (tree) await Renderer.act(async () => tree.unmount());
  }
});
