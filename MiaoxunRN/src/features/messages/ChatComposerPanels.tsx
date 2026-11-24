import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Camera,
  ContactRound,
  FileText,
  Film,
  FolderOpen,
  Images,
  Lightbulb,
  ListChecks,
  MapPin,
  Plus,
  X,
} from 'lucide-react-native';
import type { CustomStickerDTO } from '../../models/api';
import { buildApiUrl } from '../../services/api/http';
import { textFor } from '../../shared/i18n';
import type { Palette } from '../../shared/theme';
import type { Language } from '../session/sessionTypes';

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

export type ComposerTool =
  | '相册'
  | '拍摄'
  | '视频'
  | '文件'
  | '位置'
  | '联系人'
  | '任务'
  | '妙猜猜'
  | '文件库';

function composerToolIcon(command: string, color: string) {
  const Icon =
    command === '相册' || command === '小站素材'
      ? Images
      : command === '拍摄'
      ? Camera
      : command === '视频'
      ? Film
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
  return <Icon color={color} size={26} strokeWidth={1.5} />;
}

export function ChatComposerPanels({
  panel,
  palette,
  language,
  isSending,
  token,
  tools,
  footer,
  customStickers,
  customStickerState,
  customStickerDeletingIds,
  onClose,
  onSelectEmoji,
  onSelectTool,
  onSendSticker,
  onRetryCustomStickers,
  onUploadCustomSticker,
  onDeleteCustomSticker,
}: {
  panel: 'emoji' | 'tools';
  palette: Palette;
  language: Language;
  isSending: boolean;
  token: string;
  tools: Array<ComposerTool | '小站素材'>;
  footer?: React.ReactNode;
  customStickers: CustomStickerDTO[];
  customStickerState: 'idle' | 'loading' | 'uploading' | 'error';
  customStickerDeletingIds: string[];
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  onSelectTool: (tool: ComposerTool | '小站素材') => void;
  onSendSticker: (id: string) => void;
  onRetryCustomStickers?: () => void;
  onUploadCustomSticker?: () => void;
  onDeleteCustomSticker?: (id: string) => void;
}) {
  const [categoryId, setCategoryId] = React.useState('常用');
  const { height } = useWindowDimensions();
  const panelHeight = Math.max(196, Math.min(280, Math.round(height * 0.32)));
  const custom = categoryId === 'custom';
  const category =
    emojiCategories.find(item => item.id === categoryId) || emojiCategories[0];
  const uploading = customStickerState === 'uploading';
  const tabs = [
    ...emojiCategories.map(item => ({
      id: item.id,
      label: textFor(language, item.label[0], item.label[1]),
      accessibilityLabel: textFor(
        language,
        '表情分类：' + item.label[0],
        'Emoji category: ' + item.label[1],
      ),
    })),
    {
      id: 'custom',
      label: textFor(language, '自定义', 'Custom'),
      accessibilityLabel: textFor(language, '自定义表情', 'Custom stickers'),
    },
  ];
  return (
    <View
      testID="chat-composer-panel"
      accessibilityLabel={textFor(
        language,
        panel === 'emoji' ? '表情选择' : '聊天扩展功能',
        panel === 'emoji' ? 'Emoji picker' : 'Chat tools',
      )}
      onAccessibilityEscape={onClose}
      style={[
        s.panel,
        {
          height: panelHeight,
          backgroundColor: palette.soft,
          borderTopColor: palette.border,
        },
      ]}
    >
      <View style={s.header}>
        <Text
          accessibilityRole="header"
          style={[s.title, { color: palette.text }]}
        >
          {textFor(
            language,
            panel === 'emoji' ? '表情' : '更多功能',
            panel === 'emoji' ? 'Emoji' : 'More features',
          )}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(
            language,
            panel === 'emoji' ? '关闭表情选择' : '关闭扩展功能',
            panel === 'emoji' ? 'Close emoji picker' : 'Close chat tools',
          )}
          onPress={onClose}
          style={s.close}
        >
          <X color={palette.secondaryText} size={20} />
        </Pressable>
      </View>
      {panel === 'emoji' ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.tabsViewport}
            contentContainerStyle={s.tabs}
            keyboardShouldPersistTaps="always"
          >
            {tabs.map(tab => (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityLabel={tab.accessibilityLabel}
                accessibilityState={{ selected: categoryId === tab.id }}
                onPress={() => setCategoryId(tab.id)}
                style={[
                  s.tab,
                  categoryId === tab.id && { backgroundColor: palette.surface },
                ]}
              >
                <Text
                  style={[
                    s.tabLabel,
                    {
                      color:
                        categoryId === tab.id
                          ? palette.text
                          : palette.secondaryText,
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView
            key={categoryId}
            style={s.body}
            contentContainerStyle={s.emojiContent}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator
          >
            {custom ? (
              <>
                {customStickerState === 'loading' ? (
                  <View style={s.status}>
                    <ActivityIndicator color={palette.mint} />
                  </View>
                ) : null}
                {customStickerState === 'error' ? (
                  <View style={s.status}>
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
                        style={s.retry}
                      >
                        <Text style={{ color: palette.text }}>
                          {textFor(language, '重试', 'Retry')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                <View style={s.stickerGrid} testID="custom-sticker-panel">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={textFor(
                      language,
                      '添加自定义表情',
                      'Add custom sticker',
                    )}
                    disabled={isSending || uploading}
                    onPress={onUploadCustomSticker}
                    style={s.stickerCell}
                  >
                    <View
                      style={[
                        s.stickerAdd,
                        {
                          borderColor: palette.border,
                          backgroundColor: palette.surface,
                        },
                      ]}
                    >
                      {uploading ? (
                        <ActivityIndicator color={palette.mint} />
                      ) : (
                        <Plus color={palette.text} size={24} />
                      )}
                    </View>
                    <Text
                      style={[s.stickerLabel, { color: palette.secondaryText }]}
                    >
                      {textFor(
                        language,
                        uploading ? '上传中' : '添加图片',
                        uploading ? 'Uploading' : 'Add image',
                      )}
                    </Text>
                  </Pressable>
                  {customStickers.map(sticker => {
                    const deleting = customStickerDeletingIds.includes(
                      sticker.id,
                    );
                    return (
                      <View key={sticker.id} style={s.stickerCell}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={textFor(
                            language,
                            '发送自定义表情',
                            'Send custom sticker',
                          )}
                          disabled={isSending || deleting}
                          onPress={() => onSendSticker(sticker.id)}
                          style={s.stickerSend}
                        >
                          {deleting ? (
                            <ActivityIndicator color={palette.mint} />
                          ) : (
                            <Image
                              source={{
                                uri: buildApiUrl(sticker.downloadPath),
                                headers: { Authorization: `Bearer ${token}` },
                              }}
                              style={s.stickerImage}
                            />
                          )}
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={textFor(
                            language,
                            '删除自定义表情',
                            'Delete custom sticker',
                          )}
                          disabled={isSending || deleting}
                          onPress={() => onDeleteCustomSticker?.(sticker.id)}
                          style={s.stickerDelete}
                        >
                          <Text
                            style={[
                              s.stickerLabel,
                              { color: palette.secondaryText },
                            ]}
                          >
                            {textFor(language, '移除', 'Remove')}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
                {!customStickers.length && customStickerState === 'idle' ? (
                  <Text style={[s.empty, { color: palette.secondaryText }]}>
                    {textFor(
                      language,
                      '还没有收藏的自定义表情。',
                      'No custom stickers yet.',
                    )}
                  </Text>
                ) : null}
              </>
            ) : (
              <View style={s.emojiGrid}>
                {category.choices.map(([emoji, zh, en]) => (
                  <Pressable
                    key={emoji}
                    accessibilityRole="button"
                    accessibilityLabel={textFor(
                      language,
                      `插入表情：${zh}`,
                      `Insert emoji: ${en}`,
                    )}
                    disabled={isSending}
                    onPress={() => onSelectEmoji(emoji)}
                    style={({ pressed }) => [
                      s.emojiCell,
                      pressed && { backgroundColor: palette.surface },
                    ]}
                  >
                    <Text style={s.emoji}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
        </>
      ) : (
        <ScrollView
          style={s.body}
          contentContainerStyle={s.toolsContent}
          keyboardShouldPersistTaps="always"
        >
          <View style={s.toolGrid}>
            {tools.map(command => (
              <Pressable
                key={command}
                accessibilityRole="button"
                accessibilityLabel={
                  command === '妙猜猜'
                    ? textFor(language, '妙猜猜', 'Miao Guess')
                    : textFor(language, `添加${command}`, `Add ${command}`)
                }
                disabled={isSending}
                accessibilityState={{ disabled: isSending }}
                onPress={() => {
                  if (!isSending) onSelectTool(command);
                }}
                style={[s.toolItem, isSending && s.disabled]}
              >
                <View
                  style={[
                    s.toolIcon,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  {composerToolIcon(command, palette.text)}
                </View>
                <Text style={[s.toolLabel, { color: palette.secondaryText }]}>
                  {textFor(
                    language,
                    command,
                    (
                      {
                        妙猜猜: 'Miao Guess',
                        相册: 'Photos',
                        拍摄: 'Camera',
                        视频: 'Video',
                        文件: 'File',
                        位置: 'Location',
                        联系人: 'Contact',
                        任务: 'Task',
                        文件库: 'Files',
                        小站素材: 'My media',
                      } as Record<string, string>
                    )[command],
                  )}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  disabled: { opacity: 0.45 },
  panel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginTop: 8,
  },
  header: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 18,
    paddingRight: 6,
  },
  title: { fontSize: 14, fontWeight: '600' },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsViewport: { flexGrow: 0, flexShrink: 0, height: 44 },
  tabs: { alignItems: 'center', paddingHorizontal: 12, gap: 2 },
  tab: {
    minHeight: 40,
    minWidth: 48,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  tabLabel: { fontSize: 13 },
  body: { flex: 1, minHeight: 0 },
  emojiContent: { paddingHorizontal: 12, paddingBottom: 12 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  emojiCell: {
    width: '14.2857%',
    height: 48,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  emoji: { fontSize: 28 },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  stickerCell: { width: '25%', alignItems: 'center', paddingVertical: 4 },
  stickerAdd: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerImage: { width: 56, height: 56, borderRadius: 8 },
  stickerSend: {
    width: 64,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerDelete: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerLabel: { fontSize: 12, marginTop: 4 },
  status: { paddingVertical: 8, alignItems: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  empty: { paddingVertical: 12, textAlign: 'center', fontSize: 13 },
  toolsContent: { paddingHorizontal: 10, paddingBottom: 12 },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  toolItem: { width: '25%', alignItems: 'center', paddingVertical: 8, gap: 6 },
  toolIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolLabel: { fontSize: 12, textAlign: 'center', minHeight: 18 },
});
