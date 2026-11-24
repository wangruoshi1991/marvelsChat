import React from 'react';
import { Keyboard, ScrollView, StyleSheet, TextInput } from 'react-native';
import * as ReactNative from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { ChatComposer } from '../src/features/messages/ChatComposer';
import { ChatComposerPanels } from '../src/features/messages/ChatComposerPanels';
import { palettes, type Palette } from '../src/shared/theme';
import { xunV3Palette } from '../src/shared/xunPalette';
import type { ChatAttachmentDraft } from '../src/features/messages/useChatAttachments';

let tree: Renderer.ReactTestRenderer | undefined;
const changed = jest.fn();
const send = jest.fn();
const startLongSpeech = jest.fn();
const finishLongSpeech = jest.fn();
const focused = jest.fn();
const assistant = jest.fn();
const tool = jest.fn();

function ControlledComposer({
  initialDraft,
  palette,
  isSending = false,
  quickCommands,
  contextAccessWarning,
  isRecognizingSpeech = false,
  attachments = [],
  attachmentBlockReason,
}: {
  initialDraft: string;
  palette: Palette;
  isSending?: boolean;
  quickCommands?: string[];
  contextAccessWarning?: string;
  isRecognizingSpeech?: boolean;
  attachments?: ChatAttachmentDraft[];
  attachmentBlockReason?: string;
}) {
  const [draft, setDraft] = React.useState(initialDraft);
  return (
    <ChatComposer
      palette={palette}
      language="zh"
      threadTitle="朋友"
      draft={draft}
      isSending={isSending}
      isRecognizingSpeech={isRecognizingSpeech}
      replyTarget={null}
      quickCommands={quickCommands}
      contextAccessWarning={contextAccessWarning}
      attachments={attachments}
      attachmentBlockReason={attachmentBlockReason}
      onChangeDraft={value => {
        changed(value);
        setDraft(value);
      }}
      onClearReplyTarget={jest.fn()}
      onFocusInput={focused}
      onStartLongSpeech={startLongSpeech}
      onFinishLongSpeech={finishLongSpeech}
      onOpenAssistant={assistant}
      onComposerTool={tool}
      onSend={send}
    />
  );
}

async function mount(draft = '', palette = xunV3Palette(palettes.light)) {
  await act(async () => {
    tree = Renderer.create(
      <ControlledComposer initialDraft={draft} palette={palette} />,
    );
  });
}

const input = () => tree!.root.findByType(TextInput);
const button = (accessibilityLabel: string) =>
  tree!.root.findByProps({ accessibilityLabel });

afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test('moves Miao Guess into More and keeps its existing local action', async () => {
  await mount();
  const row = tree!.root.findByProps({ testID: 'chat-composer-actions' });
  expect(row.findAllByProps({ accessibilityLabel: '妙猜猜' })).toHaveLength(0);
  act(() => input().props.onChangeText('保留这段文字'));
  act(() => button('更多功能').props.onPress());
  expect(button('发送消息').props.disabled).toBe(false);
  act(() => button('妙猜猜').props.onPress());
  expect(assistant).toHaveBeenCalledTimes(1);
  expect(input().props.value).toBe('保留这段文字');
  expect(send).not.toHaveBeenCalled();
});

test('custom stickers and emoji categories have one selected tab', async () => {
  await mount();
  act(() => button('添加表情').props.onPress());
  act(() => button('自定义表情').props.onPress());
  expect(button('自定义表情').props.accessibilityState.selected).toBe(true);
  for (const category of ['常用', '情绪', '手势', '生活']) {
    expect(
      button(`表情分类：${category}`).props.accessibilityState.selected,
    ).toBe(false);
  }
});

test('inserts consecutive emoji at the caret without closing the panel or focusing the keyboard', async () => {
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => {
    callback(0);
    return 1;
  });
  await mount('AB');
  const focus = jest.fn();
  Object.assign(input().instance, { focus, setSelection: jest.fn() });
  act(() =>
    input().props.onSelectionChange({
      nativeEvent: { selection: { start: 1, end: 1 } },
    }),
  );
  act(() => button('添加表情').props.onPress());
  act(() => button('插入表情：微笑').props.onPress());
  expect(button('表情选择')).toBeDefined();
  act(() => button('插入表情：赞').props.onPress());
  expect(input().props.value).toBe('A😊👍B');
  expect(button('表情选择')).toBeDefined();
  expect(focus).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

function deferAnimationFrames() {
  const frames = new Map<number, (timestamp: number) => void>();
  let sequence = 0;
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => {
    const id = ++sequence;
    frames.set(id, callback);
    return id;
  });
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => {
    if (typeof id === 'number') frames.delete(id);
  });
  return () => {
    const pending = [...frames.values()];
    frames.clear();
    act(() => pending.forEach(callback => callback(0)));
  };
}

test('a newer More request supersedes pending emoji-to-keyboard focus', async () => {
  const flushFrames = deferAnimationFrames();
  await mount('保留草稿');
  const focus = jest.fn();
  Object.assign(input().instance, { focus });
  act(() => button('添加表情').props.onPress());
  expect(button('切换键盘输入').props.accessibilityState.expanded).toBe(true);
  act(() => button('切换键盘输入').props.onPress());
  act(() => button('更多功能').props.onPress());
  flushFrames();
  expect(button('聊天扩展功能')).toBeDefined();
  expect(focus).not.toHaveBeenCalled();
  expect(input().props.value).toBe('保留草稿');
});

test('a newer emoji request supersedes pending voice-to-keyboard focus', async () => {
  const flushFrames = deferAnimationFrames();
  await mount('保留草稿');
  act(() => button('切换语音输入').props.onPress());
  act(() => button('切换键盘输入').props.onPress());
  const focus = jest.fn();
  Object.assign(input().instance, { focus });
  act(() => button('添加表情').props.onPress());
  flushFrames();
  expect(button('表情选择')).toBeDefined();
  expect(focus).not.toHaveBeenCalled();
  expect(focused).not.toHaveBeenCalled();
});

test.each([
  ['更多功能', '聊天扩展功能'],
  ['添加表情', '表情选择'],
])(
  'opening %s directly from voice does not request keyboard focus',
  async (action, panel) => {
    const flushFrames = deferAnimationFrames();
    await mount('保留草稿');
    act(() => button('切换语音输入').props.onPress());
    act(() => button(action).props.onPress());
    const focus = jest.fn();
    Object.assign(input().instance, { focus });
    flushFrames();
    expect(button(panel)).toBeDefined();
    expect(focus).not.toHaveBeenCalled();
    expect(focused).not.toHaveBeenCalled();
  },
);

test('a short landscape emoji panel keeps a full row scrollable above its Send footer', async () => {
  jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
    width: 844,
    height: 390,
    scale: 3,
    fontScale: 1,
  });
  await mount('保留草稿');
  act(() => button('添加表情').props.onPress());
  const panel = tree!.root.findByProps({ testID: 'chat-composer-panel' });
  const panelStyle = StyleSheet.flatten(panel.props.style);
  const headerStyle = StyleSheet.flatten(
    panel.findByProps({ accessibilityLabel: '关闭表情选择' }).parent!.props
      .style,
  );
  const scrollViews = panel.findAllByType(ScrollView);
  const tabs = scrollViews.find(view => view.props.horizontal)!;
  const body = scrollViews.find(view => !view.props.horizontal)!;
  const tabsStyle = StyleSheet.flatten(tabs.props.style);
  const footerSend = panel.findByProps({ accessibilityLabel: '发送消息' });
  const footerStyle = StyleSheet.flatten(footerSend.parent!.props.style);
  const footerHeight =
    StyleSheet.flatten(footerSend.props.style).minHeight +
    2 * footerStyle.paddingVertical;
  const bodyHeight =
    panelStyle.height -
    panelStyle.borderTopWidth -
    headerStyle.height -
    tabsStyle.height -
    footerHeight;
  expect(panelStyle.height).toBeGreaterThanOrEqual(196);
  expect(headerStyle.height).toBe(44);
  expect(bodyHeight).toBeGreaterThanOrEqual(48);
  expect(StyleSheet.flatten(body.props.style)).toEqual(
    expect.objectContaining({ flex: 1, minHeight: 0 }),
  );
  expect(body.props.scrollEnabled).not.toBe(false);
});

test('native layout sizes wrapped text within the editor limits without pinning its height', async () => {
  await mount();
  const longText = '这是一段没有手动换行的长文字。'.repeat(80);
  act(() => input().props.onChangeText(longText));
  expect(input().props.value).toBe(longText);
  expect(input().props.multiline).toBe(true);
  expect(input().props.scrollEnabled).toBe(true);
  expect(input().props.selection).toBeUndefined();
  const viewportStyle = StyleSheet.flatten(input().props.style);
  const editorStyle = StyleSheet.flatten(input().parent!.props.style);
  expect(viewportStyle).toEqual(
    expect.objectContaining({ minHeight: 22, maxHeight: 110, padding: 0 }),
  );
  expect(viewportStyle.borderWidth).toBeUndefined();
  expect(viewportStyle.borderRadius).toBeUndefined();
  expect(editorStyle).toEqual(
    expect.objectContaining({ paddingVertical: 10, borderWidth: 1 }),
  );
  const decorationHeight =
    2 * (editorStyle.paddingVertical + editorStyle.borderWidth);
  expect(viewportStyle.minHeight + decorationHeight).toBe(44);
  expect(viewportStyle.maxHeight + decorationHeight).toBe(132);
  expect(input().props.onContentSizeChange).toBeUndefined();
  expect(StyleSheet.flatten(input().props.style).height).toBeUndefined();
  act(() => input().props.onChangeText('两行\n文字'));
  expect(input().props.value).toBe('两行\n文字');
  expect(StyleSheet.flatten(input().props.style).height).toBeUndefined();
  act(() => input().props.onChangeText(''));
  expect(input().props.value).toBe('');
  expect(StyleSheet.flatten(input().props.style).height).toBeUndefined();
  expect(send).not.toHaveBeenCalled();
});

test.each([
  ['standard', palettes.light],
  ['xun', xunV3Palette(palettes.light)],
] as const)(
  'the %s main row reserves text width and every visible action has a 44pt target',
  async (_theme, palette) => {
    await mount('待编辑内容', palette);
    expect(
      StyleSheet.flatten(input().parent!.props.style).flexDirection,
    ).not.toBe('row');
    expect(StyleSheet.flatten(input().parent!.props.style)).toEqual(
      expect.objectContaining({ flex: 1, minWidth: 0 }),
    );
    expect(StyleSheet.flatten(input().props.style).flex).not.toBe(1);
    const actions = ['切换语音输入', '添加表情', '更多功能'];
    for (const label of actions) {
      const style = StyleSheet.flatten(button(label).props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.width ?? style.minWidth).toBeGreaterThanOrEqual(44);
    }
  },
);

test('matches the reference single action row with the editor between its controls', async () => {
  await mount('', xunV3Palette(palettes.light));
  const row = tree!.root.findByProps({ testID: 'chat-composer-actions' });
  expect(row.findByType(TextInput)).toBeDefined();
  const labels = ['切换语音输入', '添加表情', '更多功能'];
  for (const label of labels) {
    expect(row.findByProps({ accessibilityLabel: label })).toBeDefined();
  }
  expect(row.findAllByProps({ accessibilityLabel: '发送消息' })).toHaveLength(
    0,
  );
  expect(row.findAllByType(TextInput)).toHaveLength(1);
  for (const label of labels) {
    expect(
      row.findAllByProps({ accessibilityLabel: label }).length,
    ).toBeGreaterThan(0);
  }
  expect(
    tree!.root.findAllByProps({ testID: 'chat-composer-input' }),
  ).toHaveLength(0);
});

test('switches between text and hold-to-talk modes without losing the draft', async () => {
  const flushFrames = deferAnimationFrames();
  await mount('保留的草稿');

  act(() => button('切换语音输入').props.onPress());
  expect(
    tree!.root.findAllByProps({ accessibilityLabel: '消息输入框' }),
  ).toHaveLength(0);
  expect(button('按住说话')).toBeDefined();
  expect(button('切换键盘输入')).toBeDefined();
  expect(
    tree!.root.findAllByProps({ accessibilityLabel: '切换语音输入' }),
  ).toHaveLength(0);

  act(() => button('切换键盘输入').props.onPress());
  const focus = jest.fn();
  Object.assign(input().instance, { focus });
  flushFrames();
  expect(focus).toHaveBeenCalledTimes(1);
  expect(input().props.value).toBe('保留的草稿');
  expect(focused).not.toHaveBeenCalled();
  act(() => input().props.onFocus());
  expect(focused).toHaveBeenCalledTimes(1);
  expect(button('切换语音输入')).toBeDefined();
  expect(startLongSpeech).not.toHaveBeenCalled();
  expect(finishLongSpeech).not.toHaveBeenCalled();
});

test('restores keyboard focus only after the text input is remounted', async () => {
  await mount('保留的草稿');
  let focusedBeforeInputMount = false;
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => {
    if (tree!.root.findAllByType(TextInput).length === 0)
      focusedBeforeInputMount = true;
    callback(0);
    return 1;
  });

  act(() => button('切换语音输入').props.onPress());
  act(() => button('切换键盘输入').props.onPress());

  expect(focusedBeforeInputMount).toBe(false);
  expect(input().props.value).toBe('保留的草稿');
});

test('voice mode starts and finishes one hold-to-talk session', async () => {
  await mount();
  act(() => button('切换语音输入').props.onPress());
  const talk = button('按住说话');
  act(() => talk.props.onPressIn());
  expect(startLongSpeech).toHaveBeenCalledTimes(1);
  act(() => talk.props.onPressOut());
  expect(finishLongSpeech).toHaveBeenCalledTimes(1);
});

test('iOS accessibility activation starts and stops voice without a physical hold', async () => {
  const composer = (isRecognizingSpeech: boolean) => (
    <ControlledComposer
      initialDraft=""
      palette={xunV3Palette(palettes.light)}
      isRecognizingSpeech={isRecognizingSpeech}
    />
  );
  await act(async () => {
    tree = Renderer.create(composer(false));
  });
  act(() => button('切换语音输入').props.onPress());
  const talk = button('按住说话').props;
  expect(talk.accessibilityHint).toBe('双击开始录音，再双击结束。');
  act(() => {
    talk.onAccessibilityTap();
    talk.onPressIn();
    talk.onPressOut();
    tree!.update(composer(true));
  });
  expect(startLongSpeech).toHaveBeenCalledTimes(1);
  expect(finishLongSpeech).not.toHaveBeenCalled();

  act(() => button('结束录音').props.onAccessibilityTap());
  expect(finishLongSpeech).toHaveBeenCalledTimes(1);
  act(() => button('按住说话').props.onAccessibilityTap());
  expect(startLongSpeech).toHaveBeenCalledTimes(1);

  act(() => tree!.update(composer(false)));
  act(() => {
    const idleTalk = button('按住说话').props;
    idleTalk.onAccessibilityTap();
    idleTalk.onAccessibilityTap();
  });
  expect(startLongSpeech).toHaveBeenCalledTimes(2);
  expect(finishLongSpeech).toHaveBeenCalledTimes(2);

  act(() => {
    button('按住说话').props.onPressIn();
    tree!.update(composer(true));
  });
  // Recognition can be cancelled by the app before the original touch ends.
  act(() => tree!.update(composer(false)));
  act(() => {
    const idleTalk = button('按住说话').props;
    idleTalk.onPressIn();
    idleTalk.onPressOut();
  });
  expect(startLongSpeech).toHaveBeenCalledTimes(4);
  expect(finishLongSpeech).toHaveBeenCalledTimes(3);

  act(() => button('切换键盘输入').props.onPress());
  expect(button('消息输入框')).toBeDefined();
});

test('recognizing speech disables both the mode switch and hold control', async () => {
  await act(async () => {
    tree = Renderer.create(
      <ControlledComposer
        initialDraft=""
        palette={xunV3Palette(palettes.light)}
        isRecognizingSpeech
      />,
    );
  });
  expect(button('切换语音输入').props.disabled).toBe(true);
  act(() => button('切换语音输入').props.onPress());
  expect(button('消息输入框')).toBeDefined();
});

test('keeps quick commands in their own visible row above the action row', async () => {
  await act(async () => {
    tree = Renderer.create(
      <ControlledComposer
        initialDraft=""
        palette={xunV3Palette(palettes.light)}
        quickCommands={['生成今日待办']}
      />,
    );
  });
  expect(
    tree!.root.findByProps({ testID: 'chat-quick-commands' }),
  ).toBeDefined();
  const row = tree!.root.findByProps({ testID: 'chat-composer-actions' });
  expect(row.findByType(TextInput)).toBeDefined();
  expect(
    tree!.root.findAllByProps({ accessibilityLabel: '发送消息' }),
  ).toHaveLength(0);
});

test('preserves pasted multiline text and submits it through the native keyboard Send key', async () => {
  await mount('第一段', xunV3Palette(palettes.light));
  const editor = input();
  expect(editor.props.returnKeyType).toBe('send');
  expect(editor.props.submitBehavior).toBe('submit');
  expect(editor.props.onSubmitEditing).toEqual(expect.any(Function));
  const multilineDraft = `第一段\n${'第二段长文'.repeat(80)}`;
  await act(async () => editor.props.onChangeText(multilineDraft));
  expect(input().props.value).toBe(multilineDraft);
  expect(send).not.toHaveBeenCalled();
  const row = tree!.root.findByProps({ testID: 'chat-composer-actions' });
  expect(row.findByProps({ accessibilityLabel: '更多功能' })).toBeDefined();
  expect(row.findByProps({ accessibilityLabel: '添加表情' })).toBeDefined();
  expect(row.findAllByProps({ accessibilityLabel: '发送消息' })).toHaveLength(
    0,
  );
  await act(async () =>
    input().props.onSubmitEditing({ nativeEvent: { text: multilineDraft } }),
  );
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith(undefined, multilineDraft);
});

test.each([
  { name: 'empty text', draft: '', sending: false, warning: undefined },
  { name: 'whitespace', draft: ' \n\t ', sending: false, warning: undefined },
  { name: 'sending', draft: '原消息', sending: true, warning: undefined },
  {
    name: 'context permission warning',
    draft: '草稿',
    sending: false,
    warning: '请重新同意权限',
  },
])('native keyboard Send blocks $name', async ({ draft, sending, warning }) => {
  await act(async () => {
    tree = Renderer.create(
      <ControlledComposer
        initialDraft={draft}
        palette={xunV3Palette(palettes.light)}
        isSending={sending}
        contextAccessWarning={warning}
      />,
    );
  });
  expect(input().props.submitBehavior).toBe('submit');
  act(() => input().props.onSubmitEditing({ nativeEvent: { text: draft } }));
  expect(send).not.toHaveBeenCalled();
  expect(input().props.value).toBe(draft);
});

test.each([
  ['添加表情', '表情选择'],
  ['更多功能', '聊天扩展功能'],
])(
  'keeps Send inside the %s panel and outside the main row',
  async (action, panelLabel) => {
    await mount('保留这段文字');
    const row = tree!.root.findByProps({ testID: 'chat-composer-actions' });
    expect(row.findAllByProps({ accessibilityLabel: '发送消息' })).toHaveLength(
      0,
    );
    expect(
      tree!.root.findAllByProps({ accessibilityLabel: '发送消息' }),
    ).toHaveLength(0);
    act(() => button(action).props.onPress());
    const panel = tree!.root.findByProps({ testID: 'chat-composer-panel' });
    const footerSend = panel.findByProps({ accessibilityLabel: '发送消息' });
    expect(footerSend.props.disabled).toBe(false);
    expect(
      StyleSheet.flatten(footerSend.props.style).minHeight,
    ).toBeGreaterThanOrEqual(44);
    act(() => footerSend.props.onPress());
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(undefined, '保留这段文字');
    expect(
      tree!.root.findAllByProps({ accessibilityLabel: panelLabel }),
    ).toHaveLength(0);
  },
);

const readyAttachment: ChatAttachmentDraft = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  clientKey: 'test-attachment',
  kind: 'image',
  filename: 'attachment.png',
  mimeType: 'image/png',
  byteSize: 100,
  localUri: 'file:///test/attachment.png',
  idempotencyKey: 'test-attachment',
  status: 'ready',
};

test('a ready attachment without text can use native keyboard Send', async () => {
  await act(async () => {
    tree = Renderer.create(
      <ControlledComposer
        initialDraft=""
        palette={xunV3Palette(palettes.light)}
        attachments={[readyAttachment]}
      />,
    );
  });
  expect(input().props.enablesReturnKeyAutomatically).not.toBe(true);
  expect(
    tree!.root
      .findByProps({ testID: 'chat-composer-actions' })
      .findAllByProps({ accessibilityLabel: '发送消息' }),
  ).toHaveLength(0);
  act(() => input().props.onSubmitEditing({ nativeEvent: { text: '' } }));
  expect(send).toHaveBeenCalledTimes(1);
});

test('a ready attachment has a More panel Send action without requiring text or keyboard focus', async () => {
  await act(async () => {
    tree = Renderer.create(
      <ControlledComposer
        initialDraft=""
        palette={xunV3Palette(palettes.light)}
        attachments={[readyAttachment]}
      />,
    );
  });
  act(() => button('更多功能').props.onPress());
  const panel = tree!.root.findByProps({ testID: 'chat-composer-panel' });
  const footerSend = panel.findByProps({ accessibilityLabel: '发送消息' });
  expect(footerSend.props.disabled).toBe(false);
  act(() => footerSend.props.onPress());
  expect(send).toHaveBeenCalledTimes(1);
  expect(focused).not.toHaveBeenCalled();
});

test('an unfinished attachment blocks both native Send and panel Send', async () => {
  await act(async () => {
    tree = Renderer.create(
      <ControlledComposer
        initialDraft=""
        palette={xunV3Palette(palettes.light)}
        attachments={[{ ...readyAttachment, status: 'uploading' }]}
        attachmentBlockReason="附件仍在上传"
      />,
    );
  });
  act(() => input().props.onSubmitEditing({ nativeEvent: { text: '' } }));
  act(() => button('更多功能').props.onPress());
  expect(button('发送消息').props.disabled).toBe(true);
  act(() => button('发送消息').props.onPress());
  expect(send).not.toHaveBeenCalled();
});

test('whitespace keeps More available without offering an empty send', async () => {
  await mount(' \n\t ');
  expect(button('更多功能')).toBeDefined();
  expect(
    tree!.root.findAllByProps({ accessibilityLabel: '发送消息' }),
  ).toHaveLength(0);
  act(() => button('更多功能').props.onPress());
  expect(button('聊天扩展功能')).toBeDefined();
  expect(send).not.toHaveBeenCalled();
});

test('an emoji-only draft gains a visible send action without reopening the keyboard', async () => {
  await mount();
  act(() => button('添加表情').props.onPress());
  act(() => button('插入表情：微笑').props.onPress());
  expect(input().props.value).toBe('😊');
  expect(send).not.toHaveBeenCalled();
  act(() => button('发送消息').props.onPress());
  expect(send).toHaveBeenCalledTimes(1);
});

test('explicit sending closes an open tool panel after text is entered', async () => {
  await mount();
  act(() => button('更多功能').props.onPress());
  act(() => input().props.onChangeText('编辑后的消息'));
  expect(button('聊天扩展功能')).toBeDefined();
  act(() => button('发送消息').props.onPress());
  expect(
    tree!.root.findAllByProps({ accessibilityLabel: '聊天扩展功能' }),
  ).toHaveLength(0);
  expect(send).toHaveBeenCalledTimes(1);
});

test.each([
  {
    name: 'duplicate sending',
    draft: '',
    sending: true,
    warning: undefined,
    busy: true,
  },
  {
    name: 'unauthorized sending',
    draft: '草稿',
    sending: false,
    warning: '请重新同意权限',
    busy: false,
  },
])(
  'blocks $name through the visible send action',
  async ({ draft, sending, warning, busy }) => {
    await act(async () => {
      tree = Renderer.create(
        <ControlledComposer
          initialDraft={draft}
          palette={xunV3Palette(palettes.light)}
          contextAccessWarning={warning}
        />,
      );
    });
    act(() => button('更多功能').props.onPress());
    await act(async () => {
      tree!.update(
        <ControlledComposer
          initialDraft={draft}
          palette={xunV3Palette(palettes.light)}
          isSending={sending}
          contextAccessWarning={warning}
        />,
      );
    });
    expect(button('发送消息').props.disabled).toBe(true);
    expect(button('发送消息').props.accessibilityState).toEqual({
      disabled: true,
      busy,
    });
    act(() => button('发送消息').props.onPress());
    expect(send).not.toHaveBeenCalled();
  },
);

test('spaces the integrated action row around the editor', async () => {
  await mount('', xunV3Palette(palettes.light));
  const actionsRow = tree!.root.findByProps({
    testID: 'chat-composer-actions',
  });
  expect(StyleSheet.flatten(actionsRow.props.style)).toEqual(
    expect.objectContaining({
      alignItems: 'flex-end',
      gap: 2,
      paddingHorizontal: 8,
      paddingTop: 10,
    }),
  );
});

test('switches emoji categories and opens the custom sticker collection', async () => {
  await mount();
  act(() => button('添加表情').props.onPress());
  const category = button('表情分类：情绪');
  expect(category.props.accessibilityRole).toBe('tab');
  act(() => category.props.onPress());
  expect(button('插入表情：崇拜')).toBeDefined();
  const custom = button('自定义表情');
  expect(custom.props.accessibilityRole).toBe('tab');
  act(() => custom.props.onPress());
  expect(
    tree!.root.findByProps({ testID: 'custom-sticker-panel' }),
  ).toBeDefined();
  expect(button('添加自定义表情')).toBeDefined();
});

test('opening and cancelling emoji selection preserves the draft and never sends', async () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  await mount();
  act(() => button('添加表情').props.onPress());
  expect(changed).not.toHaveBeenCalled();
  expect(input().props.value).toBe('');
  expect(
    tree!.root.findAllByProps({ accessibilityLabel: '聊天扩展功能' }),
  ).toHaveLength(0);
  expect(button('表情选择')).toBeDefined();
  expect(dismiss).toHaveBeenCalledTimes(1);
  act(() => button('关闭表情选择').props.onPress());
  expect(
    tree!.root.findAllByProps({ accessibilityLabel: '表情选择' }),
  ).toHaveLength(0);
  expect(changed).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

test('an already open tray cannot dispatch tools or reopen emoji while sending', async () => {
  await mount();
  act(() => button('更多功能').props.onPress());
  act(() => input().props.onChangeText('正在发送'));
  await act(async () => {
    tree!.update(
      <ControlledComposer
        initialDraft="正在发送"
        palette={xunV3Palette(palettes.light)}
        isSending
      />,
    );
  });
  expect(button('发送消息').props.disabled).toBe(true);
  for (const label of ['添加表情', '妙猜猜', '添加相册']) {
    expect(button(label).props.disabled).toBe(true);
  }
  expect(
    tree!.root.findAllByProps({ accessibilityLabel: '表情选择' }),
  ).toHaveLength(0);
  expect(assistant).not.toHaveBeenCalled();
  expect(tool).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(input().props.value).toBe('正在发送');
});

test('choosing an emoji replaces only the selection and restores the caret without opening the keyboard', async () => {
  const frames: Array<Parameters<typeof requestAnimationFrame>[0]> = [];
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => {
    frames.push(callback);
    return frames.length;
  });
  await mount('A🙂BC');
  const focus = jest.fn();
  const setSelection = jest.fn();
  Object.assign(input().instance, { focus, setSelection });
  expect(input().props.onSelectionChange).toEqual(expect.any(Function));
  act(() =>
    input().props.onSelectionChange({
      nativeEvent: { selection: { start: 1, end: 3 } },
    }),
  );
  act(() => button('添加表情').props.onPress());
  expect(changed).not.toHaveBeenCalled();
  act(() => button('插入表情：赞').props.onPress());
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenCalledWith('A👍BC');
  expect(input().props.value).toBe('A👍BC');
  expect(tree!.root.findByType(ChatComposerPanels).props.panel).toBe('emoji');
  act(() => frames.forEach(frame => frame(0)));
  expect(focus).not.toHaveBeenCalled();
  expect(setSelection).toHaveBeenCalledWith(3, 3);
  expect(input().props.selection).toBeUndefined();
  expect(send).not.toHaveBeenCalled();
});

test('an emoji appends when no caret was reported and its delayed caret cannot override newer editing', async () => {
  const frames: Array<Parameters<typeof requestAnimationFrame>[0]> = [];
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => {
    frames.push(callback);
    return frames.length;
  });
  await mount('保留原文');
  const focus = jest.fn();
  const setSelection = jest.fn();
  Object.assign(input().instance, { focus, setSelection });
  act(() => button('添加表情').props.onPress());
  act(() => button('插入表情：赞').props.onPress());
  expect(input().props.value).toBe('保留原文👍');
  act(() => input().props.onChangeText('用户已继续编辑'));
  act(() => frames.forEach(frame => frame(0)));
  expect(input().props.value).toBe('用户已继续编辑');
  expect(focus).not.toHaveBeenCalled();
  expect(setSelection).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

test('a delayed emoji caret restore cannot override the user moving the selection', async () => {
  const flushFrames = deferAnimationFrames();
  await mount('AB');
  const setSelection = jest.fn();
  Object.assign(input().instance, { setSelection });
  act(() => button('添加表情').props.onPress());
  act(() => button('插入表情：赞').props.onPress());
  expect(input().props.value).toBe('AB👍');
  act(() =>
    input().props.onSelectionChange({
      nativeEvent: { selection: { start: 0, end: 0 } },
    }),
  );
  flushFrames();
  expect(setSelection).not.toHaveBeenCalled();
  act(() => button('插入表情：微笑').props.onPress());
  expect(input().props.value).toBe('😊AB👍');
});

test.each(['input', 'tools'] as const)(
  'switching to %s closes emoji choices without changing the draft',
  async destination => {
    await mount();
    act(() => button('添加表情').props.onPress());
    if (destination === 'input') {
      act(() => input().props.onFocus());
      expect(focused).toHaveBeenCalledTimes(1);
    } else {
      act(() => button('更多功能').props.onPress());
      expect(button('聊天扩展功能')).toBeDefined();
    }
    expect(
      tree!.root.findAllByProps({ accessibilityLabel: '表情选择' }),
    ).toHaveLength(0);
    expect(input().props.value).toBe('');
    expect(changed).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  },
);
