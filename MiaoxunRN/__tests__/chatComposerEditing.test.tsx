import React from 'react';
import { Keyboard, StyleSheet, TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { ChatComposer } from '../src/features/messages/ChatComposer';
import { palettes, type Palette } from '../src/shared/theme';
import { xunV3Palette } from '../src/shared/xunPalette';

let tree: Renderer.ReactTestRenderer | undefined;
const changed = jest.fn();
const send = jest.fn();
const speech = jest.fn();
const focused = jest.fn();

function ControlledComposer({
  initialDraft,
  palette,
}: {
  initialDraft: string;
  palette: Palette;
}) {
  const [draft, setDraft] = React.useState(initialDraft);
  return (
    <ChatComposer
      palette={palette}
      language="zh"
      threadTitle="朋友"
      draft={draft}
      isSending={false}
      isRecognizingSpeech={false}
      replyTarget={null}
      onChangeDraft={value => {
        changed(value);
        setDraft(value);
      }}
      onClearReplyTarget={jest.fn()}
      onFocusInput={focused}
      onRecognizeSpeech={speech}
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

test('a long wrapped paste can scroll to its caret before native size measurement catches up', async () => {
  await mount();
  const longText = '这是一段没有手动换行的长文字。'.repeat(80);
  act(() => input().props.onChangeText(longText));
  expect(input().props.value).toBe(longText);
  expect(input().props.multiline).toBe(true);
  expect(input().props.scrollEnabled).toBe(true);
  expect(input().props.selection).toBeUndefined();
  act(() =>
    input().props.onContentSizeChange({
      nativeEvent: { contentSize: { height: 480 } },
    }),
  );
  expect(StyleSheet.flatten(input().props.style).height).toBe(132);
  expect(input().props.scrollEnabled).toBe(true);
  act(() => input().props.onChangeText('两行\n文字'));
  act(() =>
    input().props.onContentSizeChange({
      nativeEvent: { contentSize: { height: 64 } },
    }),
  );
  expect(StyleSheet.flatten(input().props.style).height).toBe(64);
  act(() => input().props.onChangeText(''));
  expect(StyleSheet.flatten(input().props.style).height).toBe(44);
  expect(send).not.toHaveBeenCalled();
});

test.each([
  ['standard', palettes.light],
  ['xun', xunV3Palette(palettes.light)],
] as const)(
  'the %s editor has its own full-width row and every visible action has a 44pt target',
  async (_theme, palette) => {
    await mount('待编辑内容', palette);
    expect(
      StyleSheet.flatten(input().parent!.props.style).flexDirection,
    ).not.toBe('row');
    expect(StyleSheet.flatten(input().props.style).flex).not.toBe(1);
    const actions = [
      '妙猜猜',
      '语音转文字',
      '添加表情',
      '更多功能',
      '发送消息',
    ];
    for (const label of actions) {
      const style = StyleSheet.flatten(button(label).props.style);
      expect(style.width ?? style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
  },
);

test('opening and cancelling emoji selection preserves the draft and never sends', async () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  await mount();
  act(() => button('添加表情').props.onPress());
  expect(changed).not.toHaveBeenCalled();
  expect(input().props.value).toBe('');
  expect(button('添加表情').props.accessibilityState.expanded).toBe(true);
  expect(button('表情选择')).toBeDefined();
  expect(dismiss).toHaveBeenCalledTimes(1);
  act(() => button('关闭表情选择').props.onPress());
  expect(
    tree!.root.findAllByProps({ accessibilityLabel: '表情选择' }),
  ).toHaveLength(0);
  expect(changed).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(speech).not.toHaveBeenCalled();
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
  expect(speech).not.toHaveBeenCalled();
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
