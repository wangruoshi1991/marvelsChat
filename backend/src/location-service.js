import { config } from "./config.js";
import { HttpError } from "./http-error.js";
import { normalizeLocationLabel, normalizeLocationText } from "./location-labels.js";

const addressPriority = [
  "neighbourhood",
  "suburb",
  "quarter",
  "residential",
  "city_district",
  "village",
  "town",
  "city",
  "county",
];

const areaPriority = [
  "city_district",
  "borough",
  "city",
  "town",
  "county",
  "state",
  "province",
];

const outOfChina = (lat, lon) =>
  lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;

const transformLat = (x, y) => {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
  return ret;
};

const transformLon = (x, y) => {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
  return ret;
};

const wgs84ToGcj02 = (lat, lon) => {
  if (outOfChina(lat, lon)) {
    return { latitude: lat, longitude: lon };
  }
  const a = 6378245.0;
  const ee = 0.006693421622965943;
  let dLat = transformLat(lon - 105.0, lat - 35.0);
  let dLon = transformLon(lon - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
  dLon = (dLon * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
  return { latitude: lat + dLat, longitude: lon + dLon };
};

const firstAddressValue = (address, keys) => {
  for (const key of keys) {
    const value = normalizeLocationLabel(address?.[key]);
    if (value) {
      return value;
    }
  }
  return "";
};

const normalizeCandidateName = (value) =>
  normalizeLocationText(value);

const pushCandidate = (items, seen, type, name, detail = "") => {
  const resolvedName = normalizeCandidateName(name);
  const normalizedKey = resolvedName.toLocaleLowerCase();
  if (!resolvedName || seen.has(normalizedKey)) {
    return;
  }
  seen.add(normalizedKey);
  items.push({
    id: `${type}:${items.length + 1}`,
    type,
    name: resolvedName,
    detail,
  });
};

const collectCommunityCandidates = (address) => {
  const seen = new Set();
  const items = [];
  const labels = {
    neighbourhood: "社区",
    suburb: "片区",
    quarter: "街区",
    residential: "居住区",
    city_district: "城区",
    village: "村镇",
    town: "镇",
    city: "城市",
    county: "区县",
  };
  for (const key of addressPriority) {
    pushCandidate(items, seen, key, normalizeLocationLabel(address?.[key]), labels[key] || key);
  }
  return items;
};

const collectActivityAreaCandidates = (address) => {
  const seen = new Set();
  const items = [];
  const province = firstAddressValue(address, ["state", "province"]);
  const city = firstAddressValue(address, ["city", "town", "county"]);
  const district = firstAddressValue(address, ["city_district", "borough", "suburb"]);
  const country = firstAddressValue(address, ["country"]);

  pushCandidate(
    items,
    seen,
    "city_area",
    [city, district].filter(Boolean).filter((item, index, list) => list.indexOf(item) === index).join(" · "),
    province || country,
  );

  for (const key of areaPriority) {
    pushCandidate(items, seen, key, normalizeLocationLabel(address?.[key]), country);
  }

  pushCandidate(items, seen, "province", province, country);
  return items;
};

const normalizeCoordinate = (value, name) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, `${name} must be a number`);
  }
  return parsed;
};

export async function resolveLocation({ latitude, longitude }) {
  const lat = normalizeCoordinate(latitude, "latitude");
  const lon = normalizeCoordinate(longitude, "longitude");

  if (config.geocoding.provider === "amap") {
    return resolveLocationWithAmap({ latitude: lat, longitude: lon });
  }
  if (config.geocoding.provider !== "nominatim") {
    throw new HttpError(503, `Unsupported geocoding provider: ${config.geocoding.provider}`);
  }

  if (!config.geocoding.reverseUrl) {
    throw new HttpError(503, "GEOCODING_REVERSE_URL is not configured.");
  }
  if (!config.geocoding.userAgent) {
    throw new HttpError(503, "GEOCODING_USER_AGENT is not configured.");
  }

  const url = new URL(config.geocoding.reverseUrl);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  if (config.geocoding.email) {
    url.searchParams.set("email", config.geocoding.email);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.geocoding.timeoutMs);
  let response;

  try {
    response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Accept-Language": config.geocoding.acceptLanguage,
        "User-Agent": config.geocoding.userAgent,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(504, "Geocoding request timed out.");
    }
    throw new HttpError(502, "Geocoding service is unavailable.", {
      provider: "nominatim-compatible",
      reason: error instanceof Error ? error.message : "fetch failed",
    });
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(response.status, "Geocoding service rejected the request.");
  }
  if (!payload || typeof payload !== "object") {
    throw new HttpError(502, "Geocoding service returned an invalid response.");
  }

  const address = payload.address && typeof payload.address === "object" ? payload.address : {};
  const communityCandidates = collectCommunityCandidates(address);
  const activityAreaCandidates = collectActivityAreaCandidates(address);
  const community = firstAddressValue(address, addressPriority);
  const area = firstAddressValue(address, ["city", "town", "county", "city_district", "borough", "state", "province"]);
  const province = firstAddressValue(address, ["state", "province"]);
  const country = firstAddressValue(address, ["country"]);
  const activityArea = [area, province]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join(" · ");

  if (!community && !activityArea) {
    throw new HttpError(422, "Geocoding service did not return usable community or activity area data.");
  }

  return {
    latitude: lat,
    longitude: lon,
    community,
    activityArea,
    communityCandidates,
    activityAreaCandidates,
    displayName: typeof payload.display_name === "string" ? payload.display_name : "",
    country,
    provider: "nominatim-compatible",
  };
}

async function resolveLocationWithAmap({ latitude, longitude }) {
  if (!config.geocoding.amapKey) {
    throw new HttpError(503, "AMAP_WEB_SERVICE_KEY is not configured.");
  }
  if (!config.geocoding.amapReverseUrl) {
    throw new HttpError(503, "AMAP_REVERSE_URL is not configured.");
  }

  const gcj = wgs84ToGcj02(latitude, longitude);
  const url = new URL(config.geocoding.amapReverseUrl);
  url.searchParams.set("key", config.geocoding.amapKey);
  url.searchParams.set("location", `${gcj.longitude.toFixed(6)},${gcj.latitude.toFixed(6)}`);
  url.searchParams.set("extensions", "all");
  url.searchParams.set("radius", "1000");
  url.searchParams.set("roadlevel", "1");
  url.searchParams.set("output", "JSON");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.geocoding.timeoutMs);
  let response;

  try {
    response = await fetch(url, {
      headers: {"Accept": "application/json"},
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(504, "Geocoding request timed out.");
    }
    throw new HttpError(502, "Geocoding service is unavailable.", {
      provider: "amap",
      reason: error instanceof Error ? error.message : "fetch failed",
    });
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(response.status, "Geocoding service rejected the request.");
  }
  if (!payload || typeof payload !== "object") {
    throw new HttpError(502, "Geocoding service returned an invalid response.");
  }
  if (payload.status !== "1") {
    throw new HttpError(502, payload.info ? `Amap geocoding failed: ${payload.info}` : "Amap geocoding failed.", {
      provider: "amap",
      infocode: payload.infocode || "",
    });
  }

  const regeocode = payload.regeocode && typeof payload.regeocode === "object" ? payload.regeocode : {};
  const component = regeocode.addressComponent && typeof regeocode.addressComponent === "object" ? regeocode.addressComponent : {};
  const neighborhood = component.neighborhood && typeof component.neighborhood === "object" ? component.neighborhood : {};
  const building = component.building && typeof component.building === "object" ? component.building : {};
  const businessAreas = Array.isArray(component.businessAreas) ? component.businessAreas : [];
  const pois = Array.isArray(regeocode.pois) ? regeocode.pois : [];
  const aois = Array.isArray(regeocode.aois) ? regeocode.aois : [];

  const seenCommunity = new Set();
  const communityCandidates = [];
  pushCandidate(communityCandidates, seenCommunity, "neighborhood", neighborhood.name, neighborhood.type || "社区");
  pushCandidate(communityCandidates, seenCommunity, "building", building.name, building.type || "建筑");
  for (const aoi of aois.slice(0, 6)) {
    pushCandidate(communityCandidates, seenCommunity, "aoi", aoi?.name, aoi?.type || "区域");
  }
  for (const poi of pois.slice(0, 8)) {
    pushCandidate(communityCandidates, seenCommunity, "poi", poi?.name, poi?.type || "地点");
  }
  pushCandidate(communityCandidates, seenCommunity, "township", component.township, "街道");
  pushCandidate(communityCandidates, seenCommunity, "district", component.district, "区县");

  const seenArea = new Set();
  const activityAreaCandidates = [];
  for (const area of businessAreas.slice(0, 6)) {
    pushCandidate(activityAreaCandidates, seenArea, "business_area", area?.name, component.district || "商圈");
  }
  pushCandidate(activityAreaCandidates, seenArea, "township", component.township, component.district || "街道");
  pushCandidate(activityAreaCandidates, seenArea, "district", component.district, component.city || component.province || "区县");
  pushCandidate(activityAreaCandidates, seenArea, "city", Array.isArray(component.city) ? "" : component.city, component.province || "城市");
  pushCandidate(activityAreaCandidates, seenArea, "province", component.province, component.country || "省份");

  const community = communityCandidates[0]?.name || "";
  const areaBase = activityAreaCandidates[0]?.name || (Array.isArray(component.city) ? "" : component.city) || component.district || component.province || "";
  const activityArea = [areaBase, component.city || component.province]
    .filter((value) => typeof value === "string" && value.trim())
    .filter((value, index, list) => list.indexOf(value) === index)
    .join(" · ");

  if (!community && !activityArea) {
    throw new HttpError(422, "Geocoding service did not return usable community or activity area data.");
  }

  return {
    latitude,
    longitude,
    community,
    activityArea,
    communityCandidates,
    activityAreaCandidates,
    displayName: typeof regeocode.formatted_address === "string" ? regeocode.formatted_address : "",
    country: component.country || "中国",
    provider: "amap",
  };
}
