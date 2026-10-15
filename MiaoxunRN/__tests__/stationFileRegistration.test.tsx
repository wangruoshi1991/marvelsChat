import React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { StationFileAgentPanel } from '../src/features/station/StationFileAgentPanel';
import { StationFileAssetDTO } from '../src/models/api';
import { palettes } from '../src/shared/theme';

let renderer: TestRenderer.ReactTestRenderer;
const asset: StationFileAssetDTO = {
  id: 'registered-text',
  originalFilename: 'notes.md',
  mimeType: 'text/markdown',
  storageProvider: 'inline',
  sourceKind: 'inline_text',
  status: 'processed',
};
const props = (overrides = {}) => ({
  palette: palettes.light,
  language: 'zh' as const,
  fileAssets: [],
  onCreateFileAsset: jest.fn(async () => asset),
  onActionMessage: jest.fn(),
  onActionError: jest.fn(),
  ...overrides,
});
const inputs = () => renderer.root.findAllByType(TextInput);
const submit = () =>
  renderer.root
    .findAll(node => typeof node.props.onPress === 'function')
    .find(node => node.props.accessibilityLabel === '登记预览')!;
const text = () =>
  renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat()
    .join(' ');

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
});

test('registration starts blank and cannot submit prefilled demonstration content', async () => {
  const input = props();
  await act(async () => {
    renderer = TestRenderer.create(<StationFileAgentPanel {...input} />);
  });
  expect(inputs().map(node => node.props.value)).toEqual(['', '']);
  expect(submit().props.disabled).toBe(true);
  expect(inputs()[1].props.maxLength).toBe(1000);
  await act(async () => {
    await submit().props.onPress();
  });
  expect(input.onCreateFileAsset).not.toHaveBeenCalled();
});

test('registers the exact literal text once even when pressed twice before the request settles', async () => {
  let resolve!: (result: StationFileAssetDTO) => void;
  const pending = new Promise<StationFileAssetDTO>(done => {
    resolve = done;
  });
  const create = jest.fn(() => pending);
  const input = props({ onCreateFileAsset: create });
  await act(async () => {
    renderer = TestRenderer.create(<StationFileAgentPanel {...input} />);
  });
  const content = '  <script>source</script>\n\t原文  ';
  act(() => {
    inputs()[0].props.onChangeText(' notes.md ');
    inputs()[1].props.onChangeText(content);
  });
  const send = submit().props.onPress;
  let request!: Promise<void>;
  act(() => {
    request = send();
    send();
  });
  expect(create).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledWith({
    originalFilename: 'notes.md',
    mimeType: 'text/markdown',
    content,
    metadata: { source: 'station-text-material' },
  });
  await act(async () => {
    resolve(asset);
    await request;
  });
  expect(input.onActionMessage).toHaveBeenCalledWith('文字预览已登记');
  expect(inputs().map(node => node.props.value)).toEqual(['', '']);
});

test('failed registration keeps the entered text and reports the actual failure', async () => {
  const failure = new Error('保存失败');
  const input = props({
    onCreateFileAsset: jest.fn(async () => {
      throw failure;
    }),
  });
  await act(async () => {
    renderer = TestRenderer.create(<StationFileAgentPanel {...input} />);
  });
  act(() => {
    inputs()[0].props.onChangeText('notes.txt');
    inputs()[1].props.onChangeText('  保留原文\n');
  });
  await act(async () => {
    await submit().props.onPress();
  });
  expect(input.onActionError).toHaveBeenCalledWith(failure);
  expect(input.onActionMessage).not.toHaveBeenCalled();
  expect(inputs()[1].props.value).toBe('  保留原文\n');
});

test('existing file previews render as plain text without presenting old heuristic summaries', async () => {
  const preview = '<p>保留标签</p>\n  保留空白';
  const input = props({
    fileAssets: [
      {
        ...asset,
        preprocessingResult: {
          title: '旧猜测标题',
          summary: '旧规则摘要',
          tags: ['旧标签'],
          textPreview: preview,
        },
      },
    ],
  });
  await act(async () => {
    renderer = TestRenderer.create(<StationFileAgentPanel {...input} />);
  });
  expect(text()).toContain('notes.md');
  expect(text()).toContain(preview);
  expect(text()).not.toContain('旧规则摘要');
  expect(text()).not.toContain('旧猜测标题');
  expect(text()).not.toContain('旧标签');
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.selectable && node.props.children === preview),
  ).toBe(true);
});
