import fixture from '../../shared/media-retrieval-public-contract.fixture.json';
import { mediaRetrievalApi } from '../src/services/api/mediaRetrievalApi';
import { setAuthSessionExpiredHandler } from '../src/services/api/http';

const response = (data: unknown, status = 200, error = false) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    text: async () => JSON.stringify(error ? { error: data } : { data }),
  } as unknown as Response);

describe('media retrieval frozen API contract', () => {
  const originalFetch = globalThis.fetch;
  let infoSpy: jest.SpyInstance;
  beforeEach(() => {
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    infoSpy.mockRestore();
    setAuthSessionExpiredHandler(null);
  });

  it('uses the shared fixture without exposing extra provider fields and sends authenticated explicit search only', async () => {
    globalThis.fetch = jest.fn(async () => response(fixture.searchSuccess));
    expect(
      await mediaRetrievalApi.search(
        'owner-token',
        {
          query: '  yellow dress  ',
          kind: 'image',
        },
        'search-operation-123',
      ),
    ).toEqual(fixture.searchSuccess);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4390/api/station/media-retrieval/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer owner-token',
          'Idempotency-Key': 'search-operation-123',
        }),
        body: JSON.stringify({
          query: 'yellow dress',
          kind: 'image',
          limit: 20,
        }),
      }),
    );
    globalThis.fetch = jest.fn(async () =>
      response({ ...fixture.searchSuccess, provider: 'private' }),
    );
    await expect(
      mediaRetrievalApi.search(
        'owner-token',
        { query: 'dress' },
        'search-operation-456',
      ),
    ).rejects.toMatchObject({ code: 'retrieval_contract_invalid' });
  });
  it('preserves the public error code and retryable boolean from the frozen fixture', async () => {
    globalThis.fetch = jest.fn(async () =>
      response(fixture.publicError.body, fixture.publicError.status, true),
    );
    await expect(
      mediaRetrievalApi.search(
        'owner-token',
        { query: 'dress' },
        'search-operation-789',
      ),
    ).rejects.toMatchObject({
      code: 'retrieval_policy_unverifiable',
      retryable: false,
      status: 422,
    });
  });
  it('sends fixed consent and operation keys, and DELETE has no JSON body', async () => {
    globalThis.fetch = jest.fn(async () =>
      response(
        { agentRunId: 'run-1', lifecycleStatus: 'queued', reused: false },
        202,
      ),
    );
    await mediaRetrievalApi.enable('owner-token', 'operation-123');
    await mediaRetrievalApi.reindex('owner-token', 'operation-456');
    await mediaRetrievalApi.purge('owner-token', 'operation-789');
    const calls = (globalThis.fetch as jest.Mock).mock.calls;
    expect(calls[0][1]).toMatchObject({
      headers: { 'Idempotency-Key': 'operation-123' },
      body: JSON.stringify({ consentVersion: 'media-retrieval-consent-v1' }),
    });
    expect(calls[1][1]).toMatchObject({
      body: JSON.stringify({ scope: 'stale' }),
    });
    expect(calls[2][1]).toMatchObject({
      method: 'DELETE',
      headers: { 'Idempotency-Key': 'operation-789' },
      body: undefined,
    });
  });
  it('delegates 401 to the existing session recovery without losing retrieval error handling', async () => {
    const expired = jest.fn();
    setAuthSessionExpiredHandler(expired);
    globalThis.fetch = jest.fn(async () =>
      response({ message: 'expired' }, 401, true),
    );
    await expect(
      mediaRetrievalApi.status('expired-token'),
    ).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'expired-token' }),
    );
  });
  it('validates query before network and rejects invalid response enums', async () => {
    globalThis.fetch = jest.fn(async () =>
      response({ ...fixture.searchSuccess, lifecycleStatus: 'queued' }),
    );
    await expect(
      mediaRetrievalApi.search('owner', { query: ' ' }, 'search-operation-001'),
    ).rejects.toThrow();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await expect(
      mediaRetrievalApi.search(
        'owner',
        { query: 'dress' },
        'search-operation-002',
      ),
    ).rejects.toMatchObject({ code: 'retrieval_contract_invalid' });
  });
});
