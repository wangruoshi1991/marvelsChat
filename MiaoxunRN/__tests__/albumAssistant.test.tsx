import React from 'react';
import { Alert, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  albumAssistantConsent,
  albumAssistantConsentRequirement,
  albumAssistantDisclosure,
} from '../src/features/station/albumAssistantAuthorization';
import { AlbumAssistantResults } from '../src/features/messages/AlbumAssistantResults';
import { AlbumAssistantStatus } from '../src/features/messages/AlbumAssistantStatus';
import { RetrievalResultCard } from '../src/features/media-retrieval/RetrievalResultCard';
import { mediaRetrievalApi } from '../src/services/api/mediaRetrievalApi';
import { request } from '../src/services/api/http';
import { stationContentApi } from '../src/services/api/stationContentApi';
import { profileApi } from '../src/services/api/profileApi';
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
  backfill: { indexedAssets: 2, skippedAssets: 0, totalAssets: 2 },
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
  expect(
    await albumAssistantConsent('owner-token', 'zh', () => true),
  ).toBeUndefined();
  expect(alert).not.toHaveBeenCalled();
});

test('first use returns a requirement without prompting or writing', async () => {
  jest
    .mocked(mediaRetrievalApi.status)
    .mockResolvedValue({ ...ready, enabled: false } as never);
  const alert = jest.spyOn(Alert, 'alert');
  await expect(
    albumAssistantConsentRequirement('owner-token', 'zh', () => true),
  ).resolves.toBe('media-retrieval-consent-v1');
  expect(alert).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

test('cloud analysis disclosure includes all uploaded media, independent phone permission, and revocation', () => {
  const disclosure = albumAssistantDisclosure('zh');
  expect(disclosure).toContain('云端 AI 分析');
  expect(disclosure).toContain('不只限于本次选中的相册');
  expect(disclosure).toContain('手机相册访问权限独立');
  expect(disclosure).toContain('撤回授权并清理索引，原素材保留');
});

test.each([false, true])(
  'a late consent status for a changed account does not prompt or write, enabled=%s',
  async enabled => {
    let current = true;
    let complete!: (value: never) => void;
    jest.mocked(mediaRetrievalApi.status).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          complete = resolve;
        }),
    );
    const alert = jest.spyOn(Alert, 'alert');
    const operation = albumAssistantConsent(
      'old-owner-token',
      'zh',
      () => current,
    ).then(consent =>
      profileApi.setAgentEnabled(
        'old-owner-token',
        'album-manager',
        true,
        consent,
      ),
    );
    current = false;
    complete({ ...ready, enabled } as never);
    await expect(operation).rejects.toThrow('账号已切换或操作已取消');
    expect(alert).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  },
);

test('missing consent rejects without a second prompt or API write', async () => {
  jest
    .mocked(mediaRetrievalApi.status)
    .mockResolvedValue({ ...ready, enabled: false } as never);
  const alert = jest.spyOn(Alert, 'alert');
  await expect(
    albumAssistantConsent('owner-token', 'zh', () => true),
  ).rejects.toThrow('重新查看范围及云端使用说明');
  expect(alert).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

test('explicit consent from the shared confirmation returns the version without another prompt', async () => {
  jest
    .mocked(mediaRetrievalApi.status)
    .mockResolvedValue({ ...ready, enabled: false } as never);
  const alert = jest.spyOn(Alert, 'alert');
  await expect(
    albumAssistantConsent(
      'owner-token',
      'zh',
      () => true,
      'media-retrieval-consent-v1',
    ),
  ).resolves.toBe('media-retrieval-consent-v1');
  expect(alert).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

test('a consent status failure propagates without prompting or performing an API write', async () => {
  jest
    .mocked(mediaRetrievalApi.status)
    .mockRejectedValue(new Error('无法读取授权状态'));
  const alert = jest.spyOn(Alert, 'alert');
  await expect(
    albumAssistantConsent('owner-token', 'zh', () => true),
  ).rejects.toThrow('无法读取授权状态');
  expect(alert).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

test('zero ready assets do not claim a partially searchable index', async () => {
  jest.mocked(mediaRetrievalApi.status).mockResolvedValue({
    ...ready,
    backfill: { indexedAssets: 0, skippedAssets: 0, totalAssets: 2 },
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

test.each([
  [0, 2, 2, '没有可检索素材，也没有排队任务', false],
  [1, 2, 3, '可以查找已完成索引的素材', false],
  [0, 1, 2, '请等待处理完成', true],
  [1, 1, 3, '素材正在建立索引', true],
])(
  'unavailable media remain explicit with %i ready, %i unavailable and %i total',
  async (indexedAssets, skippedAssets, totalAssets, expected, pending) => {
    jest.mocked(mediaRetrievalApi.status).mockResolvedValue({
      ...ready,
      backfill: { indexedAssets, skippedAssets, totalAssets },
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
    const displayed = renderer.root
      .findAllByType(Text)
      .map(node => String(node.props.children))
      .join(' ');
    expect(displayed).toContain(expected);
    expect(displayed).toContain(`${skippedAssets} 个素材需要检查处理状态`);
    expect(displayed).toContain('不会自动重试');
    expect(/请等待|正在建立索引/.test(displayed)).toBe(pending);
    await act(async () => renderer.unmount());
  },
);

test('polling replaces the waiting message once all indexing work is terminal', async () => {
  jest.useFakeTimers();
  jest
    .mocked(mediaRetrievalApi.status)
    .mockResolvedValueOnce({
      ...ready,
      backfill: { indexedAssets: 0, skippedAssets: 0, totalAssets: 1 },
    } as never)
    .mockResolvedValueOnce({
      ...ready,
      backfill: { indexedAssets: 0, skippedAssets: 1, totalAssets: 1 },
    } as never);
  let renderer!: TestRenderer.ReactTestRenderer;
  try {
    await act(async () => {
      renderer = TestRenderer.create(
        <AlbumAssistantStatus
          token="owner"
          palette={palettes.light}
          language="en"
          onAuthorize={jest.fn()}
          onError={jest.fn()}
        />,
      );
    });
    expect(renderer.root.findByType(Text).props.children).toContain(
      'Wait for processing',
    );
    await act(async () => jest.advanceTimersByTime(10000));
    const displayed = renderer.root
      .findAllByType(Text)
      .map(node => String(node.props.children))
      .join(' ');
    expect(displayed).toContain('no tasks are pending');
    expect(displayed).toContain('will not retry automatically');
    expect(displayed).not.toContain('Wait for processing');
  } finally {
    await act(async () => renderer?.unmount());
    jest.useRealTimers();
  }
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
