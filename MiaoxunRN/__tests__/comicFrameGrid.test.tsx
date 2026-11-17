import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { FlatList, Modal } from 'react-native';
import { comicRenderTask } from '../__fixtures__/comicRender';
import {
  ComicFrameGrid,
  ComicImageViewer,
} from '../src/features/messages/ComicFrameGrid';
import { palettes } from '../src/shared/theme';

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
  const onSave = jest.fn();
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
    tree.root.findByProps({ testID: 'comic-image-viewer-save' }),
  ).toBeTruthy();
  const list = tree.root.findByType(FlatList);
  expect(
    list.props.data.map((frame: { frameIndex: number }) => frame.frameIndex),
  ).toEqual([1, 2]);
  await act(async () => {
    list.props.onMomentumScrollEnd({
      nativeEvent: { contentOffset: { x: 1000 } },
    });
  });
  expect(
    tree.root.findAllByProps({ testID: 'comic-image-viewer-save' }),
  ).toHaveLength(0);
});
