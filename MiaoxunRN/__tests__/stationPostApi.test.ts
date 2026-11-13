import { stationContentApi } from '../src/services/api/stationContentApi';
const originalFetch = globalThis.fetch;
const requestId = '11111111-1111-4111-8111-111111111111';
const post = {
  id: '22222222-2222-4222-8222-222222222222',
  userId: '33333333-3333-4333-8333-333333333333',
  body: 'comic',
  locationLabel: '',
  visibility: 'private',
  agentCapabilities: [],
  media: [],
  likedByMe: false,
  favoritedByMe: false,
  likeCount: 0,
  commentCount: 0,
  favoriteCount: 0,
  createdAt: null,
  updatedAt: null,
};
const response = (data: unknown) =>
  ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({ data }),
  } as unknown as Response);
beforeEach(() => {
  jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});
test('read-only receipt and resolving absence use separate endpoints, preserving the stable original ID', async () => {
  globalThis.fetch = jest.fn(async () => response({ status: 'not_submitted' }));
  await stationContentApi.getStationPostSubmission('owner', requestId);
  await stationContentApi.resolveStationPostSubmission('owner', requestId);
  const calls = jest.mocked(globalThis.fetch).mock.calls;
  expect(calls[0][0]).toBe(
    `http://127.0.0.1:4390/api/station/post-submissions/${requestId}`,
  );
  expect(calls[0][1]!.method).toBe('GET');
  expect(calls[1][0]).toBe(
    `http://127.0.0.1:4390/api/station/post-submissions/${requestId}/resolve`,
  );
  expect(calls[1][1]!.method).toBe('POST');
});
test.each([
  { status: 'submitted' },
  { status: 'submitted', post: { ...post, id: 'bad-id' } },
  { status: 'not_submitted', post },
  { status: 'unknown' },
])(
  'malformed receipt %p cannot be accepted as publication proof',
  async value => {
    globalThis.fetch = jest.fn(async () => response(value));
    await expect(
      stationContentApi.resolveStationPostSubmission('owner', requestId),
    ).rejects.toThrow();
  },
);
test('submitted proof returns the exact owner post and the POST carries a stable client request ID', async () => {
  globalThis.fetch = jest.fn(async () =>
    response({ status: 'submitted', post }),
  );
  expect(
    await stationContentApi.resolveStationPostSubmission('owner', requestId),
  ).toEqual({ status: 'submitted', post });
  globalThis.fetch = jest.fn(async () => response(post));
  await stationContentApi.createStationPost('owner', {
    body: 'comic',
    clientRequestId: requestId,
  });
  expect(
    JSON.parse(String(jest.mocked(globalThis.fetch).mock.calls[0][1]!.body)),
  ).toEqual({ body: 'comic', clientRequestId: requestId });
});
