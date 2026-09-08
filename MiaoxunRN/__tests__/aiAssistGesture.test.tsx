import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Bot } from 'lucide-react-native';

import {
  AIAssistGestureHandle,
  AIAssistGestureSurface,
  resolveAIAssistDirection,
  resolveAIAssistTargetAtPoint,
  resolveAIAssistTargetLayout,
} from '../src/features/assist/AIAssistGestureSurface';
import { palettes } from '../src/shared/theme';

describe('AI assist gesture surface', () => {
  const layoutEvent = {
    nativeEvent: { layout: { height: 238, width: 390, x: 0, y: 0 } },
  };
  const touchEvent = {
    nativeEvent: {
      locationX: 118,
      locationY: 88,
      pageX: 118,
      pageY: 288,
    },
  };

  it('resolves a drag to the dominant direction after the threshold', () => {
    expect(resolveAIAssistDirection(20, 10)).toBeNull();
    expect(resolveAIAssistDirection(72, 8)).toBe('right');
    expect(resolveAIAssistDirection(-72, 8)).toBe('left');
    expect(resolveAIAssistDirection(4, -72)).toBe('up');
    expect(resolveAIAssistDirection(4, 72)).toBe('down');
  });

  it('anchors symmetric targets to the four edges of the surface', () => {
    const layout = resolveAIAssistTargetLayout(
      { x: 118, y: 88 },
      { height: 238, width: 390 },
    );

    expect(layout.center).toEqual({ x: 195, y: 119 });
    expect(layout.left.x).toBe(12);
    expect(layout.right.x + layout.right.width).toBe(378);
    expect(layout.up.y).toBe(12);
    expect(layout.down.y + layout.down.height).toBe(226);
    expect(layout.left.width).toBe(layout.right.width);
    expect(layout.left.height).toBe(layout.right.height);
    expect(layout.left.width).toBeCloseTo(62.4);
    expect(layout.left.height).toBe(214);
    expect(layout.up.width).toBe(layout.down.width);
    expect(layout.up.height).toBe(layout.down.height);
    expect(layout.up.width).toBeCloseTo(213.2);
    expect(layout.up.x - (layout.left.x + layout.left.width)).toBe(14);
    expect(layout.right.x - (layout.up.x + layout.up.width)).toBe(14);
    expect(layout.down.x - (layout.left.x + layout.left.width)).toBe(14);
    expect(layout.right.x - (layout.down.x + layout.down.width)).toBe(14);
    expect(
      resolveAIAssistTargetAtPoint(
        {
          x: layout.right.x + layout.right.width / 2,
          y: layout.right.y + layout.right.height / 2,
        },
        layout,
      ),
    ).toBe('right');
  });

  it('keeps the same edge layout for long presses anywhere in the surface', () => {
    const topLeft = resolveAIAssistTargetLayout(
      { x: 12, y: 12 },
      { height: 238, width: 390 },
    );
    const bottomRight = resolveAIAssistTargetLayout(
      { x: 378, y: 226 },
      { height: 238, width: 390 },
    );

    expect(topLeft).toEqual(bottomRight);
  });

  it('reveals configured actions and forwards the object context', async () => {
    const onSelect = jest.fn();
    const object = {
      kind: 'avatar-3d' as const,
      id: 'model-1',
      title: '我的3D形象',
      metadata: { serviceStatus: 'ready' },
    };
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <AIAssistGestureSurface
          actions={[
            {
              direction: 'right',
              eyebrow: '核心',
              label: '3D Agent',
              Icon: Bot,
              accent: '#2012D9',
              onSelect,
            },
          ]}
          object={object}
          palette={palettes.light}
          testID="subject-assist"
        >
          <Text>3D content</Text>
        </AIAssistGestureSurface>,
      );
    });

    const longPressTarget = renderer!.root
      .findAllByProps({ testID: 'subject-assist' })
      .find(node => typeof node.props.onLongPress === 'function');
    await ReactTestRenderer.act(() =>
      longPressTarget!.props.onLayout(layoutEvent),
    );
    await ReactTestRenderer.act(() =>
      longPressTarget!.props.onLongPress(touchEvent),
    );
    expect(
      renderer!.root.findByProps({ testID: 'subject-assist-overlay' }),
    ).toBeTruthy();

    await ReactTestRenderer.act(() => {
      const actionTarget = renderer!.root
        .findAllByProps({ testID: 'subject-assist-right' })
        .find(node => typeof node.props.onPress === 'function');
      actionTarget!.props.onPress();
    });
    expect(onSelect).toHaveBeenCalledWith(object);

    await ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('executes the target that receives the dragged 3D object', async () => {
    const onSelect = jest.fn();
    const gestureRef = React.createRef<AIAssistGestureHandle>();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <AIAssistGestureSurface
          actions={[
            {
              direction: 'right',
              label: '3D Agent',
              Icon: Bot,
              accent: '#2012D9',
              onSelect,
            },
          ]}
          object={{ kind: 'avatar-3d', id: 'model-1', title: '我的3D形象' }}
          palette={palettes.light}
          ref={gestureRef}
          testID="subject-assist"
        >
          <Text>3D content</Text>
        </AIAssistGestureSurface>,
      );
    });
    const surface = renderer!.root
      .findAllByProps({ testID: 'subject-assist' })
      .find(node => typeof node.props.onLayout === 'function');
    await ReactTestRenderer.act(() => surface!.props.onLayout(layoutEvent));

    const layout = resolveAIAssistTargetLayout(
      { x: 118, y: 88 },
      { height: 238, width: 390 },
    );
    const rightTarget = {
      x: layout.right.x + layout.right.width / 2,
      y: layout.right.y + layout.right.height / 2,
    };
    await ReactTestRenderer.act(() =>
      gestureRef.current!.activateAt({ x: 118, y: 88 }),
    );
    await ReactTestRenderer.act(() => gestureRef.current!.moveTo(rightTarget));
    await ReactTestRenderer.act(() =>
      gestureRef.current!.releaseAt(rightTarget),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('closes the assist state when a long press ends without dragging', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <AIAssistGestureSurface
          actions={[]}
          object={{ kind: 'avatar-3d', id: null, title: '我的3D形象' }}
          palette={palettes.light}
          testID="subject-assist"
        >
          <Text>3D content</Text>
        </AIAssistGestureSurface>,
      );
    });

    const surface = renderer!.root
      .findAllByProps({ testID: 'subject-assist' })
      .find(node => typeof node.props.onLongPress === 'function');
    await ReactTestRenderer.act(() => surface!.props.onLayout(layoutEvent));
    await ReactTestRenderer.act(() => surface!.props.onLongPress(touchEvent));
    expect(
      renderer!.root.findByProps({ testID: 'subject-assist-overlay' }),
    ).toBeTruthy();

    await ReactTestRenderer.act(() => surface!.props.onPressOut());
    expect(
      renderer!.root.findAllByProps({ testID: 'subject-assist-overlay' }),
    ).toHaveLength(0);

    await ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('cancels without rendering a duplicate drag preview', async () => {
    const gestureRef = React.createRef<AIAssistGestureHandle>();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <AIAssistGestureSurface
          actions={[]}
          object={{ kind: 'avatar-3d', id: 'model-1', title: '我的3D形象' }}
          palette={palettes.light}
          ref={gestureRef}
          testID="subject-assist"
        >
          <Text testID="avatar-content">3D content</Text>
        </AIAssistGestureSurface>,
      );
    });
    const surface = renderer!.root
      .findAllByProps({ testID: 'subject-assist' })
      .find(node => typeof node.props.onLayout === 'function');
    await ReactTestRenderer.act(() => surface!.props.onLayout(layoutEvent));
    await ReactTestRenderer.act(() =>
      gestureRef.current!.activateAt({ x: 118, y: 88 }),
    );
    const contentNodeCount = renderer!.root.findAllByProps({
      testID: 'avatar-content',
    }).length;
    await ReactTestRenderer.act(() =>
      gestureRef.current!.moveTo({ x: 210, y: 88 }),
    );

    expect(
      renderer!.root.findAllByProps({ testID: 'ai-assist-drag-preview' }),
    ).toHaveLength(0);
    expect(
      renderer!.root.findAllByProps({ testID: 'avatar-content' }),
    ).toHaveLength(contentNodeCount);

    await ReactTestRenderer.act(() => gestureRef.current!.cancel());
    expect(
      renderer!.root.findAllByProps({ testID: 'subject-assist-overlay' }),
    ).toHaveLength(0);
    expect(
      renderer!.root.findAllByProps({ testID: 'avatar-content' }),
    ).toHaveLength(contentNodeCount);

    await ReactTestRenderer.act(() => renderer!.unmount());
  });
});
