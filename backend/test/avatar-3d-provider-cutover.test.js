import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { buildAgentReadiness } = await import("../src/agent-readiness-service.js");

test("3D advisor readiness is independent from the paid avatar pipeline", async () => {
  const readiness = await buildAgentReadiness({
    ossStatus: { provider: "oss", configured: true, missing: [] },
    modelStatus: { provider: "new-api", configured: true, missing: [] },
    mediaRetrievalStatus: {
      readiness: { state: "not-ready" },
      routeEligibility: { reasonCodes: ["not-ready"] },
    },
  });
  const model3d = readiness["model-3d"];

  assert.equal(model3d.configured, true);
  assert.deepEqual(Object.keys(model3d.providers), ["model"]);
  assert.deepEqual(model3d.capabilityNeeds, ["avatar_generation_guidance_only"]);
  assert.equal(JSON.stringify(model3d).includes("AVATAR_3D_"), false);
  assert.equal(JSON.stringify(model3d).includes("DASHSCOPE_"), false);
});

test("active 3D runtime contains no Meshy provider or legacy station route", async () => {
  const sourceFiles = [
    "../src/config.js",
    "../src/agent-readiness-service.js",
    "../src/routes/station-routes.js",
    "../src/schemas.js",
    "../src/station-repository.js",
    "../src/repository-mappers.js",
  ];
  const contents = await Promise.all(sourceFiles.map((path) =>
    readFile(new URL(path, import.meta.url), "utf8")));

  assert.doesNotMatch(contents.join("\n"), /meshy|MESHY/);
  await assert.rejects(
    () => readFile(new URL("../src/model-generation-service.js", import.meta.url), "utf8"),
    (error) => error?.code === "ENOENT",
  );
  await assert.rejects(
    () => readFile(new URL("../src/routes/station-model-routes.js", import.meta.url), "utf8"),
    (error) => error?.code === "ENOENT",
  );
});

test("retired Station 3D tables have no implicit provider fallback", async () => {
  const migration = await readFile(
    new URL("../database/020_remove_station_3d_provider_defaults.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /ALTER TABLE generation_jobs[\s\S]*ALTER COLUMN provider DROP DEFAULT/);
  assert.match(migration, /ALTER TABLE station_model_assets[\s\S]*ALTER COLUMN provider DROP DEFAULT/);
  assert.doesNotMatch(migration, /SET DEFAULT|meshy|legacy/i);
});
