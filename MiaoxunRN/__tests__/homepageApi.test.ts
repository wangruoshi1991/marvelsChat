import {
  MiaoxunApiError,
  joinApiUrl,
  request,
  resolvePublicUrl,
  setAuthSessionExpiredHandler,
} from '../src/services/api/http';
import { appApi } from '../src/services/api/appApi';
import { homepageApi } from '../src/services/api/homepageApi';

const response = ({
  status = 200,
  data = {},
  requestId = 'server-request-id',
}: {
  status?: number;
  data?: unknown;
  requestId?: string;
}) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'x-request-id' ? requestId : null,
    },
    text: async () => JSON.stringify({ data }),
  } as Response);

describe('homepage API diagnostics', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('joins API paths without dropping or duplicating /api', () => {
    expect(joinApiUrl('https://api.example.com/api', '/station/site')).toBe(
      'https://api.example.com/api/station/site',
    );
    expect(joinApiUrl('https://api.example.com', '/api/station/site')).toBe(
      'https://api.example.com/api/station/site',
    );
  });

  test('resolves relative legal paths against the API origin', () => {
    expect(resolvePublicUrl('http://8.153.167.11/api', '/legal/privacy')).toBe(
      'http://8.153.167.11/legal/privacy',
    );
    expect(
      resolvePublicUrl(
        'http://8.153.167.11/api',
        'https://miaoxun.pizelife.com/legal/terms',
      ),
    ).toBe('https://miaoxun.pizelife.com/legal/terms');
  });

  test('adds a request ID while keeping prompts, IDs, and tokens out of logs', async () => {
    const fetchMock = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >(async () => response({ data: { accepted: true } }));
    globalThis.fetch = fetchMock;
    const info = jest
      .spyOn(console, 'info')
      .mockImplementation(() => undefined);
    const prompt = '只给家人看的私人主页正文';
    const bearer = 'private-bearer-token';
    const mediaAssetId = '11111111-1111-4111-8111-111111111111';

    await request('/api/station/homepage-jobs', {
      method: 'POST',
      token: bearer,
      body: {
        prompt,
        mediaAssetIds: [mediaAssetId],
        idempotencyKey: 'private-idempotency-key',
      },
    });

    const [, options] = fetchMock.mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    expect(headers['X-Request-ID']).toMatch(/^mx-[a-z0-9-]+$/);

    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toContain(headers['X-Request-ID']);
    expect(logged).not.toContain(prompt);
    expect(logged).not.toContain(bearer);
    expect(logged).not.toContain(mediaAssetId);
    expect(logged).not.toContain('private-idempotency-key');
  });

  test('uses the server request ID on API errors', async () => {
    globalThis.fetch = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >(
      async () =>
        ({
          ...response({ status: 409, requestId: 'server-conflict-id' }),
          text: async () =>
            JSON.stringify({ error: { message: '主页已在另一台设备修改。' } }),
        } as Response),
    );
    jest.spyOn(console, 'info').mockImplementation(() => undefined);

    await expect(
      request('/api/station/site', { token: 'expired' }),
    ).rejects.toMatchObject<Partial<MiaoxunApiError>>({
      status: 409,
      requestId: 'server-conflict-id',
    });
  });

  test('does not expire the session when account password verification fails', async () => {
    globalThis.fetch = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >(
      async () =>
        ({
          ...response({ status: 401, requestId: 'password-check-id' }),
          text: async () =>
            JSON.stringify({ error: { message: 'Invalid password.' } }),
        } as Response),
    );
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const onSessionExpired = jest.fn();
    const clearHandler = setAuthSessionExpiredHandler(onSessionExpired);

    await expect(
      appApi.deleteAccount('valid-session', 'wrong-password'),
    ).rejects.toMatchObject({ status: 401 });
    expect(onSessionExpired).not.toHaveBeenCalled();
    clearHandler();
  });

  test('sends the typed homepage generation contract', async () => {
    const fetchMock = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >(async () =>
      response({
        status: 202,
        data: {
          created: true,
          job: {
            id: '22222222-2222-4222-8222-222222222222',
            userId: '33333333-3333-4333-8333-333333333333',
            selectedMediaAssetIds: [],
            status: 'queued',
            progress: 0,
            siteDraftId: null,
            source: null,
            failureReason: null,
            createdAt: null,
            updatedAt: null,
            finishedAt: null,
          },
        },
      }),
    );
    globalThis.fetch = fetchMock;
    jest.spyOn(console, 'info').mockImplementation(() => undefined);

    await homepageApi.createHomepageJob('token', {
      prompt: '生成一个作品主页',
      mediaAssetIds: [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
      ],
      idempotencyKey: 'homepage:test:1',
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:4390/api/station/homepage-jobs');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({
      prompt: '生成一个作品主页',
      mediaAssetIds: [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
      ],
      idempotencyKey: 'homepage:test:1',
    });
  });
});
