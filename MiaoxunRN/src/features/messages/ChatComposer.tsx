import type { AIContextReference } from '../../models/aiTask';
import type { AssistMessageSource } from '../assist/assistMessageSource';
import { ContextReference } from '../ai/AIInteraction';
import React from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Keyboard as KeyboardIcon,
  Mic,
  Plus,
  Smile,
  X,
} from 'lucide-react-native';

import { displayText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { isLightPalette, Palette, productColors } from '../../shared/theme';
import { isXunPalette } from '../../shared/xunPalette';
import { ChatMessage, Language } from '../session/useMiaoxunSession';
import type { CustomStickerDTO } from '../../models/api';
import { chatLayoutStyles } from './chatLayoutStyles';
import type { ChatAttachmentDraft } from './useChatAttachments';
import { ChatComposerPanels, type ComposerTool } from './ChatComposerPanels';
import { ChatVoiceInput, type VoiceComposerControls } from './ChatVoiceInput';
export type { ComposerTool } from './ChatComposerPanels';

const quickCommandLongPressMs = 450;

function ChatQuickCommandRow({
  quickCommands,
  language,
  palette,
  inputBorder,
  xunTheme,
  onQuickCommand,
}: {
  quickCommands: string[];
  language: Language;
  palette: Palette;
  inputBorder: string;
  xunTheme: boolean;
  onQuickCommand?: (command: string) => void;
}) {
  const [offset, setOffset] = React.useState(0);
  const [viewportWidth, setViewportWidth] = React.useState(0);
  const [contentWidth, setContentWidth] = React.useState(0);
  const dragged = React.useRef(false);
  const touchStart = React.useRef({ x: 0, y: 0 });
  const dragStartOffset = React.useRef(0);
  const responderActive = React.useRef(false);
  const pressStart = React.useRef({ x: 0, y: 0 });
  const pressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    },
    [],
  );

  return (
    <View
      testID="chat-quick-commands"
      onStartShouldSetResponderCapture={(event: GestureResponderEvent) => {
        dragged.current = false;
        responderActive.current = false;
        touchStart.current = {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
        };
        return false;
      }}
      onMoveShouldSetResponderCapture={(event: GestureResponderEvent) => {
        const dx = event.nativeEvent.pageX - touchStart.current.x;
        const dy = event.nativeEvent.pageY - touchStart.current.y;
        const horizontal =
          Math.abs(dx) >= 8 && Math.abs(dx) > Math.abs(dy) * 1.25;
        if (horizontal) {
          dragged.current = true;
          responderActive.current = true;
        }
        return horizontal;
      }}
      onResponderGrant={() => {
        responderActive.current = true;
        dragStartOffset.current = offset;
      }}
      onResponderMove={(event: GestureResponderEvent) => {
        if (!responderActive.current) return;
        const dx = event.nativeEvent.pageX - touchStart.current.x;
        const maxOffset = Math.max(0, contentWidth - viewportWidth);
        setOffset(
          Math.min(maxOffset, Math.max(0, dragStartOffset.current - dx)),
        );
      }}
      onResponderRelease={() => {
        responderActive.current = false;
      }}
      onResponderTerminate={() => {
        responderActive.current = false;
      }}
      onLayout={event => setViewportWidth(event.nativeEvent.layout.width)}
      style={[
        accessStyles.quickCommandScroll,
        xunTheme && accessStyles.xunQuickCommandScroll,
      ]}
    >
      <View
        onLayout={event => setContentWidth(event.nativeEvent.layout.width)}
        style={[
          accessStyles.quickCommands,
          { transform: [{ translateX: -offset }] },
        ]}
      >
        {[...new Set(quickCommands)].map(command => (
          <Pressable
            key={command}
            accessibilityRole="button"
            accessibilityLabel={textFor(
              language,
              `使用快捷指令：${command}`,
              `Use quick command: ${command}`,
            )}
            onPress={() => {
              if (!dragged.current) onQuickCommand?.(command);
            }}
            onPressIn={event => {
              dragged.current = false;
              pressStart.current = {
                x: event.nativeEvent.pageX,
                y: event.nativeEvent.pageY,
              };
              if (pressTimer.current) clearTimeout(pressTimer.current);
              pressTimer.current = setTimeout(() => {
                dragged.current = true;
              }, quickCommandLongPressMs);
            }}
            onPressMove={event => {
              const dx = event.nativeEvent.pageX - pressStart.current.x;
              const dy = event.nativeEvent.pageY - pressStart.current.y;
              if (Math.abs(dx) >= 8 && Math.abs(dx) > Math.abs(dy) * 1.25) {
                dragged.current = true;
                if (pressTimer.current) {
                  clearTimeout(pressTimer.current);
                  pressTimer.current = null;
                }
              }
            }}
            onPressOut={() => {
              if (pressTimer.current) {
                clearTimeout(pressTimer.current);
                pressTimer.current = null;
              }
            }}
            style={({ pressed }) => [
              accessStyles.quickCommand,
              {
                backgroundColor: palette.surface,
                borderColor: inputBorder,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={{ color: palette.text }}>{command}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function ChatComposer({
  palette,
  language,
  threadTitle,
  draft,
  isSending,
  isRecognizingSpeech,
  voiceControls,
  chatVideoEnabled,
  replyTarget,
  contextRefs = [],
  attachments = [],
  attachmentBlockReason = '',
  onReviewAttachments,
  workspaceActions,
  quickCommands,
  contextAccessWarning,
  onOpenAgentAccess,
  onRemoveContextReference,
  onOpenContextReference,
  onChangeDraft,
  onClearReplyTarget,
  onFocusInput,
  onOpenAssistant,
  onComposerTool,
  onSelectStationSources,
  onVoiceInputUnavailable,
  onStartLongSpeech,
  onFinishLongSpeech,
  onSend,
  onQuickCommand,
  customStickers = [],
  token = '',
  customStickerState = 'idle',
  onRetryCustomStickers,
  onUploadCustomSticker,
  onDeleteCustomSticker,
  customStickerDeletingIds = [],
}: {
  palette: Palette;
  language: Language;
  threadTitle: string;
  draft: string;
  isSending: boolean;
  isRecognizingSpeech: boolean;
  voiceControls?: VoiceComposerControls;
  chatVideoEnabled?: boolean;
  replyTarget: ChatMessage | null;
  assistSource?: AssistMessageSource;
  contextRefs?: AIContextReference[];
  attachments?: ChatAttachmentDraft[];
  attachmentBlockReason?: string;
  onReviewAttachments?: (submittedText?: string) => void;
  workspaceActions?: React.ReactNode;
  quickCommands?: string[];
  contextAccessWarning?: string;
  onOpenAgentAccess?: () => void;
  onRemoveContextReference?: (index: number) => void;
  onOpenContextReference?: (reference: AIContextReference) => void;
  onChangeDraft: (value: string) => void;
  onClearReplyTarget: () => void;
  onFocusInput: () => void;
  onOpenAssistant?: () => void;
  onComposerTool?: (tool: ComposerTool) => void;
  onSelectStationSources?: () => void;
  onVoiceInputUnavailable?: () => void;
  onStartLongSpeech?: () => void;
  onFinishLongSpeech?: () => void;
  onSend: (stickerId?: string, submittedText?: string) => void;
  onQuickCommand?: (command: string) => void;
  customStickers?: CustomStickerDTO[];
  token?: string;
  customStickerState?: 'idle' | 'loading' | 'uploading' | 'error';
  onRetryCustomStickers?: () => void;
  onUploadCustomSticker?: () => void;
  onDeleteCustomSticker?: (stickerId: string) => void;
  customStickerDeletingIds?: string[];
}) {
  const [composerPanel, setComposerPanel] = React.useState<
    'tools' | 'emoji' | null
  >(null);
  const [voiceInputMode, setVoiceInputMode] = React.useState(false);
  const [accessibilityRecording, setAccessibilityRecording] =
    React.useState(false);
  const composerToolsOpen = composerPanel === 'tools';
  const emojiPickerOpen = composerPanel === 'emoji';
  const speechInput = React.useRef<'hold' | 'accessibility' | null>(null);
  React.useEffect(() => {
    if (isRecognizingSpeech) return;
    speechInput.current = null;
    if (accessibilityRecording) setAccessibilityRecording(false);
  }, [accessibilityRecording, isRecognizingSpeech]);
  const inputRef = React.useRef<TextInput>(null);
  const focusRequest = React.useRef<number | null>(null);
  const cancelInputFocus = React.useCallback(() => {
    if (focusRequest.current !== null) {
      cancelAnimationFrame(focusRequest.current);
      focusRequest.current = null;
    }
  }, []);
  const requestInputFocus = React.useCallback(() => {
    cancelInputFocus();
    focusRequest.current = requestAnimationFrame(() => {
      focusRequest.current = null;
      inputRef.current?.focus();
    });
  }, [cancelInputFocus]);
  React.useEffect(() => cancelInputFocus, [cancelInputFocus]);
  const previousVoiceInputMode = React.useRef(voiceInputMode);
  const inputSelection = React.useRef<{ start: number; end: number } | null>(
    null,
  );
  const latestDraft = React.useRef(draft);
  if (latestDraft.current !== draft) {
    latestDraft.current = draft;
    inputSelection.current = null;
  }
  React.useEffect(() => {
    if (!draft.trim()) {
      setComposerPanel(null);
    }
  }, [draft]);
  React.useEffect(() => {
    if (previousVoiceInputMode.current === voiceInputMode) return;
    previousVoiceInputMode.current = voiceInputMode;
    if (voiceInputMode) {
      Keyboard.dismiss();
      return;
    }
    if (composerPanel) return;
    requestInputFocus();
  }, [composerPanel, requestInputFocus, voiceInputMode]);
  const voiceBusy =
    voiceControls?.status === 'preparing' ||
    voiceControls?.status === 'recording' ||
    voiceControls?.status === 'finishing' ||
    voiceControls?.status === 'uploading';
  const hasDraft = Boolean(draft.trim());
  const canSubmitDraft = (text: string) =>
    (Boolean(text.trim()) ||
      attachments.some(item => item.status === 'ready')) &&
    !isSending &&
    !contextAccessWarning &&
    !attachmentBlockReason;
  const canSend = canSubmitDraft(draft);
  const xunTheme = isXunPalette(palette);
  const isLight = isLightPalette(palette);
  const accent = xunTheme || !isLight ? palette.mint : productColors.accent;
  const inputBorder = xunTheme
    ? palette.border
    : isLight
    ? productColors.chipBorder
    : palette.border;
  const toolCommands: Array<ComposerTool | '小站素材'> = [
    '妙猜猜',
    '相册',
    '拍摄',
    ...(chatVideoEnabled ? ['视频' as const] : []),
    '文件',
    '位置',
    '联系人',
    '任务',
    '文件库',
    ...(onSelectStationSources ? ['小站素材' as const] : []),
  ];
  const insertEmoji = (emoji: string) => {
    if (isSending) return;
    const selection = inputSelection.current;
    const start = Math.max(
      0,
      Math.min(selection?.start ?? draft.length, draft.length),
    );
    const end = Math.max(
      start,
      Math.min(selection?.end ?? start, draft.length),
    );
    const nextDraft = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    const cursor = start + emoji.length;
    const nextSelection = { start: cursor, end: cursor };
    latestDraft.current = nextDraft;
    inputSelection.current = nextSelection;
    onChangeDraft(nextDraft);
    requestAnimationFrame(() => {
      if (
        latestDraft.current !== nextDraft ||
        inputSelection.current !== nextSelection
      )
        return;
      inputRef.current?.setSelection(cursor, cursor);
    });
  };
  React.useEffect(() => {
    if (!onVoiceInputUnavailable) return;
    setVoiceInputMode(false);
    speechInput.current = null;
    setAccessibilityRecording(false);
  }, [onVoiceInputUnavailable]);

  const toggleVoiceInputMode = () => {
    if (onVoiceInputUnavailable && !voiceInputMode) {
      onVoiceInputUnavailable();
      return;
    }
    if (
      isSending ||
      isRecognizingSpeech ||
      voiceBusy ||
      speechInput.current === 'accessibility'
    )
      return;
    cancelInputFocus();
    setComposerPanel(null);
    setVoiceInputMode(current => !current);
  };
  const startSpeech = (input: 'hold' | 'accessibility') => {
    if (onVoiceInputUnavailable) {
      onVoiceInputUnavailable();
      return;
    }
    if (
      !onStartLongSpeech ||
      speechInput.current ||
      isRecognizingSpeech ||
      isSending
    )
      return;
    speechInput.current = input;
    if (input === 'accessibility') setAccessibilityRecording(true);
    onStartLongSpeech();
  };
  const finishSpeech = () => {
    speechInput.current = null;
    setAccessibilityRecording(false);
    onFinishLongSpeech?.();
  };
  const activateSpeech = () => {
    if (!onFinishLongSpeech) return;
    if (speechInput.current === 'accessibility') finishSpeech();
    else startSpeech('accessibility');
  };
  const submitDraft = (text: string) => {
    if (!canSubmitDraft(text)) return;
    cancelInputFocus();
    setComposerPanel(null);
    if (onReviewAttachments && attachments.length) {
      onReviewAttachments(text);
      return;
    }
    onSend(undefined, text);
  };

  return (
    <View
      style={[
        chatLayoutStyles.composer,
        xunTheme && accessStyles.xunComposer,
        {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
        },
      ]}
    >
      {workspaceActions}
      {contextAccessWarning ? (
        <Pressable
          testID="chat-context-access"
          accessibilityRole="button"
          accessibilityLabel={contextAccessWarning}
          onPress={onOpenAgentAccess}
          style={accessStyles.warning}
        >
          <Text style={{ color: palette.text }}>{contextAccessWarning}</Text>
          <Text style={{ color: palette.secondaryText }}>
            {textFor(
              language,
              '查看并确认授权，或移除引用',
              'Review access, or remove the reference',
            )}
          </Text>
        </Pressable>
      ) : null}
      <ContextReference
        references={contextRefs}
        onRemove={onRemoveContextReference}
        palette={palette}
        language={language}
        token={token}
        onPressReference={onOpenContextReference}
      />
      {onReviewAttachments && attachments.length ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onReviewAttachments()}
          style={accessStyles.reviewAttachments}
        >
          <Text style={{ color: palette.mint }}>
            {textFor(
              language,
              `查看待发附件（${attachments.length}）`,
              `Review pending attachments (${attachments.length})`,
            )}
          </Text>
        </Pressable>
      ) : null}
      {replyTarget ? (
        <View
          style={[
            styles.replyComposer,
            {
              backgroundColor: palette.soft,
              borderLeftColor: palette.mint,
            },
          ]}
        >
          <View style={styles.replyComposerText}>
            <Text
              style={[
                styles.replyPreviewName,
                { color: palette.secondaryText },
              ]}
            >
              {textFor(language, '回复', 'Reply')}{' '}
              {displayText(language, replyTarget.senderName)}
            </Text>
            <Text
              style={[
                styles.replyPreviewContent,
                { color: palette.secondaryText },
              ]}
              numberOfLines={1}
            >
              {displayText(language, replyTarget.content)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textFor(language, '取消回复', 'Cancel reply')}
            onPress={onClearReplyTarget}
            style={chatLayoutStyles.composerButton}
          >
            <Text
              style={[
                styles.messageActionText,
                { color: palette.secondaryText },
              ]}
            >
              ×
            </Text>
          </Pressable>
        </View>
      ) : null}
      {quickCommands?.length ? (
        <ChatQuickCommandRow
          quickCommands={quickCommands}
          language={language}
          palette={palette}
          inputBorder={inputBorder}
          xunTheme={xunTheme}
          onQuickCommand={onQuickCommand}
        />
      ) : null}
      <View
        testID="chat-composer-actions"
        style={[
          chatLayoutStyles.composerRow,
          xunTheme && accessStyles.xunComposerRow,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(
            language,
            voiceInputMode ? '切换键盘输入' : '切换语音输入',
            voiceInputMode
              ? 'Switch to keyboard input'
              : 'Switch to voice input',
          )}
          accessibilityState={{
            disabled: isRecognizingSpeech || voiceBusy || isSending,
          }}
          disabled={isRecognizingSpeech || voiceBusy || isSending}
          onPress={toggleVoiceInputMode}
          style={[
            chatLayoutStyles.composerButton,
            accessStyles.rowAction,
            (isRecognizingSpeech || voiceBusy || isSending) &&
              styles.disabledButton,
          ]}
        >
          <View>
            {voiceInputMode ? (
              <KeyboardIcon color={palette.text} size={23} strokeWidth={1.8} />
            ) : (
              <Mic color={palette.text} size={23} strokeWidth={1.8} />
            )}
          </View>
        </Pressable>
        {voiceInputMode && voiceControls ? (
          <ChatVoiceInput
            controls={voiceControls}
            palette={palette}
            language={language}
            borderColor={inputBorder}
            disabled={isSending}
          />
        ) : voiceInputMode ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              accessibilityRecording
                ? textFor(language, '结束录音', 'Stop recording')
                : textFor(language, '按住说话', 'Hold to talk')
            }
            accessibilityHint={
              Platform.OS === 'ios' && !accessibilityRecording
                ? textFor(
                    language,
                    '双击开始录音，再双击结束。',
                    'Double-tap to start recording, then double-tap again to stop.',
                  )
                : undefined
            }
            accessibilityState={{
              disabled: isSending && !accessibilityRecording,
              busy: isRecognizingSpeech,
            }}
            disabled={isSending && !accessibilityRecording}
            onAccessibilityTap={
              Platform.OS === 'ios' ? activateSpeech : undefined
            }
            onPressIn={() => startSpeech('hold')}
            onPressOut={() => {
              if (speechInput.current === 'hold') finishSpeech();
            }}
            style={[
              accessStyles.voiceInput,
              {
                backgroundColor: palette.input,
                borderColor: inputBorder,
              },
            ]}
          >
            {isRecognizingSpeech ? (
              <ActivityIndicator color={palette.mint} size="small" />
            ) : null}
            <Text style={{ color: palette.secondaryText }}>
              {accessibilityRecording
                ? textFor(language, '录音中', 'Recording')
                : textFor(
                    language,
                    isRecognizingSpeech ? '松开结束' : '按住说话',
                    isRecognizingSpeech ? 'Release to finish' : 'Hold to talk',
                  )}
            </Text>
          </Pressable>
        ) : (
          <View
            style={[
              accessStyles.editor,
              {
                backgroundColor: palette.input,
                borderColor: inputBorder,
              },
            ]}
          >
            <TextInput
              ref={inputRef}
              accessibilityLabel={textFor(
                language,
                '消息输入框',
                'Message input',
              )}
              value={draft}
              placeholder={textFor(
                language,
                `发给${threadTitle}`,
                `Message ${displayText(language, threadTitle)}`,
              )}
              placeholderTextColor={palette.secondaryText}
              multiline
              returnKeyType="send"
              submitBehavior="submit"
              onSubmitEditing={event => submitDraft(event.nativeEvent.text)}
              // Keep decoration and spacing outside the native scrolling text
              // viewport so its last line and caret have an unobstructed edge.
              scrollEnabled
              onChangeText={value => {
                latestDraft.current = value;
                inputSelection.current = null;
                onChangeDraft(value);
              }}
              onSelectionChange={event => {
                inputSelection.current = event.nativeEvent.selection;
              }}
              onFocus={() => {
                setComposerPanel(null);
                onFocusInput();
              }}
              style={[
                chatLayoutStyles.input,
                {
                  color: palette.text,
                },
              ]}
            />
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(
            language,
            emojiPickerOpen ? '切换键盘输入' : '添加表情',
            emojiPickerOpen ? 'Switch to keyboard input' : 'Add emoji',
          )}
          accessibilityState={{
            expanded: emojiPickerOpen,
            disabled: isSending || voiceBusy,
          }}
          disabled={isSending || voiceBusy}
          onPress={() => {
            cancelInputFocus();
            if (emojiPickerOpen) {
              setComposerPanel(null);
              requestInputFocus();
            } else {
              if (speechInput.current === 'accessibility') finishSpeech();
              setVoiceInputMode(false);
              Keyboard.dismiss();
              setComposerPanel('emoji');
            }
          }}
          style={[
            chatLayoutStyles.composerButton,
            accessStyles.rowAction,
            isSending && styles.disabledButton,
          ]}
        >
          {emojiPickerOpen ? (
            <KeyboardIcon color={palette.text} size={24} strokeWidth={1.7} />
          ) : (
            <Smile color={palette.text} size={24} strokeWidth={1.7} />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '更多功能', 'More features')}
          accessibilityState={{
            expanded: composerToolsOpen,
            disabled: isSending || voiceBusy,
          }}
          disabled={isSending || voiceBusy}
          onPress={() => {
            if (isSending) return;
            cancelInputFocus();
            if (!composerToolsOpen) {
              if (speechInput.current === 'accessibility') finishSpeech();
              setVoiceInputMode(false);
              Keyboard.dismiss();
            }
            setComposerPanel(composerToolsOpen ? null : 'tools');
          }}
          style={[chatLayoutStyles.composerButton, accessStyles.rowAction]}
        >
          {composerToolsOpen ? (
            <X color={palette.text} size={24} strokeWidth={1.7} />
          ) : (
            <Plus color={palette.text} size={24} strokeWidth={1.7} />
          )}
        </Pressable>
      </View>
      {composerPanel ? (
        <ChatComposerPanels
          panel={composerPanel}
          palette={palette}
          language={language}
          isSending={isSending}
          token={token}
          tools={toolCommands}
          customStickers={customStickers}
          customStickerState={customStickerState}
          customStickerDeletingIds={customStickerDeletingIds}
          footer={
            hasDraft || attachments.length > 0 || isSending ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={textFor(
                  language,
                  '发送消息',
                  'Send message',
                )}
                accessibilityState={{ disabled: !canSend, busy: isSending }}
                disabled={!canSend}
                onPress={() => submitDraft(draft)}
                style={[
                  chatLayoutStyles.send,
                  { backgroundColor: accent },
                  !canSend && styles.disabledButton,
                ]}
              >
                <Text
                  style={[
                    chatLayoutStyles.sendText,
                    xunTheme && { color: palette.text },
                  ]}
                >
                  {textFor(
                    language,
                    isSending ? '发送中' : '发送',
                    isSending ? 'Sending' : 'Send',
                  )}
                </Text>
              </Pressable>
            ) : null
          }
          onClose={() => setComposerPanel(null)}
          onSelectEmoji={insertEmoji}
          onSelectTool={command => {
            if (isSending) return;
            setComposerPanel(null);
            if (command === '妙猜猜') onOpenAssistant?.();
            else if (command === '小站素材') onSelectStationSources?.();
            else onComposerTool?.(command);
          }}
          onSendSticker={id => onSend(id)}
          onRetryCustomStickers={onRetryCustomStickers}
          onUploadCustomSticker={onUploadCustomSticker}
          onDeleteCustomSticker={onDeleteCustomSticker}
        />
      ) : null}
    </View>
  );
}

const accessStyles = StyleSheet.create({
  editor: {
    flex: 1,
    minWidth: 0,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  xunComposer: {
    borderTopWidth: 0,
    gap: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 8,
  },
  xunComposerRow: {
    alignItems: 'flex-end',
    gap: 2,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 0,
  },
  rowAction: {
    width: 44,
    minWidth: 44,
    height: 44,
    minHeight: 44,
    paddingHorizontal: 0,
  },
  voiceInput: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 12,
  },
  warning: { paddingVertical: 8 },
  reviewAttachments: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  quickCommands: {
    gap: 8,
    flexDirection: 'row',
    alignSelf: 'flex-start',
    paddingLeft: 2,
    paddingRight: 96,
    flexGrow: 0,
  },
  quickCommand: {
    borderRadius: 18,
    borderWidth: 1,
    flexShrink: 0,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  quickCommandScroll: {
    width: '100%',
    flexGrow: 0,
    flexShrink: 1,
    overflow: 'hidden',
  },
  xunQuickCommandScroll: {
    borderBottomWidth: 1,
    borderBottomColor: '#CAD5E0',
    paddingHorizontal: 15,
    paddingVertical: 6,
  },
});
