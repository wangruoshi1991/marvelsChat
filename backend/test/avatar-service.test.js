import assert from "node:assert/strict";
import test from "node:test";

import { createAvatarConfig, normalizeAvatarConfig } from "../src/avatar-service.js";

test("avatar normalization emits only the current v2 contract", () => {
  const seed = "user-1";
  const generated = createAvatarConfig(seed);
  const normalized = normalizeAvatarConfig(
    { palette: "grape", shape: "rounded" },
    seed,
  );

  assert.equal(normalized.version, 2);
  assert.equal(normalized.accent, generated.accent);
  assert.equal(Object.hasOwn(normalized, "palette"), false);
  assert.equal(Object.hasOwn(normalized, "shape"), false);
});

test("avatar normalization preserves a valid current accent", () => {
  assert.equal(normalizeAvatarConfig({ accent: "violet" }, "user-1").accent, "violet");
});
