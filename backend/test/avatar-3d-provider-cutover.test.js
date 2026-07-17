import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { buildAgentReadiness } = await import("../src/agent-readiness-service.js");

test("3D readiness requires Aliyun Model Studio, OSS, and the Web feature", () => {
  const readiness = buildAgentReadiness({
    dashscopeStatus: {
      provider: "aliyun-model-studio",
      configured: true,
      missing: [],
    },
    ossStatus: { provider: "oss", configured: true, missing: [] },
    avatarFeatureStatus: { provider: "avatar-3d-web", configured: true, missing: [] },
    modelStatus: { provider: "new-api", configured: true, missing: [] },
  });
  const model3d = readiness["model-3d"];

  assert.equal(model3d.configured, true);
  assert.deepEqual(Object.keys(model3d.providers).sort(), [
    "avatarWeb",
    "dashscope",
    "oss",
  ]);
  assert.ok(model3d.requiredEnv.includes("DASHSCOPE_API_KEY"));
  assert.ok(model3d.requiredEnv.includes("DASHSCOPE_WORKSPACE_ID"));
  assert.ok(model3d.requiredEnv.includes("AVATAR_3D_ENABLED"));
  assert.equal(JSON.stringify(model3d).toLowerCase().includes("meshy"), false);
});

test("active 3D runtime sources contain no Meshy provider integration", async () => {
  const sourceFiles = [
    "../src/config.js",
    "../src/agent-readiness-service.js",
    "../src/routes/station-model-routes.js",
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
});
