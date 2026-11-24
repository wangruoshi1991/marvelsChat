import React from 'react';
import {
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Pause, Play, RotateCcw } from 'lucide-react-native';
import type { ChatAttachmentDTO } from '../../models/api';
import { voiceDurationLabel } from '../../services/chatVoiceAudio';
import { textFor } from '../../shared/i18n';
import type { Palette } from '../../shared/theme';
import type { Language } from '../session/sessionTypes';
import { useVoicePlayback } from './useVoicePlayback';
import { VoiceSeekTrack } from './VoiceSeekTrack';

import {
  isVoiceCallActive,
  voiceCallConflictCopy,
} from '../../services/voiceCall/voiceCallResources';

const elapsedLabel = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
};

export function ChatVoiceMessage({
  attachment,
  token,
  palette,
  language,
  onActionMessage,
  standalone = true,
  onOpenMessageActions,
}: {
  attachment: ChatAttachmentDTO;
  token: string;
  palette: Palette;
  language: Language;
  onActionMessage: (message: string) => void;
  standalone?: boolean;
  onOpenMessageActions?: (
    event?: GestureResponderEvent,
    attachmentId?: string,
  ) => void;
}) {
  const playback = useVoicePlayback(attachment, token, onActionMessage);
  const largeText = useWindowDimensions().fontScale >= 1.6;
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const {
    phase,
    positionMs,
    waveform,
    changing,
    toggle,
    rate,
    cycleRate,
    canSeek,
    seekToFraction,
  } = playback;
  const durationMs = attachment.durationMs ?? playback.durationMs;
  const playerDurationMs = playback.durationMs || durationMs;
  const elapsedMs =
    durationMs > 0 ? Math.min(positionMs, durationMs) : positionMs;
  const seconds = Math.max(1, Math.ceil(durationMs / 1000));
  const playing = phase === 'playing';
  const paused = phase === 'paused';
  const loading = phase === 'loading';
  const failed = phase === 'failed';
  const label = loading
    ? t('取消加载语音', 'Cancel loading voice message')
    : playing
    ? t('暂停语音播放', 'Pause voice playback')
    : paused
    ? t('继续播放语音', 'Resume voice playback')
    : failed
    ? t('重试播放语音', 'Retry voice playback')
    : t(
        '播放语音，' + seconds + ' 秒',
        'Play voice message, ' + seconds + ' seconds',
      );
  const status = loading
    ? t('加载中', 'Loading')
    : paused
    ? t('已暂停', 'Paused')
    : failed
    ? t('点按重试', 'Tap to retry')
    : playing
    ? t('播放中', 'Playing')
    : null;
  const openActions = onOpenMessageActions
    ? (event: GestureResponderEvent) =>
        onOpenMessageActions(event, attachment.id)
    : undefined;
  return (
    <View
      style={[
        s.bubble,
        largeText && s.bubbleLargeText,
        standalone && [
          s.standalone,
          { backgroundColor: palette.soft, borderColor: palette.border },
        ],
      ]}
    >
      <View style={s.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={
            onOpenMessageActions
              ? t('长按显示消息操作', 'Touch and hold for message actions')
              : undefined
          }
          accessibilityState={{
            selected: playing,
            busy: loading || changing,
            disabled: changing,
          }}
          accessibilityValue={
            playing || paused
              ? {
                  text:
                    elapsedLabel(elapsedMs) +
                    ' / ' +
                    voiceDurationLabel(durationMs),
                }
              : undefined
          }
          testID="chat-attachment-audio"
          disabled={changing}
          accessibilityActions={
            onOpenMessageActions
              ? [
                  {
                    name: 'message-actions',
                    label: t('消息操作', 'Message actions'),
                  },
                ]
              : undefined
          }
          onAccessibilityAction={event => {
            if (event.nativeEvent.actionName === 'message-actions')
              onOpenMessageActions?.(undefined, attachment.id);
          }}
          onLongPress={openActions}
          onPress={() => {
            if (isVoiceCallActive())
              onActionMessage(t(...voiceCallConflictCopy.playback));
            else toggle();
          }}
          style={({ pressed }) => [s.playTarget, pressed && s.pressed]}
        >
          <View
            style={[
              s.playButton,
              { backgroundColor: failed ? palette.rose : palette.mint },
            ]}
            pointerEvents="none"
          >
            {failed ? (
              <RotateCcw color={palette.surface} size={18} />
            ) : playing ? (
              <Pause color={palette.surface} fill={palette.surface} size={18} />
            ) : (
              <Play color={palette.surface} fill={palette.surface} size={18} />
            )}
          </View>
        </Pressable>
        <VoiceSeekTrack
          key={token + ':' + attachment.id}
          canSeek={canSeek}
          durationMs={playerDurationMs}
          positionMs={positionMs}
          waveform={waveform}
          palette={palette}
          language={language}
          durationLabel={voiceDurationLabel(durationMs)}
          showElapsed={playing || paused}
          largeText={largeText}
          onSeek={seekToFraction}
          onLongPress={openActions}
        />
        <Pressable
          testID="chat-voice-rate"
          accessibilityRole="button"
          accessibilityLabel={t('语音播放速度', 'Voice playback speed')}
          accessibilityValue={{ text: `${rate}×` }}
          accessibilityHint={
            canSeek
              ? t(
                  '切换一倍、一点五倍或两倍速度',
                  'Cycle through 1, 1.5 or 2 times speed',
                )
              : t('播放后可调整速度', 'Start playback to adjust speed')
          }
          accessibilityState={{ disabled: !canSeek, busy: changing }}
          disabled={!canSeek}
          onPress={() => {
            cycleRate();
          }}
          onLongPress={openActions}
          style={[s.rateTarget, largeText && s.rateTargetLargeText]}
        >
          <Text
            numberOfLines={1}
            style={[
              s.rate,
              { color: canSeek ? palette.text : palette.secondaryText },
            ]}
          >
            {rate}×
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessible={false}
        onLongPress={status ? openActions : undefined}
        style={[s.statusTarget, largeText && s.statusTargetLargeText]}
      >
        <Text
          numberOfLines={1}
          style={[
            s.status,
            { color: failed ? palette.rose : palette.secondaryText },
          ]}
        >
          {status ?? ' '}
        </Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bubble: {
    alignSelf: 'flex-start',
    minHeight: 64,
    width: 224,
    maxWidth: '100%',
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  bubbleLargeText: { width: 310 },
  standalone: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 10 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  playTarget: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.72 },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateTarget: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateTargetLargeText: { width: 76 },
  rate: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  statusTarget: {
    alignSelf: 'stretch',
    paddingLeft: 48,
    paddingRight: 44,
    paddingTop: 2,
  },
  statusTargetLargeText: { paddingRight: 0 },
  status: { fontSize: 10 },
});
