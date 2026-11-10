import { launchCamera, launchImageLibrary } from 'react-native-image-picker';

import {
  pickStationImagesFromLibrary,
  pickStationPhotoFromLibrary,
  pickStationVideoFromLibrary,
  takeStationPhoto,
} from '../src/services/stationMediaPicker';

const mockedLaunchImageLibrary = launchImageLibrary as jest.MockedFunction<
  typeof launchImageLibrary
>;
const mockedLaunchCamera = launchCamera as jest.MockedFunction<
  typeof launchCamera
>;

describe('station media picker', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requests a compatible photo representation for iPhone HEIC assets', async () => {
    mockedLaunchImageLibrary.mockResolvedValueOnce({ didCancel: true });

    await pickStationPhotoFromLibrary();

    expect(mockedLaunchImageLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        assetRepresentationMode: 'compatible',
        mediaType: 'photo',
        selectionLimit: 1,
      }),
    );
  });

  it('reports a code-only unavailable camera instead of treating it as cancellation', async () => {
    mockedLaunchCamera.mockResolvedValueOnce({
      errorCode: 'camera_unavailable',
    });

    await expect(takeStationPhoto()).rejects.toThrow(/相机.*相册/);
  });

  it('reports a code-only camera permission denial with recovery guidance', async () => {
    mockedLaunchCamera.mockResolvedValueOnce({ errorCode: 'permission' });

    await expect(takeStationPhoto()).rejects.toThrow(/设置.*相机/);
  });

  it('reports a code-only photo permission denial instead of returning no selection', async () => {
    mockedLaunchImageLibrary.mockResolvedValueOnce({ errorCode: 'permission' });

    await expect(pickStationImagesFromLibrary()).rejects.toThrow(/相册.*设置/);
  });

  it('reports a code-only video selection failure', async () => {
    mockedLaunchImageLibrary.mockResolvedValueOnce({ errorCode: 'others' });

    await expect(pickStationVideoFromLibrary()).rejects.toThrow(/选择.*失败/);
  });

  it('does not return assets from a response marked as failed', async () => {
    mockedLaunchImageLibrary.mockResolvedValueOnce({
      errorCode: 'others',
      assets: [{ uri: 'file:///unusable.jpg' }],
    });

    await expect(pickStationPhotoFromLibrary()).rejects.toThrow(/失败/);
  });

  it('preserves native failure detail when the response has no error code', async () => {
    mockedLaunchImageLibrary.mockResolvedValueOnce({
      errorMessage: '无法读取所选文件',
    });

    await expect(pickStationPhotoFromLibrary()).rejects.toThrow(
      '无法读取所选文件',
    );
  });

  it('keeps cancellation distinct from picker errors for photos, videos and camera', async () => {
    mockedLaunchImageLibrary.mockResolvedValueOnce({ didCancel: true });
    mockedLaunchImageLibrary.mockResolvedValueOnce({ didCancel: true });
    mockedLaunchImageLibrary.mockResolvedValueOnce({ didCancel: true });
    mockedLaunchCamera.mockResolvedValueOnce({ didCancel: true });

    await expect(pickStationImagesFromLibrary()).resolves.toEqual([]);
    await expect(pickStationPhotoFromLibrary()).resolves.toBeNull();
    await expect(pickStationVideoFromLibrary()).resolves.toBeNull();
    await expect(takeStationPhoto()).resolves.toBeNull();
  });

  it('still returns a usable normalized photo after successful capture', async () => {
    mockedLaunchCamera.mockResolvedValueOnce({
      assets: [
        {
          uri: 'file:///captured.jpg',
          fileName: 'captured.jpg',
          type: 'image/jpg',
          fileSize: 2048,
          width: 640,
          height: 480,
        },
      ],
    });

    await expect(takeStationPhoto()).resolves.toEqual({
      kind: 'image',
      uri: 'file:///captured.jpg',
      originalFilename: 'captured.jpg',
      mimeType: 'image/jpeg',
      byteSize: 2048,
      width: 640,
      height: 480,
    });
  });
});
