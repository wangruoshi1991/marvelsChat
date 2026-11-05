import assert from "node:assert/strict";
import test from "node:test";
import agent from "../ui-agent.agent.js";
import {
  UI_HIDEABLE_MODULES, UI_ORDERABLE_MODULES, UI_COMPONENT_PROPERTIES,
  UI_COMPONENT_LAYOUT_SLOTS, UI_BUTTON_LAYOUT_SLOTS, UI_GESTURE_ACTIONS,
  UI_PREFERENCES_SCHEMA_VERSION, UI_PREFERENCE_SURFACES, UI_PREFERENCE_DENSITIES,
} from "../../shared/ui-preferences.js";

const catalogPrefix = "UI_PREFERENCE_CATALOG=";

test("UI Agent publishes only the shared live component and module catalogs", async () => {
  const plan = await agent.plan({ input: "调整按钮" });
  const line = plan.system.split("\n").find(item => item.startsWith(catalogPrefix));
  assert.ok(line, "The model must receive the actual shared preference catalog");
  const catalog = JSON.parse(line.slice(catalogPrefix.length));
  assert.equal(catalog.schemaVersion, UI_PREFERENCES_SCHEMA_VERSION);
  assert.deepEqual(catalog.surfaces, UI_PREFERENCE_SURFACES);
  assert.deepEqual(catalog.densities, UI_PREFERENCE_DENSITIES);
  assert.deepEqual(catalog.hideableModules, UI_HIDEABLE_MODULES);
  assert.deepEqual(catalog.orderableModules, UI_ORDERABLE_MODULES);
  assert.deepEqual(catalog.componentProperties, UI_COMPONENT_PROPERTIES);
  assert.deepEqual(catalog.componentLayoutSlots, UI_COMPONENT_LAYOUT_SLOTS);
  assert.deepEqual(catalog.buttonLayoutSlots, UI_BUTTON_LAYOUT_SLOTS);
  assert.deepEqual(catalog.gestureActions, UI_GESTURE_ACTIONS);
  assert.deepEqual(catalog.gestureDirections["messages.pullToSecondFloor"], ["down", "right"]);
  assert.deepEqual(catalog.gestureDirections["miao.taskCard.participantsSwipe"], ["left", "right"]);
  assert.deepEqual(catalog.gestureDirections["miao.taskCard.detailsSwipe"], ["left", "right"]);
  assert.deepEqual(catalog.gestureDirections["secondFloor.swipeToExit"], ["up", "down", "left", "right"]);
});

test("UI Agent explains the real screen, accessibility and gesture boundaries", async () => {
  const { system } = await agent.plan({ input: "向下滑关闭相册详情" });
  assert.match(system, /messages 仅指讯页对话列表，不包含聊天输入框/);
  assert.match(system, /xun\.threadList\.openSecondFloor 的 label 用于无障碍入口名称/);
  assert.match(system, /当进入手势禁用或存量方向不受支持时，也用于独立可点二楼按钮的文案/);
  assert.match(system, /二楼入口不依赖 newThread 按钮显隐/);
  assert.match(system, /若禁用进入手势，必须保留 xun\.threadList\.openSecondFloor\.visible 不为 false/);
  assert.match(system, /secondFloor\.swipeToExit 的四向配置仅用于固定返回手柄/);
  assert.match(system, /内容区只允许在列表底部向上滑退出/);
  assert.match(system, /不支持的请求必须返回空 patch/);
  assert.match(system, /affectedSurfaces.*\[\]/);
  assert.match(system, /预览.*用户确认/);
  assert.doesNotMatch(system, /messages 模块为 tabs\/threadList\/composer/);
});

test("UI Agent declares every surface for global font or density changes", async () => {
  const { system } = await agent.plan({
    input: "只把讯页字号放大",
    appContext: { client: { currentPage: "messages" } },
  });
  assert.match(system, /fontScale 和 density 是全局字段/);
  assert.match(system, /affectedSurfaces 必须列出目录中的全部页面/);
  assert.match(system, /单页字号或密度调整.*返回空 patch/);
});

test("UI Agent keeps instructions and current preferences in user context without adding executable tools", async () => {
  const preferences = { schemaVersion: 1, revision: 9 };
  const plan = await agent.plan({
    input: "把参与 Agent 放右上角",
    messages: [{ senderType: "user", content: "上一条" }, { senderType: "agent", content: "已撤回", recalledAt: "2026-11-05T00:00:00Z" }],
    appContext: { client: { language: "en", currentPage: "miao" }, uiPreferences: preferences },
  });
  assert.equal(plan.responseFormat, "json_object");
  assert.deepEqual(JSON.parse(plan.user), {
    instruction: "把参与 Agent 放右上角", currentPage: "miao", currentPreferences: preferences,
  });
  assert.deepEqual(plan.history, [{ role: "user", content: "上一条" }]);
  assert.match(plan.system, /当前语言：en/);
  assert.equal(Object.hasOwn(plan, "tools"), false);
});
