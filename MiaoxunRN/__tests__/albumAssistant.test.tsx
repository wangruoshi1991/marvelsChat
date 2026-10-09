import React from 'react';
import { Alert, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { albumAssistantConsent } from '../src/features/station/albumAssistantAuthorization';
import { AlbumAssistantResults } from '../src/features/messages/AlbumAssistantResults';
import { AlbumAssistantStatus } from '../src/features/messages/AlbumAssistantStatus';
import { RetrievalResultCard } from '../src/features/media-retrieval/RetrievalResultCard';
import { mediaRetrievalApi } from '../src/services/api/mediaRetrievalApi';
import { request } from '../src/services/api/http';
import { stationContentApi } from '../src/services/api/stationContentApi';
import { palettes } from '../src/shared/theme';

jest.mock('../src/services/api/mediaRetrievalApi', () => ({
  mediaRetrievalApi: { status: jest.fn() },
}));
jest.mock('../src/services/api/http', () => ({
  ...jest.requireActual('../src/services/api/http'),
  request: jest.fn(),
}));
jest.mock('../src/services/api/stationContentApi', () => ({
  stationContentApi: { stationMediaAsset: jest.fn() },
}));
jest.mock('../src/features/station/StationMediaPreviewScreen', () => ({
  StationMediaPreviewScreen: () => null,
}));
const ready = {
  enabled: true,
  consentVersion: 'media-retrieval-consent-v1',
  availability: { canStartRun: true },
  backfill: { indexedAssets: 2, totalAssets: 2 },
};
const hit = {
  mediaAssetId: 'asset-1',
  kind: 'video',
  matchedFrameTimestampMs: 4000,
  summary: '公开视频',
  matchReasons: [],
  scoreBucket: 'high',
};

beforeEach(() => {
  jest.resetAllMocks();
});
afterEach(() => {
  jest.restoreAllMocks();
});

test('an existing cloud consent is reused without another confirmation', async () => {
  jest.mocked(mediaRetrievalApi.status).mockResolvedValue(ready as never);
  const alert = jest.spyOn(Alert, 'alert');
  expect(await albumAssistantConsent('owner-token', 'zh')).toBeUndefined();
  expect(alert).not.toHaveBeenCalled();
});

test('a first consent cancellation rejects without an API write', async () => {
  jest
    .mocked(mediaRetrievalApi.status)
    .mockResolvedValue({ ...ready, enabled: false } as never);
  jest.spyOn(Alert, 'alert').mockImplementation((_title, body, buttons) => {
    expect(body).toContain('云端 AI');
    buttons?.[0].onPress?.();
  });
  await expect(albumAssistantConsent('owner-token', 'zh')).rejects.toThrow(
    '已取消',
  );
});

test('zero ready assets do not claim a partially searchable index', async () => {
  jest.mocked(mediaRetrievalApi.status).mockResolvedValue({
    ...ready,
    backfill: { indexedAssets: 0, totalAssets: 2 },
  } as never);
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <AlbumAssistantStatus
        token="owner"
        palette={palettes.light}
        language="zh"
        onAuthorize={jest.fn()}
        onError={jest.fn()}
      />,
    );
  });
  expect(renderer.root.findByType(Text).props.children).toContain('还没有完成');
  await act(async () => renderer.unmount());
});

test('message references load owned results; changing accounts clears them and ignores stale previews', async () => {
  jest.mocked(request).mockResolvedValueOnce([hit]).mockResolvedValueOnce([]);
  let complete!: (value: never) => void;
  jest.mocked(stationContentApi.stationMediaAsset).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        complete = resolve;
      }),
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  const render = (token: string) => (
    <AlbumAssistantResults
      token={token}
      threadId="thread"
      messageId="message"
      palette={palettes.light}
      language="zh"
    />
  );
  await act(async () => {
    renderer = TestRenderer.create(render('owner'));
  });
  expect(request).toHaveBeenCalledWith(
    '/api/threads/thread/messages/message/media-results',
    { token: 'owner' },
  );
  await act(async () =>
    renderer.root.findByType(RetrievalResultCard).props.onPress(),
  );
  await act(async () => renderer.update(render('other-owner')));
  await act(async () =>
    complete({ kind: 'video', status: 'uploaded' } as never),
  );
  expect(renderer.root.findAllByType(RetrievalResultCard)).toHaveLength(0);
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => String(node.props.children).includes('已不可用')),
  ).toBe(true);
  await act(async () => renderer.unmount());
});

test('malformed result references display a failure and can be retried', async () => {
  jest
    .mocked(request)
    .mockResolvedValueOnce([{ ...hit, mediaAssetId: undefined }])
    .mockResolvedValueOnce([hit]);
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <AlbumAssistantResults
        token="owner"
        threadId="thread"
        messageId="message"
        palette={palettes.light}
        language="zh"
      />,
    );
  });
  expect(renderer.root.findAllByType(RetrievalResultCard)).toHaveLength(0);
  expect(renderer.toJSON()).toMatchObject({
    children: [{ props: { accessibilityRole: 'button' } }],
  });
  await act(async () =>
    renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress(),
  );
  expect(renderer.root.findAllByType(RetrievalResultCard)).toHaveLength(1);
  await act(async () => renderer.unmount());
});
