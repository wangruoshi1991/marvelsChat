import React, {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  GestureResponderEvent,
  Pressable,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import { Palette } from '../../shared/theme';
import { useAIAssist } from './AIAssistProvider';
import {
  AIAssistAction,
  AIAssistObjectReference,
  AIAssistPoint,
} from './aiAssistTypes';

export {
  resolveAIAssistLabelFrame,
  resolveAIAssistTargetLayout,
  resolveAIAssistTargetAtPoint,
} from './assistLayout';
export type { AIAssistTargetLayout } from './assistLayout';
export type AIAssistGestureHandle = {
  activateAt: (point: AIAssistPoint) => void;
  moveTo: (point: AIAssistPoint) => void;
  releaseAt: (point: AIAssistPoint) => void;
  cancel: () => void;
};
type PendingBridgeGesture = {
  revision: number;
  origin?: AIAssistPoint;
  move?: AIAssistPoint;
  release?: AIAssistPoint;
};

export const AIAssistGestureSurface = forwardRef<
  AIAssistGestureHandle,
  {
    object: AIAssistObjectReference;
    actions: AIAssistAction[];
    palette: Palette;
    children: React.ReactNode;
    onActiveChange?: (active: boolean) => void;
    onPress?: (event: GestureResponderEvent) => void;
    style?: StyleProp<ViewStyle>;
    testID?: string;
  }
>(function AIAssistGestureSurfaceComponent(
  {
    object,
    actions,
    children,
    onActiveChange,
    onPress,
    style,
    testID = 'ai-assist-surface',
  },
  ref,
) {
  const assist = useAIAssist();
  const sourceId = useId();
  const viewRef = useRef<View>(null);
  const revisionRef = useRef(0);
  const bridgeGestureRef = useRef<PendingBridgeGesture | null>(null);
  const active = assist.activeSourceId === sourceId;
  const { open, dismiss, move, release, getGeneration } = assist;
  const activateAt = useCallback(
    (point?: AIAssistPoint) => {
      const revision = ++revisionRef.current;
      const generation = getGeneration();
      bridgeGestureRef.current = { revision };
      viewRef.current?.measureInWindow((x, y, width, height) => {
        const gesture = bridgeGestureRef.current;
        if (
          revision !== revisionRef.current ||
          gesture?.revision !== revision ||
          generation !== getGeneration() ||
          width <= 0 ||
          height <= 0
        ) {
          if (gesture?.revision === revision) bridgeGestureRef.current = null;
          return;
        }
        gesture.origin = { x, y };
        open({
          object,
          actions,
          point: {
            x: x + (point?.x ?? width / 2),
            y: y + (point?.y ?? height / 2),
          },
          sourceId,
          hapticOnOpen: true,
        });
        if (gesture.move) {
          move({ x: x + gesture.move.x, y: y + gesture.move.y }, sourceId);
        }
        if (gesture.release) {
          release(
            { x: x + gesture.release.x, y: y + gesture.release.y },
            sourceId,
          );
        }
      });
    },
    [actions, getGeneration, move, object, open, release, sourceId],
  );
  useImperativeHandle(
    ref,
    () => ({
      activateAt,
      moveTo: point => {
        const gesture = bridgeGestureRef.current;
        if (!gesture) return;
        gesture.move = point;
        if (gesture.origin) {
          move(
            {
              x: gesture.origin.x + point.x,
              y: gesture.origin.y + point.y,
            },
            sourceId,
          );
        }
      },
      releaseAt: point => {
        const gesture = bridgeGestureRef.current;
        if (!gesture) return;
        gesture.release = point;
        if (gesture.origin) {
          release(
            {
              x: gesture.origin.x + point.x,
              y: gesture.origin.y + point.y,
            },
            sourceId,
          );
        }
      },
      cancel: () => {
        revisionRef.current += 1;
        bridgeGestureRef.current = null;
        dismiss(sourceId);
      },
    }),
    [activateAt, dismiss, move, release, sourceId],
  );
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);
  useEffect(() => {
    revisionRef.current += 1;
    bridgeGestureRef.current = null;
    return () => {
      revisionRef.current += 1;
      bridgeGestureRef.current = null;
      dismiss(sourceId);
    };
  }, [dismiss, sourceId, assist.routeKey]);
  return (
    <Pressable
      ref={viewRef}
      collapsable={false}
      style={style}
      testID={testID}
      accessibilityLabel={
        typeof object.metadata?.content === 'string' && object.metadata.content
          ? object.metadata.content
          : object.title
      }
      accessibilityHint="长按查看内容操作"
      accessibilityActions={[{ name: 'show-menu', label: '内容操作' }]}
      onAccessibilityAction={() => activateAt()}
      delayLongPress={420}
      onPress={onPress}
      onLongPress={event =>
        open({
          object,
          actions,
          sourceId,
          point: {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          },
          hapticOnOpen: true,
        })
      }
      onTouchMove={event => {
        move(
          { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY },
          sourceId,
        );
      }}
      onTouchEnd={event => {
        release(
          { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY },
          sourceId,
        );
      }}
      onTouchCancel={() => {
        revisionRef.current += 1;
        bridgeGestureRef.current = null;
        dismiss(sourceId);
      }}
    >
      {children}
    </Pressable>
  );
});
