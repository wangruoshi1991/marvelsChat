import { stationLocationLabel } from '../src/features/station/stationProfileIdentity';

describe('station profile location label', () => {
  it('joins the saved activity area and community', () => {
    expect(
      stationLocationLabel({ activityArea: '浦东新区', community: '陆家嘴' }),
    ).toBe('浦东新区 · 陆家嘴');
  });

  it('treats the session placeholder and blanks as unset', () => {
    expect(
      stationLocationLabel({ activityArea: '未设置', community: ' ' }),
    ).toBe('');
    expect(
      stationLocationLabel({ activityArea: '未设置', community: '陆家嘴' }),
    ).toBe('陆家嘴');
  });

  it('does not repeat an identical area and community', () => {
    expect(
      stationLocationLabel({ activityArea: '静安', community: '静安' }),
    ).toBe('静安');
  });
});
