import React from 'react';
import {
  AppState,
  AppStateStatus,
  BackHandler,
  NativeModules,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Bot } from 'lucide-react-native';

import {
  AIAssistGestureHandle,
  AIAssistGestureSurface,
  resolveAIAssistLabelFrame,
  resolveAIAssistTargetAtPoint,
  resolveAIAssistTargetLayout,
} from '../src/features/assist/AIAssistGestureSurface';
import {
  AIAssistProvider,
  useAIAssist,
} from '../src/features/assist/AIAssistProvider';
import {
  AIAssistAction,
  AIAssistObjectKind,
  AIAssistPoint,
} from '../src/features/assist/aiAssistTypes';
import { palettes } from '../src/shared/theme';

const act = ReactTestRenderer.act;
const bounds = { width: 393, height: 760 };
const hostOrigin = { x: 0, y: 59 };
const surfaceOrigin = { x: 20, y: 160 };
const anchor = { x: 180, y: 330 };
const localAnchor = {
  x: anchor.x - surfaceOrigin.x,
  y: anchor.y - surfaceOrigin.y,
};
const touch = (point: AIAssistPoint) => ({
  nativeEvent: { pageX: point.x, pageY: point.y },
});
const centerOf = (frame: {
  x: number;
  y: number;
  width: number;
  height: number;
}) => ({
  x: frame.x + frame.width / 2,
  y: frame.y + frame.height / 2,
});
type MeasureCallback = (
  x: number,
  y: number,
  width: number,
  height: number,
) => void;

describe('global content actions', () => {
  let appStateChange: (state: AppStateStatus) => void;
  let hardwareBack: Parameters<typeof BackHandler.addEventListener>[1];
  let measurements: Array<{ callback: MeasureCallback; source: boolean }>;
  let deferred: 'host' | 'surface' | null;
  let renderers: ReactTestRenderer.ReactTestRenderer[];

  beforeEach(() => {
    jest.clearAllMocks();
    measurements = [];
    deferred = null;
    renderers = [];
    jest
      .spyOn(View.prototype, 'measureInWindow')
      .mockImplementation(function (
        this: { props: { testID?: string } },
        callback: MeasureCallback,
      ) {
        const source = this.props.testID === 'subject-assist';
        if ((source ? 'surface' : 'host') === deferred) {
          measurements.push({ callback, source });
        } else if (source) {
          callback(surfaceOrigin.x, surfaceOrigin.y, 350, 238);
        } else {
          callback(hostOrigin.x, hostOrigin.y, bounds.width, bounds.height);
        }
      });
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        appStateChange = listener;
        return { remove: jest.fn() };
      });
    jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_type, listener) => {
        hardwareBack = listener;
        return { remove: jest.fn() };
      });
  });

  afterEach(() => {
    act(() => renderers.forEach(renderer => renderer.unmount()));
    jest.restoreAllMocks();
  });

  const flushMeasurement = (index = 0) => {
    const measurement = measurements.splice(index, 1)[0];
    act(() => {
      if (measurement.source) {
        measurement.callback(surfaceOrigin.x, surfaceOrigin.y, 350, 238);
      } else {
        measurement.callback(
          hostOrigin.x,
          hostOrigin.y,
          bounds.width,
          bounds.height,
        );
      }
    });
  };

  const mount = (kind: AIAssistObjectKind = 'avatar-3d') => {
    const onSelect = jest.fn();
    const onPress = jest.fn();
    const onAskButler = jest.fn();
    const gestureRef = React.createRef<AIAssistGestureHandle>();
    const object = { kind, id: 'subject-1', title: '内容标题' };
    const actions: AIAssistAction[] = [
      {
        direction: 'right',
        label: '妙管家',
        Icon: Bot,
        accent: '#2012D9',
        onSelect,
      },
      {
        direction: 'up',
        label: '分享',
        Icon: Bot,
        accent: '#2012D9',
        onSelect,
      },
      {
        direction: 'down',
        label: '复制',
        Icon: Bot,
        accent: '#2012D9',
        onSelect,
      },
      {
        direction: 'left',
        label: '更多',
        Icon: Bot,
        accent: '#2012D9',
        onSelect,
      },
    ];
    let api!: ReturnType<typeof useAIAssist>;
    function Probe() {
      api = useAIAssist();
      return null;
    }
    function Content() {
      return <Text>Original content</Text>;
    }
    const tree = (routeKey = 'station', visible = true) => (
      <AIAssistProvider onAskButler={onAskButler} routeKey={routeKey}>
        <Probe />
        {visible ? (
          <AIAssistGestureSurface
            actions={actions}
            object={object}
            onPress={onPress}
            palette={palettes.light}
            ref={gestureRef}
            testID="subject-assist"
          >
            <Content />
          </AIAssistGestureSurface>
        ) : null}
      </AIAssistProvider>
    );
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(tree());
    });
    renderers.push(renderer);
    const surface = () =>
      renderer.root
        .findAllByProps({ testID: 'subject-assist' })
        .find(node => typeof node.props.onLongPress === 'function')!;
    const overlay = () =>
      renderer.root.findAllByProps({ testID: 'content-actions-overlay' });
    const openAt = (point: AIAssistPoint) =>
      act(() => surface().props.onLongPress(touch(point)));
    const open = () => openAt(anchor);
    const targetAt = (
      point: AIAssistPoint,
      direction: AIAssistAction['direction'],
    ) => {
      const targetLayout = resolveAIAssistTargetLayout(
        {
          x: point.x - hostOrigin.x,
          y: point.y - hostOrigin.y,
        },
        bounds,
      );
      const frame = targetLayout[direction];
      return {
        x: hostOrigin.x + frame.x + frame.width / 2,
        y: hostOrigin.y + frame.y + frame.height / 2,
      };
    };
    const targetLayout = resolveAIAssistTargetLayout(
      {
        x: anchor.x - hostOrigin.x,
        y: anchor.y - hostOrigin.y,
      },
      bounds,
    );
    const target = {
      x: hostOrigin.x + targetLayout.right.x + targetLayout.right.width / 2,
      y: hostOrigin.y + targetLayout.right.y + targetLayout.right.height / 2,
    };
    return {
      actions,
      object,
      onSelect,
      onPress,
      onAskButler,
      renderer,
      gestureRef,
      surface,
      overlay,
      open,
      openAt,
      target,
      targetAt,
      api: () => api,
      contentCount: () => renderer.root.findAllByType(Content).length,
      update: (routeKey: string, visible = true) =>
        act(() => renderer.update(tree(routeKey, visible))),
    };
  };

  it.each([320, 393, 768])(
    'keeps complete action labels and touch targets inside a %i px viewport',
    width => {
      const viewport = { width, height: 568 };
      for (const point of [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: 0, y: 568 },
        { x: width, y: 568 },
        { x: width / 2, y: 54 },
        { x: width / 2, y: 514 },
        { x: 23, y: 284 },
        { x: width - 23, y: 284 },
        { x: width / 2, y: 284 },
      ]) {
        const layout = resolveAIAssistTargetLayout(point, viewport);
        for (const direction of ['up', 'right', 'down', 'left'] as const) {
          const frame = layout[direction];
          const scaleOutset = frame.width * 0.06;
          const labelFrame = resolveAIAssistLabelFrame(
            frame,
            direction === 'right' ? '妙管家' : '分享文字',
            viewport,
          );
          expect(frame.x - scaleOutset - 6).toBeGreaterThanOrEqual(-0.001);
          expect(frame.x + frame.width + scaleOutset + 6).toBeLessThanOrEqual(
            width,
          );
          expect(frame.y - scaleOutset - 6).toBeGreaterThanOrEqual(-0.001);
          expect(frame.y + frame.height + scaleOutset + 6).toBeLessThanOrEqual(
            568,
          );
          expect(labelFrame.x).toBeGreaterThanOrEqual(0);
          expect(labelFrame.x + labelFrame.width).toBeLessThanOrEqual(width);
          expect(labelFrame.y).toBeGreaterThanOrEqual(0);
          expect(labelFrame.y + labelFrame.height).toBeLessThanOrEqual(568);
          const nearestLabelPoint = {
            x: Math.max(
              labelFrame.x,
              Math.min(layout.center.x, labelFrame.x + labelFrame.width),
            ),
            y: Math.max(
              labelFrame.y,
              Math.min(layout.center.y, labelFrame.y + labelFrame.height),
            ),
          };
          const labelDistanceFromTouch = Math.hypot(
            nearestLabelPoint.x - layout.center.x,
            nearestLabelPoint.y - layout.center.y,
          );
          const isExactCorner =
            (point.x === 0 || point.x === width) &&
            (point.y === 0 || point.y === viewport.height);
          if (!isExactCorner) {
            expect(labelDistanceFromTouch).toBeGreaterThanOrEqual(34);
          }
          expect(
            resolveAIAssistTargetAtPoint(
              {
                x: frame.x + frame.width / 2,
                y: frame.y + frame.height / 2,
              },
              layout,
            ),
          ).toBe(direction);
        }
      }
    },
  );

  it.each([
    {
      placement: 'interior',
      point: { x: 196, y: 330 },
      expected: ['above', 'below', 'below', 'below'],
    },
    {
      placement: 'top',
      point: { x: 196, y: 54 },
      expected: ['below', 'below', 'below', 'below'],
    },
    {
      placement: 'right',
      point: { x: 370, y: 360 },
      expected: ['above', 'below', 'below', 'below'],
    },
    {
      placement: 'bottom',
      point: { x: 196, y: 730 },
      expected: ['above', 'below', 'above', 'below'],
    },
    {
      placement: 'left',
      point: { x: 23, y: 360 },
      expected: ['above', 'below', 'below', 'below'],
    },
  ] as const)(
    'places labels on the design side for a $placement menu',
    ({ placement, point, expected }) => {
      const layout = resolveAIAssistTargetLayout(point, bounds);
      expect(layout.placement).toBe(placement);
      expect(
        (['up', 'right', 'down', 'left'] as const).map(
          direction => layout[direction].labelPlacement,
        ),
      ).toEqual(expected);
    },
  );

  it('centres the menu at an interior long-press location and leaves its centre unselected', () => {
    const point = { x: 170, y: 290 };
    const layout = resolveAIAssistTargetLayout(point, bounds);
    expect(layout.center).toEqual(point);
    expect(layout.placement).toBe('interior');
    expect(resolveAIAssistTargetAtPoint(point, layout)).toBeNull();
  });

  it.each([
    {
      placement: 'top',
      point: { x: 196, y: 54 },
      expected: {
        up: [-1, 1],
        right: [1, 0],
        down: [1, 1],
        left: [-1, 0],
      },
    },
    {
      placement: 'right',
      point: { x: 370, y: 360 },
      expected: {
        up: [0, -1],
        right: [-1, -1],
        down: [0, 1],
        left: [-1, 1],
      },
    },
    {
      placement: 'bottom',
      point: { x: 196, y: 730 },
      expected: {
        up: [-1, -1],
        right: [1, 0],
        down: [1, -1],
        left: [-1, 0],
      },
    },
    {
      placement: 'left',
      point: { x: 23, y: 360 },
      expected: {
        up: [0, -1],
        right: [1, -1],
        down: [0, 1],
        left: [1, 1],
      },
    },
  ] as const)(
    'keeps the true $placement-edge touch point and fans actions inward',
    ({ placement, point, expected }) => {
      const layout = resolveAIAssistTargetLayout(point, bounds);
      expect(layout.center).toEqual(point);
      expect(layout.placement).toBe(placement);
      for (const direction of ['up', 'right', 'down', 'left'] as const) {
        const target = centerOf(layout[direction]);
        const [expectedX, expectedY] = expected[direction];
        if (expectedX) expect(Math.sign(target.x - point.x)).toBe(expectedX);
        if (expectedY) expect(Math.sign(target.y - point.y)).toBe(expectedY);
      }
    },
  );

  it.each([
    { placement: 'left', localPoint: { x: 23, y: 360 } },
    { placement: 'right', localPoint: { x: 370, y: 360 } },
  ] as const)(
    'renders and selects a four-action menu from the actual $placement-side long-press point',
    ({ placement, localPoint }) => {
      const view = mount('chat-message');
      const pagePoint = {
        x: hostOrigin.x + localPoint.x,
        y: hostOrigin.y + localPoint.y,
      };
      view.openAt(pagePoint);

      const expectedLayout = resolveAIAssistTargetLayout(localPoint, bounds);
      expect(expectedLayout.placement).toBe(placement);
      const touchPointStyle = StyleSheet.flatten(
        view.renderer.root.findByProps({
          testID: 'content-action-touch-point',
        }).props.style,
      );
      expect(touchPointStyle).toMatchObject({
        left: localPoint.x - 34,
        top: localPoint.y - 34,
      });

      const expectedLabels = {
        up: '分享',
        right: '妙管家',
        down: '复制',
        left: '更多',
      } as const;
      for (const direction of ['up', 'right', 'down', 'left'] as const) {
        const actionStyle = StyleSheet.flatten(
          view.renderer.root.findByProps({
            testID: `content-action-${direction}`,
          }).props.style,
        );
        expect(actionStyle).toMatchObject({
          left: expectedLayout[direction].x,
          top: expectedLayout[direction].y,
        });
        const label = view.renderer.root.findByProps({
          testID: `content-action-label-${direction}`,
        });
        expect(label.findByType(Text).props.children).toBe(
          expectedLabels[direction],
        );
      }

      const rightTarget = view.targetAt(pagePoint, 'right');
      act(() => view.surface().props.onTouchMove(touch(rightTarget)));
      expect(
        StyleSheet.flatten(
          view.renderer.root.findByProps({
            testID: 'content-action-right',
          }).props.style,
        ).transform,
      ).toEqual([{ scale: 1.12 }]);
      act(() => view.surface().props.onTouchEnd(touch(rightTarget)));
      expect(view.onSelect).toHaveBeenCalledTimes(1);
      expect(view.onSelect).toHaveBeenCalledWith(view.object);
      expect(view.overlay()).toHaveLength(0);
    },
  );

  it.each(['avatar-3d', 'chat-message'] as const)(
    'never copies the %s content subtree into the overlay',
    kind => {
      const view = mount(kind);
      expect(view.contentCount()).toBe(1);
      view.open();
      expect(view.overlay()).not.toHaveLength(0);
      expect(view.contentCount()).toBe(1);
      act(() => view.api().move(view.target));
      expect(view.contentCount()).toBe(1);
      expect(
        view.renderer.root.findAllByProps({ testID: 'ai-assist-drag-preview' }),
      ).toHaveLength(0);
    },
  );

  it('keeps stationary release open for a separate button tap', () => {
    const view = mount();
    view.open();
    expect(NativeModules.MiaoxunHapticsModule.trigger).toHaveBeenCalledWith(
      'activation',
    );
    act(() => view.surface().props.onTouchEnd(touch(anchor)));
    expect(view.overlay()).not.toHaveLength(0);
    expect(view.onSelect).not.toHaveBeenCalled();
    const action = view.renderer.root
      .findAllByProps({ testID: 'content-action-right' })
      .find(node => typeof node.props.onPress === 'function')!;
    act(() => action.props.onPress());
    expect(NativeModules.MiaoxunHapticsModule.trigger).toHaveBeenCalledWith(
      'confirmation',
    );
    expect(view.onSelect).toHaveBeenCalledWith(view.object);
    expect(view.onSelect).toHaveBeenCalledTimes(1);
    expect(view.overlay()).toHaveLength(0);
  });

  it('selects the release target when a fast drag has no intermediate move event', () => {
    const view = mount();
    view.open();
    act(() => view.surface().props.onTouchEnd(touch(view.target)));
    expect(view.onSelect).toHaveBeenCalledWith(view.object);
    expect(view.overlay()).toHaveLength(0);
    expect(NativeModules.MiaoxunHapticsModule.trigger.mock.calls).toEqual([
      ['activation'],
      ['confirmation'],
    ]);
  });

  it('keeps unavailable actions disabled for taps and drag releases', () => {
    const view = mount();
    view.actions[0].available = false;
    view.open();
    const action = view.renderer.root
      .findAllByProps({ testID: 'content-action-right' })
      .find(node => typeof node.props.onPress === 'function')!;
    expect(action.props.disabled).toBe(true);
    act(() => {
      view.surface().props.onTouchMove(touch(view.target));
      view.surface().props.onTouchEnd(touch(view.target));
      action.props.onPress();
    });
    expect(view.onSelect).not.toHaveBeenCalled();
    expect(view.overlay()).not.toHaveLength(0);
    expect(NativeModules.MiaoxunHapticsModule.trigger.mock.calls).toEqual([
      ['activation'],
    ]);
  });

  it('executes a drag target once even if native and bridge release both arrive', () => {
    const view = mount();
    act(() => view.gestureRef.current!.activateAt(localAnchor));
    const localTarget = {
      x: view.target.x - surfaceOrigin.x,
      y: view.target.y - surfaceOrigin.y,
    };
    act(() => view.gestureRef.current!.moveTo(localTarget));
    act(() => {
      view.gestureRef.current!.releaseAt(localTarget);
      view.api().release(view.target);
    });
    expect(view.onSelect).toHaveBeenCalledTimes(1);
    expect(view.onSelect).toHaveBeenCalledWith(view.object);
    expect(view.overlay()).toHaveLength(0);
    expect(NativeModules.MiaoxunHapticsModule.trigger.mock.calls).toEqual([
      ['activation'],
      ['hover'],
      ['confirmation'],
    ]);
  });

  it('emits a light hover once per target entry, and no feedback while stationary', () => {
    const view = mount();
    view.open();
    act(() => {
      view.api().move(view.target);
      view.api().move(view.target);
      view.api().move(view.target);
    });
    expect(NativeModules.MiaoxunHapticsModule.trigger.mock.calls).toEqual([
      ['activation'],
      ['hover'],
    ]);
    act(() => {
      view.api().move(anchor);
      view.api().move(view.target);
    });
    expect(NativeModules.MiaoxunHapticsModule.trigger.mock.calls).toEqual([
      ['activation'],
      ['hover'],
      ['hover'],
    ]);
  });

  it('does not execute a menu action when the native haptics bridge is missing', () => {
    const view = mount();
    view.open();
    const action = view.renderer.root
      .findAllByProps({ testID: 'content-action-right' })
      .find(node => typeof node.props.onPress === 'function')!;
    const nativeHaptics = NativeModules.MiaoxunHapticsModule;
    NativeModules.MiaoxunHapticsModule = undefined;
    try {
      expect(() => act(() => action.props.onPress())).toThrow(
        'MiaoxunHapticsModule is not registered',
      );
      expect(view.onSelect).not.toHaveBeenCalled();
      expect(view.overlay()).not.toHaveLength(0);
    } finally {
      NativeModules.MiaoxunHapticsModule = nativeHaptics;
    }
  });

  it.each(['surface', 'host'] as const)(
    'preserves a fast 3D move and release while the %s measurement is pending',
    pendingMeasurement => {
      const view = mount();
      deferred = pendingMeasurement;
      const localTarget = {
        x: view.target.x - surfaceOrigin.x,
        y: view.target.y - surfaceOrigin.y,
      };
      act(() => {
        view.gestureRef.current!.activateAt(localAnchor);
        view.gestureRef.current!.moveTo(localTarget);
        view.gestureRef.current!.releaseAt(localTarget);
      });
      expect(view.onSelect).not.toHaveBeenCalled();
      flushMeasurement();
      expect(view.onSelect).toHaveBeenCalledTimes(1);
      expect(view.onSelect).toHaveBeenCalledWith(view.object);
      expect(view.overlay()).toHaveLength(0);
      expect(
        NativeModules.MiaoxunHapticsModule.trigger,
      ).toHaveBeenNthCalledWith(1, 'activation');
      expect(
        NativeModules.MiaoxunHapticsModule.trigger,
      ).toHaveBeenNthCalledWith(2, 'hover');
      expect(
        NativeModules.MiaoxunHapticsModule.trigger,
      ).toHaveBeenNthCalledWith(3, 'confirmation');
    },
  );

  it.each(['surface', 'host'] as const)(
    'selects a fast 3D release without a move while the %s measurement is pending',
    pendingMeasurement => {
      const view = mount();
      deferred = pendingMeasurement;
      const localTarget = {
        x: view.target.x - surfaceOrigin.x,
        y: view.target.y - surfaceOrigin.y,
      };
      act(() => {
        view.gestureRef.current!.activateAt(localAnchor);
        view.gestureRef.current!.releaseAt(localTarget);
      });
      flushMeasurement();
      expect(view.onSelect).toHaveBeenCalledTimes(1);
      expect(view.overlay()).toHaveLength(0);
      expect(NativeModules.MiaoxunHapticsModule.trigger.mock.calls).toEqual([
        ['activation'],
        ['confirmation'],
      ]);
    },
  );

  it('ignores normal movement/rotation before a long press and cancels drag outside targets', () => {
    const view = mount();
    act(() => view.surface().props.onTouchMove(touch(view.target)));
    act(() => view.surface().props.onTouchEnd(touch(view.target)));
    expect(view.overlay()).toHaveLength(0);
    expect(view.onSelect).not.toHaveBeenCalled();
    view.open();
    act(() => view.surface().props.onTouchMove(touch({ x: 20, y: 100 })));
    act(() => view.surface().props.onTouchEnd(touch({ x: 20, y: 100 })));
    expect(view.overlay()).toHaveLength(0);
    expect(view.onSelect).not.toHaveBeenCalled();
  });

  it('cleans up on touch cancel, navigation, background, back and source unmount', () => {
    const view = mount();
    view.open();
    act(() => view.surface().props.onTouchCancel());
    expect(view.overlay()).toHaveLength(0);
    view.open();
    view.update('messages');
    expect(view.overlay()).toHaveLength(0);
    view.open();
    act(() => appStateChange('background'));
    expect(view.overlay()).toHaveLength(0);
    view.open();
    const backEvent = { type: 'hardwareBackPress' as const, timeStamp: 0 };
    act(() => expect(hardwareBack(backEvent)).toBe(true));
    expect(view.overlay()).toHaveLength(0);
    expect(hardwareBack(backEvent)).toBe(false);
    view.open();
    view.update('messages', false);
    expect(view.overlay()).toHaveLength(0);
    expect(view.onSelect).not.toHaveBeenCalled();
  });

  it('passes the exact content reference to the butler and closes the menu', () => {
    const view = mount('chat-message');
    view.open();
    act(() => view.api().askButler(view.object));
    expect(view.onAskButler).toHaveBeenCalledWith(view.object);
    expect(view.overlay()).toHaveLength(0);
  });

  it('ignores obsolete host measurements after a newer menu opens', () => {
    const view = mount();
    deferred = 'host';
    act(() => {
      view.api().open({
        object: view.object,
        actions: view.actions,
        point: anchor,
        sourceId: 'old',
      });
      view.api().open({
        object: view.object,
        actions: view.actions,
        point: anchor,
        sourceId: 'new',
      });
    });
    flushMeasurement(1);
    expect(view.api().activeSourceId).toBe('new');
    flushMeasurement();
    expect(view.api().activeSourceId).toBe('new');
  });

  it('does not route new-source movement to an old menu while the new host measurement is pending', () => {
    const view = mount();
    view.open();
    deferred = 'host';
    act(() => {
      view.api().open({
        object: view.object,
        actions: view.actions,
        point: anchor,
        sourceId: 'new-source',
      });
      view.api().move(view.target, 'new-source');
      view.api().release(view.target, 'new-source');
    });
    expect(view.overlay()).toHaveLength(0);
    expect(view.onSelect).not.toHaveBeenCalled();
    flushMeasurement();
    expect(view.onSelect).toHaveBeenCalledTimes(1);
    expect(view.overlay()).toHaveLength(0);
  });

  it('does not resurrect a cancelled source while its host measurement is pending', () => {
    const view = mount();
    deferred = 'host';
    view.open();
    act(() => view.gestureRef.current!.cancel());
    flushMeasurement();
    expect(view.overlay()).toHaveLength(0);
  });

  it('cancels a pending native long press before the overlay becomes active', () => {
    const view = mount();
    deferred = 'host';
    view.open();
    act(() => view.surface().props.onTouchCancel());
    flushMeasurement();
    expect(view.overlay()).toHaveLength(0);
  });

  it('ignores stale 3D bridge movement after another content menu becomes active', () => {
    const view = mount();
    const onOtherSelect = jest.fn();
    act(() => view.gestureRef.current!.activateAt(localAnchor));
    act(() =>
      view.api().open({
        object: { kind: 'chat-message', id: 'message-2', title: '另一条消息' },
        actions: [{ ...view.actions[0], onSelect: onOtherSelect }],
        point: anchor,
        sourceId: 'other-source',
      }),
    );
    const localTarget = {
      x: view.target.x - surfaceOrigin.x,
      y: view.target.y - surfaceOrigin.y,
    };
    act(() => {
      view.gestureRef.current!.moveTo(localTarget);
      view.gestureRef.current!.releaseAt(localTarget);
    });
    expect(view.onSelect).not.toHaveBeenCalled();
    expect(onOtherSelect).not.toHaveBeenCalled();
    expect(view.api().activeSourceId).toBe('other-source');
  });

  it.each(['cancel', 'navigate', 'unmount', 'background'] as const)(
    'ignores the delayed source measurement after %s',
    reason => {
      const view = mount();
      deferred = 'surface';
      act(() => view.gestureRef.current!.activateAt(localAnchor));
      if (reason === 'cancel') act(() => view.gestureRef.current!.cancel());
      if (reason === 'navigate') view.update('messages');
      if (reason === 'unmount') view.update('station', false);
      if (reason === 'background') act(() => appStateChange('background'));
      flushMeasurement();
      expect(view.overlay()).toHaveLength(0);
      expect(view.onSelect).not.toHaveBeenCalled();
    },
  );

  it('does not reopen from a delayed accessibility measurement after navigation', () => {
    const view = mount();
    deferred = 'surface';
    act(() =>
      view.surface().props.onAccessibilityAction({
        nativeEvent: { actionName: 'show-menu' },
      }),
    );
    view.update('messages');
    deferred = null;
    flushMeasurement();
    expect(view.overlay()).toHaveLength(0);
  });
});
