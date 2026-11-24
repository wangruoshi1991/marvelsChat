import React, { useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Check, X } from 'lucide-react-native';

import { appErrorText, displayText, textFor } from '../../shared/i18n';
import type { Palette } from '../../shared/theme';
import { useCurrentScope } from '../../shared/useCurrentScope';
import { useReduceMotion } from '../../shared/useReduceMotion';
import { UserAvatar } from '../avatar/AvatarBadges';
import type { ChatThread, Language } from '../session/sessionTypes';

export function ChatForwardSheet({
  sourceLabel,
  threads,
  palette,
  language,
  onClose,
  onForward,
}: {
  sourceLabel: string;
  threads: ChatThread[];
  palette: Palette;
  language: Language;
  onClose: () => void;
  onForward: (destination: ChatThread) => Promise<void>;
}) {
  const reduceMotion = useReduceMotion();
  const isCurrent = useCurrentScope(null);
  const submitLock = useRef(false);
  const [selection, setSelection] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const destination = threads.find(thread => thread.id === selection);
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const destinationTitle = displayText(language, destination?.title);
  const title = t('转发消息', 'Forward message');
  const submitLabel = sending
    ? t('正在转发', 'Forwarding')
    : t('确认转发', 'Confirm forwarding');
  const close = () => {
    if (!submitLock.current) onClose();
  };
  const submit = async () => {
    if (!destination || submitLock.current) return;
    submitLock.current = true;
    setSending(true);
    setError('');
    try {
      await onForward(destination);
    } catch (failure) {
      if (!isCurrent()) return;
      setError(
        appErrorText(
          language,
          failure,
          '暂时无法转发，请重试。',
          'Could not forward the message. Try again.',
        ),
      );
      submitLock.current = false;
      setSending(false);
      return;
    }
    if (isCurrent()) onClose();
  };

  return (
    <Modal
      visible
      presentationStyle="fullScreen"
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={close}
    >
      <SafeAreaProvider>
        <SafeAreaView
          accessibilityViewIsModal
          onAccessibilityEscape={close}
          testID="chat-forward-sheet"
          style={[styles.screen, { backgroundColor: palette.background }]}
        >
          <View style={[styles.header, { borderBottomColor: palette.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('取消转发', 'Cancel forwarding')}
              accessibilityState={{ disabled: sending }}
              disabled={sending}
              onPress={close}
              style={[styles.close, sending && styles.disabled]}
              testID="chat-forward-cancel"
            >
              <X size={22} color={palette.text} />
            </Pressable>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: palette.text }]}
            >
              {title}
            </Text>
            <View style={styles.close} />
          </View>
          <FlatList
            data={threads}
            keyExtractor={thread => thread.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.source,
                    { backgroundColor: palette.soft, color: palette.text },
                  ]}
                >
                  {sourceLabel}
                </Text>
                <Text
                  accessibilityRole="header"
                  style={[styles.label, { color: palette.secondaryText }]}
                >
                  {t('选择会话', 'Choose a conversation')}
                </Text>
              </View>
            }
            ListEmptyComponent={
              <Text style={{ color: palette.secondaryText }}>
                {t('暂无可转发的会话', 'No conversations available')}
              </Text>
            }
            renderItem={({ item }) => {
              const checked = item.id === selection;
              const name = displayText(language, item.title);
              const kind =
                item.kind === 'group'
                  ? t('群聊', 'Group chat')
                  : t('单聊', 'Direct chat');
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel={`${name}, ${kind}`}
                  accessibilityState={{ checked, disabled: sending }}
                  disabled={sending}
                  onPress={() => {
                    if (submitLock.current) return;
                    setSelection(item.id);
                    if (selection !== item.id) setError('');
                  }}
                  style={[
                    styles.choice,
                    {
                      backgroundColor: palette.surface,
                      borderColor: checked ? palette.mint : palette.border,
                    },
                  ]}
                  testID={`chat-forward-choice-${item.id}`}
                >
                  <UserAvatar
                    text={item.avatarText}
                    palette={palette}
                    size={40}
                  />
                  <View style={styles.choiceCopy}>
                    <Text
                      numberOfLines={2}
                      style={[styles.choiceTitle, { color: palette.text }]}
                    >
                      {name}
                    </Text>
                    <Text style={{ color: palette.secondaryText }}>{kind}</Text>
                  </View>
                  {checked ? <Check size={20} color={palette.text} /> : null}
                </Pressable>
              );
            }}
          />
          <View style={[styles.footer, { borderTopColor: palette.border }]}>
            {destination ? (
              <Text
                numberOfLines={2}
                style={{ color: palette.secondaryText }}
                testID="chat-forward-destination"
              >
                {t(
                  `转发给 ${destinationTitle}`,
                  `Forward to ${destinationTitle}`,
                )}
              </Text>
            ) : null}
            {error ? (
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={{ color: palette.text }}
                testID="chat-forward-error"
              >
                {error}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={submitLabel}
              accessibilityHint={destinationTitle}
              accessibilityState={{
                disabled: !destination || sending,
                busy: sending,
              }}
              disabled={!destination || sending}
              onPress={submit}
              style={[
                styles.confirm,
                { backgroundColor: palette.text },
                (!destination || sending) && styles.disabled,
              ]}
              testID="chat-forward-confirm"
            >
              <Text style={[styles.confirmText, { color: palette.background }]}>
                {submitLabel}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  close: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    width: 48,
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  list: { gap: 8, padding: 16 },
  listHeader: { gap: 12 },
  source: { borderRadius: 12, padding: 12, fontSize: 15, lineHeight: 21 },
  label: { fontSize: 14, fontWeight: '600' },
  choice: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceCopy: { flex: 1, minWidth: 0, gap: 2 },
  choiceTitle: { fontSize: 16, fontWeight: '600' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, gap: 8, padding: 16 },
  confirm: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
    padding: 10,
  },
  confirmText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.48 },
});
