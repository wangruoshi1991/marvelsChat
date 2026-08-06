// The expression intentionally covers ASCII control characters and DEL.
const controlCharacters = /[\u0000-\u001f\u007f]+/g; // eslint-disable-line no-control-regex

export const replaceControlCharacters = (value) =>
  String(value || "").replace(controlCharacters, " ");
