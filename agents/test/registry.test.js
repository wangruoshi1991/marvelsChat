import test from "node:test";
import assert from "node:assert/strict";
import {
  getAgent,
  listAgents,
  validateAgentPermissions,
} from "../registry.js";

test("Agent permissions must be unique valid scopes", () => {
  assert.throws(
    () =>
      validateAgentPermissions({
        key: "invalid-agent",
        permissions: ["station:read", "station:read"],
      }),
    /unique valid permissions/,
  );
  assert.deepEqual(
    validateAgentPermissions({
      key: "valid-agent",
      permissions: ["station:read", "agents:invoke"],
    }),
    ["station:read", "agents:invoke"],
  );
});

test("site-builder agent is registered with station drafting capabilities", async () => {
  const agents = await listAgents();
  const siteBuilder = agents.find((agent) => agent.key === "site-builder");

  assert.ok(siteBuilder);
  assert.equal(siteBuilder.name, "建站 Agent");
  assert.equal(siteBuilder.category, "station-builder");
  assert.ok(siteBuilder.capabilities.includes("station-site-draft"));
  assert.ok(siteBuilder.permissions.includes("profile:read"));
});

test("unknown Agent keys do not fall back to another definition", async () => {
  assert.equal(await getAgent("missing-agent"), null);
});

test("site-builder agent plan asks for structured JSON only", async () => {
  const agent = await getAgent("site-builder");
  const plan = await agent.plan({
    input: "帮我做一个摄影主页",
    user: { displayName: "林小满", aiId: "000001000001" },
    appContext: {
      profile: {
        nickname: "林小满",
        bio: "摄影爱好者",
        community: "上海",
        activityArea: "徐汇滨江",
      },
      stationContent: {
        albums: [],
        mediaAssets: [],
        diaryEntries: [],
        outfits: [],
      },
    },
  });

  assert.match(plan.system, /JSON/);
  assert.match(plan.system, /不要输出 HTML/);
  assert.match(plan.user, /帮我做一个摄影主页/);
  assert.match(plan.user, /林小满/);
});

test("model-3d agent only advises and cannot trigger avatar generation", async () => {
  const agents = await listAgents();
  const modelAgent = agents.find((agent) => agent.key === "model-3d");

  assert.ok(modelAgent);
  assert.equal(modelAgent.name, "3D形象顾问 Agent");
  assert.equal(modelAgent.category, "advisory");
  assert.ok(modelAgent.capabilities.includes("photo-readiness-guidance"));
  assert.equal(modelAgent.capabilities.includes("photo-to-avatar-3d"), false);
  assert.equal(modelAgent.permissions.includes("station:write"), false);

  const fullAgent = await getAgent("model-3d");
  const plan = await fullAgent.plan({
    input: "帮我生成一个3D形象",
    user: { displayName: "测试用户", aiId: "000001000001" },
  });
  assert.match(plan.system, /App 内的独立产品流程/);
  assert.match(plan.system, /不能调用、控制或代替/);
  assert.doesNotMatch(plan.system, /\/avatar\/|Web 工作台中/);
});

test("file-preprocessor agent is registered for file preprocessing", async () => {
  const agents = await listAgents();
  const fileAgent = agents.find((agent) => agent.key === "file-preprocessor");

  assert.ok(fileAgent);
  assert.equal(fileAgent.name, "文件预处理 Agent");
  assert.equal(fileAgent.category, "preprocessing");
  assert.ok(fileAgent.capabilities.includes("file-summary"));
  assert.ok(fileAgent.capabilities.includes("metadata-tagging"));
  assert.ok(fileAgent.permissions.includes("files:write"));

  const fullAgent = await getAgent("file-preprocessor");
  const plan = await fullAgent.plan({
    input: "整理我的文件",
    user: { displayName: "测试用户" },
    appContext: { stationContent: { fileAssets: [{ id: "file-1" }] } },
  });
  assert.match(plan.user, /已有文件数: 1/);
  assert.doesNotMatch(plan.user, /昵称:/);
});

test("album-manager agent is registered for album organization", async () => {
  const agents = await listAgents();
  const albumAgent = agents.find((agent) => agent.key === "album-manager");

  assert.ok(albumAgent);
  assert.equal(albumAgent.name, "相册管理 Agent");
  assert.equal(albumAgent.category, "media-management");
  assert.ok(albumAgent.capabilities.includes("album-organization"));
  assert.ok(albumAgent.capabilities.includes("media-tagging"));
  assert.ok(albumAgent.permissions.includes("album:write"));
});

test("comic-diary agent is registered for storyboard generation", async () => {
  const agents = await listAgents();
  const comicAgent = agents.find((agent) => agent.key === "comic-diary");

  assert.ok(comicAgent);
  assert.equal(comicAgent.name, "漫画日记 Agent");
  assert.equal(comicAgent.category, "content-generation");
  assert.ok(comicAgent.capabilities.includes("comic-storyboard"));
  assert.ok(comicAgent.capabilities.includes("diary-to-comic"));
  assert.ok(comicAgent.permissions.includes("diary:read"));
  assert.ok(comicAgent.permissions.includes("station:write"));
});

test("video-production agent is registered for video draft generation", async () => {
  const agents = await listAgents();
  const videoAgent = agents.find((agent) => agent.key === "video-production");

  assert.ok(videoAgent);
  assert.equal(videoAgent.name, "视频制作 Agent");
  assert.equal(videoAgent.category, "content-generation");
  assert.ok(videoAgent.capabilities.includes("video-script"));
  assert.ok(videoAgent.capabilities.includes("shot-list"));
  assert.ok(videoAgent.permissions.includes("album:read"));
  assert.ok(videoAgent.permissions.includes("station:write"));
});
