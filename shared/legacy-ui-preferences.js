// The published presentation contract is separate from UI-Agent preferences.
export const UI_PREFERENCES_VERSION = 1;

export const DEFAULT_UI_PREFERENCES = Object.freeze({
  version: UI_PREFERENCES_VERSION,
  global: Object.freeze({
    density: "comfortable",
    radius: "medium",
    textScale: "normal",
    accent: "mint",
    cardStyle: "soft",
  }),
});

const isRecord = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const fail = (path, message) => {
  const error = new Error(`${path}: ${message}`);
  error.code = "UI_PREFERENCES_INVALID";
  error.path = path;
  throw error;
};
const enumValue = (value, values, path) => {
  if (typeof value !== "string" || !values.includes(value)) fail(path, "unsupported value");
};
const exactKeys = (value, keys, path) => {
  if (!isRecord(value)) fail(path, "expected an object");
  const missing = keys.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (missing.length) fail(`${path}.${missing[0]}`, "missing field");
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, "unknown field");
};

export function assertUiPreferences(value) {
  exactKeys(value, ["version", "global"], "$");
  if (value.version !== UI_PREFERENCES_VERSION) fail("$.version", "unsupported version");
  exactKeys(value.global, ["density", "radius", "textScale", "accent", "cardStyle"], "$.global");
  enumValue(value.global.density, ["comfortable", "compact"], "$.global.density");
  enumValue(value.global.radius, ["small", "medium", "large"], "$.global.radius");
  enumValue(value.global.textScale, ["normal", "large"], "$.global.textScale");
  enumValue(value.global.accent, ["mint", "ocean", "violet"], "$.global.accent");
  enumValue(value.global.cardStyle, ["soft", "bordered"], "$.global.cardStyle");
  return value;
}

export const normalizeUiPreferences = (value) => {
  assertUiPreferences(value);
  return { version: UI_PREFERENCES_VERSION, global: { ...value.global } };
};
export const defaultUiPreferences = () => JSON.parse(JSON.stringify(DEFAULT_UI_PREFERENCES));

export function diffUiPreferences(before, after) {
  assertUiPreferences(before);
  assertUiPreferences(after);
  const changes = [];
  for (const key of Object.keys(after.global)) {
    if (before.global[key] !== after.global[key]) {
      changes.push({ path: `$.global.${key}`, from: before.global[key], to: after.global[key] });
    }
  }
  return changes;
}
