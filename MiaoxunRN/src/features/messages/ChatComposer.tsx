import type { AIContextReference } from '../../models/aiTask';
import type { AssistMessageSource } from '../assist/assistMessageSource';
import { ContextReference } from '../ai/AIInteraction';
import React from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  LayoutChangeEvent,
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
    command === '相册'
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
  onStartLongSpeech,
  onFinishLongSpeech,
  onRecognizeSpeech,
  onSend,
  onQuickCommand,
  onLayout,
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
  onStartLongSpeech?: () => void;
  onFinishLongSpeech?: () => void;
  onRecognizeSpeech: () => void;
  onSend: () => void;
  onQuickCommand?: (command: string) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const [inputHeight, setInputHeight] = React.useState(() =>
    estimateInputHeight(draft),
  );
  const [composerToolsOpen, setComposerToolsOpen] = React.useState(false);
  const longSpeechActive = React.useRef(false);
  const inputRef = React.useRef<TextInput>(null);
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
  const toolCommands: ComposerTool[] = [
    '相册',
    '拍摄',
    '文件',
    '位置',
    '联系人',
    '任务',
    '妙猜猜',
    '文件库',
  ];

  return (
    <View
      onLayout={onLayout}
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
          scrollEnabled={inputHeight >= maxInputHeight}
          onChangeText={value => {
            onChangeDraft(value);
            const estimatedHeight = estimateInputHeight(value);
            setInputHeight(current =>
              estimatedHeight > current ? estimatedHeight : current,
            );
          }}
          onContentSizeChange={event => {
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
            setComposerToolsOpen(false);
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
        {!draft.trim() ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textFor(language, '添加表情', 'Add emoji')}
            disabled={isSending}
            onPress={() => {
              onChangeDraft(`${draft}😊`);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            style={[
              chatLayoutStyles.composerButton,
              xunTheme && accessStyles.xunCircleButton,
              accessStyles.transparentButton,
            ]}
          >
            <Smile color={palette.text} size={25} strokeWidth={1.7} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '更多功能', 'More features')}
          accessibilityState={{ expanded: composerToolsOpen }}
          onPress={() => setComposerToolsOpen(value => !value)}
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
                setComposerToolsOpen(false);
                onComposerTool?.(command);
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
  xunComposer: {
    borderTopWidth: 0,
    gap: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 23,
  },
  xunComposerRow: {
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 16,
  },
  transparentButton: { backgroundColor: 'transparent' },
  xunCircleButton: {
    backgroundColor: 'transparent',
    width: 38,
    minHeight: 38,
    borderRadius: 19,
  },
  xunSend: {
    minWidth: 56,
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 8,
  },
  hiddenSend: { display: 'none' },
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
