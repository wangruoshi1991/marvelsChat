import { profileApi } from '../src/services/api/profileApi';
import { request } from '../src/services/api/http';
import { emptyProfile } from '../src/features/session/sessionDefaults';
import { profileIdentityTags } from '../src/features/station/stationProfileIdentity';

jest.mock('../src/services/api/http', () => ({ request: jest.fn() }));

afterEach(() => jest.resetAllMocks());

test('a profile endpoint silently dropping requested identity fields cannot report success', async () => {
  (request as jest.Mock).mockResolvedValue(emptyProfile);
  await expect(
    profileApi.updateProfile('test-token', {
      ...emptyProfile,
      headline: '设计师',
    }),
  ).rejects.toThrow('不一致');
});

test('saving unrelated profile fields does not clear identity and a verified identity save succeeds', async () => {
  const profile = { ...emptyProfile, headline: '设计师', experienceYears: 0 };
  (request as jest.Mock).mockResolvedValue(profile);
  const basic = {
    nickname: '本人',
    avatarText: '本',
    bio: '',
    community: '',
    activityArea: '',
    avatarConfig: {},
  };
  await expect(profileApi.updateProfile('test-token', basic)).resolves.toEqual(
    profile,
  );
  expect((request as jest.Mock).mock.calls[0][1].body).not.toHaveProperty(
    'headline',
  );
  await expect(
    profileApi.updateProfile('test-token', {
      ...basic,
      headline: '设计师',
      experienceYears: 0,
      languages: [],
      publicLocation: '',
    }),
  ).resolves.toEqual(profile);
});

test('public tags use voluntary identity, omit absent experience and retain explicit zero', () => {
  expect(
    profileIdentityTags(
      {
        headline: '',
        publicLocation: '',
        experienceYears: null,
        languages: [],
      },
      'zh',
    ),
  ).toEqual([]);
  expect(
    profileIdentityTags(
      {
        headline: '',
        publicLocation: '上海',
        experienceYears: 0,
        languages: ['zh', 'en'],
      },
      'zh',
    ),
  ).toEqual(['上海', '0年经验', '中文 / 英语']);
});
