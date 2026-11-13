import React from 'react';
import { Image, Text } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { ComicSourcePickerSheet } from '../src/features/messages/ComicSourcePickerSheet';
import { ComicDetailScreen } from '../src/features/messages/ComicDetailScreen';
import { StationMediaAssetDTO } from '../src/models/api';
import { ComicRenderTaskDTO } from '../src/models/comicRender';
import { comicRenderTask } from '../__fixtures__/comicRender';
import { palettes } from '../src/shared/theme';
import { chatContentApi } from '../src/services/api/chatContentApi';
let mockRender: {
  loaded: boolean;
  error: string;
  tasks: ComicRenderTaskDTO[];
  busy: boolean;
  cancel: jest.Mock;
  refresh: jest.Mock;
};
jest.mock('../src/features/station/useComicRenderTasks', () => ({
  useComicRenderTasks: () => mockRender,
}));
jest.mock('../src/services/api/chatContentApi', () => ({
  chatContentApi: { comic: jest.fn() },
}));
let tree: Renderer.ReactTestRenderer;
const text = () =>
  tree.root
    .findAllByType(Text)
    .flatMap(node => node.props.children)
    .flat(Infinity)
    .join(' ');
const button = (label: string) =>
  tree.root
    .findAllByProps({ accessibilityLabel: label })
    .find(node => node.props.onPress)!;
afterEach(async () => {
  await act(async () => tree?.unmount());
});
test('source selection counts each image and other references toward six, and image failures remain explicit', async () => {
  const images = Array.from(
    { length: 6 },
    (_, index) =>
      ({
        id: `image-${index}`,
        kind: 'image',
        status: 'uploaded',
        caption: `照片${index}`,
        originalFilename: `${index}.jpg`,
      } as StationMediaAssetDTO),
  );
  const select = jest.fn();
  await act(async () => {
    tree = Renderer.create(
      <ComicSourcePickerSheet
        token="owner"
        albums={[]}
        mediaAssets={images}
        references={[{ kind: 'station-diary', id: 'diary' }]}
        palette={palettes.light}
        language="zh"
        onSelect={select}
        onClose={jest.fn()}
      />,
    );
  });
  for (let i = 0; i < 5; i += 1)
    await act(async () => {
      button(`选择 照片${i}`).props.onPress();
    });
  await act(async () => {
    button('选择 照片5').props.onPress();
  });
  expect(text()).toContain('最多选择6份');
  await act(async () => {
    tree.root.findAllByType(Image)[0].props.onError();
  });
  expect(text()).toContain('图片读取失败');
  expect(text()).toContain('文字模型不会读取原图');
  await act(async () => {
    button('使用所选').props.onPress();
  });
  expect(select.mock.calls[0][0]).toHaveLength(6);
  expect(select.mock.calls[0][0][5]).toMatchObject({
    kind: 'station-photo',
    id: 'image-4',
  });
});
test('detail publishes only successful assets in frame order and never offers cancel for a running task', async () => {
  const task = comicRenderTask({
    status: 'running',
    allowedActions: ['cancel'],
    progress: { total: 4, succeeded: 2, failed: 1, unknown: 1 },
    frames: [
      {
        frameIndex: 4,
        status: 'succeeded',
        mediaAssetId: 'four',
        errorCode: null,
      },
      {
        frameIndex: 2,
        status: 'failed',
        mediaAssetId: null,
        errorCode: 'SAFE_FAILURE',
      },
      {
        frameIndex: 1,
        status: 'succeeded',
        mediaAssetId: 'one',
        errorCode: null,
      },
      {
        frameIndex: 3,
        status: 'unknown',
        mediaAssetId: null,
        errorCode: 'RESULT_UNKNOWN',
      },
    ],
  });
  mockRender = {
    loaded: true,
    error: '',
    tasks: [task],
    busy: false,
    cancel: jest.fn(),
    refresh: jest.fn(),
  };
  jest.mocked(chatContentApi.comic).mockResolvedValue({
    comicDiary: {
      id: 'comic-1',
      title: '生活',
      summary: '散步',
      prompt: '',
      style: 'manga',
      frames: Array.from({ length: 4 }, () => ({
        title: '分镜',
        caption: '桥',
      })),
    },
    tasks: [task],
  });
  const publish = jest.fn();
  await act(async () => {
    tree = Renderer.create(
      <ComicDetailScreen
        token="owner"
        comicId="comic-1"
        palette={palettes.light}
        language="zh"
        onBack={jest.fn()}
        onPublish={publish}
      />,
    );
  });
  expect(
    tree.root.findAllByProps({ accessibilityLabel: '取消排队' }),
  ).toHaveLength(0);
  expect(text()).toContain('将带入2张已完成画面');
  expect(text()).toContain('结果未知');
  expect(text()).not.toContain('旁白');
  await act(async () => {
    button('查看分镜文字').props.onPress();
  });
  expect(text()).toContain('旁白');
  expect(button('收起分镜文字').props.accessibilityState.expanded).toBe(true);
  await act(async () => {
    button('收起分镜文字').props.onPress();
    button('放大画面').props.onPress();
  });
  expect(text()).not.toContain('旁白');
  expect(button('收起画面')).toBeDefined();
  await act(async () => {
    button('发布动态（2张）').props.onPress();
  });
  expect(publish).toHaveBeenCalledWith({
    body: '散步',
    mediaAssetIds: ['one', 'four'],
  });
  expect(mockRender.cancel).not.toHaveBeenCalled();
});
