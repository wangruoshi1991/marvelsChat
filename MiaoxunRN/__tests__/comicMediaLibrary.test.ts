import { NativeModules, Platform } from 'react-native';
import {
  ComicMediaSaveError,
  saveComicImageToLibrary,
} from '../src/services/comicMediaLibrary';

describe('comic media library', () => {
  const originalModule = NativeModules.MiaoxunMediaLibraryModule;
  afterEach(() => {
    NativeModules.MiaoxunMediaLibraryModule = originalModule;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('joins repeated saves until Photos resolves, including after a long permission prompt', async () => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'ios');
    let confirm!: (receipt: { status: 'saved'; mediaAssetId: string }) => void;
    const saveImage = jest.fn().mockImplementationOnce(
      () =>
        new Promise(resolve => {
          confirm = resolve;
        }),
    );
    NativeModules.MiaoxunMediaLibraryModule = { saveImage };
    const input = { token: 'owner', mediaAssetId: 'asset-1' };
    const first = saveComicImageToLibrary(input);
    jest.advanceTimersByTime(60_000);
    const second = saveComicImageToLibrary(input);
    expect(saveImage).toHaveBeenCalledTimes(1);
    const receipt = {
      status: 'saved' as const,
      mediaAssetId: input.mediaAssetId,
    };
    confirm(receipt);
    await expect(Promise.all([first, second])).resolves.toEqual([
      receipt,
      receipt,
    ]);
  });

  it('checks receipt identity, isolates sessions, and releases a failed save for retry', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const receipt = { status: 'saved', mediaAssetId: 'asset-1' };
    const saveImage = jest
      .fn()
      .mockResolvedValueOnce({ ...receipt, mediaAssetId: 'other' })
      .mockResolvedValueOnce({ status: 'pending', mediaAssetId: 'asset-1' })
      .mockResolvedValueOnce(receipt);
    NativeModules.MiaoxunMediaLibraryModule = { saveImage };
    const input = { token: 'owner', mediaAssetId: 'asset-1' };
    const first = saveComicImageToLibrary(input);
    const otherSession = saveComicImageToLibrary({ ...input, token: 'other' });
    await expect(first).rejects.toMatchObject({
      code: 'COMIC_MEDIA_SAVE_UNCONFIRMED',
    });
    await expect(otherSession).rejects.toMatchObject({
      code: 'COMIC_MEDIA_SAVE_UNCONFIRMED',
    });
    await expect(saveComicImageToLibrary(input)).resolves.toEqual(receipt);
    expect(saveImage).toHaveBeenCalledTimes(3);
  });

  it('fails explicitly when the native save contract is unavailable', async () => {
    await expect(
      saveComicImageToLibrary({ mediaAssetId: 'asset-1', token: 'token' }),
    ).rejects.toMatchObject({ code: 'COMIC_MEDIA_SAVE_UNAVAILABLE' });
  });

  it('keeps Android chat-image saving separate from comic assets', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const saveChatImage = jest.fn();
    NativeModules.MiaoxunMediaLibraryModule = { saveChatImage };
    await expect(
      saveComicImageToLibrary({ mediaAssetId: 'comic-asset', token: 'owner' }),
    ).rejects.toMatchObject({ code: 'COMIC_MEDIA_SAVE_UNAVAILABLE' });
    expect(saveChatImage).not.toHaveBeenCalled();
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
