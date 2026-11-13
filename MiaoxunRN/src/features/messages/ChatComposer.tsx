import type { AIContextReference } from '../../models/aiTask';
import type { AssistMessageSource } from '../assist/assistMessageSource';
import { ContextReference } from '../ai/AIInteraction';
import React from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Camera,
  ContactRound,
  FileText,
  FolderOpen,
  Images,
  Lightbulb,
  ListChecks,
  MapPin,
  Mic,
  Plus,
  Smile,
  X,
} from 'lucide-react-native';

import { displayText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { isLightPalette, Palette, productColors } from '../../shared/theme';
import { isV6Palette, v6Colors } from '../../shared/v6Palette';
import { isXunPalette } from '../../shared/xunPalette';
import { ChatMessage, Language } from '../session/useMiaoxunSession';
import { chatLayoutStyles } from './chatLayoutStyles';

const minInputHeight = 44;
const maxInputHeight = 132;
const inputLineHeight = 21;
const inputVerticalPadding = 22;
const quickCommandLongPressMs = 450;
const emojiChoices = [
  ['😊', '微笑', 'Smile'],
  ['😂', '笑哭', 'Tears of joy'],
  ['👍', '赞', 'Thumbs up'],
  ['❤️', '爱心', 'Heart'],
  ['🎉', '庆祝', 'Celebration'],
  ['🙏', '感谢', 'Thank you'],
  ['🙂', '友好', 'Friendly face'],
  ['🤔', '思考', 'Thinking'],
  ['👏', '鼓掌', 'Applause'],
  ['💪', '加油', 'Flexed biceps'],
  ['✨', '闪亮', 'Sparkles'],
  ['👋', '挥手', 'Wave'],
] as const;

export type ComposerTool =
  | '相册'
  | '拍摄'
  | '文件'
  | '位置'
  | '联系人'
  | '任务'
  | '妙猜猜'
  | '文件库';

function estimateInputHeight(value: string) {
  const lineCount = Math.max(1, value.split(/\r?\n/).length);
  return Math.max(
    minInputHeight,
    Math.min(
      maxInputHeight,
      lineCount * inputLineHeight + inputVerticalPadding,
    ),
  );
}

function composerToolIcon(command: string) {
  const Icon =
    command === '相册' || command === '小站素材'
      ? Images
      : command === '拍摄'
      ? Camera
      : command === '文件'
      ? FileText
      : command === '位置'
      ? MapPin
      : command === '联系人'
      ? ContactRound
      : command === '任务'
      ? ListChecks
      : command === '妙猜猜'
      ? Lightbulb
      : FolderOpen;
  return <Icon color="#4B5664" size={26} strokeWidth={1.5} />;
}

export function ChatComposer({
  palette,
  language,
  threadTitle,
  draft,
  isSending,
  isRecognizingSpeech,
  replyTarget,
  contextRefs = [],
  workspaceActions,
  quickCommands,
  contextAccessWarning,
  onOpenAgentAccess,
  onRemoveContextReference,
  onChangeDraft,
  onClearReplyTarget,
  onFocusInput,
  onOpenAssistant,
  onComposerTool,
  onSelectStationSources,
  onStartLongSpeech,
  onFinishLongSpeech,
  onRecognizeSpeech,
  onSend,
  onQuickCommand,
}: {
  palette: Palette;
  language: Language;
  threadTitle: string;
  draft: string;
  isSending: boolean;
  isRecognizingSpeech: boolean;
  replyTarget: ChatMessage | null;
  assistSource?: AssistMessageSource;
  contextRefs?: AIContextReference[];
  workspaceActions?: React.ReactNode;
  quickCommands?: string[];
  contextAccessWarning?: string;
  onOpenAgentAccess?: () => void;
  onRemoveContextReference?: (index: number) => void;
  onChangeDraft: (value: string) => void;
  onClearReplyTarget: () => void;
  onFocusInput: () => void;
  onOpenAssistant?: () => void;
  onComposerTool?: (tool: ComposerTool) => void;
  onSelectStationSources?: () => void;
  onStartLongSpeech?: () => void;
  onFinishLongSpeech?: () => void;
  onRecognizeSpeech: () => void;
  onSend: () => void;
  onQuickCommand?: (command: string) => void;
}) {
  const [inputHeight, setInputHeight] = React.useState(() =>
    estimateInputHeight(draft),
  );
  const [composerPanel, setComposerPanel] = React.useState<
    'tools' | 'emoji' | null
  >(null);
  const composerToolsOpen = composerPanel === 'tools';
  const emojiPickerOpen = composerPanel === 'emoji';
  const longSpeechActive = React.useRef(false);
  const inputRef = React.useRef<TextInput>(null);
  const inputSelection = React.useRef<{ start: number; end: number } | null>(
    null,
  );
  const latestDraft = React.useRef(draft);
  if (latestDraft.current !== draft) {
    latestDraft.current = draft;
    inputSelection.current = null;
  }
  const [quickCommandOffset, setQuickCommandOffset] = React.useState(0);
  const [quickCommandViewportWidth, setQuickCommandViewportWidth] =
    React.useState(0);
  const [quickCommandContentWidth, setQuickCommandContentWidth] =
    React.useState(0);
  const quickCommandDragged = React.useRef(false);
  const quickCommandTouchStart = React.useRef({ x: 0, y: 0 });
  const quickCommandDragStartOffset = React.useRef(0);
  const quickCommandResponderActive = React.useRef(false);
  const quickCommandPressStart = React.useRef({ x: 0, y: 0 });
  const quickCommandPressTimer = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  React.useEffect(
    () => () => {
      if (quickCommandPressTimer.current) {
        clearTimeout(quickCommandPressTimer.current);
      }
    },
    [],
  );
  React.useEffect(() => {
    if (!draft.trim()) {
      setInputHeight(minInputHeight);
      setComposerPanel(null);
    }
  }, [draft]);
  const canSend = Boolean(draft.trim()) && !isSending && !contextAccessWarning;
  const xunTheme = isXunPalette(palette);
  const isLight = isLightPalette(palette);
  const accent = xunTheme
    ? palette.mint
    : isLight
    ? productColors.accent
    : palette.mint;
  const soft = xunTheme
    ? palette.soft
    : isLight
    ? productColors.soft
    : palette.soft;
  const inputBorder = xunTheme
    ? palette.border
    : isLight
    ? productColors.chipBorder
    : palette.border;
  const toolCommands: Array<ComposerTool | '小站素材'> = [
    '相册',
    '拍摄',
    '文件',
    '位置',
    '联系人',
    '任务',
    '妙猜猜',
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
    latestDraft.current = nextDraft;
    inputSelection.current = { start: cursor, end: cursor };
    onChangeDraft(nextDraft);
    setComposerPanel(null);
    requestAnimationFrame(() => {
      if (latestDraft.current !== nextDraft) return;
      inputRef.current?.focus();
      inputRef.current?.setSelection(cursor, cursor);
    });
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
      {quickCommands?.length ? (
        <View
          testID="chat-quick-commands"
          onStartShouldSetResponderCapture={(event: GestureResponderEvent) => {
            quickCommandDragged.current = false;
            quickCommandResponderActive.current = false;
            quickCommandTouchStart.current = {
              x: event.nativeEvent.pageX,
              y: event.nativeEvent.pageY,
            };
            return false;
          }}
          onMoveShouldSetResponderCapture={(event: GestureResponderEvent) => {
            const dx =
              event.nativeEvent.pageX - quickCommandTouchStart.current.x;
            const dy =
              event.nativeEvent.pageY - quickCommandTouchStart.current.y;
            const horizontal =
              Math.abs(dx) >= 8 && Math.abs(dx) > Math.abs(dy) * 1.25;
            if (horizontal) {
              quickCommandDragged.current = true;
              quickCommandResponderActive.current = true;
            }
            return horizontal;
          }}
          onResponderGrant={() => {
            quickCommandResponderActive.current = true;
            quickCommandDragStartOffset.current = quickCommandOffset;
          }}
          onResponderMove={(event: GestureResponderEvent) => {
            if (!quickCommandResponderActive.current) return;
            const dx =
              event.nativeEvent.pageX - quickCommandTouchStart.current.x;
            const maxOffset = Math.max(
              0,
              quickCommandContentWidth - quickCommandViewportWidth,
            );
            setQuickCommandOffset(
              Math.min(
                maxOffset,
                Math.max(0, quickCommandDragStartOffset.current - dx),
              ),
            );
          }}
          onResponderRelease={() => {
            quickCommandResponderActive.current = false;
          }}
          onResponderTerminate={() => {
            quickCommandResponderActive.current = false;
          }}
          onLayout={event => {
            setQuickCommandViewportWidth(event.nativeEvent.layout.width);
          }}
          style={[
            accessStyles.quickCommandScroll,
            xunTheme && accessStyles.xunQuickCommandScroll,
          ]}
        >
          <View
            onLayout={event => {
              setQuickCommandContentWidth(event.nativeEvent.layout.width);
            }}
            style={[
              accessStyles.quickCommands,
              { transform: [{ translateX: -quickCommandOffset }] },
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
                  if (!quickCommandDragged.current) onQuickCommand?.(command);
                }}
                onPressIn={event => {
                  quickCommandDragged.current = false;
                  quickCommandPressStart.current = {
                    x: event.nativeEvent.pageX,
                    y: event.nativeEvent.pageY,
                  };
                  if (quickCommandPressTimer.current) {
                    clearTimeout(quickCommandPressTimer.current);
                  }
                  quickCommandPressTimer.current = setTimeout(() => {
                    quickCommandDragged.current = true;
                  }, quickCommandLongPressMs);
                }}
                onPressMove={event => {
                  const dx =
                    event.nativeEvent.pageX - quickCommandPressStart.current.x;
                  const dy =
                    event.nativeEvent.pageY - quickCommandPressStart.current.y;
                  if (Math.abs(dx) >= 8 && Math.abs(dx) > Math.abs(dy) * 1.25) {
                    quickCommandDragged.current = true;
                    if (quickCommandPressTimer.current) {
                      clearTimeout(quickCommandPressTimer.current);
                      quickCommandPressTimer.current = null;
                    }
                  }
                }}
                onPressOut={() => {
                  if (quickCommandPressTimer.current) {
                    clearTimeout(quickCommandPressTimer.current);
                    quickCommandPressTimer.current = null;
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
      ) : null}
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
      />
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
      <View style={[accessStyles.editor, xunTheme && accessStyles.xunEditor]}>
        <TextInput
          ref={inputRef}
          accessibilityLabel={textFor(language, '消息输入框', 'Message input')}
          value={draft}
          placeholder={textFor(
            language,
            `发给${threadTitle}`,
            `Message ${displayText(language, threadTitle)}`,
          )}
          placeholderTextColor={palette.secondaryText}
          multiline
          // Native scrolling must keep the caret visible while an automatic
          // wrap or paste is still waiting for its content-size event in JS.
          scrollEnabled
          onChangeText={value => {
            latestDraft.current = value;
            inputSelection.current = null;
            onChangeDraft(value);
            const estimatedHeight = estimateInputHeight(value);
            setInputHeight(current =>
              estimatedHeight > current ? estimatedHeight : current,
            );
          }}
          onSelectionChange={event => {
            inputSelection.current = event.nativeEvent.selection;
          }}
          onContentSizeChange={event => {
            // A delayed native measurement of the submitted text must not
            // expand the now-empty editor after the send animation.
            if (!latestDraft.current) {
              setInputHeight(minInputHeight);
              return;
            }
            const contentHeight = Math.ceil(
              event.nativeEvent.contentSize.height,
            );
            const nextHeight = Math.max(
              minInputHeight,
              Math.min(maxInputHeight, contentHeight),
            );
            setInputHeight(current =>
              current === nextHeight ? current : nextHeight,
            );
          }}
          onFocus={() => {
            setComposerPanel(null);
            onFocusInput();
          }}
          style={[
            chatLayoutStyles.input,
            { height: inputHeight },
            {
              backgroundColor: palette.input,
              color: palette.text,
              borderColor: inputBorder,
            },
          ]}
        />
      </View>
      <View
        style={[
          chatLayoutStyles.composerRow,
          xunTheme && accessStyles.xunComposerRow,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '妙猜猜', 'Miao Guess')}
          disabled={isSending}
          onPress={onOpenAssistant}
          style={[
            chatLayoutStyles.composerButton,
            xunTheme && accessStyles.xunCircleButton,
            { backgroundColor: soft },
            isSending && styles.disabledButton,
          ]}
        >
          <Lightbulb color={palette.text} size={23} strokeWidth={1.8} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '语音转文字', 'Speech to text')}
          disabled={isRecognizingSpeech || isSending}
          onLongPress={() => {
            if (!onStartLongSpeech || isRecognizingSpeech || isSending) return;
            longSpeechActive.current = true;
            onStartLongSpeech();
          }}
          onPress={() => {
            if (longSpeechActive.current) return;
            onRecognizeSpeech();
          }}
          onPressOut={() => {
            if (!longSpeechActive.current) return;
            longSpeechActive.current = false;
            onFinishLongSpeech?.();
          }}
          style={[
            chatLayoutStyles.composerButton,
            xunTheme && accessStyles.xunCircleButton,
            { backgroundColor: soft },
            (isRecognizingSpeech || isSending) && styles.disabledButton,
          ]}
        >
          {isRecognizingSpeech ? (
            <ActivityIndicator color={palette.mint} size="small" />
          ) : (
            <Mic color={palette.text} size={19} strokeWidth={2.5} />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '添加表情', 'Add emoji')}
          accessibilityState={{
            expanded: emojiPickerOpen,
            disabled: isSending,
          }}
          disabled={isSending}
          onPress={() => {
            setComposerPanel(emojiPickerOpen ? null : 'emoji');
            if (!emojiPickerOpen) Keyboard.dismiss();
          }}
          style={[
            chatLayoutStyles.composerButton,
            xunTheme && accessStyles.xunCircleButton,
            accessStyles.transparentButton,
          ]}
        >
          <Smile color={palette.text} size={25} strokeWidth={1.7} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '更多功能', 'More features')}
          accessibilityState={{ expanded: composerToolsOpen }}
          onPress={() => {
            setComposerPanel(composerToolsOpen ? null : 'tools');
            if (!composerToolsOpen) Keyboard.dismiss();
          }}
          style={[
            chatLayoutStyles.composerButton,
            xunTheme && accessStyles.xunCircleButton,
            accessStyles.transparentButton,
          ]}
        >
          {composerToolsOpen ? (
            <X color={palette.text} size={27} strokeWidth={1.7} />
          ) : (
            <Plus color={palette.text} size={27} strokeWidth={1.7} />
          )}
        </Pressable>
        <View style={accessStyles.sendSpacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '发送消息', 'Send message')}
          accessibilityState={{ disabled: !canSend, busy: isSending }}
          disabled={!canSend}
          onPress={onSend}
          style={[
            chatLayoutStyles.send,
            xunTheme && accessStyles.xunSend,
            { backgroundColor: accent },
            !draft.trim() && accessStyles.hiddenSend,
            !canSend && styles.disabledButton,
          ]}
        >
          <Text
            style={[
              chatLayoutStyles.sendText,
              isV6Palette(palette) && { color: v6Colors.onAccent },
              isXunPalette(palette) && accessStyles.xunSendText,
            ]}
          >
            {textFor(
              language,
              isSending ? '发送中' : '发送',
              isSending ? 'Sending' : 'Send',
            )}
          </Text>
        </Pressable>
      </View>
      {emojiPickerOpen ? (
        <View
          accessibilityLabel={textFor(language, '表情选择', 'Emoji picker')}
          onAccessibilityEscape={() => setComposerPanel(null)}
          style={[
            accessStyles.emojiPanel,
            { backgroundColor: palette.soft, borderTopColor: palette.border },
          ]}
        >
          <View style={accessStyles.emojiHeader}>
            <Text style={[accessStyles.emojiTitle, { color: palette.text }]}>
              {textFor(language, '表情', 'Emoji')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={textFor(
                language,
                '关闭表情选择',
                'Close emoji picker',
              )}
              onPress={() => setComposerPanel(null)}
              style={chatLayoutStyles.composerButton}
            >
              <X color={palette.secondaryText} size={21} />
            </Pressable>
          </View>
          <View style={accessStyles.emojiGrid}>
            {emojiChoices.map(([emoji, zh, en]) => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={textFor(
                  language,
                  `插入表情：${zh}`,
                  `Insert emoji: ${en}`,
                )}
                disabled={isSending}
                onPress={() => insertEmoji(emoji)}
                style={({ pressed }) => [
                  chatLayoutStyles.composerButton,
                  pressed && { backgroundColor: palette.surface },
                ]}
              >
                <Text style={accessStyles.emoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {composerToolsOpen ? (
        <View
          accessibilityLabel={textFor(language, '聊天扩展功能', 'Chat tools')}
          style={accessStyles.toolPanel}
        >
          {toolCommands.map(command => (
            <Pressable
              key={command}
              accessibilityRole="button"
              accessibilityLabel={textFor(
                language,
                `添加${command}`,
                `Add ${command}`,
              )}
              onPress={() => {
                setComposerPanel(null);
                if (command === '小站素材') onSelectStationSources?.();
                else onComposerTool?.(command);
              }}
              style={accessStyles.toolItem}
            >
              <View style={accessStyles.toolIcon}>
                {composerToolIcon(command)}
              </View>
              <Text
                style={[
                  accessStyles.toolLabel,
                  { color: palette.secondaryText },
                ]}
              >
                {command}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const accessStyles = StyleSheet.create({
  editor: { alignSelf: 'stretch' },
  xunEditor: { paddingHorizontal: 15, paddingTop: 10 },
  xunComposer: {
    borderTopWidth: 0,
    gap: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 8,
  },
  xunComposerRow: {
    paddingHorizontal: 15,
    paddingTop: 6,
    paddingBottom: 0,
  },
  transparentButton: { backgroundColor: 'transparent' },
  xunCircleButton: {
    backgroundColor: 'transparent',
    width: 44,
    minHeight: 44,
    borderRadius: 22,
  },
  xunSend: {
    minWidth: 56,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 8,
  },
  hiddenSend: { display: 'none' },
  sendSpacer: { flex: 1 },
  emojiPanel: {
    borderTopWidth: 1,
    paddingHorizontal: 15,
    paddingBottom: 8,
  },
  emojiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emojiTitle: { fontSize: 14, fontWeight: '600' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  emoji: { fontSize: 25 },
  toolPanel: {
    backgroundColor: '#F3F4F6',
    borderTopWidth: 1,
    borderTopColor: '#E0E5EB',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  toolItem: {
    width: '22%',
    alignItems: 'center',
    gap: 8,
  },
  toolIcon: {
    width: 51,
    height: 51,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAEDF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolLabel: { fontSize: 11 },
  warning: { paddingVertical: 8 },
  xunSendText: { color: '#073b3d' },
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
