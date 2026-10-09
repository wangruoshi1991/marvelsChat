import React from 'react';
import { AppState, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { MediaRetrievalScreen } from '../src/features/media-retrieval/MediaRetrievalScreen';
import { mediaRetrievalApi } from '../src/services/api/mediaRetrievalApi';
import { palettes } from '../src/shared/theme';
import { MiaoxunApiError } from '../src/services/api/http';
import fixture from '../../shared/media-retrieval-public-contract.fixture.json';

jest.mock('../src/services/api/mediaRetrievalApi', () => ({
  mediaRetrievalApi: {
    status: jest.fn(),
    enable: jest.fn(),
    reindex: jest.fn(),
    purge: jest.fn(),
    search: jest.fn(),
    events: jest.fn(),
  },
}));
const status = (enabled: boolean) => ({
  enabled,
  consentVersion: enabled ? 'media-retrieval-consent-v1' : null,
  backfill: {
    agentRunId: null,
    lifecycleStatus: 'idle',
    indexedAssets: 2,
    skippedAssets: 0,
    totalAssets: 2,
  },
  quota: { dailyRemaining: null, monthlyRemainingFen: null },
  availability: { state: 'available', canStartRun: true, reasonCodes: [] },
  recentRuns: [],
});

describe('Find media screen', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  const onOpenResult = jest.fn();
  const open = async (registeredAvailability = true) => {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <MediaRetrievalScreen
          userId="owner"
          token="owner"
          registeredAvailability={registeredAvailability}
          palette={palettes.light}
          language="zh"
          onClose={jest.fn()}
          onOpenResult={onOpenResult}
        />,
      );
    });
  };
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    AppState.currentState = 'active';
    (mediaRetrievalApi.status as jest.Mock).mockResolvedValue(status(false));
    (mediaRetrievalApi.enable as jest.Mock).mockResolvedValue({
      agentRunId: 'run-1',
      lifecycleStatus: 'queued',
      reused: false,
    });
    (mediaRetrievalApi.search as jest.Mock).mockResolvedValue(
      fixture.searchSuccess,
    );
    onOpenResult.mockResolvedValue(undefined);
  });
  afterEach(async () => {
    if (renderer) await ReactTestRenderer.act(async () => renderer.unmount());
    jest.useRealTimers();
  });
  it('requires explicit consent and identifies the real provider before enabling', async () => {
    await open();
    expect(JSON.stringify(renderer.toJSON())).toContain('阿里云百炼');
    expect(
      renderer.root.findByProps({ accessibilityLabel: '启用检索' }).props
        .disabled,
    ).toBe(true);
    expect(mediaRetrievalApi.enable).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: '同意私有素材检索' })
        .props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({ accessibilityLabel: '启用检索' })
        .props.onPress();
    });
    expect(mediaRetrievalApi.enable).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer.toJSON())).not.toContain('已完成');
  });
  it('keeps consent visible and enabling disabled if agent readiness is missing', async () => {
    await open(false);
    expect(
      renderer.root.findByProps({ accessibilityLabel: '启用检索' }).props
        .disabled,
    ).toBe(true);
    expect(JSON.stringify(renderer.toJSON())).toContain('检索暂不可用');
    expect(JSON.stringify(renderer.toJSON())).toContain('阿里云百炼');
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: '同意私有素材检索' })
        .props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: '启用检索' })
        .props.onPress();
    });
    expect(mediaRetrievalApi.enable).not.toHaveBeenCalled();
  });
  it('explains a closed service without hiding the consent entry', async () => {
    (mediaRetrievalApi.status as jest.Mock).mockResolvedValue({
      ...status(false),
      availability: {
        state: 'unavailable',
        canStartRun: false,
        reasonCodes: ['lifecycle-not-available'],
      },
    });
    await open();
    expect(JSON.stringify(renderer.toJSON())).toContain('尚未正式开放');
    expect(
      renderer.root.findByProps({ accessibilityLabel: '同意私有素材检索' })
        .props.accessibilityState.checked,
    ).toBe(false);
    expect(
      renderer.root.findByProps({ accessibilityLabel: '启用检索' }).props
        .disabled,
    ).toBe(true);
    expect(mediaRetrievalApi.enable).not.toHaveBeenCalled();
  });
  it('opens only explicitly searched results and removes a deleted owner asset on 404', async () => {
    (mediaRetrievalApi.status as jest.Mock).mockResolvedValue(status(true));
    await open();
    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(TextInput).props.onChangeText('黄色裙子');
    });
    expect(mediaRetrievalApi.search).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: '搜索素材' })
        .props.onPress();
    });
    onOpenResult.mockRejectedValueOnce(
      new MiaoxunApiError('not available', { status: 404 }),
    );
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: '打开图片：yellow dress' })
        .props.onPress();
    });
    expect(onOpenResult).toHaveBeenCalledWith(fixture.searchSuccess.results[0]);
    expect(
      renderer.root.findAllByProps({
        accessibilityLabel: '打开图片：yellow dress',
      }),
    ).toHaveLength(0);
    expect(mediaRetrievalApi.search).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer.toJSON())).toContain('已从当前结果移除');
    expect(JSON.stringify(renderer.toJSON())).not.toContain('今日还可检索');
  });
  it('renders verified visual evidence as a product label without exposing the internal reason code', async () => {
    (mediaRetrievalApi.status as jest.Mock).mockResolvedValue(status(true));
    (mediaRetrievalApi.search as jest.Mock).mockResolvedValue({
      ...fixture.searchSuccess,
      results: [
        {
          ...fixture.searchSuccess.results[0],
          matchReasons: ['descriptor-match'],
        },
      ],
    });
    await open();
    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(TextInput).props.onChangeText('自行车的照片');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: '搜索素材' })
        .props.onPress();
    });
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('画面内容匹配');
    expect(rendered).not.toContain('descriptor-match');
  });

  it('shows partial indexing and searches ready media only after the user submits', async () => {
    const partial = status(true);
    (mediaRetrievalApi.status as jest.Mock).mockResolvedValue({
      ...partial,
      backfill: {
        ...partial.backfill,
        indexedAssets: 5,
        totalAssets: 7,
        skippedAssets: 2,
      },
      recentRuns: [
        {
          id: 'partial-index',
          agentId: 'media-retrieval',
          runType: 'media-index',
          status: 'error',
          lifecycleStatus: 'failed',
          failureCode: 'retrieval_child_jobs_failed',
          traceId: null,
          attempt: 1,
          createdAt: null,
          finishedAt: null,
        },
      ],
    });
    await open();
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain('已有素材可检索');
    expect(rendered).toContain('已整理 5 / 7 个素材，2 个待处理');
    expect(rendered).toContain('未完成的素材不会自动重试');
    expect(rendered).not.toContain('检索暂不可用');
    expect(mediaRetrievalApi.search).not.toHaveBeenCalled();
    expect(mediaRetrievalApi.reindex).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(TextInput).props.onChangeText('黄色裙子');
    });
    expect(
      renderer.root.findByProps({ accessibilityLabel: '搜索素材' }).props
        .disabled,
    ).toBe(false);
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: '搜索素材' })
        .props.onPress();
    });
    expect(mediaRetrievalApi.search).toHaveBeenCalledTimes(1);
  });

  it('explains an empty library and does not dispatch a model search without indexed media', async () => {
    const empty = status(true);
    (mediaRetrievalApi.status as jest.Mock).mockResolvedValue({
      ...empty,
      backfill: { ...empty.backfill, indexedAssets: 0, totalAssets: 0 },
    });
    await open();
    expect(JSON.stringify(renderer.toJSON())).toContain('暂无可检索素材');
    expect(JSON.stringify(renderer.toJSON())).toContain('上传图片或视频后');
    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(TextInput).props.onChangeText('黄色裙子');
    });
    expect(
      renderer.root.findByProps({ accessibilityLabel: '搜索素材' }).props
        .disabled,
    ).toBe(true);
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: '搜索素材' })
        .props.onPress();
    });
    expect(mediaRetrievalApi.search).not.toHaveBeenCalled();
  });
});
