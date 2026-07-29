import { launchImageLibrary } from 'react-native-image-picker';

import { pickStationPhotoFromLibrary } from '../src/services/stationMediaPicker';

const mockedLaunchImageLibrary = launchImageLibrary as jest.MockedFunction<
  typeof launchImageLibrary
>;

describe('station media picker', () => {
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
});
