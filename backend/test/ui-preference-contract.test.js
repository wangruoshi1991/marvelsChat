import assert from "node:assert/strict";
import test from "node:test";
import {
  applyUIPreferencePatch,
  defaultUIPreferences,
  normalizeUIPreferences,
  sanitizeUIPreferencePatch,
} from "../../shared/ui-preferences.js";

test("UI preference contract accepts bounded tokens, layout slots, and gestures", () => {
  const patch = sanitizeUIPreferencePatch({
    fontScale: 1.1,
    surfaces: { messages: { buttonRadius: 18, buttonScale: 1.15 } },
    layout: {
      secondFloor: {
        moduleOrder: ["albums", "files"],
        buttonSlots: { backAction: "headerRight" },
      },
    },
    gestures: { "secondFloor.swipeToExit": { distance: 72, animationMs: 140 } },
  });
  const next = applyUIPreferencePatch(defaultUIPreferences(), patch);
  assert.equal(next.fontScale, 1.1);
  assert.equal(next.surfaces.messages.buttonRadius, 18);
  assert.equal(next.surfaces.messages.buttonScale, 1.15);
  assert.deepEqual(next.layout.secondFloor.moduleOrder, ["albums", "files"]);
  assert.equal(next.layout.secondFloor.buttonSlots.backAction, "headerRight");
  assert.equal(next.gestures["secondFloor.swipeToExit"].distance, 72);
});

test("UI preference contract accepts the Miao card participant and detail gestures", () => {
  const patch = sanitizeUIPreferencePatch({
    gestures: {
      "miao.taskCard.participantsSwipe": {
        direction: "right",
        distance: 96,
        animationMs: 240,
      },
      "miao.taskCard.detailsSwipe": {
        direction: "left",
        velocityThreshold: 0.5,
      },
    },
  });
  const next = applyUIPreferencePatch(defaultUIPreferences(), patch);
  assert.equal(next.gestures["miao.taskCard.participantsSwipe"].distance, 96);
  assert.equal(
    next.gestures["miao.taskCard.detailsSwipe"].velocityThreshold,
    0.5,
  );
});

test("successive gesture patches validate against the saved directions", () => {
  const participants = "miao.taskCard.participantsSwipe";
  const details = "miao.taskCard.detailsSwipe";
  const swapped = applyUIPreferencePatch(defaultUIPreferences(), {
    gestures: { [participants]: { direction: "left" }, [details]: { direction: "right" } },
  });
  assert.throws(() => applyUIPreferencePatch(swapped, {
    gestures: { [details]: { direction: "left" } },
  }), /must use different directions/);
  const stillValid = applyUIPreferencePatch(swapped, {
    gestures: { [participants]: { direction: "left", distance: 110 } },
  });
  const restored = normalizeUIPreferences(JSON.parse(JSON.stringify(stillValid)));
  assert.equal(restored.gestures[participants].direction, "left");
  assert.equal(restored.gestures[participants].distance, 110);
  assert.equal(restored.gestures[details].direction, "right");
});

test("Miao card gestures reject vertical directions that conflict with scrolling", () => {
  for (const id of ["miao.taskCard.participantsSwipe", "miao.taskCard.detailsSwipe"]) {
    for (const direction of ["up", "down"]) {
      assert.throws(() => sanitizeUIPreferencePatch({ gestures: { [id]: { direction } } }),
        /only supports left or right/);
    }
  }
});

test("a component patch preserves earlier independent fields after storage round-trip", () => {
  const id = "miao.taskCard.participants";
  const initial = applyUIPreferencePatch(defaultUIPreferences(), {
    components: { miao: { [id]: { visible: false, sizeScale: 1.1 } } },
  });
  const next = applyUIPreferencePatch(initial, {
    components: { miao: { [id]: { slot: "cardFooter" } } },
  });
  const restored = normalizeUIPreferences(JSON.parse(JSON.stringify(next)));
  assert.deepEqual(restored.components.miao[id], {
    visible: false, sizeScale: 1.1, slot: "cardFooter",
  });
});

test("component and action slots must be implemented by their registered RN control", () => {
  assert.doesNotThrow(() => sanitizeUIPreferencePatch({
    components: { messages: { "xun.threadList.newThread": { slot: "headerRight" } } },
    layout: { secondFloor: { buttonSlots: { backAction: "headerRight" } } },
  }));
  for (const patch of [
    { components: { miao: { "miao.taskCard.participants": { slot: "floating" } } } },
    { components: { secondFloor: { "secondFloor.album.upload": { slot: "topRight" } } } },
    { layout: { messages: { buttonSlots: { newAction: "floating" } } } },
    { layout: { messages: { buttonSlots: { composerAction: "inline" } } } },
  ]) {
    assert.throws(() => sanitizeUIPreferencePatch(patch), /unsupported slot|slot is unsupported|not supported/);
  }
});

test("UI preference contract rejects executable or unknown fields", () => {
  assert.throws(
    () => sanitizeUIPreferencePatch({ css: "button { color: red }" }),
    /not supported/,
  );
  assert.throws(
    () =>
      sanitizeUIPreferencePatch({
        layout: { secondFloor: { moduleOrder: ["unknown"] } },
      }),
    /unsupported module/,
  );
  assert.throws(
    () => sanitizeUIPreferencePatch({ hiddenModules: { miao: ["unknown"] } }),
    /valid module keys/,
  );
  assert.throws(
    () =>
      sanitizeUIPreferencePatch({
        gestures: { "messages.pullToSecondFloor": { distance: 12 } },
      }),
    /between 40 and 240/,
  );
  assert.throws(
    () =>
      sanitizeUIPreferencePatch({
        surfaces: { messages: { buttonScale: 1.5 } },
      }),
    /between 0.8 and 1.3/,
  );
  assert.throws(
    () =>
      sanitizeUIPreferencePatch({
        components: {
          miao: { "miao.taskCard.details": { label: "https://bad.example" } },
        },
      }),
    /invalid/,
  );
});

test("UI preference contract rejects a gesture bound to another registered action", () => {
  assert.throws(
    () =>
      sanitizeUIPreferencePatch({
        gestures: {
          "miao.taskCard.detailsSwipe": { action: "openParticipants" },
        },
      }),
    /does not match the registered gesture action/,
  );
  assert.throws(
    () =>
      sanitizeUIPreferencePatch({
        gestures: {
          "secondFloor.swipeToExit": { action: "openDetails" },
        },
      }),
    /does not match the registered gesture action/,
  );
});

test("UI preference contract keeps Miao horizontal gestures reachable", () => {
  assert.throws(
    () =>
      applyUIPreferencePatch(defaultUIPreferences(), {
        gestures: {
          "miao.taskCard.participantsSwipe": { direction: "left" },
        },
      }),
    /must use different directions/,
  );
  assert.throws(
    () =>
      applyUIPreferencePatch(defaultUIPreferences(), {
        gestures: {
          "miao.taskCard.participantsSwipe": { direction: "left" },
          "miao.taskCard.detailsSwipe": { direction: "left" },
        },
      }),
    /must use different directions/,
  );
  assert.doesNotThrow(() =>
    applyUIPreferencePatch(defaultUIPreferences(), {
      gestures: {
        "miao.taskCard.participantsSwipe": { enabled: false, direction: "left" },
        "miao.taskCard.detailsSwipe": { direction: "left" },
      },
    }),
  );
});

test("UI preference contract protects second-floor navigation and permissions", () => {
  for (const module of ["toolTray", "permissions"]) {
    assert.throws(
      () =>
        sanitizeUIPreferencePatch({
          hiddenModules: { secondFloor: [module] },
        }),
      /is required and cannot be hidden/,
    );
  }
});

test("stored UI preferences preserve revision and reject unknown schema", () => {
  const current = normalizeUIPreferences({
    schemaVersion: 1,
    revision: 7,
    density: "compact",
    fontScale: 1,
    surfaces: defaultUIPreferences().surfaces,
    hiddenModules: defaultUIPreferences().hiddenModules,
    layout: defaultUIPreferences().layout,
    gestures: defaultUIPreferences().gestures,
  });
  assert.equal(current.revision, 7);
  assert.equal(current.density, "compact");
  assert.throws(
    () => normalizeUIPreferences({ schemaVersion: 2, revision: 0 }),
    /version/,
  );
});
