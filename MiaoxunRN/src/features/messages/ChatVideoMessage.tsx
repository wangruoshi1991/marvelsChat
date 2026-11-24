import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Film, X } from 'lucide-react-native';
import Video from 'react-native-video';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { ChatAttachmentDTO } from '../../models/api';
import {
  downloadChatVideo,
  releaseChatVideo,
} from '../../services/api/chatAttachmentApi';
import { voiceDurationLabel } from '../../services/chatVoiceAudio';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';
import { textFor } from '../../shared/i18n';
import type { Palette } from '../../shared/theme';
import type { Language } from '../session/sessionTypes';
import type { GestureResponderEvent } from 'react-native';

import { useVoiceCallActivity } from '../voiceCalls/useVoiceCallActivity';
import {
  isVoiceCallActive,
  voiceCallConflictCopy,
} from '../../services/voiceCall/voiceCallResources';

export function ChatVideoMessage({
  attachment,
  token,
  palette,
  language,
  onLongPress,
}: {
  attachment: ChatAttachmentDTO;
  token: string;
  palette: Palette;
  language: Language;
  onLongPress?: (event: GestureResponderEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const callActive = useVoiceCallActivity();
  useEffect(() => {
    if (callActive) setOpen(false);
  }, [callActive]);
  const t = (zh: string, en: string) => textFor(language, zh, en);
  return (
    <>
      <Pressable
        testID="chat-video-attachment"
        accessibilityRole="button"
        accessibilityLabel={t('打开视频', 'Open video')}
        onPress={() => {
          if (isVoiceCallActive()) {
            Alert.alert(
              t('正在语音通话', 'Voice call in progress'),
              t(...voiceCallConflictCopy.playback),
            );
            return;
          }
          setOpen(true);
        }}
        onLongPress={onLongPress}
        style={[
          styles.tile,
          { backgroundColor: palette.soft, borderColor: palette.border },
        ]}
      >
        <Film size={21} color={palette.mint} />
        <Text numberOfLines={1} style={[styles.name, { color: palette.text }]}>
          {attachment.filename}
        </Text>
        <Text style={{ color: palette.secondaryText }}>
          {voiceDurationLabel(attachment.durationMs ?? 0)}
        </Text>
      </Pressable>
      {open && !callActive ? (
        <ChatVideoPreview
          {...{ attachment, token, palette, language }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ChatVideoPreview({
  attachment,
  token,
  palette,
  language,
  onClose,
}: {
  attachment: ChatAttachmentDTO;
  token: string;
  palette: Palette;
  language: Language;
  onClose: () => void;
}) {
  const { id: attachmentId } = attachment;
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState<{ uri?: string; error?: boolean }>({});
  const t = (zh: string, en: string) => textFor(language, zh, en);
  useEffect(() => {
    let current = true;
    const key = createIdempotencyKey();
    setStatus({});
    downloadChatVideo(attachmentId, token, key)
      .then(uri => {
        if (current) setStatus({ uri });
      })
      .catch(() => {
        if (current) setStatus({ error: true });
      });
    return () => {
      current = false;
      releaseChatVideo(key);
    };
  }, [attachmentId, retry, token]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state === 'background') onClose();
    });
    return () => listener.remove();
  }, [onClose]);
  return (
    <Modal onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView
          style={[styles.preview, { backgroundColor: palette.background }]}
        >
          <View style={styles.header}>
            <Text
              numberOfLines={1}
              style={[styles.name, { color: palette.text }]}
            >
              {attachment.filename}
            </Text>
            <Pressable
              testID="close-chat-video"
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel={t('关闭视频', 'Close video')}
              onPress={onClose}
            >
              <X size={22} color={palette.text} />
            </Pressable>
          </View>
          <View style={styles.stage}>
            {status.error ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setRetry(value => value + 1)}
                style={styles.retry}
              >
                <Text style={{ color: palette.rose }}>
                  {t(
                    '视频读取失败，点按重试',
                    'Could not open video. Tap to retry.',
                  )}
                </Text>
              </Pressable>
            ) : status.uri ? (
              <Video
                testID="chat-video-player"
                style={styles.player}
                source={{ uri: status.uri }}
                controls
                resizeMode="contain"
                paused
                playInBackground={false}
                playWhenInactive={false}
                onError={() => setStatus({ error: true })}
              />
            ) : (
              <ActivityIndicator
                color={palette.mint}
                accessibilityLabel={t('正在加载视频', 'Loading video')}
              />
            )}
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 48,
    maxWidth: '100%',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  name: { flexShrink: 1, fontSize: 14 },
  preview: { flex: 1 },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  close: {
    height: 44,
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  player: { width: '100%', height: '80%' },
  retry: { minHeight: 44, justifyContent: 'center' },
});
