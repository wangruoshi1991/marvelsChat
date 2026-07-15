import { apiClient } from '../src/services/apiClient';
import { uploadStationMediaAsset } from '../src/services/stationMediaUpload';

jest.mock('../src/services/apiClient', () => ({
  apiClient: {
    createStationMediaUploadUrl: jest.fn(),
    completeStationMediaUpload: jest.fn(),
  },
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('homepage media upload retry', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  test('the same media task can be retried after a failed upload', async () => {
    mockedApiClient.createStationMediaUploadUrl.mockResolvedValue({
      asset: {} as never,
      upload: {
        method: 'PUT',
        url: 'https://oss.example.com/private-upload',
        headers: { 'Content-Type': 'image/jpeg' },
        expiresAt: '2026-07-15T08:05:00.000Z',
        objectKey: 'private/photo.jpg',
        storageProvider: 'oss',
      },
    });
    mockedApiClient.completeStationMediaUpload.mockResolvedValue({
      id: 'asset-1',
      status: 'uploaded',
    } as never);
    const localResponse = {
      blob: jest.fn(async () => ({} as Blob)),
    } as unknown as Response;
    const failedUpload = { ok: false, status: 503 } as Response;
    const successfulUpload = { ok: true, status: 200 } as Response;
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(localResponse)
      .mockResolvedValueOnce(failedUpload)
      .mockResolvedValueOnce(localResponse)
      .mockResolvedValueOnce(successfulUpload);
    globalThis.fetch = fetchMock;
    const input = {
      token: 'token',
      asset: { id: 'asset-1' } as never,
      media: {
        uri: 'file:///private/photo.jpg',
        originalFilename: 'photo.jpg',
        mimeType: 'image/jpeg',
        byteSize: 100,
        width: 800,
        height: 1200,
      },
    };

    await expect(uploadStationMediaAsset(input)).rejects.toThrow(
      '照片上传失败，请重试。',
    );
    await expect(uploadStationMediaAsset(input)).resolves.toMatchObject({
      id: 'asset-1',
      status: 'uploaded',
    });
    expect(mockedApiClient.completeStationMediaUpload).toHaveBeenCalledTimes(1);
  });
});
