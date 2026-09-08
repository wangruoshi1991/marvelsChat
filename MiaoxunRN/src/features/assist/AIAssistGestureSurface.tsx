import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';

import { Palette } from '../../shared/theme';
import {
  AIAssistAction,
  AIAssistDirection,
  AIAssistObjectReference,
  AIAssistPoint,
} from './aiAssistTypes';

const activationDelayMs = 420;
const dragThreshold = 8;
const targetEdgeInset = 12;
const targetGap = 14;

type SurfaceSize = { width: number; height: number };
type SurfacePoint = AIAssistPoint;
type AssistTargetFrame = SurfacePoint & SurfaceSize;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type AIAssistTargetLayout = Record<
  AIAssistDirection,
  AssistTargetFrame
> & { center: SurfacePoint };

export type AIAssistGestureHandle = {
  activateAt: (localPoint: SurfacePoint) => void;
  moveTo: (localPoint: SurfacePoint) => void;
  releaseAt: (localPoint: SurfacePoint) => void;
  cancel: () => void;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export function resolveAIAssistTargetLayout(
  _touchPoint: SurfacePoint,
  surface: SurfaceSize,
): AIAssistTargetLayout {
  const center = { x: surface.width / 2, y: surface.height / 2 };
  const sideWidth = clamp(surface.width * 0.16, 54, 68);
  const sideHeight = Math.max(0, surface.height - targetEdgeInset * 2);
  const horizontalX = targetEdgeInset + sideWidth + targetGap;
  const horizontalWidth = Math.max(0, surface.width - horizontalX * 2);
  const horizontalHeight = clamp(surface.height * 0.23, 50, 60);

  return {
    center,
    left: {
      x: targetEdgeInset,
      y: targetEdgeInset,
      width: sideWidth,
      height: sideHeight,
    },
    right: {
      x: surface.width - targetEdgeInset - sideWidth,
      y: targetEdgeInset,
      width: sideWidth,
      height: sideHeight,
    },
    up: {
      x: horizontalX,
      y: targetEdgeInset,
      width: horizontalWidth,
      height: horizontalHeight,
    },
    down: {
      x: horizontalX,
      y: surface.height - targetEdgeInset - horizontalHeight,
      width: horizontalWidth,
      height: horizontalHeight,
    },
  };
}

export function resolveAIAssistDirection(
  dx: number,
  dy: number,
  threshold = 46,
): AIAssistDirection | null {
  if (Math.hypot(dx, dy) < threshold) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

export function resolveAIAssistTargetAtPoint(
  point: SurfacePoint,
  layout: AIAssistTargetLayout,
): AIAssistDirection | null {
  const directions: AIAssistDirection[] = ['up', 'right', 'down', 'left'];
  return (
    directions.find(direction => {
      const frame = layout[direction];
      return (
        point.x >= frame.x &&
        point.x <= frame.x + frame.width &&
        point.y >= frame.y &&
        point.y <= frame.y + frame.height
      );
    }) || null
  );
}

export const AIAssistGestureSurface = forwardRef<
  AIAssistGestureHandle,
  {
    object: AIAssistObjectReference;
    actions: AIAssistAction[];
    palette: Palette;
    children: React.ReactNode;
    onActiveChange?: (active: boolean) => void;
    testID?: string;
  }
>(function AIAssistGestureSurfaceComponent(
  {
    object,
    actions,
    palette,
    children,
    onActiveChange,
    testID = 'ai-assist-surface',
  },
  ref,
) {
  const [active, setActive] = useState(false);
  const [selectedDirection, setSelectedDirection] =
    useState<AIAssistDirection | null>(null);
  const [surfaceSize, setSurfaceSize] = useState<SurfaceSize>({
    height: 0,
    width: 0,
  });
  const [menuTouchPoint, setMenuTouchPoint] = useState<SurfacePoint>({
    x: 0,
    y: 0,
  });
  const activeRef = useRef(false);
  const movedRef = useRef(false);
  const localTouchPointRef = useRef<SurfacePoint>({ x: 0, y: 0 });
  const surfaceRef = useRef<View>(null);
  const gestureOriginRef = useRef<SurfacePoint>({ x: 0, y: 0 });
  const selectedDirectionRef = useRef<AIAssistDirection | null>(null);
  const targetLayoutRef = useRef<AIAssistTargetLayout | null>(null);
  const executeAction = useCallback(
    (direction: AIAssistDirection) => {
      const action = actions.find(item => item.direction === direction);
      if (!action) return;
      if (action.available === false) {
        action.onUnavailable?.(object);
        return;
      }
      action.onSelect(object);
    },
    [actions, object],
  );

  const reset = useCallback(() => {
    activeRef.current = false;
    movedRef.current = false;
    selectedDirectionRef.current = null;
    targetLayoutRef.current = null;
    setActive(false);
    setSelectedDirection(null);
    onActiveChange?.(false);
  }, [onActiveChange]);

  const activateAt = useCallback(
    (localPoint: SurfacePoint) => {
      if (activeRef.current || !surfaceSize.width || !surfaceSize.height)
        return;
      const layout = resolveAIAssistTargetLayout(localPoint, surfaceSize);
      activeRef.current = true;
      movedRef.current = false;
      localTouchPointRef.current = localPoint;
      gestureOriginRef.current = localPoint;
      targetLayoutRef.current = layout;
      setMenuTouchPoint(localPoint);
      setSelectedDirection(null);
      setActive(true);
      onActiveChange?.(true);
      Vibration.vibrate(8);
    },
    [onActiveChange, surfaceSize],
  );

  const moveTo = useCallback((localPoint: SurfacePoint) => {
    if (!activeRef.current) return;
    localTouchPointRef.current = localPoint;
    const dx = localPoint.x - gestureOriginRef.current.x;
    const dy = localPoint.y - gestureOriginRef.current.y;
    movedRef.current ||= Math.hypot(dx, dy) > dragThreshold;
    const direction = targetLayoutRef.current
      ? resolveAIAssistTargetAtPoint(localPoint, targetLayoutRef.current)
      : null;
    if (direction && direction !== selectedDirectionRef.current) {
      Vibration.vibrate(8);
    }
    selectedDirectionRef.current = direction;
    setSelectedDirection(direction);
  }, []);

  const releaseAt = useCallback(
    (localPoint: SurfacePoint) => {
      if (!activeRef.current) return;
      moveTo(localPoint);
      const direction = selectedDirectionRef.current;
      const shouldExecute = movedRef.current && direction;
      reset();
      if (shouldExecute) {
        Vibration.vibrate(16);
        executeAction(shouldExecute);
      }
    },
    [executeAction, moveTo, reset],
  );

  useImperativeHandle(
    ref,
    () => ({ activateAt, cancel: () => reset(), moveTo, releaseAt }),
    [activateAt, moveTo, releaseAt, reset],
  );

  const rememberTouchPoint = useCallback((event?: GestureResponderEvent) => {
    if (!event?.nativeEvent) return;
    localTouchPointRef.current = {
      x: event.nativeEvent.locationX,
      y: event.nativeEvent.locationY,
    };
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: () => activeRef.current,
        onPanResponderMove: (_event, gesture) => {
          moveTo({
            x: gestureOriginRef.current.x + gesture.dx,
            y: gestureOriginRef.current.y + gesture.dy,
          });
        },
        onPanResponderRelease: (_event, gesture) => {
          releaseAt({
            x: gestureOriginRef.current.x + gesture.dx,
            y: gestureOriginRef.current.y + gesture.dy,
          });
        },
        onPanResponderTerminate: () => reset(),
        onPanResponderTerminationRequest: () => !activeRef.current,
      }),
    [moveTo, releaseAt, reset],
  );

  const targetLayout = useMemo(
    () =>
      resolveAIAssistTargetLayout(
        {
          x: menuTouchPoint.x || surfaceSize.width / 2,
          y: menuTouchPoint.y || surfaceSize.height / 2,
        },
        surfaceSize,
      ),
    [menuTouchPoint.x, menuTouchPoint.y, surfaceSize],
  );
  return (
    <Pressable
      ref={surfaceRef}
      {...panResponder.panHandlers}
      accessibilityActions={[
        { name: 'show-menu', label: 'AI辅助选项' },
        ...actions.map(action => ({
          name: action.direction,
          label: action.label,
        })),
      ]}
      accessibilityHint="长按后拖入一个 AI 能力"
      accessibilityLabel={object.title}
      accessibilityRole="button"
      delayLongPress={activationDelayMs}
      onAccessibilityAction={event => {
        const actionName = event.nativeEvent.actionName;
        if (actionName === 'show-menu') {
          activateAt({ x: surfaceSize.width / 2, y: surfaceSize.height / 2 });
          return;
        }
        executeAction(actionName as AIAssistDirection);
      }}
      onLayout={(event: LayoutChangeEvent) => {
        setSurfaceSize({
          height: event.nativeEvent.layout.height,
          width: event.nativeEvent.layout.width,
        });
      }}
      onLongPress={event => {
        rememberTouchPoint(event);
        activateAt(localTouchPointRef.current);
      }}
      onPressIn={rememberTouchPoint}
      onPressOut={() => {
        if (activeRef.current && !movedRef.current) reset();
      }}
      style={localStyles.surface}
      testID={testID}
    >
      <View pointerEvents="auto" style={localStyles.content}>
        {children}
      </View>

      {active ? (
        <View
          pointerEvents="box-none"
          style={localStyles.overlay}
          testID={`${testID}-overlay`}
        >
          <View pointerEvents="none" style={localStyles.backdrop} />
          {actions.map(action => (
            <AssistTarget
              key={action.direction}
              action={action}
              frame={targetLayout[action.direction]}
              object={object}
              palette={palette}
              selected={selectedDirection === action.direction}
              onAfterSelect={reset}
              testID={`${testID}-${action.direction}`}
            />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
});

function AssistTarget({
  action,
  frame,
  object,
  palette,
  selected,
  onAfterSelect,
  testID,
}: {
  action: AIAssistAction;
  frame: AssistTargetFrame;
  object: AIAssistObjectReference;
  palette: Palette;
  selected: boolean;
  onAfterSelect: () => void;
  testID: string;
}) {
  const selectionProgress = useRef(new Animated.Value(0)).current;
  const available = action.available !== false;
  const foregroundColor = selected
    ? '#FFFFFF'
    : available
    ? palette.text
    : palette.secondaryText;
  const Icon = action.Icon;
  const isSideTarget =
    action.direction === 'left' || action.direction === 'right';
  const iconBackgroundStyle = {
    backgroundColor: selected ? 'rgba(255,255,255,0.18)' : `${action.accent}18`,
  };

  useEffect(() => {
    Animated.spring(selectionProgress, {
      damping: 13,
      mass: 0.55,
      stiffness: 300,
      toValue: selected ? 1 : 0,
      useNativeDriver: true,
    }).start();
    return () => selectionProgress.stopAnimation();
  }, [selected, selectionProgress]);

  const select = () => {
    onAfterSelect();
    if (available) action.onSelect(object);
    else action.onUnavailable?.(object);
  };

  return (
    <AnimatedPressable
      accessibilityLabel={action.label}
      accessibilityRole="button"
      accessibilityState={{ disabled: !available, selected }}
      onPress={select}
      pointerEvents="auto"
      style={[
        localStyles.target,
        isSideTarget && localStyles.targetSide,
        {
          backgroundColor: selected
            ? action.accent
            : available
            ? 'rgba(255,255,255,0.94)'
            : 'rgba(240,240,240,0.9)',
          borderColor: selected ? action.accent : `${action.accent}55`,
          height: frame.height,
          left: frame.x,
          top: frame.y,
          width: frame.width,
        },
        selected && localStyles.targetSelected,
        {
          transform: [
            {
              scale: selectionProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.08],
              }),
            },
          ],
        },
      ]}
      testID={testID}
    >
      <View style={[localStyles.targetIcon, iconBackgroundStyle]}>
        <Icon color={foregroundColor} size={17} strokeWidth={2.1} />
      </View>
      <View
        style={[
          localStyles.targetCopy,
          isSideTarget && localStyles.targetCopySide,
        ]}
      >
        {action.eyebrow ? (
          <Text
            numberOfLines={1}
            style={[localStyles.targetEyebrow, { color: foregroundColor }]}
          >
            {action.eyebrow}
          </Text>
        ) : null}
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          numberOfLines={2}
          style={[
            localStyles.targetLabel,
            isSideTarget && localStyles.targetLabelSide,
            { color: foregroundColor },
          ]}
        >
          {action.label}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

const localStyles = StyleSheet.create({
  surface: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  content: { flex: 1, width: '100%' },
  overlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 20,
  },
  backdrop: {
    backgroundColor: 'rgba(247,248,252,0.52)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  target: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    paddingHorizontal: 6,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    zIndex: 3,
  },
  targetSelected: {
    borderWidth: 2,
    shadowOpacity: 0.2,
    zIndex: 4,
  },
  targetSide: {
    flexDirection: 'column',
    gap: 7,
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  targetEyebrow: { fontSize: 9, fontWeight: '800' },
  targetIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  targetCopy: {
    flexShrink: 1,
    justifyContent: 'center',
  },
  targetCopySide: { alignItems: 'center', width: '100%' },
  targetLabel: {
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 13,
    textAlign: 'left',
  },
  targetLabelSide: { textAlign: 'center' },
});
