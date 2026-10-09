import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StationMediaPreviewScreen } from '../src/features/station/StationMediaPreviewScreen';
import { StationMediaAssetDTO } from '../src/models/api';
import { palettes } from '../src/shared/theme';
import { stationContentApi } from '../src/services/api/stationContentApi';
import { MiaoxunApiError } from '../src/services/api/http';

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
