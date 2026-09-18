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
  AppState,
  BackHandler,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AIAssistAction,
  AIAssistObjectReference,
  AIAssistPoint,
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

export function useAIAssist() {
  const value = useContext(Context);
  if (!value) throw new Error('Content actions require AIAssistProvider');
  return value;
}

export function AIAssistProvider({
  children,
  onAskButler,
  routeKey,
}: {
  children: React.ReactNode;
  onAskButler: (object: AIAssistObjectReference) => void;
  routeKey: string;
}) {
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
      if (movedRef.current) {
        if (action?.available === false) return;
        if (action) select(current, action);
        else dismiss();
      }
      // A stationary release keeps the menu open for a separate tap.
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
      onAskButler(object);
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
          <View
            style={localStyles.overlay}
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
              const Icon = action.Icon;
              return (
                <React.Fragment key={action.direction}>
                  <Pressable
                    accessibilityLabel={action.label}
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: action.available === false,
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
                      selected === action.direction && localStyles.selected,
                    ]}
                  >
                    <View
                      style={[
                        localStyles.circle,
                        action.available === false && localStyles.unavailable,
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
                    </View>
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
          </View>
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
  selected: { transform: [{ scale: 1.12 }] },
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
