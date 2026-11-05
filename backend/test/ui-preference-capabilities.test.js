import assert from "node:assert/strict";
import test from "node:test";
import { applyUIPreferencePatch, defaultUIPreferences, normalizeUIPreferences, sanitizeUIPreferencePatch } from "../../shared/ui-preferences.js";

test("each fixed component only accepts properties consumed by its renderer", () => {
  for (const [surface, id, property, value] of [
    ["messages", "xun.threadList.newThread", "order", 2],
    ["messages", "xun.threadList.openSecondFloor", "icon", "+"],
    ["messages", "xun.threadList.openSecondFloor", "sizeScale", 1.2],
    ["secondFloor", "secondFloor.album.upload", "order", 2],
    ["secondFloor", "secondFloor.file.upload", "order", 2],
  ]) assert.throws(() => sanitizeUIPreferencePatch({ components: { [surface]: { [id]: { [property]: value } } } }), /not supported/);
  assert.doesNotThrow(() => sanitizeUIPreferencePatch({ components: {
    messages: { "xun.threadList.openSecondFloor": { label: "进入个人空间", visible: true } },
    miao: { "miao.taskCard.details": { icon: "↗", label: "成果", sizeScale: 1.2, order: 1 } },
  } }));
});

test("new module proposals reject unavailable modules and preserve required navigation", () => {
  for (const patch of [
    { hiddenModules: { messages: ["tabs"] } },
    { hiddenModules: { messages: ["voiceDock"] } },
    { hiddenModules: { miao: ["profileHeader"] } },
    { layout: { messages: { moduleOrder: ["threadList", "tabs"] } } },
    { layout: { miao: { moduleOrder: ["taskFeed"] } } },
    { layout: { secondFloor: { moduleOrder: ["toolTray", "files"] } } },
  ]) assert.throws(() => sanitizeUIPreferencePatch(patch), /not supported|cannot be hidden|unsupported module/);
  assert.doesNotThrow(() => sanitizeUIPreferencePatch({ hiddenModules: { messages: ["threadList"], miao: ["taskFeed"] }, layout: { secondFloor: { moduleOrder: ["files", "albums"] } } }));
});

test("entrance gestures must not steal ordinary upward reading or chat row left swipes", () => {
  for (const direction of ["up", "left"]) assert.throws(() => sanitizeUIPreferencePatch({ gestures: { "messages.pullToSecondFloor": { direction } } }), /direction/);
  for (const direction of ["down", "right"]) assert.doesNotThrow(() => sanitizeUIPreferencePatch({ gestures: { "messages.pullToSecondFloor": { direction } } }));
});

test("confirmed preferences keep a reachable entrance to the second floor", () => {
  const noPull = applyUIPreferencePatch(defaultUIPreferences(), { gestures: { "messages.pullToSecondFloor": { enabled: false } } });
  assert.doesNotThrow(() => applyUIPreferencePatch(noPull, { components: { messages: { "xun.threadList.newThread": { visible: false } } } }));
  assert.throws(() => applyUIPreferencePatch(noPull, { components: { messages: { "xun.threadList.openSecondFloor": { visible: false } } } }), /reachable/);
  assert.doesNotThrow(() => applyUIPreferencePatch(noPull, { gestures: { "messages.pullToSecondFloor": { enabled: true } }, components: { messages: { "xun.threadList.newThread": { visible: false } } } }));
});

test("historical schema-one preferences remain readable without silent rewriting", () => {
  const historical = defaultUIPreferences();
  historical.hiddenModules.messages = ["tabs", "voiceDock"];
  historical.hiddenModules.miao = ["profileHeader"];
  historical.components.messages["xun.threadList.newThread"] = { order: 3 };
  historical.gestures["messages.pullToSecondFloor"] = { ...historical.gestures["messages.pullToSecondFloor"], direction: "up", enabled: false };
  historical.components.messages["xun.threadList.openSecondFloor"] = { visible: false };
  const restored = normalizeUIPreferences(JSON.parse(JSON.stringify(historical)));
  assert.deepEqual(restored, historical);
  assert.doesNotThrow(() => applyUIPreferencePatch(restored, { gestures: { "messages.pullToSecondFloor": { enabled: true, direction: "down" } } }));
});
