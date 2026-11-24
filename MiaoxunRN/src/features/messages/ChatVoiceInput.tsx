import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import {
  Lock,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Send,
  Square,
  Trash2,
} from 'lucide-react-native';
import { voiceDurationLabel } from '../../services/chatVoiceAudio';
import { textFor } from '../../shared/i18n';
import type { Palette } from '../../shared/theme';
import type { Language } from '../session/sessionTypes';
import type { ChatVoiceControls } from './useChatVoice';
import { useRecordingPreview } from './useVoicePlayback';
import {
  isVoiceCallActive,
  voiceCallConflictCopy,
} from '../../services/voiceCall/voiceCallResources';

export type VoiceComposerControls = Omit<ChatVoiceControls, 'start'> & {
  start: (mode: 'hold' | 'accessible') => void;
};

type Intent = 'review' | 'cancel' | 'lock';
type Point = { x: number; y: number };
const gestureDistance = 60;

function point({ nativeEvent }: GestureResponderEvent): Point {
  return { x: nativeEvent.pageX, y: nativeEvent.pageY };
}

function intentBetween(origin: Point, position: Point): Intent {
  const up = origin.y - position.y;
  const left = origin.x - position.x;
  if (up >= gestureDistance && up >= Math.abs(left)) return 'cancel';
  if (left >= gestureDistance && left > Math.abs(up)) return 'lock';
  return 'review';
}

function VoiceDraft({
  recordingId,
  durationMs,
  status,
  palette,
  t,
  border,
  disabled,
  discard,
  upload,
}: {
  recordingId: string;
  durationMs: number;
  status: VoiceComposerControls['status'];
  palette: Palette;
  t: (zh: string, en: string) => string;
  border: { backgroundColor: string; borderColor: string };
  disabled: boolean;
  discard: () => void;
  upload: () => Promise<void>;
}) {
  const [previewError, setPreviewError] = useState('');
  const preview = useRecordingPreview(recordingId, durationMs, () =>
    setPreviewError(t('试听失败', 'Preview failed')),
  );
  const uploading = status === 'uploading';
  const uploadFailed = status === 'failed';
  const loading = preview.phase === 'loading';
  const playing = preview.phase === 'playing';
  const paused = preview.phase === 'paused';
  const retry = preview.phase === 'failed';
  const previewLabel = loading
    ? t('取消试听', 'Cancel preview')
    : playing
    ? t('暂停试听', 'Pause preview')
    : paused
    ? t('继续试听', 'Resume preview')
    : retry
    ? t('重试试听', 'Retry preview')
    : t('试听录音', 'Preview recording');
  const previewColor = retry ? palette.rose : palette.mint;
  return (
    <View style={[s.draft, border]} testID="chat-voice-draft">
      <View style={s.draftRow}>
        <Pressable
          style={s.action}
          accessibilityRole="button"
          accessibilityLabel={t('丢弃录音', 'Discard recording')}
          disabled={uploading}
          onPress={() => {
            preview.stop();
            discard();
          }}
        >
          <Trash2 size={18} color={palette.secondaryText} />
        </Pressable>
        <Pressable
          style={s.preview}
          testID="chat-voice-preview"
          accessibilityRole="button"
          accessibilityLabel={previewLabel}
          accessibilityValue={{ text: voiceDurationLabel(durationMs) }}
          disabled={uploading || preview.changing}
          onPress={() => {
            if (isVoiceCallActive()) {
              setPreviewError(t(...voiceCallConflictCopy.playback));
              return;
            }
            setPreviewError('');
            preview.toggle();
          }}
        >
          {loading ? (
            <ActivityIndicator color={previewColor} size="small" />
          ) : playing ? (
            <Pause size={17} color={previewColor} />
          ) : retry ? (
            <RotateCcw size={17} color={previewColor} />
          ) : (
            <Play size={17} color={previewColor} />
          )}
          <Text numberOfLines={1} style={[s.time, { color: palette.text }]}>
            {voiceDurationLabel(durationMs)}
          </Text>
        </Pressable>
        <Pressable
          style={s.action}
          testID="chat-voice-send"
          accessibilityRole="button"
          accessibilityLabel={
            uploadFailed
              ? t('重试发送语音', 'Retry sending voice')
              : t('发送语音', 'Send voice message')
          }
          accessibilityState={{
            busy: uploading,
            disabled: disabled || uploading,
          }}
          disabled={disabled || uploading}
          onPress={() => {
            preview.stop();
            upload().catch(() => undefined);
          }}
        >
          {uploading ? (
            <ActivityIndicator color={palette.mint} size="small" />
          ) : uploadFailed ? (
            <RotateCcw size={18} color={palette.rose} />
          ) : (
            <Send size={19} color={palette.mint} />
          )}
        </Pressable>
      </View>
      {uploadFailed || previewError ? (
        <Text
          style={[s.notice, { color: palette.rose }]}
          accessibilityLiveRegion="polite"
        >
          {uploadFailed ? t('发送失败', 'Upload failed') : previewError}
        </Text>
      ) : null}
    </View>
  );
}

export function ChatVoiceInput({
  controls,
  palette,
  language,
  borderColor,
  disabled,
}: {
  controls: VoiceComposerControls;
  palette: Palette;
  language: Language;
  borderColor: string;
  disabled: boolean;
}) {
  const [screenReader, setScreenReader] = useState(false);
  const [intent, setIntent] = useState<Intent>('review');
  const gesture = useRef<{
    origin: Point;
    latest: Point;
    cancelled: boolean;
  } | null>(null);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isScreenReaderEnabled?.()
      .then(enabled => {
        if (mounted) setScreenReader(enabled);
      })
      .catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener?.(
      'screenReaderChanged',
      setScreenReader,
    );
    return () => {
      mounted = false;
      listener?.remove();
    };
  }, []);

  const t = (zh: string, en: string) => textFor(language, zh, en);
  const {
    mode,
    status,
    durationMs,
    start,
    finish,
    lock,
    discard,
    upload,
    recordingId,
  } = controls;
  const border = { backgroundColor: palette.input, borderColor };
  const recording = status === 'recording';
  const busy =
    status === 'preparing' || status === 'finishing' || status === 'uploading';
  if (recordingId && ['ready', 'failed', 'uploading'].includes(status)) {
    return (
      <VoiceDraft
        key={recordingId}
        {...{
          recordingId,
          durationMs,
          status,
          palette,
          t,
          border,
          disabled,
          discard,
          upload,
        }}
      />
    );
  }

  const stop = () => {
    finish().catch(() => undefined);
  };
  const activate = () => {
    if (disabled || busy) return;
    if (recording) stop();
    else start('accessible');
  };
  if (
    (recording && mode === 'locked') ||
    ((screenReader || mode === 'accessible') && mode !== 'hold')
  ) {
    const label = recording
      ? t('结束录音', 'Stop recording')
      : t('开始录音', 'Start recording');
    return (
      <View
        style={[s.row, border]}
        testID={mode === 'locked' ? 'chat-voice-locked' : undefined}
      >
        {recording ? (
          <Pressable
            style={s.action}
            accessibilityRole="button"
            accessibilityLabel={t('取消录音', 'Cancel recording')}
            onPress={discard}
          >
            <Trash2 color={palette.secondaryText} size={18} />
          </Pressable>
        ) : null}
        <Pressable
          style={s.talk}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ busy, disabled: disabled || busy }}
          disabled={disabled || busy}
          onPress={activate}
        >
          {busy ? (
            <ActivityIndicator size="small" color={palette.mint} />
          ) : recording ? (
            <Square size={16} fill={palette.rose} color={palette.rose} />
          ) : (
            <Mic size={16} color={palette.mint} />
          )}
          <Text
            numberOfLines={1}
            style={[s.statusLabel, { color: palette.text }]}
          >
            {recording
              ? mode === 'locked'
                ? t('已锁定', 'Locked')
                : t('录音中', 'Recording')
              : busy
              ? t('准备中', 'Preparing')
              : label}
          </Text>
          {recording ? (
            <Text style={[s.time, { color: palette.secondaryText }]}>
              {voiceDurationLabel(durationMs)}
            </Text>
          ) : null}
        </Pressable>
      </View>
    );
  }

  const cancelling = intent === 'cancel';
  const locking = intent === 'lock';
  const statusColor = cancelling ? palette.rose : palette.text;
  const label = recording
    ? cancelling
      ? t('松开取消', 'Release to cancel')
      : locking
      ? t('松开锁定', 'Release to lock')
      : t(
          '松开试听，上滑取消，左滑锁定',
          'Release to preview. Slide up to cancel or left to lock.',
        )
    : status === 'finishing'
    ? t('正在完成录音', 'Finishing recording')
    : busy
    ? t('正在准备录音', 'Preparing recording')
    : t('按住说话', 'Hold to talk');
  const display =
    recording && intent === 'review'
      ? t('上滑取消 · 左滑锁定', '↑ Cancel · ← Lock')
      : label;
  return (
    <View
      testID="chat-voice-hold"
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled }}
      onAccessibilityTap={activate}
      style={[s.row, border, cancelling && { borderColor: palette.rose }]}
      onStartShouldSetResponder={() => !disabled && !busy && !recording}
      onResponderGrant={event => {
        const origin = point(event);
        gesture.current = { origin, latest: origin, cancelled: false };
        setIntent('review');
        start('hold');
      }}
      onResponderMove={event => {
        const session = gesture.current;
        if (!session) return;
        if ((event.nativeEvent.touches?.length ?? 1) > 1)
          session.cancelled = true;
        session.latest = point(event);
        setIntent(
          session.cancelled
            ? 'cancel'
            : intentBetween(session.origin, session.latest),
        );
      }}
      onResponderRelease={event => {
        const session = gesture.current;
        gesture.current = null;
        setIntent('review');
        if (!session) return;
        const release = point(event);
        const validRelease =
          Number.isFinite(release.x) && Number.isFinite(release.y);
        const outcome = session.cancelled
          ? 'cancel'
          : intentBetween(
              session.origin,
              validRelease ? release : session.latest,
            );
        if (outcome === 'lock' && lock()) return;
        finish(outcome === 'cancel').catch(() => undefined);
      }}
      onResponderTerminate={() => {
        gesture.current = null;
        setIntent('review');
        finish(true).catch(() => undefined);
      }}
    >
      {busy ? (
        <ActivityIndicator color={palette.mint} size="small" />
      ) : locking ? (
        <Lock size={16} color={palette.mint} />
      ) : (
        <Mic size={16} color={cancelling ? palette.rose : palette.mint} />
      )}
      <Text numberOfLines={1} style={[s.statusLabel, { color: statusColor }]}>
        {display}
      </Text>
      {recording ? (
        <Text style={[s.time, { color: palette.secondaryText }]}>
          {voiceDurationLabel(durationMs)}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 5,
  },
  draft: { flex: 1, borderRadius: 12, borderWidth: 1, minHeight: 44 },
  draftRow: { flexDirection: 'row', alignItems: 'center' },
  talk: {
    minHeight: 44,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  action: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    minHeight: 44,
    minWidth: 44,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  statusLabel: { flexShrink: 1, fontSize: 12 },
  time: { fontSize: 12, fontVariant: ['tabular-nums'], flexShrink: 1 },
  notice: { textAlign: 'center', fontSize: 11, paddingBottom: 5 },
});
