import * as Keychain from 'react-native-keychain';
import { mediaRetrievalJournal } from '../src/features/media-retrieval/mediaRetrievalJournal';

describe('retrieval operation journal', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports failure when a platform deletion leaves the stored operation present', async () => {
    jest.spyOn(Keychain, 'resetGenericPassword').mockResolvedValueOnce(false);
    jest.spyOn(Keychain, 'getGenericPassword').mockResolvedValueOnce({
      username: 'owner',
      password: JSON.stringify({ action: 'purge', key: 'operation-123' }),
      service: 'com.wangruoshi.miaoxun.retrieval.owner',
      storage: Keychain.STORAGE_TYPE?.AES_GCM_NO_AUTH,
    });
    await expect(
      mediaRetrievalJournal('owner').write(null),
    ).rejects.toMatchObject({
      code: 'retrieval_local_storage',
    });
  });

  it('accepts an already absent entry even when the deletion returns false', async () => {
    jest.spyOn(Keychain, 'resetGenericPassword').mockResolvedValueOnce(false);
    jest.spyOn(Keychain, 'getGenericPassword').mockResolvedValueOnce(false);
    await expect(
      mediaRetrievalJournal('owner').write(null),
    ).resolves.toBeUndefined();
  });

  it('rejects a record that belongs to a different account', async () => {
    jest.spyOn(Keychain, 'getGenericPassword').mockResolvedValueOnce({
      username: 'different-owner',
      password: JSON.stringify({ action: 'enable', key: 'operation-123' }),
      service: 'com.wangruoshi.miaoxun.retrieval.owner',
      storage: Keychain.STORAGE_TYPE?.AES_GCM_NO_AUTH,
    });
    await expect(mediaRetrievalJournal('owner').read()).rejects.toMatchObject({
      code: 'retrieval_local_storage',
    });
  });
});
