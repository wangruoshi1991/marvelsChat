import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { HomepageSiteDTO } from '../src/models/api';
import { StationHomepageStatus } from '../src/features/station/StationHomepageStatus';
import { palettes } from '../src/shared/theme';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const site = (
  overrides: Partial<HomepageSiteDTO> = {},
): HomepageSiteDTO => ({
  userId,
  currentDraftId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  publishedReleaseId: null,
  visibility: 'private',
  shareUrl: null,
  publishedAt: null,
  unpublishedAt: null,
  ...overrides,
});

async function flushEffects() {
  for (let index = 0; index < 3; index += 1) {
    await new Promise<void>(resolve => setImmediate(resolve));
  }
}

const renderedText = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .filter(item => typeof item === 'string')
    .join(' ');

async function renderStatus({
  enabled = true,
  loadSite = jest.fn(async () => ({ site: null })),
  onOpen = jest.fn(),
}: {
  enabled?: boolean;
  loadSite?: () => Promise<{ site: HomepageSiteDTO | null }>;
  onOpen?: () => void;
} = {}) {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <StationHomepageStatus
        palette={palettes.light}
        language="zh"
        enabled={enabled}
        refreshVersion={0}
        loadSite={loadSite}
        onOpen={onOpen}
      />,
    );
    await flushEffects();
  });
  return renderer as unknown as ReactTestRenderer.ReactTestRenderer;
}

describe('StationHomepageStatus', () => {
  test('stays hidden and does not load when the feature is disabled', async () => {
    const loadSite = jest.fn(async () => ({ site: null }));
    const renderer = await renderStatus({ enabled: false, loadSite });

    expect(renderer.toJSON()).toBeNull();
    expect(loadSite).not.toHaveBeenCalled();
  });

  test('opens the builder from the not-created state', async () => {
    const onOpen = jest.fn();
    const renderer = await renderStatus({ onOpen });

    expect(renderedText(renderer)).toContain('未创建');
    expect(renderedText(renderer)).toContain('用 AI 创建主页');
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'station-homepage-open' }).props.onPress();
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['有未发布草稿', site()],
    [
      '仅自己可见',
      site({
        publishedReleaseId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        publishedAt: '2026-07-16T08:00:00.000Z',
      }),
    ],
    [
      '链接分享中',
      site({
        publishedReleaseId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        visibility: 'link',
        shareUrl: 'https://example.com/s/token',
        publishedAt: '2026-07-16T08:00:00.000Z',
      }),
    ],
  ])('shows %s for the matching homepage state', async (label, homepageSite) => {
    const renderer = await renderStatus({
      loadSite: jest.fn(async () => ({ site: homepageSite })),
    });

    expect(renderedText(renderer)).toContain(label);
  });

  test('shows a safe unavailable state and retries the load', async () => {
    const loadSite = jest
      .fn<Promise<{ site: HomepageSiteDTO | null }>, []>()
      .mockRejectedValueOnce(new Error('provider raw error'))
      .mockResolvedValueOnce({ site: null });
    const renderer = await renderStatus({ loadSite });

    expect(renderedText(renderer)).toContain('主页状态暂不可用');
    expect(renderedText(renderer)).not.toContain('provider raw error');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'station-homepage-retry' })
        .props.onPress();
      await flushEffects();
    });

    expect(loadSite).toHaveBeenCalledTimes(2);
    expect(renderedText(renderer)).toContain('未创建');
  });
});
