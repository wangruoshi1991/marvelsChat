import { appApi } from '../src/services/api/appApi';
import { stationContentApi } from '../src/services/api/stationContentApi';

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

  test('accepts the complete station content contract', async () => {
    globalThis.fetch = jest.fn(async () =>
      response({ stationContent: validStationContent }),
    ) as jest.Mock;

    await expect(appApi.bootstrap('token')).resolves.toMatchObject({
      stationContent: validStationContent,
    });
  });
});
