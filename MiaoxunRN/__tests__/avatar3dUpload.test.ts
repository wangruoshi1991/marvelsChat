import { apiClient } from '../src/services/apiClient';
import { uploadAndValidateAvatar3dPhoto } from '../src/services/avatar3dUpload';

describe('avatar3d photo upload', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('signs the upload with the converted blob size', async () => {
    const photo = {
      id: 'photo-1',
      jobId: null,
      view: null,
      originalFilename: 'portrait.jpg',
      mimeType: 'image/jpeg',
      byteSize: 321,
      width: 1200,
      height: 1600,
      status: 'ready',
      purpose: 'reference',
      quality: null,
      errorCode: null,
      createdAt: '2026-07-29T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:00.000Z',
    } as const;
    jest.spyOn(apiClient, 'prepareAvatar3dPhoto').mockResolvedValue({
      photo: { ...photo, status: 'pending_upload' },
      upload: {
        method: 'PUT',
        url: 'https://oss.example.com/upload',
        headers: { 'Content-Type': 'image/jpeg' },
        expiresAt: '2026-07-29T01:00:00.000Z',
      },
    });
    jest.spyOn(apiClient, 'completeAvatar3dPhoto').mockResolvedValue(photo);
    jest.spyOn(apiClient, 'deleteAvatar3dPhoto').mockResolvedValue(undefined);
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => ({ size: 321 } as Blob),
      })
      .mockResolvedValueOnce({ ok: true }) as jest.MockedFunction<typeof fetch>;

    await uploadAndValidateAvatar3dPhoto({
      token: 'token',
      media: {
        kind: 'image',
        uri: 'file:///portrait.jpg',
        originalFilename: 'portrait.jpg',
        mimeType: 'image/jpeg',
        byteSize: 999,
        width: 1200,
        height: 1600,
      },
    });

    expect(apiClient.prepareAvatar3dPhoto).toHaveBeenCalledWith('token', {
      originalFilename: 'portrait.jpg',
      mimeType: 'image/jpeg',
      byteSize: 321,
    });
  });
});
