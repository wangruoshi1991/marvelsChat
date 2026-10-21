import test from "node:test";
import assert from "node:assert/strict";
import { getAgent, listAgents, validateAgentPermissions } from "../registry.js";

test("specialist conversations declare history permission in their Agent definition", async () => {
  for (const key of [
    "album-manager",
    "comic-diary",
    "file-preprocessor",
    "miaoxun-butler",
    "model-3d",
    "site-builder",
    "video-production",
    "virtual-character",
  ]) {
    const agent = await getAgent(key);
    assert.ok(
      agent.permissions.includes("messages:read"),
      `${key} declares messages:read`,
    );
    const mode = key === "album-manager" ? "plan" : key === "miaoxun-butler" ? "dispatch" : "chat";
    const respond = agent[mode];
    assert.equal(typeof respond, "function", `${key} has a response contract`);
    const prompt = await respond.call(agent, {
      input: "Current request",
      user: { displayName: "Test" },
      messages: [
        { senderType: "user", content: "Earlier request" },
        { senderType: "agent", content: "Earlier answer" },
      ],
      appContext: { client: { language: "en" } },
    });
    assert.deepEqual(
      prompt.history,
      [
        { role: "user", content: "Earlier request" },
        { role: "assistant", content: "Earlier answer" },
      ],
      `${key} retains authorized prior turns`,
    );
  }
});

test("ordinary conversations have an explicit chat method distinct from generation and task entry points", async () => {
  const registered = await listAgents();
  for (const key of ["comic-diary", "file-preprocessor", "model-3d", "site-builder", "video-production", "virtual-character"]) {
    const definition = await getAgent(key);
    assert.equal(typeof definition.chat, "function", key);
    assert.ok(registered.find(agent => agent.key === key).runtimeModes.includes("chat"), key);
  }
  const character = await getAgent("virtual-character");
  assert.equal(character.plan, undefined);
  assert.deepEqual(registered.find(agent => agent.key === "virtual-character").runtimeModes, ["chat", "dispatch", "contribute"]);
  const album = await getAgent("album-manager");
  assert.equal(album.chat, undefined);
  assert.equal(typeof album.plan, "function");
  assert.equal(typeof (await getAgent("miaoxun-butler")).dispatch, "function");
});

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
  assert.match(plan.system, /interaction-intent/);
  assert.match(plan.system, /open-link\|compose-message\|follow-user/);
  assert.match(plan.system, /只能逐字保留用户明确提供的目标/);
  assert.match(plan.system, /不会打开链接、发送消息或关注用户/);
  assert.match(plan.system, /不要声称意图已经执行或服务已接通/);
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

test("workspace declarations are versioned typed capabilities distinct from display labels", async () => {
  const { validateAgentWorkspaceCapabilities } = await import("../registry.js");
  const album = await getAgent("album-manager");
  const site = await getAgent("site-builder");
  assert.equal(
    validateAgentWorkspaceCapabilities(album)[0].outputKind,
    "media_selection",
  );
  assert.equal(
    validateAgentWorkspaceCapabilities(site)[0].outputKind,
    "site_draft",
  );
  for (const change of [
    (value) => {
      value.workspaceCapabilities[0].requiredScopes.push("files:write");
    },
    (value) => {
      value.workspaceCapabilities[0].outputKind = "unregistered";
    },
    (value) => {
      value.workspaceCapabilities[0].url = "https://example.invalid";
    },
    (value) => {
      value.workspaceCapabilities.push(value.workspaceCapabilities[0]);
    },
    (value) => {
      value.version = "unversioned";
    },
  ]) {
    const changed = {
      ...album,
      workspaceCapabilities: structuredClone(album.workspaceCapabilities),
    };
    change(changed);
    assert.throws(() => validateAgentWorkspaceCapabilities(changed));
  }
});

test("coordinator plans against supplied catalogue and real outputs without a fixed workflow", async () => {
  const butler = await getAgent("miaoxun-butler");
  const plan = await butler.coordinate({
    input: "创建文字介绍",
    appContext: {
      availableCapabilities: [
        { agentId: "site-builder", capability: "site.compose" },
      ],
      unavailableCapabilities: [
        {
          agentName: "相册管理 Agent",
          description: "查找真实照片",
          reason: "authorization_required",
        },
      ],
      contextRefs: [],
      steps: [],
    },
  });
  const context = JSON.parse(plan.user);
  assert.deepEqual(context.availableCapabilities, [
    { agentId: "site-builder", capability: "site.compose" },
  ]);
  assert.deepEqual(context.unavailableCapabilities, [
    {
      agentName: "相册管理 Agent",
      description: "查找真实照片",
      reason: "authorization_required",
    },
  ]);
  assert.equal(context.goal, "创建文字介绍");
  assert.equal(Object.hasOwn(context, "remainingLimits"), false);
  assert.doesNotMatch(plan.system, /remainingLimits|剩余额度/);
  assert.match(plan.system, /没有固定执行流程/);
  assert.match(plan.system, /"type":"clarify"/);
  assert.match(plan.system, /status为succeeded/);
  assert.match(plan.system, /禁止省略所选相册以扩大范围/);
  assert.match(plan.system, /summary、question和goal会直接展示给用户/);
  assert.match(plan.system, /不得暴露agentId、capability及其内部取值/);
  assert.match(
    plan.system,
    /不得把节点key、dependsOn或resultKey中的机器标识写入用户文案/,
  );
  assert.match(plan.system, /不得让用户在工作空间注册、添加或接入执行器/);
  assert.match(plan.system, /我 → 我的 Agent/);
  assert.match(plan.system, /request_access精确选择/);
  assert.match(plan.system, /仅选择目标所必需的能力/);
  assert.match(plan.system, /不要用camelCase、大写或中文/);
  assert.match(plan.system, /总长度不超过80/);
  assert.match(plan.system, /不得以coordinate-开头/);
  assert.match(plan.system, /当前任务的授权快照不能扩大/);
  assert.deepEqual(plan.history, []);
});

test("site agent includes the complete exact handoff and never proposes a missing-media text fallback", async () => {
  const agent = await getAgent("site-builder");
  const mediaAssets = Array.from({ length: 15 }, (_, index) => ({
    id: `selected-${index}`,
  }));
  const plan = await agent.plan({
    input: "使用这些素材",
    user: {},
    appContext: { stationContent: { mediaAssets } },
  });
  assert.match(plan.user, /selected-14/);
  assert.match(plan.system, /不得将任务偷换成纯文字页面/);
  assert.doesNotMatch(plan.system, /缺少素材，仍然生成/);
});

test("text collaboration requires an explicit contribute method and registry derives runtime modes", async () => {
  const { validateAgentWorkspaceCapabilities } = await import("../registry.js");
  const agents = await listAgents();
  for (const key of ["file-preprocessor", "comic-diary", "video-production", "virtual-character", "model-3d", "miaoxun-butler"]) {
    const agent = await getAgent(key);
    const declared = agent.workspaceCapabilities.find(entry => entry.outputKind === "text_result");
    assert.ok(declared, key);
    assert.equal(typeof agent.contribute, "function");
    assert.ok(agents.find(entry => entry.key === key).runtimeModes.includes("contribute"));
    assert.throws(() => validateAgentWorkspaceCapabilities({ ...agent, contribute: undefined }));
    const prompt = await agent.contribute({ input: "完成本节点文字方案", messages: [{ role: "user", content: "不可继承的私聊" }],
      appContext: { profile: { bio: "不可默读的资料" }, workspaceContribution: { selectedContext: [], dependencies: [] } } });
    assert.deepEqual(prompt.history, []);
    assert.equal(prompt.user.includes("不可继承的私聊"), false);
    assert.equal(prompt.user.includes("不可默读的资料"), false);
    assert.match(prompt.system, /不要求JSON/);
    assert.match(prompt.system, /此次只交付文本/);
    await assert.rejects(agent.contribute({ input: "无上下文" }), /explicit authorized context/);
  }
  assert.equal(agents.find(entry => entry.key === "album-manager").runtimeModes.includes("contribute"), false);
});
