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
import { WorkspaceContextCard } from '../src/features/messages/WorkspaceContextCard';
import { ChatScreen } from '../src/features/messages/MessagesScreen';
import { WorkspaceContributionCard } from '../src/features/messages/WorkspaceContributionCard';
import { ChatMessage, ChatThread } from '../src/features/session/sessionTypes';
import { emptyProfile } from '../src/features/session/sessionDefaults';
import { palettes, productColors } from '../src/shared/theme';
import { MessageInlineAction } from '../src/shared/ui';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';
import { useWorkspaceContributions } from '../src/features/messages/useWorkspaceContributions';
import {
  prepareSpeechRecognition,
  startSpeechRecognition,
} from '../src/services/speechToText';

jest.mock('../src/services/speechToText', () => ({
  prepareSpeechRecognition: jest.fn(),
  startSpeechRecognition: jest.fn(),
}));
jest.mock('../src/features/ai/useAITasks', () => ({
  useAITasks: () => ({
    tasks: [],
    error: '',
    decisionError: '',
    pendingTaskId: null,
    refresh: jest.fn(async () => undefined),
  }),
}));

jest.mock('../src/features/messages/useWorkspaceContributions', () => ({
  useWorkspaceContributions: jest.fn(() => ({
    contributions: [],
    unavailable: 0,
    hasMore: false,
    error: '',
  })),
}));

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
    jest.mocked(useWorkspaceContributions).mockReturnValue({
      contributions: [],
      unavailable: 0,
      hasMore: false,
      error: '',
      loading: false,
      historyLoaded: false,
      loadMore: async () => {},
      retry: async () => {},
    });
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
    const measureInWindow = jest
      .spyOn(View.prototype, 'measureInWindow')
      .mockImplementation(callback => callback(12, 100, 320, 96));
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
    expect(measureInWindow).toHaveBeenCalled();
    expect(onOpenMessageMenu).toHaveBeenCalledWith(
      message,
      true,
      { x: 180, y: 260 },
      { x: 12, y: 100, width: 320, height: 96 },
    );
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
    // Asserted against the token rather than a literal, so a palette pass
    // cannot leave this test asserting a colour the app no longer uses.
    expect(StyleSheet.flatten(surface.props.style)).toMatchObject({
      width: '100%',
      backgroundColor: productColors.border,
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

  it('keeps the chat composer focused on speech, native editing and sending', async () => {
    const onSend = jest.fn();
    const onChangeDraft = jest.fn();
    const onFocusInput = jest.fn();
    const onRecognizeSpeech = jest.fn();
    const props = {
      palette: palettes.light,
      language: 'zh' as const,
      threadTitle: thread.title,
      draft: '待编辑的内容',
      isSending: false,
      isRecognizingSpeech: false,
      replyTarget: null,
      onChangeDraft,
      onClearReplyTarget: jest.fn(),
      onFocusInput,
      onRecognizeSpeech,
      onSend,
    };
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<ChatComposer {...props} />);
    });
    const input = renderer.root.findByType(TextInput);
    expect(input.props.onLongPress).toBeUndefined();
    expect(input.props.contextMenuHidden).not.toBe(true);
    await ReactTestRenderer.act(() => input.props.onChangeText('新的内容'));
    expect(onChangeDraft).toHaveBeenCalledWith('新的内容');
    await ReactTestRenderer.act(() => input.props.onFocus());
    expect(onFocusInput).toHaveBeenCalledTimes(1);
    const sendButton = renderer.root
      .findAllByProps({ accessibilityLabel: '发送消息' })
      .find(node => typeof node.props.onPress === 'function');
    expect(
      StyleSheet.flatten(sendButton!.props.style).minHeight,
    ).toBeGreaterThanOrEqual(44);
    const speechButton = renderer.root
      .findAllByProps({ accessibilityLabel: '语音转文字' })
      .find(node => typeof node.props.onPress === 'function');
    expect(speechButton).toBeTruthy();
    await ReactTestRenderer.act(() => speechButton!.props.onPress());
    expect(onRecognizeSpeech).toHaveBeenCalledTimes(1);
    expect(
      renderer.root.findAllByProps({ testID: 'chat-draft-assist' }),
    ).toHaveLength(0);
    expect(
      renderer.root
        .findAllByType(Text)
        .map(node => node.props.children)
        .flat(),
    ).not.toContain('妙管家');
    expect(onSend).not.toHaveBeenCalled();
    await ReactTestRenderer.act(() => sendButton!.props.onPress());
    expect(onSend).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(() => {
      renderer.update(<ChatComposer {...props} draft="   " />);
    });
    expect(
      renderer.root.findAllByProps({ testID: 'chat-draft-assist' }),
    ).toHaveLength(0);
    expect(
      renderer.root
        .findAllByProps({ accessibilityLabel: '发送消息' })
        .find(node => typeof node.props.onPress === 'function')!.props.disabled,
    ).toBe(true);
  });

  it('renders Butler quick-command capsules without sending on tap', async () => {
    const onChangeDraft = jest.fn();
    const onQuickCommand = jest.fn();
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ChatComposer
          palette={palettes.light}
          language="zh"
          threadTitle="妙讯管家"
          draft=""
          isSending={false}
          isRecognizingSpeech={false}
          replyTarget={null}
          quickCommands={['生成今日待办', '今晚只提醒紧急事项']}
          onQuickCommand={onQuickCommand}
          onChangeDraft={onChangeDraft}
          onClearReplyTarget={jest.fn()}
          onFocusInput={jest.fn()}
          onRecognizeSpeech={jest.fn()}
          onSend={jest.fn()}
        />,
      );
    });
    const command = renderer.root.findByProps({
      accessibilityLabel: '使用快捷指令：生成今日待办',
    });
    const quickCommandScroller = renderer.root.findByProps({
      testID: 'chat-quick-commands',
    });
    expect(StyleSheet.flatten(quickCommandScroller.props.style)).toEqual(
      expect.objectContaining({ overflow: 'hidden', flexShrink: 1 }),
    );
    expect(quickCommandScroller.props.onMoveShouldSetResponderCapture).toEqual(
      expect.any(Function),
    );
    await ReactTestRenderer.act(() => command.props.onPress());
    expect(onQuickCommand).toHaveBeenCalledWith('生成今日待办');
    expect(onChangeDraft).not.toHaveBeenCalled();
  });

  it('keeps attachment tools separate from quick-command draft insertion', async () => {
    const onQuickCommand = jest.fn();
    const onComposerTool = jest.fn();
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ChatComposer
          palette={palettes.light}
          language="zh"
          threadTitle="妙讯管家"
          draft=""
          isSending={false}
          isRecognizingSpeech={false}
          replyTarget={null}
          onQuickCommand={onQuickCommand}
          onComposerTool={onComposerTool}
          onChangeDraft={jest.fn()}
          onClearReplyTarget={jest.fn()}
          onFocusInput={jest.fn()}
          onRecognizeSpeech={jest.fn()}
          onSend={jest.fn()}
        />,
      );
    });
    await ReactTestRenderer.act(() =>
      renderer.root
        .findByProps({ accessibilityLabel: '更多功能' })
        .props.onPress(),
    );
    expect(
      renderer.root.findByProps({ accessibilityLabel: '聊天扩展功能' }),
    ).toBeDefined();
    await ReactTestRenderer.act(() =>
      renderer.root
        .findByProps({ accessibilityLabel: '添加相册' })
        .props.onPress(),
    );
    expect(onComposerTool).toHaveBeenCalledWith('相册');
    expect(onQuickCommand).not.toHaveBeenCalled();
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: '聊天扩展功能' }),
    ).toHaveLength(0);
  });

  it('closes attachment tools when the message input receives focus', async () => {
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ChatComposer
          palette={palettes.light}
          language="zh"
          threadTitle="妙讯管家"
          draft=""
          isSending={false}
          isRecognizingSpeech={false}
          replyTarget={null}
          onChangeDraft={jest.fn()}
          onClearReplyTarget={jest.fn()}
          onFocusInput={jest.fn()}
          onRecognizeSpeech={jest.fn()}
          onSend={jest.fn()}
        />,
      );
    });
    await ReactTestRenderer.act(() =>
      renderer.root
        .findByProps({ accessibilityLabel: '更多功能' })
        .props.onPress(),
    );
    await ReactTestRenderer.act(() =>
      renderer.root.findByType(TextInput).props.onFocus(),
    );
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: '聊天扩展功能' }),
    ).toHaveLength(0);
  });

  it('keeps the shortcut row horizontally scrollable and grows the multiline input', async () => {
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ChatComposer
          palette={palettes.light}
          language="zh"
          threadTitle="妙讯管家"
          draft={'今晚只提醒紧急事项\n请保留第二行'}
          isSending={false}
          isRecognizingSpeech={false}
          replyTarget={null}
          quickCommands={['一', '二', '三']}
          onChangeDraft={jest.fn()}
          onClearReplyTarget={jest.fn()}
          onFocusInput={jest.fn()}
          onRecognizeSpeech={jest.fn()}
          onSend={jest.fn()}
        />,
      );
    });
    const quickCommands = renderer.root.findByProps({
      testID: 'chat-quick-commands',
    });
    expect(quickCommands.props.onResponderMove).toEqual(expect.any(Function));
    expect(StyleSheet.flatten(quickCommands.props.style)).toEqual(
      expect.objectContaining({ width: '100%', flexShrink: 1 }),
    );
    const input = renderer.root.findByType(TextInput);
    expect(StyleSheet.flatten(input.props.style)).toEqual(
      expect.objectContaining({ textAlignVertical: 'top' }),
    );
    await ReactTestRenderer.act(() =>
      input.props.onContentSizeChange({
        nativeEvent: { contentSize: { height: 82 } },
      }),
    );
    expect(StyleSheet.flatten(input.props.style)).toEqual(
      expect.objectContaining({ height: 82 }),
    );
    await ReactTestRenderer.act(() =>
      input.props.onChangeText('第一行\n第二行\n第三行'),
    );
    expect(StyleSheet.flatten(input.props.style)).toEqual(
      expect.objectContaining({ height: 85 }),
    );
  });

  it('does not turn a horizontal shortcut swipe into a draft insertion', async () => {
    const onQuickCommand = jest.fn();
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ChatComposer
          palette={palettes.light}
          language="zh"
          threadTitle="妙讯管家"
          draft=""
          isSending={false}
          isRecognizingSpeech={false}
          replyTarget={null}
          quickCommands={['生成今日待办', '今晚只提醒紧急事项']}
          onQuickCommand={onQuickCommand}
          onChangeDraft={jest.fn()}
          onClearReplyTarget={jest.fn()}
          onFocusInput={jest.fn()}
          onRecognizeSpeech={jest.fn()}
          onSend={jest.fn()}
        />,
      );
    });
    const scroller = renderer.root.findByProps({
      testID: 'chat-quick-commands',
    });
    const command = renderer.root.findByProps({
      accessibilityLabel: '使用快捷指令：今晚只提醒紧急事项',
    });
    const touchStart = { nativeEvent: { pageX: 760, pageY: 1680 } };
    const touchMove = { nativeEvent: { pageX: 280, pageY: 1680 } };
    await ReactTestRenderer.act(() =>
      scroller.props.onStartShouldSetResponderCapture(touchStart),
    );
    expect(scroller.props.onMoveShouldSetResponderCapture(touchMove)).toBe(
      true,
    );
    await ReactTestRenderer.act(() => scroller.props.onResponderGrant());
    await ReactTestRenderer.act(() =>
      scroller.props.onResponderMove(touchMove),
    );
    await ReactTestRenderer.act(() =>
      scroller.props.onResponderRelease(touchMove),
    );
    await ReactTestRenderer.act(() =>
      command.props.onPressIn({ nativeEvent: { pageX: 760, pageY: 1680 } }),
    );
    await ReactTestRenderer.act(() =>
      command.props.onPressMove({ nativeEvent: { pageX: 280, pageY: 1680 } }),
    );
    await ReactTestRenderer.act(() => command.props.onPress());
    expect(onQuickCommand).not.toHaveBeenCalled();
  });

  it('does not submit a shortcut after a sustained touch', async () => {
    jest.useFakeTimers();
    const onQuickCommand = jest.fn();
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ChatComposer
          palette={palettes.light}
          language="zh"
          threadTitle="妙讯管家"
          draft=""
          isSending={false}
          isRecognizingSpeech={false}
          replyTarget={null}
          quickCommands={['生成今日待办']}
          onQuickCommand={onQuickCommand}
          onChangeDraft={jest.fn()}
          onClearReplyTarget={jest.fn()}
          onFocusInput={jest.fn()}
          onRecognizeSpeech={jest.fn()}
          onSend={jest.fn()}
        />,
      );
    });
    const command = renderer.root.findByProps({
      accessibilityLabel: '使用快捷指令：生成今日待办',
    });
    await ReactTestRenderer.act(() =>
      command.props.onPressIn({ nativeEvent: { pageX: 100, pageY: 100 } }),
    );
    await ReactTestRenderer.act(() => jest.advanceTimersByTime(450));
    await ReactTestRenderer.act(() => command.props.onPress());
    expect(onQuickCommand).not.toHaveBeenCalled();
    jest.useRealTimers();
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
          position={{ x: 12, y: 120, isMine: true, arrowPlacement: 'bottom' }}
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
    expect(actions.some(action => action.props.title === '复制')).toBe(false);
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

  it('reserves the measured composer height so the last message is not covered', async () => {
    const props = {
      palette: palettes.light,
      language: 'zh' as const,
      currentUserId: 'user-1',
      currentUserName: 'Gary',
      thread: { ...thread, agentId: 'miaoxun-butler' },
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
    const composer = renderer.root.findByType(ChatComposer);
    const list = renderer.root.findByType(FlatList);
    const footer = () => {
      const element = list.props.ListFooterComponent as React.ReactElement<{
        children?: React.ReactNode;
      }>;
      const children = React.Children.toArray(element.props.children);
      return children[children.length - 1] as React.ReactElement<{
        style?: unknown;
      }>;
    };
    expect(footer().props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 48 })]),
    );
    await ReactTestRenderer.act(() =>
      composer.props.onLayout({ nativeEvent: { layout: { height: 124 } } }),
    );
    expect(footer().props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 136 })]),
    );
  });

  it('merges a real contribution into the ordinary chronological chat timeline', async () => {
    const workspace = agentWorkspace({
      steps: [
        workspaceStep({
          agentId: 'album-manager',
          goal: '筛选旅行照片',
          summary: '已筛出 8 张候选照片。',
          status: 'succeeded',
          createdAt: '2026-09-16T07:00:00.000Z',
        }),
      ],
    });
    jest.mocked(useWorkspaceContributions).mockReturnValue({
      contributions: [{ workspace, step: workspace.steps[0] }],
      unavailable: 0,
      hasMore: false,
      error: '',
      loading: false,
      historyLoaded: false,
      loadMore: async () => {},
      retry: async () => {},
    });
    const props = {
      palette: palettes.light,
      language: 'zh' as const,
      currentUserId: 'user-1',
      currentUserName: 'Gary',
      thread: { ...thread, agentId: 'album-manager' },
      agents: [],
      renderUserAvatar: () => <View />,
      onBack: jest.fn(),
      onSend: jest.fn(),
      onDeleteMessage: jest.fn(),
      onRecallMessage: jest.fn(),
      onSetMuted: jest.fn(async () => undefined),
      onActionError: jest.fn(),
      token: 'owner-token',
      workspaceContribution: { workspace, step: workspace.steps[0] },
    };
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<ChatScreen {...props} />);
    });
    const list = renderer.root.findByType(FlatList);
    const footer = list.props.ListFooterComponent as React.ReactElement<{
      children?: React.ReactNode;
    }>;
    expect(footer).toBeTruthy();
    const children = React.Children.toArray(footer.props.children);
    expect(
      children.some(
        child =>
          React.isValidElement(child) &&
          child.type === WorkspaceContributionCard,
      ),
    ).toBe(false);
    expect(list.props.data.map((item: { kind: string }) => item.kind)).toEqual([
      'contribution',
      'message',
    ]);
    expect(list.props.keyExtractor(list.props.data[0])).toBe(
      'contribution:node-1',
    );
    expect(
      list.props.renderItem({ item: list.props.data[0], index: 0 }).type,
    ).toBe(WorkspaceContributionCard);
  });

  it('follows new messages only near the bottom after history is loaded', async () => {
    jest.useFakeTimers();
    jest.mocked(useWorkspaceContributions).mockReturnValue({
      contributions: [],
      unavailable: 0,
      hasMore: false,
      error: '',
      loading: false,
      historyLoaded: true,
      loadMore: async () => {},
      retry: async () => {},
    });
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
      token: 'owner-token',
    };
    const spy = jest
      .spyOn(FlatList.prototype, 'scrollToEnd')
      .mockImplementation(() => {});
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<ChatScreen {...props} />);
    });
    await ReactTestRenderer.act(async () => {
      jest.runAllTimers();
    });
    spy.mockClear();
    const list = renderer.root.findByType(FlatList);
    const event = (y: number) => ({
      nativeEvent: {
        contentOffset: { y },
        contentSize: { height: 1000 },
        layoutMeasurement: { height: 400 },
      },
    });
    await ReactTestRenderer.act(async () => {
      list.props.onScroll(event(100));
    });
    jest.mocked(useWorkspaceContributions).mockReturnValue({
      contributions: [],
      unavailable: 0,
      hasMore: false,
      error: '',
      loading: false,
      historyLoaded: false,
      loadMore: async () => {},
      retry: async () => {},
    });
    await ReactTestRenderer.act(async () => {
      renderer.update(<ChatScreen {...props} />);
    });
    await ReactTestRenderer.act(async () => {
      list.props.onLayout();
      jest.runAllTimers();
    });
    expect(spy).not.toHaveBeenCalled();
    jest.mocked(useWorkspaceContributions).mockReturnValue({
      contributions: [],
      unavailable: 0,
      hasMore: false,
      error: '',
      loading: false,
      historyLoaded: true,
      loadMore: async () => {},
      retry: async () => {},
    });
    await ReactTestRenderer.act(async () => {
      renderer.update(
        <ChatScreen
          {...props}
          thread={{ ...thread, messages: [message, { ...message, id: '2' }] }}
        />,
      );
    });
    await ReactTestRenderer.act(async () => {
      jest.runAllTimers();
    });
    expect(spy).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => {
      list.props.onScroll(event(600));
    });
    await ReactTestRenderer.act(async () => {
      renderer.update(
        <ChatScreen
          {...props}
          thread={{
            ...thread,
            messages: [
              message,
              { ...message, id: '2' },
              { ...message, id: '3' },
            ],
          }}
        />,
      );
    });
    await ReactTestRenderer.act(async () => {
      jest.runAllTimers();
    });
    expect(spy).toHaveBeenCalled();
    spy.mockClear();
    const contribution = (id: string, createdAt: string) => {
      const workspace = agentWorkspace({
        steps: [workspaceStep({ id, createdAt })],
      });
      return { workspace, step: workspace.steps[0] };
    };
    const recent = contribution('recent', '2026-09-16T09:00:00.000Z');
    jest.mocked(useWorkspaceContributions).mockReturnValue({
      contributions: [recent],
      unavailable: 0,
      hasMore: true,
      error: '',
      loading: false,
      historyLoaded: false,
      loadMore: async () => {},
      retry: async () => {},
    });
    const latestThread = {
      ...thread,
      messages: [message, { ...message, id: '2' }, { ...message, id: '3' }],
    };
    await ReactTestRenderer.act(async () => {
      renderer.update(<ChatScreen {...props} thread={latestThread} />);
    });
    await ReactTestRenderer.act(async () => {
      jest.runAllTimers();
    });
    expect(spy).toHaveBeenCalled();
    spy.mockClear();
    const earlier = contribution('earlier', '2026-09-16T07:00:00.000Z');
    jest.mocked(useWorkspaceContributions).mockReturnValue({
      contributions: [recent, earlier],
      unavailable: 0,
      hasMore: false,
      error: '',
      loading: false,
      historyLoaded: true,
      loadMore: async () => {},
      retry: async () => {},
    });
    await ReactTestRenderer.act(async () => {
      renderer.update(<ChatScreen {...props} thread={latestThread} />);
    });
    await ReactTestRenderer.act(async () => {
      jest.runAllTimers();
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockClear();
    await ReactTestRenderer.act(async () => {
      list.props.onScroll(event(100));
      renderer.root.findByType(ChatComposer).props.onChangeDraft('继续');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(ChatComposer).props.onSend();
    });
    await ReactTestRenderer.act(async () => {
      jest.runAllTimers();
    });
    expect(props.onSend).toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it.each(['ui-agent', 'group'] as const)(
    'does not poll workspace contributions for a %s conversation',
    async kind => {
      const props = {
        palette: palettes.light,
        language: 'zh' as const,
        currentUserId: 'user-1',
        currentUserName: 'Gary',
        thread: {
          ...thread,
          agentId: kind === 'ui-agent' ? 'ui-agent' : 'comic-diary',
          kind: kind === 'group' ? ('group' as const) : ('agent' as const),
        },
        agents: [],
        renderUserAvatar: () => <View />,
        token: 'owner',
        onBack: jest.fn(),
        onSend: jest.fn(),
        onDeleteMessage: jest.fn(),
        onRecallMessage: jest.fn(),
        onSetMuted: jest.fn(async () => undefined),
        onActionError: jest.fn(),
      };
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(<ChatScreen {...props} />);
      });
      expect(
        jest.mocked(useWorkspaceContributions).mock.calls.at(-1)?.[1],
      ).toBeUndefined();
    },
  );

  it('selects one contribution explicitly, sends its node context, and removes it before an ordinary new request', async () => {
    const workspace = agentWorkspace({
      id: '45267cd7-549c-4f8f-8576-49d061cc335a',
    });
    const context = {
      id: workspace.id,
      revision: 3,
      currentRound: 1,
      nodeId: '12a41286-e950-42a7-b482-1d1c56414e89',
      goal: workspace.goal,
    };
    jest.mocked(useWorkspaceContributions).mockReturnValue({
      contributions: [{ workspace, step: workspace.steps[0] }],
      unavailable: 0,
      hasMore: false,
      error: '',
      loading: false,
      historyLoaded: false,
      loadMore: async () => {},
      retry: async () => {},
    });
    const props = {
      palette: palettes.light,
      language: 'zh' as const,
      currentUserId: 'user-1',
      currentUserName: 'Gary',
      thread: { ...thread, agentId: 'comic-diary' },
      agents: [],
      renderUserAvatar: () => <View />,
      token: 'owner',
      onBack: jest.fn(),
      onSend: jest.fn<
        Promise<boolean>,
        Parameters<React.ComponentProps<typeof ChatScreen>['onSend']>
      >(async () => true),
      onDeleteMessage: jest.fn(),
      onRecallMessage: jest.fn(),
      onSetMuted: jest.fn(async () => undefined),
      onActionError: jest.fn(),
      onOpenWorkspace: jest.fn(),
    };
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<ChatScreen {...props} />);
    });
    const list = renderer.root.findByType(FlatList);
    const contribution = list.props.data.find(
      (item: { kind: string }) => item.kind === 'contribution',
    );
    const card = list.props.renderItem({ item: contribution, index: 0 });
    const composer = () => renderer.root.findByType(ChatComposer);
    expect(composer().props.workspaceActions).toBeUndefined();
    await ReactTestRenderer.act(async () => {
      card.props.onDiscuss(context);
    });
    expect(
      renderer.root.findByType(WorkspaceContextCard).props.context,
    ).toEqual(context);
    await ReactTestRenderer.act(async () => {
      composer().props.onChangeDraft('请解释这一步');
    });
    await ReactTestRenderer.act(async () => {
      composer().props.onSend();
    });
    expect(props.onSend.mock.calls[0][6]).toEqual(context);
    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(WorkspaceContextCard).props.onRemove();
    });
    await ReactTestRenderer.act(async () => {
      composer().props.onChangeDraft('一个新需求');
    });
    await ReactTestRenderer.act(async () => {
      composer().props.onSend();
    });
    expect(props.onSend.mock.calls[1][6]).toBeUndefined();
    expect(props.onSend.mock.calls[1][7]).toBe(true);
    await ReactTestRenderer.act(async () => {
      card.props.onDiscuss(context);
    });
    await ReactTestRenderer.act(async () => {
      renderer.update(
        <ChatScreen {...props} token="new-owner" currentUserId="other-user" />,
      );
    });
    expect(renderer.root.findAllByType(WorkspaceContextCard)).toHaveLength(0);
  });

  it('does not append the same Butler quick command twice', async () => {
    const props = {
      palette: palettes.light,
      language: 'zh' as const,
      currentUserId: 'user-1',
      currentUserName: 'Gary',
      thread: { ...thread, agentId: 'miaoxun-butler' },
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
    const composer = () => renderer.root.findByType(ChatComposer);
    await ReactTestRenderer.act(() =>
      composer().props.onQuickCommand('生成今日待办'),
    );
    await ReactTestRenderer.act(() =>
      composer().props.onQuickCommand('生成今日待办'),
    );
    expect(composer().props.draft).toBe('生成今日待办');
  });

  it('speech text stays in the editable draft and sends only after an explicit confirmation', async () => {
    let recognized!: (text: string) => void;
    const result = new Promise<string>(resolve => {
      recognized = resolve;
    });
    jest
      .mocked(prepareSpeechRecognition)
      .mockReturnValue({ result: Promise.resolve(), cancel: jest.fn() });
    jest
      .mocked(startSpeechRecognition)
      .mockReturnValue({ result, cancel: jest.fn(), finish: jest.fn() });
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
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<ChatScreen {...props} />);
    });
    const composer = () => renderer.root.findByType(ChatComposer);
    await ReactTestRenderer.act(async () =>
      composer().props.onRecognizeSpeech(),
    );
    await ReactTestRenderer.act(async () => recognized('帮我规划明天的安排'));
    expect(composer().props.draft).toBe('帮我规划明天的安排');
    expect(props.onSend).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => composer().props.onSend());
    expect(props.onSend).toHaveBeenCalledTimes(1);
    expect(props.onSend.mock.calls[0][0]).toBe('帮我规划明天的安排');
  });

  it('leaving ChatScreen cancels a pending tap permission request instead of opening a late microphone', async () => {
    let allow!: () => void;
    const result = new Promise<void>(resolve => {
      allow = resolve;
    });
    const cancel = jest.fn();
    jest.mocked(prepareSpeechRecognition).mockReturnValue({ result, cancel });
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
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<ChatScreen {...props} />);
    });
    await ReactTestRenderer.act(async () =>
      renderer.root.findByType(ChatComposer).props.onRecognizeSpeech(),
    );
    await ReactTestRenderer.act(async () => renderer.unmount());
    expect(cancel).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(async () => allow());
    expect(startSpeechRecognition).not.toHaveBeenCalled();
    expect(props.onSend).not.toHaveBeenCalled();
    expect(props.onActionError).not.toHaveBeenCalled();
  });

  it('opens 妙猜猜 with a local conversation snapshot instead of a thread id reference', async () => {
    const onActionError = jest.fn();
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
      onActionError,
    };
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<ChatScreen {...props} />);
    });
    await ReactTestRenderer.act(() =>
      renderer.root
        .findByProps({ accessibilityLabel: '妙猜猜' })
        .props.onPress(),
    );
    expect(mockAssist.askButler).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'chat-draft',
        id: null,
        metadata: expect.objectContaining({ threadId: thread.id }),
      }),
    );
    expect(onActionError).not.toHaveBeenCalled();
  });

  it('reports unavailable attachment actions instead of inserting their labels', async () => {
    const onActionError = jest.fn();
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
      onActionError,
    };
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<ChatScreen {...props} />);
    });
    await ReactTestRenderer.act(() =>
      renderer.root
        .findByProps({ accessibilityLabel: '更多功能' })
        .props.onPress(),
    );
    await ReactTestRenderer.act(() =>
      renderer.root
        .findByProps({ accessibilityLabel: '添加相册' })
        .props.onPress(),
    );
    expect(onActionError).toHaveBeenCalledWith(expect.stringContaining('相册'));
    expect(renderer.root.findByType(ChatComposer).props.draft).toBe('');
  });
});
