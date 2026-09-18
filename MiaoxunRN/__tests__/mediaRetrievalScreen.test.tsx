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
  quota: { dailyRemaining: 10, monthlyRemainingFen: 100 },
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
  it('does not expose an enable action if agent readiness is missing', async () => {
    await open(false);
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: '启用检索' }),
    ).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).toContain('检索暂不可用');
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
  });
});
