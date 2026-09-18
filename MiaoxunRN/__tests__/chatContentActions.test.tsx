import React from 'react';
import {
  Alert,
  FlatList,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import ReactTestRenderer from 'react-test-renderer';

import { AIAssistGestureSurface } from '../src/features/assist/AIAssistGestureSurface';
import {
  AIAssistAction,
  AIAssistObjectReference,
} from '../src/features/assist/aiAssistTypes';
import { ChatComposer } from '../src/features/messages/ChatComposer';
import { ChatMessageItem } from '../src/features/messages/ChatMessageItem';
import { ChatMessageMenu } from '../src/features/messages/ChatMessageMenu';
import { ChatScreen } from '../src/features/messages/MessagesScreen';
import { ChatMessage, ChatThread } from '../src/features/session/sessionTypes';
import { emptyProfile } from '../src/features/session/sessionDefaults';
import { palettes } from '../src/shared/theme';
import { MessageInlineAction } from '../src/shared/ui';

const mockAssist = {
  isActive: false,
  activeSourceId: undefined,
  open: jest.fn(),
  move: jest.fn(),
  release: jest.fn(),
  dismiss: jest.fn(),
  askButler: jest.fn(),
};

jest.mock('../src/features/assist/AIAssistProvider', () => ({
  useAIAssist: () => mockAssist,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const message: ChatMessage = {
  id: 'message-1',
  threadId: 'thread-1',
  senderType: 'user',
  senderName: 'Gary',
  content: '一条真实消息',
  metadata: { senderUserId: 'user-1' },
  createdAt: '2026-09-16T08:00:00.000Z',
};
const thread = {
  id: 'thread-1',
  title: '朋友',
  kind: 'direct',
  peerUserId: 'peer-1',
  messages: [message],
} as ChatThread;
const touchEvent = { nativeEvent: { pageX: 180, pageY: 260 } };

describe('Chat content actions', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAssist.isActive = false;
  });

  afterEach(async () => {
    await ReactTestRenderer.act(() => renderer?.unmount());
    jest.restoreAllMocks();
  });

  const renderMessage = async (
    overrides: Partial<React.ComponentProps<typeof ChatMessageItem>> = {},
  ) => {
    const props = {
      item: message,
      previousMessage: null,
      palette: palettes.light,
      language: 'zh' as const,
      currentUserId: 'user-1',
      currentUserName: 'Gary',
      thread,
      agents: [],
      isDarkPalette: false,
      renderUserAvatar: () => <View />,
      onOpenMessageMenu: jest.fn(),
      onRetrySend: jest.fn(),
      onActionMessage: jest.fn(),
      ...overrides,
    };
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<ChatMessageItem {...props} />);
    });
    return props;
  };

  it('shares/copies the real message and passes its context to Butler', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({
      action: Share.sharedAction,
    });
    const props = await renderMessage();
    const surface = renderer.root.findByType(AIAssistGestureSurface);
    const object: AIAssistObjectReference = surface.props.object;
    const actions: AIAssistAction[] = surface.props.actions;
    expect(object).toMatchObject({
      kind: 'chat-message',
      id: message.id,
      metadata: { content: message.content, threadId: thread.id },
    });
    expect(actions.map(action => action.direction)).toEqual([
      'up',
      'right',
      'down',
      'left',
    ]);
    expect(actions.map(action => action.label)).toEqual([
      '分享',
      '妙管家',
      '复制',
      '更多',
    ]);

    await ReactTestRenderer.act(() => actions[0].onSelect(object));
    expect(share).toHaveBeenCalledWith({ message: message.content });
    await ReactTestRenderer.act(() => actions[1].onSelect(object));
    expect(mockAssist.askButler).toHaveBeenCalledWith(object);
    await ReactTestRenderer.act(() => actions[2].onSelect(object));
    expect(Clipboard.setString).toHaveBeenCalledWith(message.content);
    expect(props.onActionMessage).toHaveBeenCalledWith('消息已复制');
  });

  it('closes the global menu before opening local More at the message point', async () => {
    const order: string[] = [];
    mockAssist.dismiss.mockImplementation(() => order.push('dismiss'));
    const onOpenMessageMenu = jest.fn(() => order.push('more'));
    await renderMessage({ onOpenMessageMenu });
    const touchView = renderer.root
      .findAllByType(View)
      .find(node => typeof node.props.onTouchStart === 'function');
    await ReactTestRenderer.act(() =>
      touchView!.props.onTouchStart(touchEvent),
    );
    const surface = renderer.root.findByType(AIAssistGestureSurface);
    const more: AIAssistAction = surface.props.actions.find(
      (action: AIAssistAction) => action.direction === 'left',
    );
    await ReactTestRenderer.act(() => more.onSelect(surface.props.object));
    expect(order).toEqual(['dismiss', 'more']);
    expect(onOpenMessageMenu).toHaveBeenCalledWith(message, true, {
      x: 180,
      y: 260,
    });
  });

  it('does not expose message content actions after recall', async () => {
    await renderMessage({
      item: { ...message, recalledAt: '2026-09-16T08:00:30Z' },
    });
    expect(renderer.root.findAllByType(AIAssistGestureSurface)).toHaveLength(0);
  });

  it('keeps long text, reply context and failed-send retry inside the full-width card', async () => {
    const content = `${'很长的消息内容'.repeat(
      80,
    )}\n${'https://example.com/'.repeat(15)}`;
    const item: ChatMessage = {
      ...message,
      content,
      localStatus: 'failed',
      metadata: {
        ...message.metadata,
        replyTo: { senderName: '朋友', content: '原始引用内容' },
      },
    };
    const renderUserAvatar = jest.fn(() => <View testID="real-user-avatar" />);
    const props = await renderMessage({
      item,
      currentUserAvatarConfig: emptyProfile.avatarConfig,
      renderUserAvatar,
    });
    expect(renderUserAvatar).toHaveBeenCalledWith(
      expect.objectContaining({
        config: emptyProfile.avatarConfig,
        size: 36,
      }),
    );
    const body = renderer.root.findByProps({
      testID: `chat-message-content-${item.id}`,
    });
    expect(body.props.children).toBe(content);
    expect(body.props.numberOfLines).toBeUndefined();
    expect(StyleSheet.flatten(body.props.style).height).toBeUndefined();
    const surface = renderer.root.findByType(AIAssistGestureSurface);
    expect(StyleSheet.flatten(surface.props.style)).toMatchObject({
      width: '100%',
      backgroundColor: '#F0EBFD',
    });
    const texts = renderer.root
      .findAllByType(Text)
      .map(node => node.props.children);
    expect(texts).toContain('原始引用内容');
    expect(texts).toContain('发送失败，点击重试');
    expect(texts).not.toContain('我');
    await ReactTestRenderer.act(() => surface.props.onPress());
    expect(props.onRetrySend).toHaveBeenCalledWith(item);
  });

  it('opens draft actions without overriding native text selection or sending', async () => {
    const onSend = jest.fn();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({
      action: Share.sharedAction,
    });
    const alert = jest.spyOn(Alert, 'alert');
    const props = {
      palette: palettes.light,
      language: 'zh' as const,
      threadTitle: thread.title,
      threadId: thread.id,
      draft: '待编辑的内容',
      isSending: false,
      isRecognizingSpeech: false,
      replyTarget: null,
      onChangeDraft: jest.fn(),
      onClearReplyTarget: jest.fn(),
      onFocusInput: jest.fn(),
      onRecognizeSpeech: jest.fn(),
      onSend,
      onActionMessage: jest.fn(),
    };
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<ChatComposer {...props} />);
    });
    const input = renderer.root.findByType(TextInput);
    expect(input.props.onLongPress).toBeUndefined();
    expect(input.props.contextMenuHidden).not.toBe(true);
    const sendButton = renderer.root
      .findAllByProps({ accessibilityLabel: '发送消息' })
      .find(node => typeof node.props.onPress === 'function');
    expect(
      StyleSheet.flatten(sendButton!.props.style).minHeight,
    ).toBeGreaterThanOrEqual(44);
    const button = renderer.root
      .findAllByProps({ testID: 'chat-draft-assist' })
      .find(node => typeof node.props.onPress === 'function');
    await ReactTestRenderer.act(() => button!.props.onPress(touchEvent));
    expect(mockAssist.open).toHaveBeenCalledWith(
      expect.objectContaining({
        object: expect.objectContaining({
          kind: 'chat-draft',
          metadata: { content: props.draft, threadId: thread.id },
        }),
        point: { x: 180, y: 260 },
      }),
    );
    const request = mockAssist.open.mock.calls[0][0];
    const actions: AIAssistAction[] = request.actions;
    expect(actions.map(action => [action.direction, action.label])).toEqual([
      ['up', '换行'],
      ['right', '妙管家'],
      ['down', '粘贴'],
      ['left', '更多'],
    ]);
    await ReactTestRenderer.act(() => {
      input.props.onSelectionChange({
        nativeEvent: { selection: { start: 2, end: 2 } },
      });
      actions[0].onSelect(request.object);
    });
    expect(props.onChangeDraft).toHaveBeenCalledWith('待编\n辑的内容');
    jest.mocked(Clipboard.getString).mockResolvedValueOnce('粘贴文本');
    await ReactTestRenderer.act(async () => {
      input.props.onSelectionChange({
        nativeEvent: { selection: { start: 1, end: 3 } },
      });
      await actions[2].onSelect(request.object);
    });
    expect(props.onChangeDraft).toHaveBeenCalledWith('待粘贴文本的内容');
    await ReactTestRenderer.act(() => actions[1].onSelect(request.object));
    expect(mockAssist.askButler).toHaveBeenCalledWith(request.object);
    await ReactTestRenderer.act(() => actions[3].onSelect(request.object));
    const moreButtons = alert.mock.calls.at(-1)![2]!;
    expect(moreButtons.map(item => item.text)).toEqual([
      '分享',
      '复制',
      '继续编辑',
      '取消',
    ]);
    await ReactTestRenderer.act(() => moreButtons[0].onPress?.());
    expect(share).toHaveBeenCalledWith({ message: props.draft });
    await ReactTestRenderer.act(() => moreButtons[1].onPress?.());
    expect(Clipboard.setString).toHaveBeenCalledWith(props.draft);
    expect(onSend).not.toHaveBeenCalled();
    await ReactTestRenderer.act(() => sendButton!.props.onPress());
    expect(onSend).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(() => {
      renderer.update(<ChatComposer {...props} draft="   " />);
    });
    expect(
      renderer.root.findAllByProps({ testID: 'chat-draft-assist' })[0].props
        .disabled,
    ).toBe(false);
    expect(
      renderer.root
        .findAllByProps({ accessibilityLabel: '发送消息' })
        .find(node => typeof node.props.onPress === 'function')!.props.disabled,
    ).toBe(true);
  });

  it('requires confirmation before deleting and keeps Recall permission gated', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const onDeleteMessage = jest.fn();
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ChatMessageMenu
          palette={palettes.light}
          language="zh"
          selectedMessage={message}
          position={{ x: 12, y: 120, isMine: true }}
          arrowLeft={34}
          canRecall={false}
          onClose={jest.fn()}
          onReply={jest.fn()}
          onDeleteMessage={onDeleteMessage}
          onRecallMessage={jest.fn()}
          onActionMessage={jest.fn()}
        />,
      );
    });
    const actions = renderer.root.findAllByType(MessageInlineAction);
    expect(actions.some(action => action.props.title === '撤回')).toBe(false);
    await ReactTestRenderer.act(() =>
      actions.find(action => action.props.title === '删除')!.props.onPress(),
    );
    expect(onDeleteMessage).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2]!;
    expect(buttons.some(button => button.style === 'cancel')).toBe(true);
    await ReactTestRenderer.act(() =>
      buttons.find(button => button.style === 'destructive')!.onPress?.(),
    );
    expect(onDeleteMessage).toHaveBeenCalledWith(message.id);
  });

  it('disables list scrolling while global content actions are open', async () => {
    const props = {
      palette: palettes.light,
      language: 'zh' as const,
      currentUserId: 'user-1',
      currentUserName: 'Gary',
      thread,
      agents: [],
      renderUserAvatar: () => <View />,
      onBack: jest.fn(),
      onSend: jest.fn(),
      onDeleteMessage: jest.fn(),
      onRecallMessage: jest.fn(),
      onSetMuted: jest.fn(async () => undefined),
      onActionError: jest.fn(),
    };
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<ChatScreen {...props} />);
    });
    expect(renderer.root.findByType(FlatList).props.scrollEnabled).toBe(true);
    mockAssist.isActive = true;
    await ReactTestRenderer.act(() =>
      renderer.update(<ChatScreen {...props} />),
    );
    expect(renderer.root.findByType(FlatList).props.scrollEnabled).toBe(false);
    mockAssist.isActive = false;
    await ReactTestRenderer.act(() =>
      renderer.update(<ChatScreen {...props} />),
    );
    expect(renderer.root.findByType(FlatList).props.scrollEnabled).toBe(true);
  });
});
