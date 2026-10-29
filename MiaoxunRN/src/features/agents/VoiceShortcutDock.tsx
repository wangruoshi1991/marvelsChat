import React, { useEffect, useId, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  Linking,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Mic, X } from 'lucide-react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { Palette } from '../../shared/theme';
import { appErrorText, textFor } from '../../shared/i18n';
import { Language } from '../session/sessionTypes';
import {
  SpeechRecognitionSession,
  SpeechPermissionPreparation,
  prepareSpeechRecognition,
  startSpeechRecognition,
} from '../../services/speechToText';
import { workspacePalette } from '../../shared/workspacePalette';
import { isV6Palette } from '../../shared/v6Palette';
import { isXunPalette } from '../../shared/xunPalette';
import {
  easeOutCss,
  entranceCurve,
  radialCurve,
  useReduceMotion,
} from '../../shared/useReduceMotion';
import { triggerAIAssistHaptic } from '../assist/assistHaptics';

type Action = 'keyboard' | 'butler' | 'feed';
type Phase =
  | 'idle'
  | 'authorizing'
  | 'permissionReady'
  | 'preparing'
  | 'listening'
  | 'finishing'
  | 'ready'
  | 'error';
type Tone = 'miao' | 'xun';
const miaoTriggerSize = 55;
// Both tabs use the same three-way long-press gesture and option centers.
//
// V15 places the radial options about 80pt from the trigger center. Miao's
// option circles are 54pt wide (its native trigger remains 52pt); Xun uses a
// 54pt trigger and the more compact 49pt circles shown in its shell. The previous 56pt
// spacing left only a 2pt visual gap, which made the menu look
// cramped and made a small finger movement look like an option selection.
const shortcutOptions: { action: Action; x: number; y: number }[] = [
  { action: 'keyboard', x: 0, y: -80 },
  { action: 'butler', x: -80, y: 0 },
  { action: 'feed', x: 0, y: 80 },
];

function AssistantMark({ color }: { color: string }) {
  return (
    <Svg height={30} viewBox="0 0 24 24" width={30}>
      <Path
        d="M8 3h13l-4 17H3L6 6a4 4 0 0 1 2-3Z"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
      />
      <Path
        d="m13 6-2 7m-1 3h.1"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
      />
    </Svg>
  );
}

/** The prototype uses one outlined glyph per shortcut, with the label below it. */
function ShortcutIcon({
  action,
  tone,
  color,
}: {
  action: Action;
  tone: Tone;
  color: string;
}) {
  if (tone === 'xun') {
    const common = {
      fill: 'none' as const,
      stroke: color,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
      strokeWidth: 1.9,
    };
    if (action === 'keyboard') {
      return (
        <Svg height={20} viewBox="0 0 24 24" width={20}>
          <Rect {...common} height={13} rx={3} width={6} x={9} y={2} />
          <Path {...common} d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
        </Svg>
      );
    }
    if (action === 'butler') {
      return (
        <Svg height={20} viewBox="0 0 24 24" width={20}>
          <Path
            {...common}
            d="M20 11a8 8 0 0 1-8 8H5l-3 2v-9a9 9 0 0 1 18-1Z"
          />
          <Path {...common} d="M8 10v3m5-3v3" />
        </Svg>
      );
    }
    return (
      <Svg height={20} viewBox="0 0 24 24" width={20}>
        <Rect {...common} height={18} rx={2} width={14} x={3} y={2} />
        <Path {...common} d="M6 6h8M6 10h5m3 6 2 2 5-6" />
      </Svg>
    );
  }
  const common = {
    fill: 'none' as const,
    stroke: color,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
  };
  if (action === 'keyboard') {
    return (
      <Svg height={22} viewBox="0 0 24 24" width={22}>
        <Rect {...common} height={14} rx={1} width={20} x={2} y={5} />
        <Path
          {...common}
          d="M5 8h1m3 0h1m3 0h1m3 0h1M5 11h1m3 0h1m3 0h1m3 0h1M6 15h12"
        />
      </Svg>
    );
  }
  if (action === 'butler') {
    return (
      <Svg height={22} viewBox="0 0 24 24" width={22}>
        <Path {...common} d="m7 3-4 17h13l5-17ZM12 6l-2 7m-1 3h.1" />
      </Svg>
    );
  }
  return (
    <Svg height={22} viewBox="0 0 24 24" width={22}>
      <Path {...common} d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <Circle {...common} cx={12} cy={12} r={3} />
    </Svg>
  );
}

export function voiceShortcutActionAt(
  dx: number,
  dy: number,
  hitRadius = 27,
): Action | null {
  return (
    shortcutOptions.find(
      option => Math.hypot(dx - option.x, dy - option.y) <= hitRadius,
    )?.action ?? null
  );
}
type Props = {
  palette: Palette;
  language: Language;
  bottomOffset?: number;
  active?: boolean;
  tone?: Tone;
  onCompose: (draft?: string) => void;
  onOpenButler: (draft?: string) => void;
  onToggleFeed: () => void;
  onExpandedChange: (expanded: boolean) => void;
};

/** The held gesture owns the shortcut menu; selecting Voice owns recognition. */
export function VoiceShortcutDock({
  palette,
  language,
  bottomOffset = 88,
  active = true,
  tone = 'miao',
  ...callbacks
}: Props) {
  const colors = workspacePalette(palette);
  const statusColors =
    isV6Palette(palette) || isXunPalette(palette)
      ? {
          surface: '#FFFFFF',
          border: '#FFFFFF',
          text: '#10121E',
          secondaryText: '#777777',
        }
      : colors;
  const options = shortcutOptions;
  const triggerSize = tone === 'xun' ? 54 : miaoTriggerSize;
  const toneRef = useRef(tone);
  toneRef.current = tone;
  const triggerSizeRef = useRef(triggerSize);
  triggerSizeRef.current = triggerSize;
  const optionSize = tone === 'xun' ? 49 : 54;
  const optionRadius = optionSize / 2;
  const optionRadiusRef = useRef(optionRadius);
  optionRadiusRef.current = optionRadius;
  // Opacity and position ease on different curves in the prototype, and the
  // third option alone lags .035s, so each option owns its own pair of values.
  const optionFade = useRef(
    shortcutOptions.map(() => new Animated.Value(0)),
  ).current;
  const optionSlide = useRef(
    shortcutOptions.map(() => new Animated.Value(0)),
  ).current;
  // Prototype `.voice-input-panel` enters from `translateY(-12px) scale(.98)`
  // over `opacity .22s ease` + `transform .28s cubic-bezier(.2,.8,.2,1)`.
  const statusFade = useRef(new Animated.Value(0)).current;
  const statusSlide = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const reduceMotion = useReduceMotion();
  // The collapsed trigger uses the prototype's light gradient; the active
  // state switches to its cyan surface and halo.
  const triggerGradient = expanded
    ? ['#00C7CB', '#00C7CB']
    : tone === 'xun'
    ? ['#FBFCFE', '#EDF0F6']
    : ['#F7F9FF', '#E1E7F1'];
  const triggerGradientId = `voiceTrigger-${useId().replace(/:/g, '')}`;
  const optionGradientId = `voiceOption-${useId().replace(/:/g, '')}`;
  const [phase, setPhase] = useState<Phase>('idle');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [permissionAction, setPermissionAction] = useState<
    'prepare' | 'settings' | null
  >(null);
  const [selected, setSelected] = useState<Action | null>(null);
  const statusShown =
    (expanded && phase !== 'idle') ||
    [
      'error',
      'authorizing',
      'permissionReady',
      'preparing',
      'listening',
      'finishing',
      'ready',
    ].includes(phase);
  useEffect(() => {
    statusFade.stopAnimation();
    statusSlide.stopAnimation();
    if (!statusShown) {
      statusFade.setValue(0);
      statusSlide.setValue(0);
      return;
    }
    if (reduceMotion) {
      statusFade.setValue(1);
      statusSlide.setValue(1);
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(statusFade, {
        toValue: 1,
        duration: 220,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      }),
      Animated.timing(statusSlide, {
        toValue: 1,
        duration: 280,
        easing: Easing.bezier(...entranceCurve),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [statusShown, statusFade, statusSlide, reduceMotion]);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const expandedRef = useRef(false);
  const phaseRef = useRef<Phase>('idle');
  const draftRef = useRef('');
  const selectedRef = useRef<Action | null>(null);
  const session = useRef<SpeechRecognitionSession | null>(null);
  const permissionSession = useRef<SpeechPermissionPreparation | null>(null);
  const gestureCancelled = useRef(false);
  const generation = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const moved = useRef(false);
  const touchOffset = useRef({ x: 0, y: 0 });
  const lastPoint = useRef({ x: 0, y: 0 });
  const pendingAction = useRef<Action | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const pulseLate = useRef(new Animated.Value(0)).current;
  const changePhase = (value: Phase) => {
    phaseRef.current = value;
    setPhase(value);
  };
  const changeExpanded = (value: boolean) => {
    if (value) setMenuVisible(true);
    if (expandedRef.current === value) return;
    expandedRef.current = value;
    setExpanded(value);
    callbacksRef.current.onExpandedChange(value);
  };
  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  const close = (immediate = false) => {
    clearHold();
    gestureCancelled.current = true;
    generation.current += 1;
    session.current?.cancel();
    permissionSession.current?.cancel();
    permissionSession.current = null;
    session.current = null;
    pendingAction.current = null;
    held.current = false;
    selectedRef.current = null;
    draftRef.current = '';
    setSelected(null);
    setDraft('');
    setError('');
    setPermissionAction(null);
    changePhase('idle');
    changeExpanded(false);
    if (immediate) {
      // A route transition removes the dock from interaction immediately.
      // Do not leave the exit animation's disabled option labels mounted for
      // the next route to reveal when the dock is retained and shown again.
      optionFade.forEach(value => value.setValue(0));
      optionSlide.forEach(value => value.setValue(0));
      setMenuVisible(false);
    }
  };
  const deliver = (action: Action, text = '') => {
    close();
    if (action === 'feed') callbacksRef.current.onToggleFeed();
    else if (action === 'keyboard')
      callbacksRef.current.onCompose(text || undefined);
    else callbacksRef.current.onOpenButler(text || undefined);
  };
  const perform = (action: Action) => {
    if (pendingAction.current || phaseRef.current === 'authorizing') return;
    triggerAIAssistHaptic('confirmation');
    // On the Xun page the top shortcut is the V15 “Voice / 直接说” entry.
    // Selecting it starts recognition after the radial menu has closed;
    // opening the menu itself must remain a visual-only action.
    if (tone === 'xun' && action === 'keyboard') {
      changeExpanded(false);
      start({ openMenu: false, holdGesture: false });
      return;
    }
    if (action === 'feed') return deliver(action);
    if (!session.current || phaseRef.current === 'preparing')
      return deliver(action, draftRef.current);
    pendingAction.current = action;
    changeExpanded(false);
    changePhase('finishing');
    session.current.finish();
  };
  const start = (
    startOptions: { openMenu?: boolean; holdGesture?: boolean } = {},
  ) => {
    if (!active || session.current || permissionSession.current) return;
    const openMenu = startOptions.openMenu ?? tone === 'miao';
    const holdGesture = startOptions.holdGesture ?? openMenu;
    // Accessibility long-press actions do not always have a preceding
    // PanResponder grant, so clear the cancellation latch explicitly.
    gestureCancelled.current = false;
    held.current = holdGesture;
    pendingAction.current = null;
    draftRef.current = '';
    setDraft('');
    setError('');
    setPermissionAction(null);
    if (openMenu) changeExpanded(true);
    triggerAIAssistHaptic('activation');
    changePhase('preparing');
    const currentGeneration = ++generation.current;
    let settled = false;
    const failed = (cause: unknown) => {
      if (generation.current !== currentGeneration || settled) return;
      settled = true;
      session.current = null;
      pendingAction.current = null;
      draftRef.current = '';
      setDraft('');
      changePhase('error');
      const code = (cause as { code?: string })?.code;
      setPermissionAction(
        code === 'speech_permission_required'
          ? 'prepare'
          : code === 'speech_denied'
          ? 'settings'
          : null,
      );
      setError(
        appErrorText(
          language,
          cause,
          '语音识别失败，请重试或使用键盘',
          'Speech recognition failed. Retry or use the keyboard.',
        ),
      );
    };
    try {
      const nextSession = startSpeechRecognition(language, update => {
        if (generation.current !== currentGeneration || settled) return;
        draftRef.current = update.text;
        setDraft(update.text);
        if (phaseRef.current !== 'finishing') changePhase(update.state);
      });
      session.current = nextSession;
      nextSession.result.then(text => {
        if (generation.current !== currentGeneration || settled) return;
        settled = true;
        session.current = null;
        draftRef.current = text;
        setDraft(text);
        const action = pendingAction.current;
        if (action && !(tone === 'xun' && action === 'keyboard'))
          deliver(action, text);
        else changePhase('ready');
      }, failed);
    } catch (cause) {
      failed(cause);
    }
  };
  const openShortcuts = () => {
    if (!active || session.current || permissionSession.current) return;
    gestureCancelled.current = false;
    held.current = true;
    pendingAction.current = null;
    selectedRef.current = null;
    setSelected(null);
    draftRef.current = '';
    setDraft('');
    setError('');
    setPermissionAction(null);
    changePhase('idle');
    triggerAIAssistHaptic('activation');
    changeExpanded(true);
  };
  const authorize = () => {
    if (permissionSession.current) return;
    clearHold();
    held.current = false;
    gestureCancelled.current = true;
    setPermissionAction(null);
    setError('');
    changePhase('authorizing');
    const currentGeneration = ++generation.current;
    const fail = (cause: unknown) => {
      if (generation.current !== currentGeneration) return;
      permissionSession.current = null;
      changePhase('error');
      setPermissionAction(
        (cause as { code?: string })?.code === 'speech_denied'
          ? 'settings'
          : 'prepare',
      );
      setError(
        appErrorText(
          language,
          cause,
          '语音授权未完成，请重试',
          'Voice permission was not completed. Try again.',
        ),
      );
    };
    try {
      const preparation = prepareSpeechRecognition();
      permissionSession.current = preparation;
      preparation.result.then(() => {
        if (generation.current !== currentGeneration) return;
        permissionSession.current = null;
        // Only a new intentional hold can open the microphone after system prompts.
        changePhase('permissionReady');
      }, fail);
    } catch (cause) {
      fail(cause);
    }
  };
  const actionsRef = useRef({
    start,
    close,
    perform,
    changeExpanded,
    openShortcuts,
  });
  actionsRef.current = { start, close, perform, changeExpanded, openShortcuts };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: event => {
        gestureCancelled.current = false;
        if (
          phaseRef.current === 'finishing' ||
          phaseRef.current === 'authorizing'
        ) {
          gestureCancelled.current = true;
          return;
        }
        moved.current = false;
        held.current = false;
        touchOffset.current = {
          x:
            (event?.nativeEvent.locationX ?? triggerSizeRef.current / 2) -
            triggerSizeRef.current / 2,
          y:
            (event?.nativeEvent.locationY ?? triggerSizeRef.current / 2) -
            triggerSizeRef.current / 2,
        };
        lastPoint.current = touchOffset.current;
        selectedRef.current = null;
        setSelected(null);
        clearHold();
        holdTimer.current = setTimeout(() => {
          // V15 state 3 opens the Xun radial menu first. Its Voice card is
          // state 8 and appears only after the Voice option is selected.
          if (toneRef.current === 'xun') actionsRef.current.openShortcuts();
          else actionsRef.current.start();
        }, 480);
      },
      onPanResponderMove: (_, gesture) => {
        if (gestureCancelled.current) return;
        lastPoint.current = {
          x: touchOffset.current.x + gesture.dx,
          y: touchOffset.current.y + gesture.dy,
        };
        if (!held.current) {
          if (Math.hypot(gesture.dx, gesture.dy) > 14) {
            moved.current = true;
            clearHold();
          }
          return;
        }
        const action = voiceShortcutActionAt(
          lastPoint.current.x,
          lastPoint.current.y,
          optionRadiusRef.current,
        );
        if (action && action !== selectedRef.current)
          triggerAIAssistHaptic('hover');
        selectedRef.current = action;
        setSelected(action);
      },
      onPanResponderRelease: (_, gesture) => {
        clearHold();
        if (gestureCancelled.current) return;
        gestureCancelled.current = true;
        if (held.current) {
          held.current = false;
          const point =
            Number.isFinite(gesture?.dx) && Number.isFinite(gesture?.dy)
              ? {
                  x: touchOffset.current.x + gesture.dx,
                  y: touchOffset.current.y + gesture.dy,
                }
              : lastPoint.current;
          const action = voiceShortcutActionAt(
            point.x,
            point.y,
            optionRadiusRef.current,
          );
          actionsRef.current.changeExpanded(false);
          if (action) actionsRef.current.perform(action);
          else if (phaseRef.current !== 'error') actionsRef.current.close();
        } else if (!moved.current && expandedRef.current) {
          // A tap can dismiss an already-open menu, but it can never open one.
          // Opening remains an intentional long press, matching the V15 FAB.
          actionsRef.current.close();
        }
      },
      onPanResponderTerminate: () => actionsRef.current.close(),
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;
  useEffect(() => {
    if (!menuVisible) return;
    optionFade.forEach(value => value.stopAnimation());
    optionSlide.forEach(value => value.stopAnimation());
    if (reduceMotion) {
      optionFade.forEach(value => value.setValue(expanded ? 1 : 0));
      optionSlide.forEach(value => value.setValue(expanded ? 1 : 0));
      if (!expanded) setMenuVisible(false);
      return;
    }
    // Prototype `.radial-option` is `opacity .18s ease` + `transform .38s
    // cubic-bezier(.18,.88,.28,1.18)`, and collapse starts from `scale(.42)`.
    // Only the third option declares `transition-delay: .035s`; the `.07s` rule
    // targets `:nth-of-type(4)`, which is the trigger, so it matches nothing.
    const target = expanded ? 1 : 0;
    const fade = (value: Animated.Value, delay: number) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, {
          toValue: target,
          duration: 180,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: true,
        }),
      ]);
    const slide = (value: Animated.Value, delay: number) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, {
          toValue: target,
          duration: 380,
          easing: Easing.bezier(...radialCurve),
          useNativeDriver: true,
        }),
      ]);
    const animation = Animated.parallel(
      options.flatMap((_option, index) => {
        const delay = index === 2 ? 35 : 0;
        return [
          fade(optionFade[index], delay),
          slide(optionSlide[index], delay),
        ];
      }),
    );
    animation.start(({ finished }) => {
      if (finished && !expandedRef.current) setMenuVisible(false);
    });
    return () => animation.stop();
  }, [expanded, menuVisible, options, optionFade, optionSlide, reduceMotion]);
  useEffect(() => {
    if (!active) actionsRef.current.close(true);
  }, [active]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'inactive' && phaseRef.current === 'authorizing') {
        // System permission UI may interrupt touch, but preparation cannot record audio.
        clearHold();
        held.current = false;
        gestureCancelled.current = true;
        return;
      }
      if (state !== 'active') actionsRef.current.close(true);
    });
    return () => {
      subscription.remove();
      clearHold();
      generation.current += 1;
      session.current?.cancel();
      permissionSession.current?.cancel();
      callbacksRef.current.onExpandedChange(false);
    };
  }, []);
  useEffect(() => {
    // The Xun prototype keeps the trigger quiet once the Voice card opens.
    // The pulse belongs to Miao's held-to-speak state only; leaving it on Xun
    // creates a second halo behind the confirmation card after the menu closes.
    if (phase !== 'listening' || reduceMotion || tone !== 'miao') {
      pulse.setValue(0);
      pulseLate.setValue(0);
      return;
    }
    // Prototype draws two rings on the same `voice-pulse 1.45s ease-out infinite`
    // (`::before` and `::after`), and only the `::after` carries
    // `animation-delay: .55s`. A CSS delay applies to the first iteration only,
    // so the second ring is a delay followed by its own loop.
    const ring = (value: Animated.Value) =>
      Animated.loop(
        Animated.timing(value, {
          toValue: 1,
          duration: 1450,
          easing: Easing.bezier(...easeOutCss),
          useNativeDriver: true,
        }),
      );
    const first = ring(pulse);
    const second = Animated.sequence([Animated.delay(550), ring(pulseLate)]);
    first.start();
    second.start();
    return () => {
      first.stop();
      second.stop();
    };
  }, [phase, pulse, pulseLate, reduceMotion, tone]);
  if (!active) return null;
  // Prototype `#miaoVoiceCluster` reads 键盘 / 妙管家 / 瀑布, while
  // `x3AiMenu()` reads 语音 / 未读 / 规划 — the same three
  // directions carry different meanings on each tab.
  const optionText = (action: Action) => {
    if (tone === 'xun') {
      return textFor(
        language,
        action === 'keyboard' ? '语音' : action === 'butler' ? '未读' : '规划',
        action === 'keyboard'
          ? 'Voice'
          : action === 'butler'
          ? 'Unread'
          : 'Plan',
      );
    }
    return textFor(
      language,
      action === 'keyboard' ? '键盘' : action === 'butler' ? '妙管家' : '瀑布',
      action === 'keyboard' ? 'Type' : action === 'butler' ? 'Butler' : 'Feed',
    );
  };
  const optionAccessibilityLabel = (action: Action) => {
    if (tone === 'xun') {
      return textFor(
        language,
        action === 'keyboard'
          ? '直接说'
          : action === 'butler'
          ? '总结未读'
          : '替我规划',
        action === 'keyboard'
          ? 'Speak'
          : action === 'butler'
          ? 'Summarize unread'
          : 'Plan for me',
      );
    }
    return textFor(
      language,
      action === 'keyboard'
        ? '切换到键盘'
        : action === 'butler'
        ? '打开妙管家'
        : '切换到瀑布',
      action === 'keyboard'
        ? 'Switch to keyboard'
        : action === 'butler'
        ? 'Open Miao butler'
        : 'Switch task feed layout',
    );
  };
  const status =
    error ||
    draft ||
    textFor(
      language,
      phase === 'authorizing'
        ? '请完成系统语音授权…'
        : phase === 'permissionReady'
        ? '权限已开启，请重新长按说话'
        : phase === 'preparing'
        ? '正在准备麦克风…'
        : phase === 'finishing'
        ? '正在完成识别…'
        : '正在听…',
      phase === 'authorizing'
        ? 'Complete system voice permissions…'
        : phase === 'permissionReady'
        ? 'Permissions ready. Hold again to speak.'
        : phase === 'preparing'
        ? 'Preparing microphone…'
        : phase === 'finishing'
        ? 'Finishing transcription…'
        : 'Listening…',
    );
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {expanded && tone === 'xun' ? (
        <Pressable
          testID="voice-menu-backdrop"
          accessibilityLabel={textFor(
            language,
            '关闭语音菜单',
            'Close voice menu',
          )}
          accessibilityRole="button"
          style={[
            StyleSheet.absoluteFill,
            tone === 'xun' ? s.xunMenuBackdrop : s.miaoMenuBackdrop,
          ]}
          onPress={() => close()}
        />
      ) : null}
      {tone === 'xun' && statusShown ? (
        <Pressable
          testID="xun-status-backdrop"
          accessibilityRole="button"
          accessibilityLabel={textFor(
            language,
            '关闭语音识别卡',
            'Close voice recognition card',
          )}
          onPress={() => close()}
          style={[StyleSheet.absoluteFill, s.xunStatusBackdrop]}
        />
      ) : null}
      {statusShown ? (
        <Animated.View
          accessibilityLiveRegion="polite"
          style={[
            s.status,
            tone === 'xun' && s.xunStatus,
            {
              backgroundColor: statusColors.surface,
              borderColor: statusColors.border,
            },
            {
              opacity: statusFade,
              transform: [
                {
                  translateY: statusSlide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-12, 0],
                  }),
                },
                {
                  scale: statusSlide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.98, 1],
                  }),
                },
              ],
            },
          ]}
        >
          {tone === 'xun' ? (
            <>
              <View style={s.xunStatusHeading}>
                <View style={s.xunStatusIcon}>
                  <Mic size={23} color="#171722" />
                </View>
                <View style={s.xunStatusHeadingCopy}>
                  <Text style={s.xunStatusTitle}>
                    {textFor(language, '语音', 'Voice')}
                  </Text>
                  <Text style={s.xunStatusSubtitle}>
                    {textFor(
                      language,
                      phase === 'ready'
                        ? '意图已识别，等待确认中…'
                        : '正在识别你的意图…',
                      phase === 'ready'
                        ? 'Intent recognized. Waiting for confirmation…'
                        : 'Recognizing your intent…',
                    )}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={textFor(
                    language,
                    '关闭语音',
                    'Close voice input',
                  )}
                  onPress={() => close()}
                  style={s.xunStatusClose}
                >
                  <X size={16} color="#171722" />
                </Pressable>
              </View>
              <View style={s.xunStatusContent}>
                <TextInput
                  accessibilityLabel={textFor(
                    language,
                    '语音识别内容',
                    'Voice transcription',
                  )}
                  editable={phase === 'ready'}
                  multiline
                  numberOfLines={3}
                  onChangeText={value => {
                    draftRef.current = value;
                    setDraft(value);
                  }}
                  placeholder={textFor(language, '正在听…', 'Listening…')}
                  placeholderTextColor="#777777"
                  style={s.xunTranscript}
                  value={draft}
                />
                <Text style={s.xunStatusNote}>
                  {textFor(
                    language,
                    'AI会识别对象、内容和发送范围，执行前由你确认',
                    'AI identifies the target, content, and audience. You confirm before execution.',
                  )}
                </Text>
                {permissionAction ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={textFor(
                      language,
                      permissionAction === 'prepare'
                        ? '开启语音权限'
                        : '打开系统设置',
                      permissionAction === 'prepare'
                        ? 'Enable voice permissions'
                        : 'Open system settings',
                    )}
                    onPress={() => {
                      if (permissionAction === 'prepare') authorize();
                      else
                        Linking.openSettings().catch(cause =>
                          setError(
                            appErrorText(
                              language,
                              cause,
                              '无法打开系统设置',
                              'Unable to open system settings',
                            ),
                          ),
                        );
                    }}
                    style={s.xunPermissionAction}
                  >
                    <Text style={s.xunPermissionLabel}>
                      {textFor(
                        language,
                        permissionAction === 'prepare'
                          ? '开启语音权限'
                          : '打开系统设置',
                        permissionAction === 'prepare'
                          ? 'Enable voice permissions'
                          : 'Open system settings',
                      )}
                    </Text>
                  </Pressable>
                ) : null}
                <View style={s.xunStatusAction}>
                  <Text style={s.xunStatusActionTitle}>
                    {textFor(
                      language,
                      phase === 'ready' ? '等待确认' : '等待语音',
                      phase === 'ready'
                        ? 'Awaiting confirmation'
                        : 'Waiting for voice',
                    )}
                  </Text>
                  <Text
                    accessibilityRole={error ? 'alert' : undefined}
                    style={s.xunStatusActionText}
                  >
                    {error ||
                      textFor(
                        language,
                        phase === 'ready'
                          ? '识别完成后，这里会显示 AI 准备执行的动作。'
                          : '识别完成后，这里会显示 AI 准备执行的动作。',
                        'The action prepared by AI will appear here after recognition.',
                      )}
                  </Text>
                </View>
                <View style={s.xunStatusButtons}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={textFor(
                      language,
                      '重新说',
                      'Speak again',
                    )}
                    onPress={() => start()}
                    style={s.xunSecondaryButton}
                  >
                    <Text style={s.xunSecondaryButtonLabel}>
                      {textFor(language, '重新说', 'Speak again')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={textFor(
                      language,
                      '确认执行',
                      'Confirm execution',
                    )}
                    disabled={phase !== 'ready'}
                    onPress={() => {
                      close();
                      callbacksRef.current.onCompose(draft || undefined);
                    }}
                    style={[
                      s.xunPrimaryButton,
                      phase !== 'ready' && s.xunPrimaryButtonDisabled,
                    ]}
                  >
                    <Text style={s.xunPrimaryButtonLabel}>
                      {textFor(language, '确认执行', 'Confirm')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={s.statusIcon}>
                <Mic size={25} color="#FFFFFF" />
              </View>
              <View style={s.statusCopy}>
                <View style={s.miaoStatusTop}>
                  <Text
                    style={[s.caption, { color: statusColors.secondaryText }]}
                  >
                    {textFor(language, '语音输入', 'Voice input')}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={textFor(
                      language,
                      '取消语音输入',
                      'Cancel voice input',
                    )}
                    onPress={() => close()}
                  >
                    <Text
                      style={[
                        s.miaoCancel,
                        { color: statusColors.secondaryText },
                      ]}
                    >
                      {textFor(language, '松开取消', 'Release to cancel')}
                    </Text>
                  </Pressable>
                </View>
                <Text
                  accessibilityRole={error ? 'alert' : undefined}
                  numberOfLines={3}
                  style={[
                    s.statusText,
                    { color: error ? palette.rose : statusColors.text },
                  ]}
                >
                  {status}
                </Text>
                {tone !== 'miao' &&
                !error &&
                phase !== 'authorizing' &&
                phase !== 'permissionReady' ? (
                  <Text
                    style={[s.caption, { color: statusColors.secondaryText }]}
                  >
                    {textFor(
                      language,
                      phase === 'finishing'
                        ? '识别完成后带入草稿，确认后再发送'
                        : selected
                        ? `松开打开${optionText(selected)}`
                        : '松开取消 · 滑向入口后松开',
                      phase === 'finishing'
                        ? 'Transcription will open as a draft for review.'
                        : selected
                        ? `Release to open ${optionText(selected)}`
                        : 'Release to cancel · Slide to an option',
                    )}
                  </Text>
                ) : null}
                {permissionAction ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={textFor(
                      language,
                      permissionAction === 'prepare'
                        ? '开启语音权限'
                        : '打开系统设置',
                      permissionAction === 'prepare'
                        ? 'Enable voice permissions'
                        : 'Open system settings',
                    )}
                    onPress={() => {
                      if (permissionAction === 'prepare') authorize();
                      else
                        Linking.openSettings().catch(cause =>
                          setError(
                            appErrorText(
                              language,
                              cause,
                              '无法打开系统设置',
                              'Unable to open system settings',
                            ),
                          ),
                        );
                    }}
                    style={s.permissionAction}
                  >
                    <Text
                      style={[s.permissionLabel, { color: statusColors.text }]}
                    >
                      {textFor(
                        language,
                        permissionAction === 'prepare'
                          ? '开启语音权限'
                          : '打开系统设置',
                        permissionAction === 'prepare'
                          ? 'Enable voice permissions'
                          : 'Open system settings',
                      )}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {tone !== 'miao' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={textFor(
                    language,
                    '取消语音输入',
                    'Cancel voice input',
                  )}
                  onPress={() => close()}
                  style={s.close}
                >
                  <X size={18} color={statusColors.secondaryText} />
                </Pressable>
              ) : null}
            </>
          )}
        </Animated.View>
      ) : null}
      <View pointerEvents="box-none" style={s.cluster}>
        {menuVisible
          ? options.map((option, index) => (
              <Animated.View
                key={option.action}
                pointerEvents={expanded ? 'auto' : 'none'}
                accessibilityElementsHidden={!expanded}
                importantForAccessibility={
                  expanded ? 'auto' : 'no-hide-descendants'
                }
                style={[
                  s.optionPosition,
                  tone === 'xun' && s.optionPositionXun,
                  {
                    bottom: bottomOffset + (triggerSize - optionSize) / 2,
                    opacity: optionFade[index],
                    transform: [
                      {
                        translateX: Animated.multiply(
                          optionSlide[index],
                          option.x,
                        ),
                      },
                      {
                        translateY: Animated.multiply(
                          optionSlide[index],
                          option.y,
                        ),
                      },
                      {
                        scale: optionSlide[index].interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.42, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Pressable
                  key={option.action}
                  accessibilityRole="button"
                  accessibilityLabel={optionAccessibilityLabel(option.action)}
                  accessibilityState={{
                    selected: selected === option.action,
                    disabled: !expanded,
                  }}
                  disabled={!expanded}
                  onPress={expanded ? () => perform(option.action) : undefined}
                  style={[
                    s.option,
                    tone === 'xun' && s.optionXun,
                    tone !== 'xun' && selected === option.action
                      ? s.optionSelected
                      : s.optionDefault,
                  ]}
                >
                  <Svg
                    height="100%"
                    pointerEvents="none"
                    style={StyleSheet.absoluteFill}
                    width="100%"
                  >
                    <Defs>
                      <LinearGradient
                        id={`${optionGradientId}-${option.action}`}
                        x1="0"
                        x2="1"
                        y1="0"
                        y2="1"
                      >
                        <Stop
                          offset="0"
                          stopColor={tone === 'xun' ? '#FBFCFF' : '#F6F8FF'}
                        />
                        <Stop
                          offset="1"
                          stopColor={tone === 'xun' ? '#E3E8F2' : '#E1E7F1'}
                        />
                      </LinearGradient>
                    </Defs>
                    <Rect
                      fill={`url(#${optionGradientId}-${option.action})`}
                      height="100%"
                      rx={optionRadius}
                      width="100%"
                    />
                  </Svg>
                  <ShortcutIcon
                    action={option.action}
                    tone={tone}
                    color={tone === 'xun' ? '#171722' : '#060B10'}
                  />
                  <Text
                    style={[s.optionLabel, tone === 'xun' && s.optionLabelXun]}
                  >
                    {optionText(option.action)}
                  </Text>
                </Pressable>
              </Animated.View>
            ))
          : null}
        {tone === 'miao' && phase === 'listening'
          ? [pulse, pulseLate].map((value, index) => (
              // Prototype `voice-pulse`: `from { opacity: .8; scale(.82) }` →
              // `to { opacity: 0; scale(1.38) }`, drawn twice with the second
              // ring delayed .55s.
              <Animated.View
                key={index === 0 ? 'pulse-first' : 'pulse-late'}
                testID="voice-pulse"
                pointerEvents="none"
                style={[
                  s.pulse,
                  {
                    bottom: bottomOffset + (triggerSize - 48) / 2,
                    right: 20 + (triggerSize - 48) / 2,
                    borderColor: colors.text,
                    opacity: value.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 0],
                    }),
                    transform: [
                      { rotate: '45deg' },
                      {
                        scale: value.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.82, 1.38],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ))
          : null}
        <View
          key={`voice-trigger-${tone}`}
          {...responder.panHandlers}
          accessible
          accessibilityRole="button"
          accessibilityLabel={textFor(
            language,
            tone === 'xun' ? '打开语音快捷菜单' : '长按进行语音输入',
            tone === 'xun' ? 'Open voice shortcuts' : 'Hold for voice input',
          )}
          accessibilityHint={textFor(
            language,
            tone === 'xun'
              ? '长按后滑向语音、未读或规划；原地松开取消。轻点仅关闭已展开的快捷入口。'
              : `长按后滑向键盘、妙管家或${optionText(
                  'feed',
                )}；原地松开取消。轻点仅关闭已展开的快捷入口。`,
            tone === 'xun'
              ? 'Hold and slide to Voice, Unread or Plan. Release in place to cancel. A tap only closes an open menu.'
              : `Hold and slide to Type, Butler or ${optionText(
                  'feed',
                )}. Release in place to cancel. A tap only closes an open menu.`,
          )}
          accessibilityState={{
            expanded,
            busy: phase === 'preparing' || phase === 'finishing',
          }}
          accessibilityActions={[
            {
              name: 'longpress',
              label: textFor(
                language,
                tone === 'xun' ? '打开语音菜单' : '开始语音输入',
                tone === 'xun' ? 'Open voice menu' : 'Start voice input',
              ),
            },
          ]}
          onAccessibilityAction={event => {
            if (event.nativeEvent.actionName !== 'longpress') return;
            if (tone === 'xun') openShortcuts();
            else start();
          }}
          // A regular tap deliberately does not open the radial menu. V15
          // treats this control as a long-press affordance; an accessibility
          // tap only dismisses an already-open menu. VoiceOver users can use
          // the explicit `longpress` accessibility action below.
          onAccessibilityTap={() => {
            if (expandedRef.current) close();
          }}
          style={[
            s.triggerTouch,
            tone === 'xun' && s.triggerTouchXun,
            {
              bottom: bottomOffset,
              width: triggerSize,
              height: triggerSize,
            },
          ]}
        >
          {expanded ? (
            <>
              <View
                pointerEvents="none"
                testID="voice-trigger-halo"
                style={[
                  s.triggerHalo,
                  tone === 'xun' && s.triggerHaloXun,
                  {
                    width: triggerSize + 14,
                    height: triggerSize + 14,
                    transform: [{ rotate: tone === 'miao' ? '45deg' : '0deg' }],
                  },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  s.triggerOutline,
                  tone === 'xun' && s.triggerOutlineXun,
                  {
                    width: triggerSize + 10,
                    height: triggerSize + 10,
                    transform: [{ rotate: tone === 'miao' ? '45deg' : '0deg' }],
                  },
                ]}
              />
            </>
          ) : null}
          <View
            pointerEvents="none"
            style={[
              s.trigger,
              tone === 'xun' && s.triggerXun,
              expanded && s.triggerExpanded,
              expanded && tone === 'xun' && s.triggerExpandedXun,
              {
                width: triggerSize,
                height: triggerSize,
                transform: [{ rotate: tone === 'miao' ? '45deg' : '0deg' }],
              },
            ]}
          >
            <Svg height="100%" style={StyleSheet.absoluteFill} width="100%">
              <Defs>
                <LinearGradient
                  id={triggerGradientId}
                  x1="0"
                  x2="1"
                  y1="0"
                  y2="1"
                >
                  <Stop offset="0" stopColor={triggerGradient[0]} />
                  <Stop offset="1" stopColor={triggerGradient[1]} />
                </LinearGradient>
              </Defs>
              <Rect
                fill={`url(#${triggerGradientId})`}
                height="100%"
                rx={tone === 'xun' ? 19 : 21}
                width="100%"
              />
            </Svg>
            <View
              style={{
                transform: [{ rotate: tone === 'miao' ? '-45deg' : '0deg' }],
              }}
            >
              {phase === 'preparing' || phase === 'finishing' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : tone === 'xun' ? (
                <AssistantMark color={expanded ? '#FFFFFF' : '#070B11'} />
              ) : (
                <Mic size={32} color={expanded ? '#FFFFFF' : '#070B11'} />
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  cluster: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  triggerTouch: {
    position: 'absolute',
    right: 20,
    width: miaoTriggerSize,
    height: miaoTriggerSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerTouchXun: { right: 22 },
  trigger: {
    width: miaoTriggerSize,
    height: miaoTriggerSize,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    // Prototype `.fab`: a rounded square with a soft active halo.
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    overflow: 'hidden',
  },
  triggerXun: {
    width: 54,
    height: 54,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#CDD7E2',
    shadowColor: '#243E5D',
    shadowOpacity: 0.13,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 5 },
  },
  triggerExpanded: {
    borderWidth: 0,
  },
  triggerExpandedXun: {
    shadowOpacity: 0,
  },
  triggerHalo: {
    position: 'absolute',
    borderRadius: 26,
    backgroundColor: '#72E6DF45',
  },
  triggerHaloXun: { backgroundColor: '#B9EDE244' },
  triggerOutline: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 24,
    borderColor: '#B7EEE8',
  },
  triggerOutlineXun: { borderColor: '#94E4DB' },
  optionPosition: {
    position: 'absolute',
    right: 20,
  },
  optionPositionXun: { right: 23 },
  option: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  optionXun: {
    width: 49,
    height: 49,
    borderRadius: 24.5,
    borderWidth: 0,
    gap: 3,
    // V20 gives each light shortcut a very soft white halo; the cyan active
    // halo belongs only to the main trigger.
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.3,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  optionDefault: { borderColor: 'transparent' },
  optionSelected: { borderColor: 'transparent', borderWidth: 0 },
  miaoMenuBackdrop: {
    bottom: 89,
    backgroundColor: '#00000047',
  },
  xunMenuBackdrop: {
    bottom: 89,
    backgroundColor: '#00000033',
  },
  optionLabel: {
    color: '#060B10',
    fontSize: 12,
    fontWeight: '500',
    marginTop: -1,
  },
  optionLabelXun: {
    color: '#171722',
    fontSize: 11,
    fontWeight: '400',
    marginTop: 0,
  },
  pulse: {
    position: 'absolute',
    width: 48,
    height: 48,
    right: 16,
    borderWidth: 1,
    borderRadius: 22,
  },
  status: {
    position: 'absolute',
    top: 3,
    left: 28,
    right: 28,
    minHeight: 79,
    padding: 17,
    borderWidth: 0,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 2 },
    elevation: 0,
  },
  xunStatus: {
    top: 3,
    left: 13,
    right: 13,
    padding: 0,
    borderWidth: 0,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.035,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  xunStatusBackdrop: {
    bottom: 86,
    backgroundColor: '#00000033',
  },
  xunStatusHeading: {
    minHeight: 74,
    padding: 16,
    backgroundColor: '#F4F6F9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    position: 'relative',
  },
  xunStatusIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#CBD5DD',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  xunStatusHeadingCopy: { flex: 1, minWidth: 0 },
  xunStatusTitle: {
    color: '#171722',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 5,
  },
  xunStatusSubtitle: { color: '#777777', fontSize: 12 },
  xunStatusClose: {
    position: 'absolute',
    top: 17,
    right: 17,
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: '#CCD6DF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  xunStatusContent: {
    paddingTop: 13,
    paddingHorizontal: 17,
    paddingBottom: 17,
  },
  xunTranscript: {
    minHeight: 67,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#F4F6F9',
    color: '#737373',
    fontSize: 12,
    lineHeight: 19,
    textAlignVertical: 'top',
  },
  xunStatusNote: {
    marginVertical: 13,
    marginHorizontal: 16,
    color: '#777777',
    fontSize: 12,
    lineHeight: 18,
  },
  xunPermissionAction: {
    alignSelf: 'flex-start',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CED8E3',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 13,
  },
  xunPermissionLabel: { color: '#171722', fontSize: 12, fontWeight: '600' },
  xunStatusAction: {
    paddingVertical: 17,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CED8E3',
    marginBottom: 13,
  },
  xunStatusActionTitle: {
    color: '#171722',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  xunStatusActionText: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 19,
  },
  xunStatusButtons: { flexDirection: 'row', gap: 12 },
  xunSecondaryButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#667087',
    alignItems: 'center',
    justifyContent: 'center',
  },
  xunSecondaryButtonLabel: { color: '#171722', fontSize: 14 },
  xunPrimaryButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 24,
    backgroundColor: '#00C7CB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  xunPrimaryButtonDisabled: { opacity: 0.7 },
  xunPrimaryButtonLabel: {
    color: '#073B3D',
    fontSize: 14,
    fontWeight: '600',
  },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00C7CB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconXun: {
    backgroundColor: '#CBD5DD',
  },
  statusCopy: { flex: 1, gap: 4 },
  miaoStatusTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  miaoCancel: {
    fontSize: 12,
    lineHeight: 15,
  },
  permissionAction: { minHeight: 44, justifyContent: 'center' },
  permissionLabel: {
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  caption: { fontSize: 11, lineHeight: 15 },
  statusText: { fontSize: 15, lineHeight: 21, fontWeight: '500' },
  close: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
