import {
  MiaoxunApiError,
  isAuthSessionError,
  request,
  setAuthSessionExpiredHandler,
} from '../src/services/api/http';

const response = ({
  status,
  body,
  requestId = 'server-request-1',
}: {
  status: number;
  body: unknown;
  requestId?: string;
}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'x-request-id' ? requestId : null,
    },
    text: jest.fn(async () => JSON.stringify(body)),
  } as unknown as Response);

describe('API transport privacy and session handling', () => {
  const originalFetch = globalThis.fetch;
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    setAuthSessionExpiredHandler(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    infoSpy.mockRestore();
    setAuthSessionExpiredHandler(null);
  });

  test('network logs contain structure but no user-authored text', async () => {
    globalThis.fetch = jest.fn(async () =>
      response({
        status: 200,
        body: {
          data: {
            id: 'message-1',
            content: 'private response text',
          },
        },
      }),
    ) as jest.Mock;

    await request('/api/threads/thread-1/messages', {
      method: 'POST',
      token: 'secret-session-token',
      body: {
        content: 'private request text',
        prompt: 'private agent prompt',
      },
    });

    const logs = JSON.stringify(infoSpy.mock.calls);
    expect(logs).toContain('content');
    expect(logs).toContain('prompt');
    expect(logs).not.toContain('private request text');
    expect(logs).not.toContain('private response text');
    expect(logs).not.toContain('secret-session-token');
  });

  test('401 expires the active session but 403 remains an authorization error', async () => {
    const onExpired = jest.fn(async () => undefined);
    setAuthSessionExpiredHandler(onExpired);
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        response({
          status: 401,
          body: { error: { message: 'Invalid session' } },
        }),
      )
      .mockResolvedValueOnce(
        response({
          status: 403,
          body: { error: { message: 'Permission denied' } },
        }),
      ) as jest.Mock;

    await expect(
      request('/api/me', { token: 'session-1' }),
    ).rejects.toMatchObject({
      status: 401,
      requestId: 'server-request-1',
    });
    await expect(
      request('/api/admin/users', { token: 'session-1' }),
    ).rejects.toMatchObject({ status: 403 });

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledWith({
      token: 'session-1',
      requestId: 'server-request-1',
    });
    expect(
      isAuthSessionError(new MiaoxunApiError('expired', { status: 401 })),
    ).toBe(true);
    expect(
      isAuthSessionError(new MiaoxunApiError('forbidden', { status: 403 })),
    ).toBe(false);
  });
});
