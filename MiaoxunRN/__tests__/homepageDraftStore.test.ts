import * as Keychain from 'react-native-keychain';
import { homepageDraftStore } from '../src/services/homepageDraftStore';

const mockedKeychain = Keychain as jest.Mocked<typeof Keychain>;

describe('homepageDraftStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('persists resumable homepage state in the platform keychain', async () => {
    const value = {
      schemaVersion: 1 as const,
      userId: 'user-1',
      prompt: '私人主页内容',
      selectedMediaAssetIds: ['asset-1', 'asset-2', 'asset-3'],
      activeJobId: 'job-1',
      draftId: null,
      updatedAt: '2026-07-15T08:00:00.000Z',
    };

    await homepageDraftStore.save(value);
    expect(mockedKeychain.setGenericPassword).toHaveBeenCalledWith(
      value.userId,
      JSON.stringify(value),
      expect.objectContaining({ service: expect.any(String) }),
    );

    mockedKeychain.getGenericPassword.mockResolvedValueOnce({
      username: value.userId,
      password: JSON.stringify(value),
      service: 'homepage',
      storage: 'keychain',
    } as never);
    await expect(homepageDraftStore.read(value.userId)).resolves.toEqual(value);
  });

  test('ignores malformed or cross-account local state', async () => {
    mockedKeychain.getGenericPassword.mockResolvedValueOnce({
      username: 'someone-else',
      password: '{broken',
      service: 'homepage',
      storage: 'keychain',
    } as never);

    await expect(homepageDraftStore.read('user-1')).resolves.toBeNull();
  });
});
