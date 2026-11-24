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
import { Check, ChevronLeft, X } from 'lucide-react-native';
import { appErrorText, displayText, textFor } from '../../shared/i18n';
import type { Palette } from '../../shared/theme';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';
import { useCurrentScope } from '../../shared/useCurrentScope';
import { useReduceMotion } from '../../shared/useReduceMotion';
import type {
  ChatMessage,
  ChatThread,
  Language,
} from '../session/sessionTypes';
import {
  forwardMessageLabel,
  maxForwardSelection,
  selectableForwardMessages,
  selectableForwardTargets,
  selectedForwardMessages,
} from './chatMessageSelection';

type Result = {
  message: ChatMessage;
  requestKey: string;
  keyScope: string;
  status: 'waiting' | 'sending' | 'sent' | 'failed';
  error: string;
};

type Props = {
  scope: string;
  sourceThreadId: string;
  initialMessageId: string;
  messages: ChatMessage[];
  threads: ChatThread[];
  requestKeys: Map<string, string>;
  palette: Palette;
  language: Language;
  onClose: () => void;
  onForward: (
    message: ChatMessage,
    destination: ChatThread,
    clientMessageId: string,
  ) => Promise<void>;
};

/** Every selected message is a separate server transaction with its own receipt. */
export function ChatBatchForwardSheet({
  scope,
  sourceThreadId,
  initialMessageId,
  messages,
  threads,
  requestKeys,
  palette,
  language,
  onClose,
  onForward,
}: Props) {
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const reduceMotion = useReduceMotion();
  const isCurrent = useCurrentScope(scope);
  const [step, setStep] = useState<'select' | 'target' | 'results'>('select');
  const [selected, setSelected] = useState(() => new Set([initialMessageId]));
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  const frozenDestination = useRef<ChatThread | null>(null);
  const rows = useRef<Result[]>([]);
  const available = selectableForwardMessages(messages, sourceThreadId);
  const choices = selectedForwardMessages(available, selected);
  const destinations = selectableForwardTargets(threads, sourceThreadId);
  const destination = destinations.find(thread => thread.id === destinationId);
  const close = () => {
    if (!locked.current) onClose();
  };
  const back = () => {
    if (locked.current) return;
    if (step === 'target') setStep('select');
    else close();
  };
  const updateRow = (id: string, status: Result['status'], error = '') => {
    rows.current = rows.current.map(row =>
      row.message.id === id ? { ...row, status, error } : row,
    );
    if (isCurrent()) setResults(rows.current);
  };
  const run = async (messageIds: string[]) => {
    const target = frozenDestination.current;
    if (!target || locked.current || !isCurrent()) return;
    locked.current = true;
    setBusy(true);
    const attempts = rows.current.filter(
      row => messageIds.includes(row.message.id) && row.status !== 'sent',
    );
    try {
      for (const row of attempts) {
        if (!isCurrent()) return;
        updateRow(row.message.id, 'sending');
        try {
          await onForward(row.message, target, row.requestKey);
          if (!isCurrent()) return;
          updateRow(row.message.id, 'sent');
          requestKeys.delete(row.keyScope);
        } catch (error) {
          if (!isCurrent()) return;
          updateRow(
            row.message.id,
            'failed',
            appErrorText(
              language,
              error,
              '未确认转发成功，可重试此条。',
              'Forwarding was not confirmed. Retry this message.',
            ),
          );
        }
      }
    } finally {
      locked.current = false;
      if (isCurrent()) setBusy(false);
    }
  };
  const confirm = () => {
    if (!destination || !choices.length || locked.current || step !== 'target')
      return;
    frozenDestination.current = destination;
    rows.current = choices.map(message => {
      const keyScope = `${scope}:${message.id}:${destination.id}`;
      const requestKey = requestKeys.get(keyScope) || createIdempotencyKey();
      requestKeys.set(keyScope, requestKey);
      return { message, requestKey, keyScope, status: 'waiting', error: '' };
    });
    setResults(rows.current);
    setStep('results');
    run(rows.current.map(row => row.message.id));
  };
  const sent = results.filter(row => row.status === 'sent').length;
  const failures = results.filter(row => row.status === 'failed');
  const footerLabel =
    step === 'select'
      ? t(`下一步（${choices.length}）`, `Next (${choices.length})`)
      : step === 'target'
      ? t(
          `确认逐条转发 ${choices.length} 条`,
          `Forward ${choices.length} messages individually`,
        )
      : busy
      ? t('正在逐条转发', 'Forwarding messages')
      : failures.length
      ? t(
          `重试失败项（${failures.length}）`,
          `Retry failed (${failures.length})`,
        )
      : t('完成', 'Done');
  const disabled =
    busy ||
    (step === 'select' && !choices.length) ||
    (step === 'target' && (!destination || !choices.length));
  const rowColor = { color: palette.text };
  const secondaryColor = { color: palette.secondaryText };
  return (
    <Modal
      visible
      presentationStyle="fullScreen"
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={back}
    >
      <SafeAreaProvider>
        <SafeAreaView
          accessibilityViewIsModal
          onAccessibilityEscape={back}
          testID="chat-batch-forward-sheet"
          style={[s.screen, { backgroundColor: palette.background }]}
        >
          <View style={[s.header, { borderBottomColor: palette.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                step === 'target'
                  ? t('返回多选', 'Back to selection')
                  : t('关闭多选转发', 'Close multiple forwarding')
              }
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              testID="chat-batch-close"
              style={s.icon}
              onPress={back}
            >
              {step === 'target' ? (
                <ChevronLeft color={palette.text} size={22} />
              ) : (
                <X color={palette.text} size={22} />
              )}
            </Pressable>
            <Text accessibilityRole="header" style={[s.title, rowColor]}>
              {step === 'select'
                ? t('多选消息', 'Select messages')
                : step === 'target'
                ? t('选择目标会话', 'Choose destination')
                : t('转发结果', 'Forwarding results')}
            </Text>
            <View style={s.icon} />
          </View>
          {step === 'select' ? (
            <FlatList
              data={available}
              keyExtractor={item => item.id}
              contentContainerStyle={s.list}
              ListHeaderComponent={
                <Text style={secondaryColor}>
                  {t(
                    `当前已加载的可转发消息，最多选择 ${maxForwardSelection} 条。`,
                    `Loaded messages available to forward. Select up to ${maxForwardSelection}.`,
                  )}
                </Text>
              }
              ListEmptyComponent={
                <Text style={secondaryColor}>
                  {t('暂无可转发的消息', 'No messages available to forward')}
                </Text>
              }
              renderItem={({ item }) => {
                const checked = selected.has(item.id);
                return (
                  <Pressable
                    testID={`chat-batch-message-${item.id}`}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${
                      item.senderName
                    }: ${forwardMessageLabel(item, language)}`}
                    accessibilityState={{ checked }}
                    style={[
                      s.row,
                      { borderColor: checked ? palette.mint : palette.border },
                    ]}
                    onPress={() => {
                      if (locked.current) return;
                      const next = new Set(choices.map(message => message.id));
                      if (next.has(item.id)) next.delete(item.id);
                      else if (next.size < maxForwardSelection)
                        next.add(item.id);
                      else {
                        setNotice(
                          t(
                            `最多选择 ${maxForwardSelection} 条。`,
                            `Select up to ${maxForwardSelection} messages.`,
                          ),
                        );
                        return;
                      }
                      setNotice('');
                      setSelected(next);
                    }}
                  >
                    <View
                      style={[
                        s.checkbox,
                        {
                          borderColor: checked ? palette.mint : palette.border,
                        },
                      ]}
                    >
                      {checked ? (
                        <Check size={17} color={palette.mint} />
                      ) : null}
                    </View>
                    <View style={s.copy}>
                      <Text
                        numberOfLines={1}
                        style={[s.sender, secondaryColor]}
                      >
                        {item.senderName}
                      </Text>
                      <Text numberOfLines={3} style={rowColor}>
                        {forwardMessageLabel(item, language)}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          ) : step === 'target' ? (
            <FlatList
              data={destinations}
              keyExtractor={item => item.id}
              contentContainerStyle={s.list}
              ListHeaderComponent={
                <Text style={secondaryColor}>
                  {t(
                    `将按聊天顺序逐条转发 ${choices.length} 条消息。`,
                    `${choices.length} messages will be forwarded individually in chat order.`,
                  )}
                </Text>
              }
              ListEmptyComponent={
                <Text style={secondaryColor}>
                  {t('暂无可转发的会话', 'No conversations available')}
                </Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  testID={`chat-batch-target-${item.id}`}
                  accessibilityRole="radio"
                  accessibilityLabel={displayText(language, item.title)}
                  accessibilityState={{ checked: destinationId === item.id }}
                  onPress={() => setDestinationId(item.id)}
                  style={[
                    s.row,
                    {
                      borderColor:
                        destinationId === item.id
                          ? palette.mint
                          : palette.border,
                    },
                  ]}
                >
                  <View style={s.copy}>
                    <Text
                      numberOfLines={2}
                      style={[s.destinationTitle, rowColor]}
                    >
                      {displayText(language, item.title)}
                    </Text>
                    <Text style={secondaryColor}>
                      {item.kind === 'group'
                        ? t('群聊', 'Group chat')
                        : t('单聊', 'Direct chat')}
                    </Text>
                  </View>
                  {destinationId === item.id ? (
                    <Check color={palette.mint} size={20} />
                  ) : null}
                </Pressable>
              )}
            />
          ) : (
            <FlatList
              data={results}
              keyExtractor={item => item.message.id}
              contentContainerStyle={s.list}
              ListHeaderComponent={
                <View style={s.summary}>
                  <Text style={rowColor}>
                    {t('目标：', 'To: ')}
                    {displayText(language, frozenDestination.current?.title)}
                  </Text>
                  <Text
                    accessibilityLiveRegion="polite"
                    testID="chat-batch-summary"
                    style={secondaryColor}
                  >
                    {t(
                      `已成功 ${sent} 条，未确认 ${failures.length} 条，共 ${results.length} 条。`,
                      `${sent} sent, ${failures.length} unconfirmed, ${results.length} total.`,
                    )}
                  </Text>
                  <Text style={secondaryColor}>
                    {t(
                      '每条独立发送；重试不会重发已成功的消息。',
                      'Messages send separately. Retrying does not resend confirmed messages.',
                    )}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View
                  testID={`chat-batch-result-${item.message.id}`}
                  style={[s.result, { borderColor: palette.border }]}
                >
                  <Text numberOfLines={2} style={rowColor}>
                    {forwardMessageLabel(item.message, language)}
                  </Text>
                  <Text style={secondaryColor}>
                    {item.status === 'sent'
                      ? t('已转发', 'Forwarded')
                      : item.status === 'sending'
                      ? t('正在发送', 'Sending')
                      : item.status === 'waiting'
                      ? t('等待发送', 'Waiting')
                      : item.error}
                  </Text>
                  {item.status === 'failed' ? (
                    <Pressable
                      testID={`chat-batch-retry-${item.message.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={t('重试此条', 'Retry this message')}
                      accessibilityState={{ disabled: busy }}
                      disabled={busy}
                      onPress={() => run([item.message.id])}
                      style={[
                        s.retry,
                        { borderColor: palette.border },
                        busy && s.disabled,
                      ]}
                    >
                      <Text style={rowColor}>
                        {t('重试此条', 'Retry this message')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            />
          )}
          <View style={[s.footer, { borderTopColor: palette.border }]}>
            {notice && step === 'select' ? (
              <Text accessibilityRole="alert" style={rowColor}>
                {notice}
              </Text>
            ) : null}
            {step === 'target' && destination ? (
              <Text numberOfLines={2} style={secondaryColor}>
                {t('转发给 ', 'Forward to ')}
                {displayText(language, destination.title)}
              </Text>
            ) : null}
            <Pressable
              testID="chat-batch-confirm"
              accessibilityRole="button"
              accessibilityLabel={footerLabel}
              accessibilityState={{ disabled, busy }}
              disabled={disabled}
              style={[
                s.confirm,
                { backgroundColor: palette.text },
                disabled && s.disabled,
              ]}
              onPress={() => {
                if (locked.current) return;
                if (step === 'select') {
                  if (choices.length) setStep('target');
                } else if (step === 'target') confirm();
                else if (failures.length)
                  run(failures.map(row => row.message.id));
                else close();
              }}
            >
              <Text style={[s.confirmText, { color: palette.background }]}>
                {footerLabel}
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
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  icon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  list: { padding: 16, gap: 10 },
  row: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  sender: { fontSize: 12 },
  destinationTitle: { fontSize: 16, fontWeight: '600' },
  summary: { gap: 6, marginBottom: 4 },
  result: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  retry: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16, gap: 8 },
  confirm: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  confirmText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.48 },
});
