import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  avatar3dCostVersion,
  avatar3dDefaultQualityPreset,
  publicAvatar3dQualityCatalog,
  resolveAvatar3dQuality,
} = await import("../src/avatar-3d-quality.js");

const runtime = {
  qualityCostsFen: {
    standard: 280,
    ultra: 420,
  },
};

test("standard quality keeps detailed texture with standard geometry", () => {
  assert.deepEqual(
    resolveAvatar3dQuality({ preset: "standard", runtime }),
    {
      id: "standard",
      geometryQuality: "standard",
      textureQuality: "detailed",
      estimatedCostFen: 280,
    },
  );
});

test("maps ultra quality to ultra geometry and detailed texture", () => {
  assert.deepEqual(
    resolveAvatar3dQuality({ preset: "ultra", runtime }),
    {
      id: "ultra",
      geometryQuality: "ultra",
      textureQuality: "detailed",
      estimatedCostFen: 420,
    },
  );
});

test("rejects unknown quality presets before provider submission", () => {
  assert.throws(
    () => resolveAvatar3dQuality({ preset: "custom", runtime }),
    (error) => error?.status === 400 && error?.details?.code === "INVALID_QUALITY_PRESET",
  );
});

test("publishes only the two approved presets with fine quality as default", () => {
  const catalog = publicAvatar3dQualityCatalog(runtime);

  assert.equal(avatar3dCostVersion, "2026-07-21");
  assert.equal(avatar3dDefaultQualityPreset, "ultra");
  assert.deepEqual(catalog.map((entry) => entry.id), ["standard", "ultra"]);
  assert.deepEqual(catalog.map((entry) => entry.estimatedCostFen), [280, 420]);
  assert.equal(JSON.stringify(catalog).includes("geometryQuality"), false);
  assert.equal(JSON.stringify(catalog).includes("textureQuality"), false);
});
