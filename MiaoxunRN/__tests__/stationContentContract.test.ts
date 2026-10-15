import { appApi } from '../src/services/api/appApi';
import { stationContentApi } from '../src/services/api/stationContentApi';
import { stationAgentApi } from '../src/services/api/stationAgentApi';

const response = (data: unknown) =>
  ({
    ok: true,
    status: 200,
    headers: { get: () => 'server-request-1' },
    text: jest.fn(async () => JSON.stringify({ data })),
  } as unknown as Response);

const validStationContent = {
  posts: [],
  diaryEntries: [],
  albums: [],
  mediaAssets: [],
  outfits: [],
  siteDrafts: [],
  fileAssets: [],
  comicDiaries: [],
  videoDrafts: [],
};
const draftMetadata = {
  id: 'site-1',
  title: '周末页面',
  source: 'model',
  status: 'draft',
  createdAt: '2026-10-14T00:00:00Z',
  updatedAt: '2026-10-14T00:00:00Z',
};

describe('station content API contract', () => {
  const originalFetch = globalThis.fetch;
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    infoSpy.mockRestore();
  });

  test('bootstrap rejects a station payload that omits posts', async () => {
    const stationContentWithoutPosts: Record<string, unknown> = {
      ...validStationContent,
    };
    Reflect.deleteProperty(stationContentWithoutPosts, 'posts');
    globalThis.fetch = jest.fn(async () =>
      response({ stationContent: stationContentWithoutPosts }),
    ) as jest.Mock;

    await expect(appApi.bootstrap('token')).rejects.toMatchObject({
      code: 'STATION_CONTENT_CONTRACT_MISMATCH',
      details: {
        invalidFields: ['posts'],
        source: '/api/app/bootstrap.stationContent',
      },
    });
  });

  test('station refresh rejects non-array contract fields', async () => {
    globalThis.fetch = jest.fn(async () =>
      response({ ...validStationContent, posts: null }),
    ) as jest.Mock;

    await expect(
      stationContentApi.stationContent('token'),
    ).rejects.toMatchObject({
      code: 'STATION_CONTENT_CONTRACT_MISMATCH',
      details: {
        invalidFields: ['posts'],
        source: '/api/station/content',
      },
    });
  });

  test('station content rejects posts without explicit interaction state', async () => {
    globalThis.fetch = jest.fn(async () =>
      response({
        ...validStationContent,
        posts: [
          {
            id: 'post-1',
            likeCount: 0,
            favoriteCount: 0,
            media: [],
          },
        ],
      }),
    ) as jest.Mock;

    await expect(
      stationContentApi.stationContent('token'),
    ).rejects.toMatchObject({
      code: 'STATION_CONTENT_CONTRACT_MISMATCH',
      details: {
        invalidFields: ['posts[0].likedByMe', 'posts[0].favoritedByMe'],
        source: '/api/station/content',
      },
    });
  });

  test('accepts the complete station content contract', async () => {
    globalThis.fetch = jest.fn(async () =>
      response({ stationContent: validStationContent }),
    ) as jest.Mock;

    await expect(appApi.bootstrap('token')).resolves.toMatchObject({
      stationContent: validStationContent,
    });
  });

  test('bootstrap, station refresh and draft list accept the same metadata without content', async () => {
    const stationContent = {
      ...validStationContent,
      siteDrafts: [draftMetadata],
    };
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(response({ stationContent }))
      .mockResolvedValueOnce(response(stationContent))
      .mockResolvedValueOnce(response([draftMetadata]));
    await expect(appApi.bootstrap('token')).resolves.toMatchObject({
      stationContent,
    });
    await expect(stationContentApi.stationContent('token')).resolves.toEqual(
      stationContent,
    );
    await expect(stationAgentApi.stationSiteDrafts('token')).resolves.toEqual([
      draftMetadata,
    ]);
  });

  test.each([
    {
      ...draftMetadata,
      draft: { title: '旧标题', sections: [{ body: '私有正文' }] },
    },
    { ...draftMetadata, prompt: '原始私有需求' },
    { ...draftMetadata, summary: '派生正文摘要' },
    { ...draftMetadata, userId: 'internal' },
    { ...draftMetadata, modelProvider: 'internal' },
    { ...draftMetadata, title: '' },
    { ...draftMetadata, title: '题'.repeat(161) },
    { ...draftMetadata, source: 'agent' },
    { ...draftMetadata, status: 'unknown' },
    { ...draftMetadata, createdAt: 'invalid' },
    {
      id: 'site-1',
      draft: { title: '旧嵌套标题' },
      prompt: '旧需求',
      source: 'model',
    },
  ])(
    'all public draft list paths reject old body data or invalid metadata: %p',
    async draft => {
      const stationContent = { ...validStationContent, siteDrafts: [draft] };
      globalThis.fetch = jest
        .fn()
        .mockResolvedValueOnce(response({ stationContent }))
        .mockResolvedValueOnce(response(stationContent))
        .mockResolvedValueOnce(response([draft]));
      await expect(appApi.bootstrap('token')).rejects.toMatchObject({
        code: 'STATION_CONTENT_CONTRACT_MISMATCH',
      });
      await expect(
        stationContentApi.stationContent('token'),
      ).rejects.toMatchObject({ code: 'STATION_CONTENT_CONTRACT_MISMATCH' });
      await expect(stationAgentApi.stationSiteDrafts('token')).rejects.toThrow(
        '草稿列表格式不受支持',
      );
    },
  );
});
