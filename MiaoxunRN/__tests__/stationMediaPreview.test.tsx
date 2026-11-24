import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StationMediaPreviewScreen } from '../src/features/station/StationMediaPreviewScreen';
import { StationMediaAssetDTO } from '../src/models/api';
import { palettes } from '../src/shared/theme';
import { stationContentApi } from '../src/services/api/stationContentApi';
import { MiaoxunApiError } from '../src/services/api/http';
import { saveComicImageToLibrary } from '../src/services/comicMediaLibrary';

jest.mock('../src/services/comicMediaLibrary', () => ({
  saveComicImageToLibrary: jest.fn(),
}));

jest.mock('../src/services/api/stationContentApi', () => ({
  stationContentApi: { stationMediaAsset: jest.fn() },
}));

test('video uses authenticated media endpoint and seeks to matched time after load', async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <StationMediaPreviewScreen
        asset={{ id: 'asset-1', kind: 'video' } as StationMediaAssetDTO}
        token="private-token"
        timestampMs={12500}
        palette={palettes.light}
        language="zh"
        onBack={jest.fn()}
        onUnavailable={jest.fn()}
      />,
    );
  });
  const player = renderer.root.findByProps({ testID: 'native-video' });
  expect(player.props.source).toEqual({
    uri: 'http://127.0.0.1:4390/api/station/media-assets/asset-1/file',
    headers: { Authorization: 'Bearer private-token' },
  });
  await act(async () => player.props.onLoad({ duration: 30 }));
  expect(player.props.seek).toHaveBeenCalledWith(12.5);
  await act(async () => renderer.unmount());
});

test('deleted result is invalidated when the media load fails', async () => {
  const onUnavailable = jest.fn();
  jest
    .mocked(stationContentApi.stationMediaAsset)
    .mockRejectedValueOnce(new MiaoxunApiError('Missing', { status: 404 }));
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <StationMediaPreviewScreen
        asset={{ id: 'asset-1', kind: 'video' } as StationMediaAssetDTO}
        token="private-token"
        timestampMs={null}
        palette={palettes.light}
        language="zh"
        onBack={jest.fn()}
        onUnavailable={onUnavailable}
      />,
    );
  });
  await act(async () =>
    renderer.root.findByProps({ testID: 'native-video' }).props.onError(),
  );
  expect(onUnavailable).toHaveBeenCalledWith('asset-1');
  await act(async () => renderer.unmount());
});

test('image preview exposes an accessible save action and reports success', async () => {
  const onActionMessage = jest.fn();
  jest.mocked(saveComicImageToLibrary).mockResolvedValueOnce({
    status: 'saved',
    mediaAssetId: 'asset-1',
  });
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <StationMediaPreviewScreen
        asset={{ id: 'asset-1', kind: 'image', status: 'uploaded' }}
        token="private-token"
        timestampMs={null}
        palette={palettes.light}
        language="zh"
        onBack={jest.fn()}
        onUnavailable={jest.fn()}
        onActionMessage={onActionMessage}
      />,
    );
  });
  const save = renderer.root.findByProps({ testID: 'station-media-save' });
  expect(save.props.accessibilityLabel).toBe('保存图片');
  await act(async () => save.props.onPress());
  expect(saveComicImageToLibrary).toHaveBeenCalledWith({
    mediaAssetId: 'asset-1',
    token: 'private-token',
  });
  expect(onActionMessage).toHaveBeenCalledWith('图片已保存到系统相册。');
  expect(
    renderer.root.findByProps({ testID: 'station-media-save-status' }).props
      .children,
  ).toContain('图片已保存到系统相册');
  await act(async () => renderer.unmount());
});

test('image preview reports a save failure without hiding the retryable action', async () => {
  const onActionMessage = jest.fn();
  jest
    .mocked(saveComicImageToLibrary)
    .mockRejectedValueOnce(new Error('未获得保存到相册的权限。'));
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <StationMediaPreviewScreen
        asset={{ id: 'asset-1', kind: 'image', status: 'uploaded' }}
        token="private-token"
        timestampMs={null}
        palette={palettes.light}
        language="zh"
        onBack={jest.fn()}
        onUnavailable={jest.fn()}
        onActionMessage={onActionMessage}
      />,
    );
  });
  const save = renderer.root.findByProps({ testID: 'station-media-save' });
  await act(async () => save.props.onPress());
  expect(onActionMessage).toHaveBeenCalledWith('未获得保存到相册的权限。');
  expect(
    renderer.root.findByProps({ testID: 'station-media-save-status' }).props
      .children,
  ).toContain('未获得保存到相册的权限');
  await act(async () => renderer.unmount());
});

test('leaving a preview silences its pending save and a double tap starts it once', async () => {
  let reject!: (error: Error) => void;
  const saveImage = jest.mocked(saveComicImageToLibrary);
  saveImage.mockClear().mockImplementationOnce(
    () =>
      new Promise((_resolve, failure) => {
        reject = failure;
      }),
  );
  const onActionMessage = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <StationMediaPreviewScreen
        asset={{ id: 'asset-1', kind: 'image', status: 'uploaded' }}
        token="owner"
        timestampMs={null}
        palette={palettes.light}
        language="zh"
        onBack={jest.fn()}
        onUnavailable={jest.fn()}
        onActionMessage={onActionMessage}
      />,
    );
  });
  const save = tree.root.findByProps({ testID: 'station-media-save' });
  act(() => {
    save.props.onPress();
    save.props.onPress();
  });
  expect(saveImage).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
  await act(async () => {
    reject(new Error('Photos denied'));
  });
  expect(onActionMessage).not.toHaveBeenCalled();
});
