import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { FileText, Film, X } from 'lucide-react-native';
import { textFor } from '../../shared/i18n';
import type { Palette } from '../../shared/theme';
import { useReduceMotion } from '../../shared/useReduceMotion';
import type { Language } from '../session/sessionTypes';
import type { ChatAttachmentDraft } from './useChatAttachments';

export function ChatAttachmentReview({
  items,
  draft,
  palette,
  language,
  busy,
  sendBlockReason,
  onClose,
  onRetry,
  onRemove,
  onSend,
}: {
  items: ChatAttachmentDraft[];
  draft: string;
  palette: Palette;
  language: Language;
  busy: boolean;
  sendBlockReason: string;
  onClose: () => void;
  onRetry: (key: string) => void;
  onRemove: (key: string) => void;
  onSend: () => void;
}) {
  const reduceMotion = useReduceMotion();
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const blocked = busy || !!sendBlockReason || !items.length;
  return (
    <Modal
      presentationStyle="fullScreen"
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView
          testID="chat-attachment-review"
          style={[s.screen, { backgroundColor: palette.background }]}
        >
          <View style={[s.header, { borderBottomColor: palette.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('返回聊天', 'Return to chat')}
              onPress={onClose}
              style={s.hit}
            >
              <X color={palette.text} size={22} />
            </Pressable>
            <Text
              accessibilityRole="header"
              style={[s.title, { color: palette.text }]}
            >
              {t('发送预览', 'Review attachments')}
            </Text>
            <View style={s.hit} />
          </View>
          <ScrollView contentContainerStyle={s.list}>
            {items.map(item => (
              <View
                key={item.clientKey}
                style={[s.card, { backgroundColor: palette.surface }]}
              >
                {item.kind === 'image' && item.localUri ? (
                  <Image
                    source={{ uri: item.localUri }}
                    resizeMode="contain"
                    accessibilityLabel={item.filename}
                    style={[s.image, { backgroundColor: palette.soft }]}
                  />
                ) : null}
                <View style={s.row}>
                  {item.kind === 'video' ? (
                    <Film color={palette.secondaryText} size={20} />
                  ) : null}
                  {item.kind === 'file' ? (
                    <FileText color={palette.secondaryText} size={20} />
                  ) : null}
                  <Text
                    numberOfLines={1}
                    style={[s.filename, { color: palette.text }]}
                  >
                    {item.filename}
                  </Text>
                  {item.status === 'uploading' ? (
                    <ActivityIndicator
                      color={palette.mint}
                      accessibilityLabel={t('上传中', 'Uploading')}
                    />
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      `移除${item.filename}`,
                      `Remove ${item.filename}`,
                    )}
                    onPress={() => onRemove(item.clientKey)}
                    style={s.hit}
                  >
                    <X color={palette.secondaryText} size={18} />
                  </Pressable>
                </View>
                {item.status === 'failed' ? (
                  <View style={s.row}>
                    <Text style={[s.filename, { color: palette.rose }]}>
                      {item.error || t('上传失败', 'Upload failed')}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => onRetry(item.clientKey)}
                      style={s.hit}
                    >
                      <Text style={{ color: palette.mint }}>
                        {t('重试', 'Retry')}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
            {draft.trim() ? (
              <Text
                style={[
                  s.draft,
                  { backgroundColor: palette.surface, color: palette.text },
                ]}
              >
                {draft.trim()}
              </Text>
            ) : null}
            {!items.length ? (
              <Text style={{ color: palette.secondaryText }}>
                {t('未选择附件', 'No attachments selected')}
              </Text>
            ) : null}
          </ScrollView>
          <View style={[s.footer, { borderTopColor: palette.border }]}>
            {sendBlockReason ? (
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: palette.secondaryText }}
              >
                {sendBlockReason}
              </Text>
            ) : null}
            <Pressable
              testID="chat-attachment-review-send"
              accessibilityRole="button"
              accessibilityState={{ disabled: blocked, busy }}
              disabled={blocked}
              onPress={onSend}
              style={[
                s.send,
                { backgroundColor: palette.mint },
                blocked && s.disabled,
              ]}
            >
              <Text style={s.sendText}>
                {t(`发送（${items.length}）`, `Send (${items.length})`)}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  title: { fontSize: 17, fontWeight: '700' },
  hit: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  list: { gap: 12, padding: 16 },
  card: { borderRadius: 14, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 1.6 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingLeft: 12 },
  filename: { flex: 1 },
  draft: { borderRadius: 14, padding: 12 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, gap: 8, padding: 16 },
  send: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
  },
  sendText: { color: '#092522', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
