import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Mic, MicOff, Minimize2, Phone, PhoneOff } from 'lucide-react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { textFor } from '../../shared/i18n';
import type { Palette } from '../../shared/theme';
import { useReduceMotion } from '../../shared/useReduceMotion';
import type { Language } from '../session/sessionTypes';

import { VoiceCallAudioOutput } from './VoiceCallAudioOutput';

export type { VoiceCallDisplay } from './voiceCallPresentation';
import {
  canMinimizeVoiceCall,
  type VoiceCallDisplay,
} from './voiceCallPresentation';

type Action = () => void | Promise<void>;
type Props = {
  display: VoiceCallDisplay | null;
  palette: Palette;
  language: Language;
  onAccept: Action;
  onDecline: Action;
  onEnd: Action;
  onToggleMute: Action;
  onDismiss: Action;
  onMinimize?: Action;
};
type ActionKind =
  | 'accept'
  | 'decline'
  | 'end'
  | 'mute'
  | 'dismiss'
  | 'minimize';

/** Presentation only: call state and microphone ownership remain with the caller. */
export function VoiceCallSheet({ display, ...props }: Props) {
  return display ? <CallPresentation display={display} {...props} /> : null;
}

function CallPresentation({
  display,
  palette,
  language,
  onAccept,
  onDecline,
  onEnd,
  onToggleMute,
  onDismiss,
  onMinimize,
}: Omit<Props, 'display'> & { display: VoiceCallDisplay }) {
  const reduceMotion = useReduceMotion();
  const title = useRef<Text>(null);
  const owner = useMemo(
    () => ({
      peerName: display.peerName,
      phase: display.phase,
      muted: display.muted,
    }),
    [display.peerName, display.phase, display.muted],
  );
  const activeOwner = useRef<object | null>(owner);
  activeOwner.current = owner;
  useEffect(() => {
    activeOwner.current = owner;
    return () => {
      if (activeOwner.current === owner) activeOwner.current = null;
    };
  }, [owner]);
  const [pending, setPending] = useState<{
    owner: object;
    kind: ActionKind;
  } | null>(null);
  const pendingRef = useRef<typeof pending>(null);
  const [actionError, setActionError] = useState<object | null>(null);
  const [now, setNow] = useState(Date.now);
  const { phase, connectedAt } = display;
  const terminal = phase === 'ended' || phase === 'failed';
  const canMinimize = Boolean(onMinimize && canMinimizeVoiceCall(display));
  const currentPending = pending?.owner === owner ? pending.kind : undefined;
  const busy = Boolean(currentPending);
  const t = (zh: string, en: string) => textFor(language, zh, en);

  useEffect(() => {
    if (
      phase !== 'connected' ||
      !Number.isFinite(connectedAt) ||
      !connectedAt ||
      connectedAt < 0
    )
      return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase, connectedAt]);
  const elapsedSeconds =
    phase === 'connected' &&
    connectedAt &&
    Number.isFinite(connectedAt) &&
    connectedAt > 0 &&
    connectedAt <= now
      ? Math.floor((now - connectedAt) / 1000)
      : undefined;
  const duration =
    elapsedSeconds === undefined
      ? undefined
      : `${Math.floor(elapsedSeconds / 60)}:${String(
          elapsedSeconds % 60,
        ).padStart(2, '0')}`;

  const run = async (kind: ActionKind, action: Action) => {
    if (activeOwner.current !== owner || pendingRef.current?.owner === owner)
      return;
    const operation = { owner, kind };
    pendingRef.current = operation;
    setPending(operation);
    setActionError(null);
    try {
      await action();
    } catch {
      if (activeOwner.current === owner) setActionError(owner);
    } finally {
      if (pendingRef.current === operation) pendingRef.current = null;
      if (activeOwner.current === owner) setPending(null);
    }
  };
  const close = () => {
    if (canMinimize && onMinimize) run('minimize', onMinimize);
    else if (terminal) run('dismiss', onDismiss);
    else if (phase === 'incoming') run('decline', onDecline);
    else run('end', onEnd);
  };
  const status =
    currentPending === 'end' || currentPending === 'decline'
      ? t('正在结束通话…', 'Ending call…')
      : currentPending === 'accept'
      ? t('正在接听…', 'Answering…')
      : currentPending === 'mute'
      ? t('正在更新麦克风…', 'Updating microphone…')
      : phase === 'dialing'
      ? t('正在发起呼叫…', 'Starting call…')
      : phase === 'outgoing'
      ? t('等待对方接听…', 'Waiting for an answer…')
      : phase === 'incoming'
      ? t('邀请你进行语音通话', 'Incoming voice call')
      : phase === 'connecting'
      ? display.connectedAt
        ? t('正在恢复语音连接…', 'Reconnecting audio…')
        : t('正在建立语音连接…', 'Connecting audio…')
      : phase === 'connected'
      ? t('通话中', 'Connected')
      : phase === 'ended'
      ? t('通话已结束', 'Call ended')
      : t('通话失败', 'Call failed');
  const mainLabel = terminal
    ? t('完成', 'Done')
    : phase === 'incoming'
    ? t('接听', 'Answer')
    : phase === 'dialing' || phase === 'outgoing'
    ? t('取消呼叫', 'Cancel call')
    : t('挂断', 'End call');
  const mainKind = terminal
    ? 'dismiss'
    : phase === 'incoming'
    ? 'accept'
    : 'end';
  const MainIcon = phase === 'incoming' ? Phone : PhoneOff;
  const main = terminal
    ? () => run('dismiss', onDismiss)
    : phase === 'incoming'
    ? () => run('accept', onAccept)
    : () => run('end', onEnd);

  const muteControl =
    phase === 'connected' ? (
      <Pressable
        testID="voice-call-mute"
        accessibilityRole="button"
        accessibilityLabel={
          display.muted
            ? t('取消静音', 'Unmute microphone')
            : t('静音', 'Mute microphone')
        }
        accessibilityState={{
          disabled: busy,
          selected: display.muted,
          busy: currentPending === 'mute',
        }}
        disabled={busy}
        onPress={() => run('mute', onToggleMute)}
        style={[
          s.callControl,
          {
            borderColor: palette.border,
            backgroundColor: palette.surface,
          },
        ]}
      >
        {currentPending === 'mute' ? (
          <ActivityIndicator color={palette.text} />
        ) : display.muted ? (
          <MicOff size={22} color={palette.text} />
        ) : (
          <Mic size={22} color={palette.text} />
        )}
        <Text style={[s.callControlText, { color: palette.text }]}>
          {display.muted ? t('取消静音', 'Unmute') : t('静音', 'Mute')}
        </Text>
      </Pressable>
    ) : null;
  return (
    <Modal
      visible
      presentationStyle="fullScreen"
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={close}
      onShow={() => {
        const handle = findNodeHandle(title.current);
        if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
      }}
    >
      <SafeAreaProvider>
        <SafeAreaView
          testID="voice-call-sheet"
          accessibilityViewIsModal
          onAccessibilityEscape={close}
          style={[s.screen, { backgroundColor: palette.background }]}
        >
          {canMinimize && onMinimize ? (
            <View style={s.header}>
              <Pressable
                testID="voice-call-minimize"
                accessibilityRole="button"
                accessibilityLabel={t('收起通话', 'Minimize call')}
                accessibilityHint={t(
                  '通话会继续，可使用妙讯其他功能',
                  'Keep the call active while using Miaoxun',
                )}
                accessibilityState={{
                  disabled: busy,
                  busy: currentPending === 'minimize',
                }}
                disabled={busy}
                onPress={() => run('minimize', onMinimize)}
                style={({ pressed }) => [
                  s.minimize,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                    opacity: pressed ? 0.65 : 1,
                  },
                ]}
              >
                <Minimize2 size={23} strokeWidth={2.25} color={palette.text} />
              </Pressable>
            </View>
          ) : null}
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.content}>
              <Text style={[s.eyebrow, { color: palette.secondaryText }]}>
                {t('语音通话', 'Voice call')}
              </Text>
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                style={[
                  s.symbol,
                  {
                    backgroundColor: palette.soft,
                    borderColor: palette.border,
                  },
                ]}
              >
                {terminal ? (
                  <PhoneOff size={36} color={palette.secondaryText} />
                ) : (
                  <Phone size={36} color={palette.mint} />
                )}
              </View>
              <Text
                ref={title}
                testID="voice-call-peer"
                accessibilityRole="header"
                style={[s.peer, { color: palette.text }]}
              >
                {display.peerName}
              </Text>
              <Text
                testID="voice-call-status"
                accessibilityLiveRegion="polite"
                style={[s.status, { color: palette.text }]}
              >
                {status}
              </Text>
              {duration !== undefined ? (
                <Text
                  testID="voice-call-duration"
                  accessibilityLabel={t(
                    `通话时长 ${Math.floor(elapsedSeconds! / 60)} 分 ${
                      elapsedSeconds! % 60
                    } 秒`,
                    `Call duration ${Math.floor(
                      elapsedSeconds! / 60,
                    )} minutes ${elapsedSeconds! % 60} seconds`,
                  )}
                  style={[s.duration, { color: palette.secondaryText }]}
                >
                  {duration}
                </Text>
              ) : null}
              {display.message ? (
                <Text
                  testID="voice-call-message"
                  accessibilityLiveRegion="polite"
                  style={[s.message, { color: palette.secondaryText }]}
                >
                  {display.message}
                </Text>
              ) : null}
              {phase === 'connected' ? (
                <Text
                  testID="voice-call-microphone-state"
                  style={[s.message, { color: palette.secondaryText }]}
                >
                  {display.muted
                    ? t('麦克风已静音', 'Microphone muted')
                    : t('麦克风已开启', 'Microphone on')}
                </Text>
              ) : null}
              {actionError === owner ? (
                <Text
                  testID="voice-call-action-error"
                  accessibilityRole="alert"
                  style={[s.message, { color: palette.text }]}
                >
                  {t(
                    '操作未完成，请重试。',
                    'Could not complete the action. Try again.',
                  )}
                </Text>
              ) : null}
            </View>
            <View style={s.actions}>
              {!terminal ? (
                <Text style={[s.hint, { color: palette.secondaryText }]}>
                  {t(
                    '通话期间请保持妙讯在前台',
                    'Keep Miaoxun open during the call',
                  )}
                </Text>
              ) : null}
              {connectedAt && canMinimizeVoiceCall(display) ? (
                <VoiceCallAudioOutput
                  key={connectedAt}
                  connectedAt={connectedAt}
                  disabled={busy || phase !== 'connected'}
                  language={language}
                  palette={palette}
                >
                  {muteControl}
                </VoiceCallAudioOutput>
              ) : (
                muteControl
              )}
              <Pressable
                testID={
                  terminal
                    ? 'voice-call-dismiss'
                    : phase === 'incoming'
                    ? 'voice-call-accept'
                    : 'voice-call-end'
                }
                accessibilityRole="button"
                accessibilityLabel={mainLabel}
                accessibilityState={{
                  disabled: busy,
                  busy: currentPending === mainKind,
                }}
                disabled={busy}
                onPress={main}
                style={[s.button, { backgroundColor: palette.text }]}
              >
                {currentPending === mainKind ? (
                  <ActivityIndicator color={palette.background} />
                ) : !terminal ? (
                  <MainIcon size={22} color={palette.background} />
                ) : null}
                <Text style={[s.buttonText, { color: palette.background }]}>
                  {mainLabel}
                </Text>
              </Pressable>
              {phase === 'incoming' ? (
                <Pressable
                  testID="voice-call-decline"
                  accessibilityRole="button"
                  accessibilityLabel={t('拒绝接听', 'Decline call')}
                  accessibilityState={{
                    disabled: busy,
                    busy: currentPending === 'decline',
                  }}
                  disabled={busy}
                  onPress={() => run('decline', onDecline)}
                  style={[
                    s.button,
                    s.secondary,
                    {
                      borderColor: palette.border,
                      backgroundColor: palette.surface,
                    },
                  ]}
                >
                  {currentPending === 'decline' ? (
                    <ActivityIndicator color={palette.text} />
                  ) : (
                    <PhoneOff size={22} color={palette.text} />
                  )}
                  <Text style={[s.buttonText, { color: palette.text }]}>
                    {t('拒绝', 'Decline')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  header: { alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 8 },
  minimize: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
    gap: 16,
  },
  eyebrow: { fontSize: 15, textAlign: 'center' },
  symbol: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  peer: {
    width: '100%',
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  status: { fontSize: 19, textAlign: 'center' },
  duration: {
    fontSize: 22,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  message: { fontSize: 16, textAlign: 'center', lineHeight: 24 },
  hint: { fontSize: 14, textAlign: 'center', marginBottom: 8 },
  actions: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 12 },
  callControl: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
    borderWidth: 1,
    borderRadius: 16,
  },
  callControlText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  button: {
    minHeight: 56,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  secondary: { borderWidth: 1 },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
});
