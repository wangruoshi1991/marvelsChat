import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import {
  AccessibilityInfo,
  FlatList,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
} from 'react-native';
import { comicRenderTask } from '../__fixtures__/comicRender';
import {
  ComicFrameGrid,
  ComicImageViewer,
} from '../src/features/messages/ComicFrameGrid';
import { palettes } from '../src/shared/theme';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaProvider: View, SafeAreaView: View };
});

const base = {
  token: 'owner',
  palette: palettes.light,
  language: 'zh' as const,
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => {
    callback(0);
    return 0;
  });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.clearAllMocks();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('keeps storyboard grids stable for three frames and opens the selected frame', async () => {
  const onOpen = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <ComicFrameGrid {...base} count={3} onOpen={onOpen} large />,
    );
  });
  const frames = tree.root.findAll(node =>
    /^comic-frame-\d+$/.test(node.props.testID || ''),
  );
  expect(new Set(frames.map(node => node.props.testID))).toEqual(
    new Set(['comic-frame-1', 'comic-frame-2', 'comic-frame-3']),
  );
  const first = frames.find(node => node.props.testID === 'comic-frame-1')!;
  const second = frames.find(node => node.props.testID === 'comic-frame-2')!;
  expect(first.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ width: '100%' })]),
  );
  expect(second.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ width: '48%' })]),
  );
  act(() => second.props.onPress());
  expect(onOpen).toHaveBeenCalledWith(2);
});

test('viewer starts on the requested frame and only exposes save for a real image', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => {});
  const task = comicRenderTask({
    status: 'partially_succeeded',
    phase: 'completed',
    allowedActions: [],
    progress: { total: 2, succeeded: 1, failed: 1, unknown: 0 },
    frames: [
      {
        frameIndex: 1,
        status: 'succeeded',
        mediaAssetId: 'asset-1',
        errorCode: null,
      },
      {
        frameIndex: 2,
        status: 'failed',
        mediaAssetId: null,
        errorCode: 'FAILED',
      },
    ],
  });
  let complete!: () => void;
  const onSave = jest.fn(
    () =>
      new Promise<void>(resolve => {
        complete = resolve;
      }),
  );
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <ComicImageViewer
        {...base}
        visible
        count={2}
        task={task}
        initialIndex={1}
        onClose={jest.fn()}
        onSave={onSave}
      />,
    );
  });
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  expect(
    tree.root.findByProps({ testID: 'comic-image-viewer' }).props.edges,
  ).toEqual(['top', 'bottom']);
  const close = tree.root.findByProps({ testID: 'comic-image-viewer-close' });
  expect(StyleSheet.flatten(close.props.style)).toMatchObject({
    width: 44,
    height: 44,
  });
  const viewport = tree.root.findByProps({
    testID: 'comic-image-viewer-viewport',
  });
  await act(async () => {
    viewport.props.onLayout({
      nativeEvent: { layout: { width: 320, height: 410 } },
    });
  });
  expect(
    tree.root.findByProps({ testID: 'comic-image-viewer-save' }),
  ).toBeTruthy();
  const list = tree.root.findByType(FlatList);
  const save = tree.root.findByProps({ testID: 'comic-image-viewer-save' });
  expect(StyleSheet.flatten(save.props.style)).toMatchObject({
    width: 44,
    height: 44,
  });
  expect(list.props.getItemLayout(null, 1)).toEqual({
    length: 320,
    offset: 320,
    index: 1,
  });
  const image = tree.root.findAllByType(Image).find(node => node.props.source);
  expect(image?.props.resizeMode).toBe('contain');
  expect(StyleSheet.flatten(image?.props.style)).toMatchObject({
    height: '100%',
    width: '100%',
  });
  act(() => {
    save.props.onPress();
    save.props.onPress();
  });
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(
    list.props.data.map((frame: { frameIndex: number }) => frame.frameIndex),
  ).toEqual([1, 2]);
  await act(async () => {
    list.props.onMomentumScrollEnd({
      nativeEvent: { contentOffset: { x: 320 } },
    });
  });
  expect(
    tree.root.findAllByProps({ testID: 'comic-image-viewer-save' }),
  ).toHaveLength(0);
  await act(async () => {
    complete();
  });
  expect(JSON.stringify(tree.toJSON())).not.toContain('已保存到相册');
  expect(announce).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

test.each([
  { os: 'ios', error: null, expected: '已保存到相册' },
  { os: 'ios', error: new Error('相册权限不足'), expected: '相册权限不足' },
  { os: 'android', error: null, expected: '已保存到相册' },
] as const)(
  'shows the final save result on $os ($expected)',
  async ({ os, error, expected }) => {
    jest.replaceProperty(Platform, 'OS', os);
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    const task = comicRenderTask({
      frames: [
        {
          frameIndex: 1,
          status: 'succeeded',
          mediaAssetId: 'asset-1',
          errorCode: null,
        },
      ],
    });
    const onSave = jest.fn(async () => {
      if (error) throw error;
    });
    let tree!: Renderer.ReactTestRenderer;
    await act(async () => {
      tree = Renderer.create(
        <ComicImageViewer
          {...base}
          visible
          count={1}
          task={task}
          initialIndex={1}
          onClose={jest.fn()}
          onSave={onSave}
        />,
      );
    });
    const save = tree.root.findByProps({ testID: 'comic-image-viewer-save' });
    await act(async () => save.props.onPress());
    const notice = tree.root
      .findAllByType(Text)
      .find(node => node.props.accessibilityLiveRegion === 'polite');
    expect(notice?.props.children).toBe(expected);
    expect(announce.mock.calls).toEqual(os === 'ios' ? [[expected]] : []);
    await act(async () => tree.unmount());
  },
);
