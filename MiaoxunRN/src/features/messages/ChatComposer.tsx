import type { AIContextReference } from '../../models/aiTask';
import type { AssistMessageSource } from '../assist/assistMessageSource';
import { ContextReference } from '../ai/AIInteraction';
import React from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Image,
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
  Keyboard as KeyboardIcon,
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
import { isXunPalette } from '../../shared/xunPalette';
import { ChatMessage, Language } from '../session/useMiaoxunSession';
import type { CustomStickerDTO } from '../../models/api';
import { buildApiUrl } from '../../services/api/http';
import { chatLayoutStyles } from './chatLayoutStyles';
import type { ChatAttachmentDraft } from './useChatAttachments';

const quickCommandLongPressMs = 450;
const emojiCategories = [
  {
    id: '常用',
    label: ['常用', 'Recent'],
    choices: [
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
    ],
  },
  {
    id: '情绪',
    label: ['情绪', 'Faces'],
    choices: [
      ['😀', '开心', 'Grinning'],
      ['😃', '笑脸', 'Big smile'],
      ['😄', '露齿笑', 'Beaming'],
      ['😁', '咧嘴笑', 'Beaming eyes'],
      ['😆', '眯眼笑', 'Laughing'],
      ['😅', '苦笑', 'Sweat smile'],
      ['😉', '眨眼', 'Wink'],
      ['😍', '花痴', 'Heart eyes'],
      ['🥰', '爱意', 'Smiling hearts'],
      ['😘', '飞吻', 'Kiss'],
      ['😎', '酷', 'Cool'],
      ['😭', '大哭', 'Crying'],
      ['😡', '生气', 'Angry'],
      ['😴', '困', 'Sleeping'],
      ['🤗', '抱抱', 'Hugging'],
      ['🤩', '崇拜', 'Star struck'],
    ],
  },
  {
    id: '手势',
    label: ['手势', 'Gestures'],
    choices: [
      ['👋', '挥手', 'Wave'],
      ['🤝', '握手', 'Handshake'],
      ['👏', '鼓掌', 'Clap'],
      ['🙌', '举手', 'Raising hands'],
      ['🫶', '双手爱心', 'Heart hands'],
      ['🤞', '交叉手指', 'Crossed fingers'],
      ['✌️', '胜利', 'Victory'],
      ['🤟', '我爱你', 'Love you'],
      ['👌', '好的', 'OK hand'],
      ['👀', '看看', 'Eyes'],
      ['💯', '满分', 'Hundred points'],
      ['🔥', '火热', 'Fire'],
    ],
  },
  {
    id: '生活',
    label: ['生活', 'Life'],
    choices: [
      ['☀️', '太阳', 'Sun'],
      ['🌈', '彩虹', 'Rainbow'],
      ['🌸', '樱花', 'Cherry blossom'],
      ['🌻', '向日葵', 'Sunflower'],
      ['🍀', '四叶草', 'Four leaf clover'],
      ['🐱', '猫咪', 'Cat'],
      ['🐶', '小狗', 'Dog'],
      ['🦋', '蝴蝶', 'Butterfly'],
      ['☕️', '咖啡', 'Coffee'],
      ['🍰', '蛋糕', 'Cake'],
      ['🍎', '苹果', 'Apple'],
      ['🎁', '礼物', 'Gift'],
    ],
  },
] as const;

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

export type ComposerTool =
  | '相册'
  | '拍摄'
  | '文件'
  | '位置'
  | '联系人'
  | '任务'
  | '妙猜猜'
  | '文件库';

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
  attachments = [],
  attachmentSlots = 6,
  attachmentBlockReason = '',
  onRemoveAttachment,
  onRetryAttachment,
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
  replyTarget: ChatMessage | null;
  assistSource?: AssistMessageSource;
  contextRefs?: AIContextReference[];
  attachments?: ChatAttachmentDraft[];
  attachmentSlots?: number;
  attachmentBlockReason?: string;
  onRemoveAttachment?: (clientKey: string) => void;
  onRetryAttachment?: (clientKey: string) => void;
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
  onStartLongSpeech?: () => void;
  onFinishLongSpeech?: () => void;
  onSend: (stickerId?: string) => void;
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
  const [emojiCategory, setEmojiCategory] = React.useState('常用');
  const [customPickerOpen, setCustomPickerOpen] = React.useState(false);
  const [voiceInputMode, setVoiceInputMode] = React.useState(false);
  const composerToolsOpen = composerPanel === 'tools';
  const emojiPickerOpen = composerPanel === 'emoji';
  const activeEmojiCategory =
    emojiCategories.find(category => category.id === emojiCategory) ||
    emojiCategories[0];
  const emojiDynamicStyles = React.useMemo(
    () => ({
      selectedTab: { backgroundColor: palette.surface },
      selectedText: { color: palette.text },
      unselectedText: { color: palette.secondaryText },
    }),
    [palette.secondaryText, palette.surface, palette.text],
  );
  const longSpeechActive = React.useRef(false);
  const inputRef = React.useRef<TextInput>(null);
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
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      onFocusInput();
    });
  }, [onFocusInput, voiceInputMode]);
  const hasDraft = Boolean(draft.trim());
  const canSend =
    (hasDraft || attachments.some(item => item.status === 'ready')) &&
    !isSending &&
    !contextAccessWarning &&
    !attachmentBlockReason;
  const xunTheme = isXunPalette(palette);
  const isLight = isLightPalette(palette);
  const accent = xunTheme || !isLight ? palette.mint : productColors.accent;
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
  const toggleVoiceInputMode = () => {
    if (isSending || isRecognizingSpeech) return;
    setComposerPanel(null);
    setVoiceInputMode(current => !current);
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
      {attachments.length ? (
        <View
          testID="chat-attachment-draft-strip"
          style={accessStyles.attachmentStrip}
        >
          {attachments.map(item => (
            <View
              key={item.clientKey}
              style={[
                accessStyles.attachmentItem,
                { backgroundColor: palette.soft },
              ]}
            >
              {item.kind === 'image' && item.localUri ? (
                <Image
                  source={{ uri: item.localUri }}
                  style={accessStyles.attachmentThumbnail}
                  accessibilityLabel={item.filename}
                />
              ) : (
                <Text
                  numberOfLines={1}
                  style={[textColorStyle(palette.text), maxWidthStyle(112)]}
                >
                  ▤ {item.filename}
                </Text>
              )}
              <Text
                accessibilityLiveRegion="polite"
                style={textColorStyle(
                  item.status === 'failed' ? '#B42318' : palette.secondaryText,
                )}
              >
                {item.status === 'uploading'
                  ? textFor(language, '上传中', 'Uploading')
                  : item.status === 'failed'
                  ? item.error || textFor(language, '上传失败', 'Upload failed')
                  : textFor(language, '已就绪', 'Ready')}
              </Text>
              {item.status === 'failed' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={textFor(
                    language,
                    `重试上传${item.filename}`,
                    `Retry ${item.filename}`,
                  )}
                  onPress={() => onRetryAttachment?.(item.clientKey)}
                >
                  <Text style={textColorStyle(palette.text)}>
                    {textFor(language, '重试', 'Retry')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={textFor(
                  language,
                  `移除${item.filename}`,
                  `Remove ${item.filename}`,
                )}
                onPress={() => onRemoveAttachment?.(item.clientKey)}
              >
                <X color={palette.secondaryText} size={16} />
              </Pressable>
            </View>
          ))}
          <Text style={{ color: palette.secondaryText }}>
            {textFor(
              language,
              `还可添加${attachmentSlots}个`,
              `${attachmentSlots} slots left`,
            )}
          </Text>
        </View>
      ) : null}
      {attachmentBlockReason ? (
        <Text
          accessibilityLiveRegion="polite"
          style={textColorStyle('#B42318')}
        >
          {attachmentBlockReason}
        </Text>
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
          accessibilityLabel={textFor(language, '妙猜猜', 'Miao Guess')}
          disabled={isSending}
          onPress={onOpenAssistant}
          style={[
            chatLayoutStyles.composerButton,
            xunTheme && accessStyles.xunCircleAction,
            isSending && styles.disabledButton,
          ]}
          hitSlop={xunTheme ? 5 : undefined}
        >
          <View style={xunTheme && accessStyles.xunIconBubble}>
            <Lightbulb color={palette.text} size={23} strokeWidth={1.8} />
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(
            language,
            voiceInputMode ? '切换键盘输入' : '切换语音输入',
            voiceInputMode
              ? 'Switch to keyboard input'
              : 'Switch to voice input',
          )}
          accessibilityState={{ disabled: isRecognizingSpeech || isSending }}
          disabled={isRecognizingSpeech || isSending}
          onPress={toggleVoiceInputMode}
          style={[
            chatLayoutStyles.composerButton,
            xunTheme && accessStyles.xunCircleAction,
            (isRecognizingSpeech || isSending) && styles.disabledButton,
          ]}
          hitSlop={xunTheme ? 5 : undefined}
        >
          <View style={xunTheme && accessStyles.xunIconBubble}>
            {voiceInputMode ? (
              <KeyboardIcon color={palette.text} size={23} strokeWidth={1.8} />
            ) : (
              <Mic color={palette.text} size={23} strokeWidth={1.8} />
            )}
          </View>
        </Pressable>
        {voiceInputMode ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textFor(language, '按住说话', 'Hold to talk')}
            accessibilityState={{
              disabled: isSending,
              busy: isRecognizingSpeech,
            }}
            disabled={isSending}
            onPressIn={() => {
              if (!onStartLongSpeech || isRecognizingSpeech || isSending)
                return;
              longSpeechActive.current = true;
              onStartLongSpeech();
            }}
            onPressOut={() => {
              if (!longSpeechActive.current) return;
              longSpeechActive.current = false;
              onFinishLongSpeech?.();
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
              {textFor(
                language,
                isRecognizingSpeech ? '松开结束' : '按住说话',
                isRecognizingSpeech ? 'Release to finish' : 'Hold to talk',
              )}
            </Text>
          </Pressable>
        ) : (
          <View style={accessStyles.editor}>
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
              returnKeyType="default"
              submitBehavior="newline"
              // Native text layout grows within the shared min/max height; keep
              // scrolling enabled so the caret stays visible above that limit.
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
                  backgroundColor: palette.input,
                  color: palette.text,
                  borderColor: inputBorder,
                },
              ]}
            />
          </View>
        )}
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
            xunTheme && accessStyles.xunCompactAction,
            isSending && styles.disabledButton,
          ]}
          hitSlop={xunTheme ? 8 : undefined}
        >
          <Smile color={palette.text} size={24} strokeWidth={1.7} />
        </Pressable>
        {attachments.length > 0 || (!hasDraft && !isSending) ? (
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
              xunTheme && accessStyles.xunCompactAction,
            ]}
            hitSlop={xunTheme ? 8 : undefined}
          >
            {composerToolsOpen ? (
              <X color={palette.text} size={24} strokeWidth={1.7} />
            ) : (
              <Plus color={palette.text} size={24} strokeWidth={1.7} />
            )}
          </Pressable>
        ) : null}
        {hasDraft || attachments.length > 0 || isSending ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textFor(language, '发送消息', 'Send message')}
            accessibilityState={{ disabled: !canSend, busy: isSending }}
            disabled={!canSend}
            onPress={() => {
              if (!canSend) return;
              setComposerPanel(null);
              onSend();
            }}
            style={[
              chatLayoutStyles.send,
              { backgroundColor: accent },
              !canSend && styles.disabledButton,
            ]}
            hitSlop={xunTheme ? 5 : undefined}
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
        ) : null}
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
            <View style={accessStyles.emojiTitleGroup}>
              <Text style={[accessStyles.emojiTitle, { color: palette.text }]}>
                {textFor(language, '表情', 'Emoji')}
              </Text>
              <View style={accessStyles.emojiTabs}>
                {emojiCategories.map(category => {
                  const selected = category.id === activeEmojiCategory.id;
                  return (
                    <Pressable
                      key={category.id}
                      accessibilityRole="tab"
                      accessibilityLabel={textFor(
                        language,
                        '表情分类：' + category.label[0],
                        'Emoji category: ' + category.label[1],
                      )}
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setEmojiCategory(category.id);
                        setCustomPickerOpen(false);
                      }}
                      style={[
                        accessStyles.emojiTab,
                        selected && emojiDynamicStyles.selectedTab,
                      ]}
                    >
                      <Text
                        style={[
                          accessStyles.emojiTabLabel,
                          selected
                            ? emojiDynamicStyles.selectedText
                            : emojiDynamicStyles.unselectedText,
                        ]}
                      >
                        {textFor(
                          language,
                          category.label[0],
                          category.label[1],
                        )}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel={textFor(
                    language,
                    '自定义表情',
                    'Custom stickers',
                  )}
                  accessibilityState={{ selected: customPickerOpen }}
                  onPress={() => setCustomPickerOpen(true)}
                  style={[
                    accessStyles.emojiTab,
                    customPickerOpen && emojiDynamicStyles.selectedTab,
                  ]}
                >
                  <Text
                    style={[
                      accessStyles.emojiTabLabel,
                      customPickerOpen
                        ? emojiDynamicStyles.selectedText
                        : emojiDynamicStyles.unselectedText,
                    ]}
                  >
                    {textFor(language, '自定义', 'Custom')}
                  </Text>
                </Pressable>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={textFor(
                language,
                '关闭表情选择',
                'Close emoji picker',
              )}
              onPress={() => setComposerPanel(null)}
              style={[
                chatLayoutStyles.composerButton,
                xunTheme && accessStyles.xunCompactAction,
              ]}
              hitSlop={xunTheme ? 8 : undefined}
            >
              <X color={palette.secondaryText} size={21} />
            </Pressable>
          </View>
          {customPickerOpen ? (
            <View
              style={accessStyles.customPanel}
              testID="custom-sticker-panel"
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={textFor(
                  language,
                  '添加自定义表情',
                  'Add custom sticker',
                )}
                disabled={isSending || customStickerState === 'uploading'}
                onPress={onUploadCustomSticker}
                style={[
                  accessStyles.customAdd,
                  { borderColor: palette.border },
                ]}
              >
                <Plus color={palette.text} size={20} />
                <Text style={{ color: palette.text }}>
                  {customStickerState === 'uploading'
                    ? textFor(language, '上传中', 'Uploading')
                    : textFor(language, '添加图片', 'Add image')}
                </Text>
              </Pressable>
              {customStickerState === 'loading' ? (
                <ActivityIndicator color={palette.mint} />
              ) : null}
              {customStickerState === 'error' ? (
                <View>
                  <Text style={{ color: palette.rose }}>
                    {textFor(
                      language,
                      '读取失败，请重试。',
                      'Unable to load. Try again.',
                    )}
                  </Text>
                  {onRetryCustomStickers ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={textFor(
                        language,
                        '重试读取自定义表情',
                        'Retry loading custom stickers',
                      )}
                      onPress={onRetryCustomStickers}
                      style={[
                        accessStyles.customAdd,
                        { borderColor: palette.border },
                      ]}
                    >
                      <Text style={{ color: palette.text }}>
                        {textFor(language, '重试', 'Retry')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {customStickers.length ? (
                customStickers.map(sticker => (
                  <View key={sticker.id} style={accessStyles.customItem}>
                    {customStickerDeletingIds.includes(sticker.id) ? (
                      <ActivityIndicator color={palette.mint} />
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={textFor(
                        language,
                        '发送自定义表情',
                        'Send custom sticker',
                      )}
                      disabled={
                        isSending ||
                        customStickerDeletingIds.includes(sticker.id)
                      }
                      onPress={() => onSend(sticker.id)}
                    >
                      <Image
                        source={{
                          uri: buildApiUrl(sticker.downloadPath),
                          headers: { Authorization: `Bearer ${token}` },
                        }}
                        style={accessStyles.customImage}
                      />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={textFor(
                        language,
                        '删除自定义表情',
                        'Delete custom sticker',
                      )}
                      disabled={customStickerDeletingIds.includes(sticker.id)}
                      onPress={() => onDeleteCustomSticker?.(sticker.id)}
                    >
                      <X color={palette.secondaryText} size={14} />
                    </Pressable>
                  </View>
                ))
              ) : customStickerState === 'idle' ? (
                <Text style={{ color: palette.secondaryText }}>
                  {textFor(
                    language,
                    '还没有收藏的自定义表情。',
                    'No custom stickers yet.',
                  )}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={accessStyles.emojiGrid}>
              {activeEmojiCategory.choices.map(([emoji, zh, en]) => (
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
          )}
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
              disabled={isSending}
              accessibilityState={{ disabled: isSending }}
              onPress={() => {
                if (isSending) return;
                setComposerPanel(null);
                if (command === '小站素材') onSelectStationSources?.();
                else onComposerTool?.(command);
              }}
              style={[
                accessStyles.toolItem,
                isSending && styles.disabledButton,
              ]}
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

const textColorStyle = (color: string) => ({ color });
const maxWidthStyle = (maxWidth: number) => ({ maxWidth });

const accessStyles = StyleSheet.create({
  editor: { flex: 1, minWidth: 0 },
  xunComposer: {
    borderTopWidth: 0,
    gap: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 8,
  },
  xunComposerRow: {
    alignItems: 'center',
    gap: 0,
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 0,
  },
  xunCircleAction: {
    minHeight: 44,
    minWidth: 34,
    width: 34,
    paddingHorizontal: 0,
  },
  xunIconBubble: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#e7edf3',
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  xunCompactAction: {
    minWidth: 28,
    width: 28,
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
  emojiTitleGroup: { flex: 1, minWidth: 0, gap: 8 },
  emojiTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingRight: 8,
  },
  emojiTab: {
    borderRadius: 12,
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  emojiTabLabel: { fontSize: 12 },
  emojiTitle: { fontSize: 14, fontWeight: '600' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  emoji: { fontSize: 25 },
  customPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  customAdd: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 48,
    paddingHorizontal: 10,
  },
  customItem: { alignItems: 'center', gap: 2 },
  customImage: { borderRadius: 8, height: 52, width: 52 },
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
  attachmentStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  attachmentItem: {
    minHeight: 34,
    maxWidth: '100%',
    borderRadius: 6,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attachmentThumbnail: { width: 28, height: 28, borderRadius: 4 },
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
