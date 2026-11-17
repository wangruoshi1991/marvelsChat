import { NativeModules, Platform } from 'react-native';
import {
  ComicMediaSaveError,
  saveComicImageToLibrary,
} from '../src/services/comicMediaLibrary';

describe('comic media library', () => {
  it('fails explicitly when the native save contract is unavailable', async () => {
    await expect(
      saveComicImageToLibrary({ mediaAssetId: 'asset-1', token: 'token' }),
    ).rejects.toMatchObject({ code: 'COMIC_MEDIA_SAVE_UNAVAILABLE' });
  });

  it('rejects an empty private media reference before native work', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const saveImage = jest.fn();
    NativeModules.MiaoxunMediaLibraryModule = { saveImage };
    await expect(
      saveComicImageToLibrary({ mediaAssetId: ' ', token: 'token' }),
    ).rejects.toMatchObject<Partial<ComicMediaSaveError>>({
      code: 'COMIC_MEDIA_INVALID_ID',
    });
    expect(saveImage).not.toHaveBeenCalled();
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalOS,
    });
    delete NativeModules.MiaoxunMediaLibraryModule;
  });
});
