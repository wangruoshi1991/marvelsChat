import {
  gcj02ToWgs84,
  wgs84ToGcj02,
} from '../src/features/station/stationLocationGeo';

describe('stationLocationGeo', () => {
  it('leaves coordinates outside China unchanged', () => {
    const sanFrancisco = { latitude: 37.7749, longitude: -122.4194 };

    expect(wgs84ToGcj02(sanFrancisco)).toEqual(sanFrancisco);
    expect(gcj02ToWgs84(sanFrancisco)).toEqual(sanFrancisco);
  });

  it('converts China coordinates with a reversible approximation', () => {
    const chengdu = { latitude: 30.5728, longitude: 104.0668 };
    const gcj = wgs84ToGcj02(chengdu);
    const wgs = gcj02ToWgs84(gcj);

    expect(gcj.latitude).not.toBeCloseTo(chengdu.latitude, 5);
    expect(gcj.longitude).not.toBeCloseTo(chengdu.longitude, 5);
    expect(wgs.latitude).toBeCloseTo(chengdu.latitude, 4);
    expect(wgs.longitude).toBeCloseTo(chengdu.longitude, 4);
  });
});
