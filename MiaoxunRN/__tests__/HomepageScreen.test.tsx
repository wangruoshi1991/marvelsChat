import React from 'react';
import { Alert, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {
  HomepageReleaseDTO,
  HomepageSiteDraftDTO,
  HomepageSiteDTO,
  StationMediaAssetDTO,
} from '../src/models/api';
import { HomepageScreen } from '../src/features/homepage/HomepageScreen';
import type { HomepageSession } from '../src/features/homepage/homepageTypes';
import { palettes } from '../src/shared/theme';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const draftId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const draft: HomepageSiteDraftDTO = {
  id: draftId,
  userId,
  prompt: '记录我的城市生活',
  revision: 1,
  selectedMediaAssetIds: [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
  ],
  source: 'model',
  status: 'draft',
  draft: {
    version: 2,
    language: 'zh',
    title: 'Jarson 的城市日常',
    theme: 'gallery',
    summary: '散步、朋友与正在做的事。',
    sections: [
      {
        id: 'hero',
        type: 'hero',
        title: '城市日常',
        subtitle: '上海',
        body: '',
        assetIds: ['11111111-1111-4111-8111-111111111111'],
        diaryEntryIds: [],
        actions: [],
        hidden: false,
      },
      {
        id: 'gallery',
        type: 'gallery',
        title: '最近',
        subtitle: '',
        body: '',
        assetIds: [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
        ],
        diaryEntryIds: [],
        actions: [],
        hidden: false,
      },
    ],
  },
};

const mediaAssets: StationMediaAssetDTO[] = draft.selectedMediaAssetIds.map(
  (id, index) => ({
    id,
    userId,
    albumId: null,
    kind: 'image',
    storageProvider: 'oss',
    storageKey: `private/${index}.jpg`,
    originalFilename: `${index}.jpg`,
    mimeType: 'image/jpeg',
    byteSize: 100,
    width: 800,
    height: 1200,
    caption: '',
    status: 'uploaded',
  }),
);

const privateSite = (
  overrides: Partial<HomepageSiteDTO> = {},
): HomepageSiteDTO => ({
  userId,
  currentDraftId: draftId,
  publishedReleaseId: null,
  visibility: 'private',
  shareUrl: null,
  publishedAt: null,
  unpublishedAt: null,
  ...overrides,
});

const release: HomepageReleaseDTO = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  userId,
  draftId,
  revision: 1,
  snapshot: draft.draft,
  selectedMediaAssetIds: draft.selectedMediaAssetIds,
  visibility: 'private',
  createdAt: '2026-07-15T08:00:00.000Z',
};

const makeSession = (
  overrides: Partial<HomepageSession> = {},
): HomepageSession => ({
  token: 'test-token',
  user: { id: userId, displayName: 'Jarson' },
  homepageV1: {
    enabled: true,
    publicVisibilityEnabled: false,
    generationDailyLimit: 5,
    refineDailyLimit: 20,
  },
  stationContent: { mediaAssets },
  homepageSite: jest.fn(async () => ({ site: null })),
  homepageJobs: jest.fn(async () => []),
  homepageReleases: jest.fn(async () => []),
  homepageDraft: jest.fn(async () => draft),
  createHomepageJob: jest.fn(),
  homepageJob: jest.fn(),
  updateHomepageDraft: jest.fn(async () => ({ ...draft, revision: 2 })),
  refineHomepageSection: jest.fn(),
  createHomepagePreview: jest.fn(async () => ({
    previewUrl: 'https://preview.example.com/preview/token',
    expiresAt: '2026-07-15T08:05:00.000Z',
  })),
  publishHomepage: jest.fn(),
  unpublishHomepage: jest.fn(),
  restoreHomepageRelease: jest.fn(),
  createStationMediaAsset: jest.fn(),
  ...overrides,
});

async function flushEffects() {
  for (let index = 0; index < 5; index += 1) {
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

async function renderScreen(session: HomepageSession) {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <HomepageScreen
        palette={palettes.light}
        language="zh"
        session={session}
        pollIntervalMs={0}
        onOpenSettings={jest.fn()}
        onActionMessage={jest.fn()}
        onActionError={jest.fn()}
      />,
    );
    await flushEffects();
  });
  return renderer as unknown as ReactTestRenderer.ReactTestRenderer;
}

async function unmountScreen(renderer: ReactTestRenderer.ReactTestRenderer) {
  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
}

describe('HomepageScreen', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('starts with the homepage empty state and enforces 3-9 photos', async () => {
    const session = makeSession();
    const renderer = await renderScreen(session);

    expect(renderedText(renderer)).toContain('创建我的主页');

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'homepage-start' }).props.onPress();
    });
    const input = renderer.root.findByProps({ testID: 'homepage-prompt' });
    await ReactTestRenderer.act(async () => {
      input.props.onChangeText('展示我最近的城市生活');
      mediaAssets.slice(0, 2).forEach(asset => {
        renderer.root
          .findByProps({ testID: `homepage-photo-${asset.id}` })
          .props.onPress();
      });
    });

    expect(renderedText(renderer)).toContain('还需选择 1 张照片');
    expect(
      renderer.root.findByProps({ testID: 'homepage-generate' }).props
        .accessibilityState,
    ).toEqual({ disabled: true });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: `homepage-photo-${mediaAssets[2].id}` })
        .props.onPress();
    });
    expect(
      renderer.root.findByProps({ testID: 'homepage-generate' }).props
        .accessibilityState,
    ).toEqual({ disabled: false });

    await unmountScreen(renderer);
  });

  test('shows a usable basic draft when generation falls back', async () => {
    const fallbackDraft = { ...draft, source: 'fallback' };
    const session = makeSession({
      createHomepageJob: jest.fn(async () => ({
        created: true,
        job: {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          userId,
          selectedMediaAssetIds: draft.selectedMediaAssetIds,
          status: 'completed' as const,
          progress: 100,
          siteDraftId: draftId,
          source: 'fallback' as const,
          failureReason: null,
        },
      })),
      homepageDraft: jest.fn(async () => fallbackDraft),
    });
    const renderer = await renderScreen(session);

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'homepage-start' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'homepage-prompt' })
        .props.onChangeText('展示我最近的城市生活');
      mediaAssets.forEach(asset => {
        renderer.root
          .findByProps({ testID: `homepage-photo-${asset.id}` })
          .props.onPress();
      });
    });
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'homepage-generate' })
        .props.onPress();
      await flushEffects();
    });

    expect(renderedText(renderer)).toContain('基础版已生成');
    expect(renderedText(renderer)).toContain('AI 生成内容');
    expect(renderedText(renderer)).toContain(fallbackDraft.draft.title);
    await unmountScreen(renderer);
  });

  test('surfaces a revision conflict without overwriting the newer draft', async () => {
    const conflict = Object.assign(new Error('conflict'), { status: 409 });
    const session = makeSession({
      homepageSite: jest.fn(async () => ({ site: privateSite() })),
      homepageDraft: jest.fn(async () => draft),
      updateHomepageDraft: jest.fn(async () => {
        throw conflict;
      }),
    });
    const renderer = await renderScreen(session);

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'homepage-edit' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'homepage-title' })
        .props.onChangeText('本地的新标题');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'homepage-save' }).props.onPress();
      await flushEffects();
    });

    expect(renderedText(renderer)).toContain('主页已在其他设备更新');
    expect(
      renderer.root.findByProps({ testID: 'homepage-reload' }),
    ).toBeDefined();
    expect(session.updateHomepageDraft).toHaveBeenCalledWith(
      draftId,
      expect.objectContaining({ revision: 1 }),
    );
    await unmountScreen(renderer);
  });

  test('opens the exact isolated Web preview for the current draft', async () => {
    const session = makeSession({
      homepageSite: jest.fn(async () => ({ site: privateSite() })),
    });
    const renderer = await renderScreen(session);

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'homepage-edit' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '预览' }).props.onPress();
      await flushEffects();
    });

    const webview = renderer.root.findByProps({ testID: 'homepage-webview' });
    expect(webview.props.source).toEqual({
      uri: 'https://preview.example.com/preview/token',
    });
    expect(webview.props.incognito).toBe(true);
    expect(webview.props.cacheEnabled).toBe(false);
    expect(
      webview.props.onShouldStartLoadWithRequest({
        url: 'https://malicious.example.com/',
      }),
    ).toBe(false);
    await unmountScreen(renderer);
  });

  test('requires confirmation before creating a share link', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    const linkSite = privateSite({
      visibility: 'link',
      shareUrl: 'https://preview.example.com/s/share-token',
      publishedReleaseId: release.id,
    });
    const session = makeSession({
      homepageSite: jest.fn(async () => ({ site: privateSite() })),
      publishHomepage: jest.fn(async () => ({
        site: linkSite,
        release: { ...release, visibility: 'link' as const },
        siteDraft: draft,
      })),
    });
    const renderer = await renderScreen(session);

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'homepage-edit' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ testID: 'homepage-publish' }).props.onPress();
    });
    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0][2] || [];
    const shareButton = buttons.find(button => button.text === '生成分享链接');
    await ReactTestRenderer.act(async () => {
      await shareButton?.onPress?.();
      await flushEffects();
    });

    expect(session.publishHomepage).toHaveBeenCalledWith(draftId, {
      revision: 1,
      visibility: 'link',
    });
    await unmountScreen(renderer);
  });

  test('shows the revoked state after stopping link sharing', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const activeSite = privateSite({
      visibility: 'link',
      shareUrl: 'https://preview.example.com/s/share-token',
      publishedReleaseId: release.id,
    });
    const revokedSite = privateSite({
      visibility: 'private',
      shareUrl: null,
      unpublishedAt: '2026-07-15T09:00:00.000Z',
    });
    const session = makeSession({
      homepageSite: jest.fn(async () => ({ site: activeSite })),
      unpublishHomepage: jest.fn(async () => ({ site: revokedSite })),
    });
    const renderer = await renderScreen(session);

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ testID: 'homepage-unpublish' })
        .props.onPress();
    });
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] || [];
    const revokeButton = buttons.find(
      (button: { text?: string }) => button.text === '停止分享',
    );
    await ReactTestRenderer.act(async () => {
      await revokeButton?.onPress?.();
      await flushEffects();
    });

    expect(session.unpublishHomepage).toHaveBeenCalledTimes(1);
    expect(renderedText(renderer)).toContain('分享链接已停用');
    await unmountScreen(renderer);
  });
});
