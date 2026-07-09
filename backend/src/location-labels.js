export const normalizeLocationLabel = (value) =>
  String(value || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)[0] || "";

export const normalizeLocationText = (value) =>
  normalizeLocationLabel(value)
    .trim()
    .replace(/\s+/g, " ");
