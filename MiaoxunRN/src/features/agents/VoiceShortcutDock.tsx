import React, { useEffect, useRef, useState } from 'react';
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
  View,
} from 'react-native';
import { Keyboard, Mic, X } from 'lucide-react-native';
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
const triggerSize = 52;
// Both tabs use the same compact three-way gesture. Tone only changes the
// trigger styling and copy; it must not change where a release lands.
const shortcutOptions: { action: Action; x: number; y: number }[] = [
  { action: 'keyboard', x: 0, y: -56 },
  { action: 'butler', x: -56, y: 0 },
  { action: 'feed', x: 0, y: 56 },
];
export function voiceShortcutActionAt(dx: number, dy: number): Action | null {
  return (
    shortcutOptions.find(
      option => Math.hypot(dx - option.x, dy - option.y) <= 27,
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

/** The held gesture owns a speech session. Releasing outside an option cancels. */
export function VoiceShortcutDock({
  palette,
  language,
  bottomOffset = 88,
  active = true,
  tone = 'miao',
  ...callbacks
}: Props) {
  const colors = workspacePalette(palette);
  const triggerBackgroundColor = tone === 'xun' ? '#079FA4' : colors.text;
  const options = shortcutOptions;
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
  const [phase, setPhase] = useState<Phase>('idle');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [permissionAction, setPermissionAction] = useState<
    'prepare' | 'settings' | null
  >(null);
  const [selected, setSelected] = useState<Action | null>(null);
  const statusShown =
    (expanded && phase !== 'idle') ||
    ['error', 'authorizing', 'permissionReady', 'finishing'].includes(phase);
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
  const close = () => {
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
    if (action === 'feed') return deliver(action);
    if (!session.current || phaseRef.current === 'preparing')
      return deliver(action, draftRef.current);
    pendingAction.current = action;
    changeExpanded(false);
    changePhase('finishing');
    session.current.finish();
  };
  const start = () => {
    if (!active || session.current || permissionSession.current) return;
    held.current = true;
    draftRef.current = '';
    setDraft('');
    setError('');
    setPermissionAction(null);
    changeExpanded(true);
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
        if (action) deliver(action, text);
        else changePhase('ready');
      }, failed);
    } catch (cause) {
      failed(cause);
    }
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
  const actionsRef = useRef({ start, close, perform, changeExpanded });
  actionsRef.current = { start, close, perform, changeExpanded };
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
            (event?.nativeEvent.locationX ?? triggerSize / 2) - triggerSize / 2,
          y:
            (event?.nativeEvent.locationY ?? triggerSize / 2) - triggerSize / 2,
        };
        lastPoint.current = touchOffset.current;
        selectedRef.current = null;
        setSelected(null);
        clearHold();
        holdTimer.current = setTimeout(() => actionsRef.current.start(), 480);
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
          const action = voiceShortcutActionAt(point.x, point.y);
          actionsRef.current.changeExpanded(false);
          if (action) actionsRef.current.perform(action);
          else if (phaseRef.current !== 'error') actionsRef.current.close();
        } else if (
          !moved.current &&
          Math.hypot(gesture?.dx ?? 0, gesture?.dy ?? 0) <= 14
        ) {
          if (expandedRef.current) actionsRef.current.close();
          else actionsRef.current.changeExpanded(true);
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
    if (!active) actionsRef.current.close();
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
      if (state !== 'active') actionsRef.current.close();
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
    if (phase !== 'listening' || reduceMotion) {
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
  }, [phase, pulse, pulseLate, reduceMotion]);
  if (!active) return null;
  // Prototype `#miaoVoiceCluster` reads 键盘 / 妙管家 / 瀑布, while
  // `#xunVoiceCluster` reads 直接说 / 总结未读 / 替我规划 — the same three
  // directions carry different meanings on each tab.
  const optionText = (action: Action) => {
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
      {expanded ? (
        <Pressable
          accessibilityLabel={textFor(
            language,
            '关闭语音菜单',
            'Close voice menu',
          )}
          accessibilityRole="button"
          style={StyleSheet.absoluteFill}
          onPress={close}
        />
      ) : null}
      {statusShown ? (
        <Animated.View
          accessibilityLiveRegion="polite"
          style={[
            s.status,
            { backgroundColor: colors.surface, borderColor: colors.border },
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
          <View style={[s.statusIcon, { backgroundColor: colors.soft }]}>
            <Mic size={20} color={colors.text} />
          </View>
          <View style={s.statusCopy}>
            <Text style={[s.caption, { color: colors.secondaryText }]}>
              {textFor(language, '语音输入', 'Voice input')}
            </Text>
            <Text
              accessibilityRole={error ? 'alert' : undefined}
              numberOfLines={3}
              style={[
                s.statusText,
                { color: error ? palette.rose : colors.text },
              ]}
            >
              {status}
            </Text>
            {!error &&
            phase !== 'authorizing' &&
            phase !== 'permissionReady' ? (
              <Text style={[s.caption, { color: colors.secondaryText }]}>
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
                <Text style={[s.permissionLabel, { color: colors.text }]}>
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textFor(
              language,
              '取消语音输入',
              'Cancel voice input',
            )}
            onPress={close}
            style={s.close}
          >
            <X size={18} color={colors.secondaryText} />
          </Pressable>
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
                  {
                    bottom: bottomOffset - 1,
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
                    {
                      backgroundColor:
                        selected === option.action
                          ? colors.text
                          : colors.surface,
                      borderColor:
                        selected === option.action
                          ? colors.text
                          : colors.border,
                    },
                  ]}
                >
                  {option.action === 'keyboard' ? (
                    <Keyboard
                      size={19}
                      color={
                        selected === option.action
                          ? colors.surface
                          : colors.text
                      }
                    />
                  ) : (
                    <Text
                      style={[
                        s.optionLabel,
                        {
                          color:
                            selected === option.action
                              ? colors.surface
                              : colors.text,
                        },
                      ]}
                    >
                      {optionText(option.action)}
                    </Text>
                  )}
                </Pressable>
              </Animated.View>
            ))
          : null}
        {phase === 'listening'
          ? [pulse, pulseLate].map((value, index) => (
              // Prototype `voice-pulse`: `from { opacity: .8; scale(.82) }` →
              // `to { opacity: 0; scale(1.38) }`, drawn twice with the second
              // ring delayed .55s.
              <Animated.View
                key={index === 0 ? 'pulse-first' : 'pulse-late'}
                pointerEvents="none"
                style={[
                  s.pulse,
                  {
                    bottom: bottomOffset + 2,
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
          {...responder.panHandlers}
          accessible
          accessibilityRole="button"
          accessibilityLabel={textFor(
            language,
            '长按进行语音输入',
            'Hold for voice input',
          )}
          accessibilityHint={textFor(
            language,
            `长按后滑向键盘、妙管家或${optionText(
              'feed',
            )}；原地松开取消。轻点打开快捷入口。`,
            `Hold and slide to Type, Butler or ${optionText(
              'feed',
            )}. Release in place to cancel. Tap for shortcuts.`,
          )}
          accessibilityState={{
            expanded,
            busy: phase === 'preparing' || phase === 'finishing',
          }}
          accessibilityActions={[
            {
              name: 'longpress',
              label: textFor(language, '开始语音输入', 'Start voice input'),
            },
          ]}
          onAccessibilityAction={event => {
            if (event.nativeEvent.actionName === 'longpress') start();
          }}
          onAccessibilityTap={() => {
            if (
              phaseRef.current === 'finishing' ||
              phaseRef.current === 'authorizing'
            )
              return;
            if (expandedRef.current) close();
            else changeExpanded(true);
          }}
          style={[s.triggerTouch, { bottom: bottomOffset }]}
        >
          <View
            pointerEvents="none"
            style={[s.trigger, { backgroundColor: triggerBackgroundColor }]}
          >
            <View style={s.triggerIcon}>
              {phase === 'preparing' || phase === 'finishing' ? (
                <ActivityIndicator size="small" color={colors.surface} />
              ) : (
                <Mic size={18} color={colors.surface} />
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
    right: 14,
    width: triggerSize,
    height: triggerSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trigger: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  triggerIcon: { transform: [{ rotate: '-45deg' }] },
  optionPosition: {
    position: 'absolute',
    right: 13,
  },
  option: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  optionLabel: { fontSize: 12, fontWeight: '600' },
  pulse: {
    position: 'absolute',
    width: 48,
    height: 48,
    right: 16,
    borderWidth: 1,
    borderRadius: 15,
  },
  status: {
    position: 'absolute',
    top: 16,
    left: 18,
    right: 18,
    padding: 12,
    borderWidth: 1,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  statusIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCopy: { flex: 1, gap: 4 },
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
