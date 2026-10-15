import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChatMessageText } from '../src/features/messages/ChatMessageText';
import {
  messageTextBlocks,
  messageTextInline,
  messageTextPreview,
  safeMessageLink,
} from '../src/features/messages/messageTextPresentation';
import { palettes } from '../src/shared/theme';

const trees: TestRenderer.ReactTestRenderer[] = [];
beforeEach(() => jest.clearAllMocks());
const render = (content: string, formatted = true) => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <ChatMessageText formatted={formatted} palette={palettes.light}>
        {content}
      </ChatMessageText>,
    );
  });
  trees.push(tree);
  return tree;
};
afterEach(() => {
  act(() => trees.splice(0).forEach(tree => tree.unmount()));
  jest.restoreAllMocks();
});
const visibleText = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
const links = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .filter(node => node.props.accessibilityRole === 'link');

test('user messages remain exactly plain text and agent prose renders readable blocks', () => {
  const raw =
    '## Title\n\n- first\n- **second** with `code` [link](https://example.invalid)';
  const user = render(raw, false);
  expect(user.root.findByType(Text).props.children).toBe(raw);
  expect(links(user)).toHaveLength(0);
  const agent = render(raw);
  expect(agent.root.findAllByType(View).length).toBeGreaterThan(1);
  expect(visibleText(agent)).toContain('Title');
  expect(visibleText(agent)).toContain('second');
  expect(visibleText(agent)).toContain('code');
});

test('Markdown links and image descriptions are text links, never fetched or opened during rendering', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const raw =
    '[文档 **新版**](https://example.invalid/a_(b)?q=1#x "说明")\n![封面](https://media.invalid/photo.png)\n<http://example.invalid/help>\n<img src="x">';
  const tree = render(raw);
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  expect(tree.root.findAllByType(Pressable)).toHaveLength(0);
  expect(open).not.toHaveBeenCalled();
  expect(links(tree)).toHaveLength(3);
  expect(visibleText(tree)).not.toContain('[文档');
  expect(visibleText(tree)).not.toContain('![封面]');
  expect(visibleText(tree)).toContain('<img src="x">');
  expect(messageTextPreview(raw)).toBe(
    '文档 新版 封面 http://example.invalid/help <img src="x">',
  );
  const stopPropagation = jest.fn();
  await act(async () => links(tree)[0].props.onPress({ stopPropagation }));
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith('https://example.invalid/a_(b)?q=1#x');
});

test('ordinary web addresses open only after a tap and preserve surrounding punctuation', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const raw =
    '参考 https://example.invalid/a_(b)。以及 (HTTP://example.invalid/help).';
  const tree = render(raw);
  expect(open).not.toHaveBeenCalled();
  expect(links(tree).map(link => link.props.accessibilityHint)).toEqual([
    'https://example.invalid/a_(b)',
    'HTTP://example.invalid/help',
  ]);
  expect(messageTextPreview(raw)).toBe(raw);
  await act(async () =>
    links(tree)[1].props.onPress({ stopPropagation: jest.fn() }),
  );
  expect(open).toHaveBeenCalledWith('HTTP://example.invalid/help');
});

test('HTML attributes and inline code remain inert even when they contain web addresses', () => {
  const raw =
    '<img src="https://example.invalid/image.png">\n<a href="https://example.invalid">链接</a>\n`https://example.invalid/code`';
  const tree = render(raw);
  expect(links(tree)).toHaveLength(0);
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  expect(Linking.openURL).not.toHaveBeenCalled();
  expect(messageTextPreview(raw)).toBe(
    raw.replace(/\n/g, ' ').replace(/`/g, ''),
  );
});

test('native URL parsing accepts upper-case schemes and path punctuation without accepting credentials', () => {
  const originalURL = globalThis.URL;
  // eslint-disable-next-line @react-native/no-deep-imports -- Exercise the native URL implementation instead of Jest's Node URL.
  globalThis.URL = require('react-native/Libraries/Blob/URL').URL;
  try {
    const destination = 'HTTPS://example.invalid/a:b@c?q=1';
    expect(safeMessageLink(destination)).toBe(destination);
    expect(safeMessageLink('HTTPS://user:password@example.invalid')).toBeNull();
    expect(safeMessageLink('https:///missing-host')).toBeNull();
  } finally {
    globalThis.URL = originalURL;
  }
});

test.each([
  // eslint-disable-next-line no-script-url -- An explicitly rejected input, never executed.
  'javascript:alert(1)',
  'data:text/html,test',
  'file:///private/data',
  'mailto:someone@example.invalid',
  '//example.invalid',
  'https:\\example.invalid',
  'https://user:password@example.invalid',
  'https://exam\nple.invalid',
  'https://example.invalid/\u0000',
  '%6aavascript:alert(1)',
])(
  'unsafe or unsupported destination stays visible but inert: %s',
  destination => {
    const open = jest.spyOn(Linking, 'openURL');
    const tree = render(`[说明](${destination})`);
    expect(safeMessageLink(destination)).toBeNull();
    expect(links(tree)).toHaveLength(0);
    expect(visibleText(tree)).toContain('说明');
    expect(open).not.toHaveBeenCalled();
  },
);

test('a failed explicit link open reports failure without retrying or navigating elsewhere', async () => {
  const open = jest
    .spyOn(Linking, 'openURL')
    .mockRejectedValue(new Error('unavailable'));
  const alert = jest.spyOn(Alert, 'alert');
  const tree = render('[说明](https://example.invalid)');
  await act(async () =>
    links(tree)[0].props.onPress({ stopPropagation: jest.fn() }),
  );
  expect(open).toHaveBeenCalledTimes(1);
  expect(alert).toHaveBeenCalledWith('无法打开链接', '请稍后重试。');
});

test('six heading levels have hierarchy and do not absorb ordinary hash text', () => {
  const raw =
    Array.from(
      { length: 6 },
      (_, i) => `${'#'.repeat(i + 1)} 第${i + 1}级`,
    ).join('\n') + '\n#ordinary';
  const tree = render(raw);
  const headings = tree.root
    .findAllByType(Text)
    .filter(node => node.props.accessibilityRole === 'header');
  expect(headings).toHaveLength(6);
  const sizes = headings.map(
    node => StyleSheet.flatten(node.props.style).fontSize,
  );
  expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  expect(new Set(sizes).size).toBe(6);
  expect(visibleText(tree)).toContain('#ordinary');
  expect(messageTextPreview(raw)).toBe(
    '第1级 第2级 第3级 第4级 第5级 第6级 #ordinary',
  );
});

test('quoted paragraphs preserve nested quotes, lists and inline formatting', () => {
  const raw =
    '> ## 引用\n> 第一段\n>\n> - 项目\n>   1. **子项**\n> > *内层引用*\n\n正常正文';
  const tree = render(raw);
  expect(
    tree.root
      .findAllByType(View)
      .filter(node => node.props.testID === 'message-quote'),
  ).toHaveLength(2);
  expect(messageTextPreview(raw)).toBe(
    '引用 第一段 • 项目 1. 子项 内层引用 正常正文',
  );
  expect(visibleText(tree)).not.toContain('>');
  expect(visibleText(tree)).toContain('正常正文');
});

test('wide tables scroll horizontally and retain escaped pipes, code pipes, extra columns and long cells', () => {
  const long = '完整成果'.repeat(300);
  const raw = `| 项目 | 内容 |\n| :--- | ---: |\n| A \\| B | \`x|y\` | 额外列 |\n| 长内容 | ${long} |`;
  const parsed = messageTextBlocks(raw)[0];
  expect(parsed.kind).toBe('table');
  if (parsed.kind !== 'table') throw new Error('Expected a table');
  expect(parsed.rows).toEqual([
    ['项目', '内容'],
    ['A \\| B', '`x|y`', '额外列'],
    ['长内容', long],
  ]);
  const tree = render(raw);
  const table = tree.root.findByType(ScrollView);
  expect(table.props.horizontal).toBe(true);
  expect(table.props.nestedScrollEnabled).toBe(true);
  expect(visibleText(tree)).toContain('A | B');
  expect(visibleText(tree)).toContain('x|y');
  expect(visibleText(tree)).toContain('额外列');
  expect(visibleText(tree)).toContain(long);
  expect(
    tree.root.findAllByType(Text).every(node => !node.props.numberOfLines),
  ).toBe(true);
  expect(messageTextPreview(raw)).toContain(long);
});

test('a pipe in ordinary prose or an invalid divider is not silently treated as a table', () => {
  const raw = '条件 A | B\n这一行不构成表格\n\n名称 | 状态\n-- | ---\n文字';
  expect(messageTextBlocks(raw).every(block => block.kind !== 'table')).toBe(
    true,
  );
  expect(visibleText(render(raw))).toContain('条件 A | B');
});

test.each([
  [
    '**三步路线图**\n\n1. **准备**素材\n2) 与*助手*沟通\n- 查看`页面`\n\n__完成__',
    '三步路线图 1. 准备素材 2) 与助手沟通 • 查看页面 完成',
  ],
  ['### 路线\n\n```text\n**原样代码**\n```', '路线 **原样代码**'],
  [
    '**加粗 *斜体*** 与 *斜体 **加粗*** 和 ***同时***',
    '加粗 斜体 与 斜体 加粗 和 同时',
  ],
  [
    '**含 `**原样代码**` 的强调** 与 ``包含 ` 符号``',
    '含 **原样代码** 的强调 与 包含 ` 符号',
  ],
  [
    '\\*字面星号\\* 与 \\[标签](https://example.invalid) 和 foo_bar_baz',
    '*字面星号* 与 [标签](https://example.invalid) 和 foo_bar_baz',
  ],
  ['未闭合的 **加粗和 `代码', '未闭合的 **加粗和 `代码'],
  ['[未闭合](https://example.invalid', '[未闭合](https://example.invalid'],
  ['```js\n未闭合的代码\n**保留星号**', '```js 未闭合的代码 **保留星号**'],
])('body and previews preserve formatting semantics: %s', (raw, expected) => {
  const tree = render(raw);
  expect(messageTextPreview(raw)).toBe(expected);
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
});

test('code fences preserve nested markup and mismatched fences without activating links', () => {
  const raw = '````md\n```\n[link](https://example.invalid)\n~~~\n````';
  const tree = render(raw);
  expect(visibleText(tree)).toBe('```\n[link](https://example.invalid)\n~~~');
  expect(links(tree)).toHaveLength(0);
});

test('escaped link delimiters and balanced URL parentheses are parsed without HTML execution', () => {
  const raw =
    '[文字\\]标签](https://example.invalid/a_(b)) 和 <script>alert(1)</script>';
  const parts = messageTextInline(raw);
  expect(parts[0]).toEqual(
    expect.objectContaining({
      kind: 'link',
      href: 'https://example.invalid/a_(b)',
    }),
  );
  expect(messageTextPreview(raw)).toBe(
    '文字]标签 和 <script>alert(1)</script>',
  );
});

test('unknown JSON retains exact text and markup in body and preview', () => {
  const raw = '{\n  "unknown": "**原样内容**",\n  "markup": "`代码`"\n}';
  const tree = render(raw);
  expect(tree.root.findByType(Text).props.children).toBe(raw);
  expect(messageTextPreview(raw)).toBe(raw);
});
