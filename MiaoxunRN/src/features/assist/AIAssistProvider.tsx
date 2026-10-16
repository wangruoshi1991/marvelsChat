import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  AppState,
  BackHandler,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useReduceMotion } from '../../shared/useReduceMotion';
import {
  AIAssistAction,
  AIAssistObjectReference,
  AIAssistPoint,
  AIAssistScene,
} from './aiAssistTypes';
import {
  AssistBounds,
  resolveAIAssistLabelFrame,
  resolveAIAssistTargetAtPoint,
  resolveAIAssistTargetLayout,
} from './assistLayout';
import { triggerAIAssistHaptic } from './assistHaptics';

type AssistRequest = {
  object: AIAssistObjectReference;
  actions: AIAssistAction[];
  point?: AIAssistPoint;
  sourceId?: string;
  hapticOnOpen?: boolean;
};
type ActiveRequest = AssistRequest & {
  point: AIAssistPoint;
  origin: AIAssistPoint;
  bounds: AssistBounds;
};
type AssistContext = {
  isActive: boolean;
  activeSourceId?: string;
  open: (request: AssistRequest) => void;
  move: (point: AIAssistPoint, sourceId?: string) => void;
  release: (point: AIAssistPoint, sourceId?: string) => void;
  dismiss: (sourceId?: string) => void;
  askButler: (object: AIAssistObjectReference) => void;
  routeKey: string;
  getGeneration: () => number;
};
const Context = createContext<AssistContext | null>(null);

function ContentActionCircle({
  action,
  selected,
  reveal,
  reduceMotion,
}: {
  action: AIAssistAction;
  selected: boolean;
  reveal: Animated.Value;
  reduceMotion: boolean;
}) {
  const scale = useRef(new Animated.Value(selected ? 1.12 : 1)).current;
  useEffect(() => {
    scale.stopAnimation();
    const target = selected ? 1.12 : 1;
    if (reduceMotion) {
      scale.setValue(target);
      return;
    }
    const animation = Animated.timing(scale, {
      toValue: target,
      duration: 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, scale, selected]);
  const Icon = action.Icon;
  return (
    <Animated.View
      style={[
        localStyles.circle,
        action.available === false && localStyles.unavailable,
        {
          transform: [
            {
              scale: Animated.multiply(
                reveal.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.88, 1],
                }),
                scale,
              ),
            },
          ],
        },
      ]}
    >
      {action.imageSource ? (
        <Image
          resizeMode="contain"
          source={action.imageSource}
          style={localStyles.icon}
        />
      ) : (
        <Icon color="#FFFFFF" size={23} strokeWidth={1.8} />
      )}
    </Animated.View>
  );
}

export function useAIAssist() {
  const value = useContext(Context);
  if (!value) throw new Error('Content actions require AIAssistProvider');
  return value;
}

export function AIAssistProvider({
  children,
  onAskButler,
  routeKey,
  scene,
}: {
  children: React.ReactNode;
  onAskButler: (object: AIAssistObjectReference) => void;
  routeKey: string;
  scene?: AIAssistScene;
}) {
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const hostRef = useRef<View>(null);
  const boundsRef = useRef<AssistBounds>({ width: 0, height: 0 });
  const pendingRef = useRef(0);
  const pendingRequestRef = useRef<{
    revision: number;
    sourceId?: string;
  } | null>(null);
  const pendingMoveRef = useRef<AIAssistPoint | null>(null);
  const pendingReleaseRef = useRef<AIAssistPoint | null>(null);
  const getGeneration = useCallback(() => pendingRef.current, []);
  const requestRef = useRef<ActiveRequest | null>(null);
  const [request, setRequest] = useState<ActiveRequest | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const movedRef = useRef(false);
  const reveal = useRef(new Animated.Value(0)).current;
  // Shared with every other animated surface, so the preference is read once
  // and answered the same way everywhere.
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    reveal.stopAnimation();
    if (!request) {
      reveal.setValue(0);
      return;
    }
    if (reduceMotion) {
      reveal.setValue(1);
      return;
    }
    reveal.setValue(0);
    const animation = Animated.timing(reveal, {
      toValue: 1,
      duration: 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, request, reveal]);

  const dismiss = useCallback((sourceId?: string) => {
    if (
      sourceId &&
      requestRef.current?.sourceId !== sourceId &&
      pendingRequestRef.current?.sourceId !== sourceId
    )
      return;
    pendingRef.current += 1;
    pendingRequestRef.current = null;
    pendingMoveRef.current = null;
    pendingReleaseRef.current = null;
    requestRef.current = null;
    movedRef.current = false;
    selectedRef.current = null;
    setRequest(null);
    setSelected(null);
  }, []);
  useEffect(() => {
    dismiss();
  }, [dismiss, routeKey]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') dismiss();
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!requestRef.current) return false;
      dismiss();
      return true;
    });
    return () => {
      subscription.remove();
      back.remove();
    };
  }, [dismiss]);

  const targetAt = useCallback(
    (current: ActiveRequest, point: AIAssistPoint) => {
      const local = {
        x: point.x - current.origin.x,
        y: point.y - current.origin.y,
      };
      const anchor = {
        x: current.point.x - current.origin.x,
        y: current.point.y - current.origin.y,
      };
      const direction = resolveAIAssistTargetAtPoint(
        local,
        resolveAIAssistTargetLayout(anchor, current.bounds),
      );
      return (
        current.actions.find(action => action.direction === direction) ?? null
      );
    },
    [],
  );
  const move = useCallback(
    (point: AIAssistPoint, sourceId?: string) => {
      const current = requestRef.current;
      if (!current) {
        const pending = pendingRequestRef.current;
        if (pending && (!sourceId || pending.sourceId === sourceId)) {
          pendingMoveRef.current = point;
        }
        return;
      }
      if (sourceId && current.sourceId !== sourceId) return;
      movedRef.current ||=
        Math.hypot(point.x - current.point.x, point.y - current.point.y) > 10;
      const action = targetAt(current, point);
      const direction =
        action?.available === false ? null : action?.direction ?? null;
      if (direction !== selectedRef.current) {
        if (direction) triggerAIAssistHaptic('hover');
        selectedRef.current = direction;
        setSelected(direction);
      }
    },
    [targetAt],
  );
  const select = useCallback(
    (current: ActiveRequest, action: AIAssistAction) => {
      if (requestRef.current !== current || action.available === false) return;
      triggerAIAssistHaptic('confirmation');
      dismiss();
      action.onSelect(current.object);
    },
    [dismiss],
  );
  const release = useCallback(
    (point: AIAssistPoint, sourceId?: string) => {
      const current = requestRef.current;
      if (!current) {
        const pending = pendingRequestRef.current;
        if (pending && (!sourceId || pending.sourceId === sourceId)) {
          pendingReleaseRef.current = point;
        }
        return;
      }
      if (sourceId && current.sourceId !== sourceId) return;
      movedRef.current ||=
        Math.hypot(point.x - current.point.x, point.y - current.point.y) > 10;
      const action = targetAt(current, point);
      if (movedRef.current && action && action.available !== false)
        select(current, action);
      else dismiss();
    },
    [dismiss, select, targetAt],
  );
  const open = useCallback(
    (next: AssistRequest) => {
      if (!next.actions.length) return;
      const revision = ++pendingRef.current;
      requestRef.current = null;
      movedRef.current = false;
      selectedRef.current = null;
      setRequest(null);
      setSelected(null);
      pendingRequestRef.current = { revision, sourceId: next.sourceId };
      pendingMoveRef.current = null;
      pendingReleaseRef.current = null;
      hostRef.current?.measureInWindow((x, y, width, height) => {
        if (revision !== pendingRef.current || width <= 0 || height <= 0)
          return;
        const pending = pendingRequestRef.current;
        if (!pending || pending.revision !== revision) return;
        pendingRequestRef.current = null;
        const deferredMove = pendingMoveRef.current;
        const deferredRelease = pendingReleaseRef.current;
        pendingMoveRef.current = null;
        pendingReleaseRef.current = null;
        const active = {
          ...next,
          object: {
            ...next.object,
            scene: next.object.scene || sceneRef.current,
          },
          point: next.point ?? { x: x + width / 2, y: y + height / 2 },
          origin: { x, y },
          bounds: { width, height },
        };
        movedRef.current = false;
        selectedRef.current = null;
        requestRef.current = active;
        if (next.hapticOnOpen) triggerAIAssistHaptic('activation');
        setSelected(null);
        setRequest(active);
        if (deferredMove) move(deferredMove, next.sourceId);
        if (deferredRelease) release(deferredRelease, next.sourceId);
      });
    },
    [move, release],
  );
  const askButler = useCallback(
    (object: AIAssistObjectReference) => {
      dismiss();
      onAskButler({ ...object, scene: object.scene || sceneRef.current });
    },
    [dismiss, onAskButler],
  );
  const context = useMemo(
    () => ({
      isActive: Boolean(request),
      activeSourceId: request?.sourceId,
      open,
      move,
      release,
      dismiss,
      askButler,
      routeKey,
      getGeneration,
    }),
    [request, open, move, release, dismiss, askButler, routeKey, getGeneration],
  );
  const layout = request
    ? resolveAIAssistTargetLayout(
        {
          x: request.point.x - request.origin.x,
          y: request.point.y - request.origin.y,
        },
        request.bounds,
      )
    : null;

  return (
    <Context.Provider value={context}>
      <View
        ref={hostRef}
        collapsable={false}
        style={localStyles.host}
        onLayout={event => {
          const { width, height } = event.nativeEvent.layout;
          if (
            boundsRef.current.width !== width ||
            boundsRef.current.height !== height
          )
            dismiss();
          boundsRef.current = { width, height };
        }}
      >
        <View
          style={localStyles.host}
          accessibilityElementsHidden={Boolean(request)}
          importantForAccessibility={request ? 'no-hide-descendants' : 'auto'}
        >
          {children}
        </View>
        {request && layout ? (
          <Animated.View
            style={[localStyles.overlay, { opacity: reveal }]}
            accessibilityViewIsModal
            testID="content-actions-overlay"
          >
            <Pressable
              accessibilityLabel="关闭内容操作"
              accessibilityRole="button"
              style={localStyles.backdrop}
              onPress={() => dismiss()}
            />
            <View
              pointerEvents="none"
              testID="content-action-touch-point"
              style={[
                localStyles.center,
                {
                  left: layout.center.x - 34,
                  top: layout.center.y - 34,
                },
              ]}
            />
            {request.actions.map(action => {
              const frame = layout[action.direction];
              const labelFrame = resolveAIAssistLabelFrame(
                frame,
                action.label,
                request.bounds,
              );
              return (
                <React.Fragment key={action.direction}>
                  <Pressable
                    accessibilityLabel={action.label}
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: action.available === false,
                      selected: selected === action.direction,
                    }}
                    disabled={action.available === false}
                    testID={`content-action-${action.direction}`}
                    onPress={() => select(request, action)}
                    hitSlop={6}
                    style={[
                      localStyles.action,
                      {
                        left: frame.x,
                        top: frame.y,
                        width: frame.width,
                        height: frame.height,
                      },
                    ]}
                  >
                    <ContentActionCircle
                      action={action}
                      selected={selected === action.direction}
                      reveal={reveal}
                      reduceMotion={reduceMotion}
                    />
                  </Pressable>
                  <View
                    pointerEvents="none"
                    testID={`content-action-label-${action.direction}`}
                    style={[
                      localStyles.labelFrame,
                      {
                        left: labelFrame.x,
                        top: labelFrame.y,
                        width: labelFrame.width,
                        height: labelFrame.height,
                      },
                      frame.labelPlacement === 'above'
                        ? localStyles.labelAbove
                        : localStyles.labelBelow,
                    ]}
                  >
                    <Text style={localStyles.label} numberOfLines={2}>
                      {action.label}
                    </Text>
                  </View>
                </React.Fragment>
              );
            })}
          </Animated.View>
        ) : null}
      </View>
    </Context.Provider>
  );
}

const localStyles = StyleSheet.create({
  host: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 1000, elevation: 30 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.58)' },
  center: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  action: { position: 'absolute' },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  unavailable: { opacity: 0.45 },
  icon: { width: 26, height: 26 },
  labelFrame: { position: 'absolute' },
  labelAbove: { justifyContent: 'flex-end' },
  labelBelow: { justifyContent: 'flex-start' },
  label: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
});
