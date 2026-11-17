import React from 'react';
import { Keyboard, StyleSheet, TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { ChatComposer } from '../src/features/messages/ChatComposer';
import { palettes, type Palette } from '../src/shared/theme';
import { xunV3Palette } from '../src/shared/xunPalette';

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
}: {
  initialDraft: string;
  palette: Palette;
  isSending?: boolean;
  quickCommands?: string[];
  contextAccessWarning?: string;
  isRecognizingSpeech?: boolean;
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

test('native layout sizes wrapped text within the editor limits without pinning its height', async () => {
  await mount();
  const longText = '这是一段没有手动换行的长文字。'.repeat(80);
  act(() => input().props.onChangeText(longText));
  expect(input().props.value).toBe(longText);
  expect(input().props.multiline).toBe(true);
  expect(input().props.scrollEnabled).toBe(true);
  expect(input().props.selection).toBeUndefined();
  expect(StyleSheet.flatten(input().props.style)).toEqual(
    expect.objectContaining({ minHeight: 44, maxHeight: 132 }),
  );
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
    const actions = ['妙猜猜', '切换语音输入', '添加表情', '发送消息'];
    for (const label of actions) {
      const style = StyleSheet.flatten(button(label).props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      if (_theme === 'xun' && label !== '发送消息') {
        expect(style.width ?? style.minWidth).toBe(
          label === '妙猜猜' || label === '切换语音输入' ? 34 : 28,
        );
        expect(button(label).props.hitSlop).toBe(
          label === '妙猜猜' || label === '切换语音输入' ? 5 : 8,
        );
      } else {
        expect(style.width ?? style.minWidth).toBeGreaterThanOrEqual(44);
      }
    }
  },
);

test('matches the reference single action row with the editor between its controls', async () => {
  await mount('', xunV3Palette(palettes.light));
  const row = tree!.root.findByProps({ testID: 'chat-composer-actions' });
  expect(row.findByType(TextInput)).toBeDefined();
  const labels = ['妙猜猜', '切换语音输入', '添加表情', '更多功能'];
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
  await mount('保留的草稿');
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => {
    callback(0);
    return 1;
  });

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
  expect(input().props.value).toBe('保留的草稿');
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

test('preserves native Return newlines and sends multiline text only through the visible action', async () => {
  await mount('第一段', xunV3Palette(palettes.light));
  const editor = input();
  expect(editor.props.returnKeyType).toBe('default');
  expect(editor.props.submitBehavior).toBe('newline');
  expect(editor.props.onSubmitEditing).toBeUndefined();
  const multilineDraft = `第一段\n${'第二段长文'.repeat(80)}`;
  await act(async () => editor.props.onChangeText(multilineDraft));
  expect(input().props.value).toBe(multilineDraft);
  expect(send).not.toHaveBeenCalled();
  const row = tree!.root.findByProps({ testID: 'chat-composer-actions' });
  expect(row.findAllByProps({ accessibilityLabel: '更多功能' })).toHaveLength(
    0,
  );
  expect(row.findByProps({ accessibilityLabel: '添加表情' })).toBeDefined();
  await act(async () => button('发送消息').props.onPress());
  expect(send).toHaveBeenCalledTimes(1);
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
      alignItems: 'center',
      gap: 0,
      paddingHorizontal: 6,
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

test('the fixed assistant action uses the existing local action and retains the draft', async () => {
  await mount('保留这段文字');
  act(() => button('妙猜猜').props.onPress());
  expect(assistant).toHaveBeenCalledTimes(1);
  expect(tool).not.toHaveBeenCalled();
  expect(input().props.value).toBe('保留这段文字');
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

test('choosing an emoji replaces only the current selection and restores the caret after it', async () => {
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
  expect(
    tree!.root.findAllByProps({ accessibilityLabel: '表情选择' }),
  ).toHaveLength(0);
  act(() => frames.forEach(frame => frame(0)));
  expect(focus).toHaveBeenCalledTimes(1);
  expect(setSelection).toHaveBeenCalledWith(3, 3);
  expect(input().props.selection).toBeUndefined();
  expect(send).not.toHaveBeenCalled();
});

test('an emoji appends when no caret was reported and its delayed focus cannot override newer editing', async () => {
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
