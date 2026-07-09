export type Coordinates = {
  latitude: number;
  longitude: number;
};

const outOfChina = (latitude: number, longitude: number) =>
  longitude < 72.004 ||
  longitude > 137.8347 ||
  latitude < 0.8293 ||
  latitude > 55.8271;

const transformLat = (x: number, y: number) => {
  let value =
    -100 +
    2 * x +
    3 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  value +=
    ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  value +=
    ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  value +=
    ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) *
      2) /
    3;
  return value;
};

const transformLongitude = (x: number, y: number) => {
  let value =
    300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  value +=
    ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  value +=
    ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  value +=
    ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) *
      2) /
    3;
  return value;
};

export const wgs84ToGcj02 = ({
  latitude,
  longitude,
}: Coordinates): Coordinates => {
  if (outOfChina(latitude, longitude)) {
    return { latitude, longitude };
  }
  const a = 6378245.0;
  const ee = 0.00669342162296594323;
  let dLat = transformLat(longitude - 105, latitude - 35);
  let dLon = transformLongitude(longitude - 105, latitude - 35);
  const radLat = (latitude / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
  dLon = (dLon * 180) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { latitude: latitude + dLat, longitude: longitude + dLon };
};

export const gcj02ToWgs84 = ({
  latitude,
  longitude,
}: Coordinates): Coordinates => {
  if (outOfChina(latitude, longitude)) {
    return { latitude, longitude };
  }
  const converted = wgs84ToGcj02({ latitude, longitude });
  return {
    latitude: latitude * 2 - converted.latitude,
    longitude: longitude * 2 - converted.longitude,
  };
};
