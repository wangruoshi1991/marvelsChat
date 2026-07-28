import assert from "node:assert/strict";
import test from "node:test";

import { createAvatar3dProviderRegistry } from "../src/avatar-3d-provider-registry.js";

test("provider registry exposes Tripo as the only 3D provider", () => {
  const tripo = { name: "tripo" };
  const registry = createAvatar3dProviderRegistry({
    tripo,
    extraProvider: { name: "must-not-be-registered" },
  });

  assert.equal(registry.resolve("tripo"), tripo);
  assert.throws(() => registry.resolve("extra_provider"), /Unsupported avatar provider/);
  assert.throws(() => registry.resolve("unknown"), /Unsupported avatar provider/);
});
