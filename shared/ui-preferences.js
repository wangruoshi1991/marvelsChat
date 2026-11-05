// The UI Agent is allowed to produce preference patches only. This module is
// deliberately framework-free so the backend and future clients share the
// same bounds without importing React Native or executing generated code.

export const UI_PREFERENCES_SCHEMA_VERSION = 1;
export const UI_PREFERENCE_SURFACES = Object.freeze([
  "messages",
  "miao",
  "secondFloor",
]);
export const UI_PREFERENCE_DENSITIES = Object.freeze([
  "compact",
  "comfortable",
  "spacious",
]);
export const UI_SURFACE_MODULES = Object.freeze({
  messages: ["tabs", "threadList", "composer", "voiceDock", "taskInbox"],
  miao: ["profileHeader", "agentList", "taskFeed", "navigation"],
  secondFloor: [
    "toolTray",
    "albums",
    "files",
    "relationships",
    "assets",
    "information",
    "permissions",
  ],
});
// These modules contain safety and navigation affordances that must remain
// reachable even when a user asks UI-Agent to hide optional content.
export const UI_PROTECTED_MODULES = Object.freeze({
  messages: ["tabs"],
  miao: [],
  secondFloor: ["toolTray", "permissions"],
});
// These are the modules the current RN screens actually allow users to hide
// or reorder. The broader schema-one catalogue remains readable as history.
export const UI_HIDEABLE_MODULES = Object.freeze({
  messages: ["threadList", "taskInbox"],
  miao: ["taskFeed"],
  secondFloor: ["albums", "files", "relationships", "assets", "information"],
});
export const UI_ORDERABLE_MODULES = Object.freeze({
  messages: [],
  miao: [],
  secondFloor: ["albums", "files", "relationships", "assets", "information", "permissions"],
});
export const UI_BUTTON_LAYOUT_SLOTS = Object.freeze({
  messages: { newAction: ["headerRight", "topRight"] },
  miao: { agentEntry: ["topRight", "cardFooter"] },
  secondFloor: { backAction: ["headerRight"] },
});
const historicalButtonSlotIds = Object.freeze({
  messages: ["newAction", "composerAction", "voiceAction"],
  miao: ["agentEntry", "profileAction", "navigationAction"],
  secondFloor: ["uploadAction", "toolAction", "backAction"],
});
export const UI_GESTURE_IDS = Object.freeze([
  "messages.pullToSecondFloor",
  "secondFloor.swipeToExit",
  "miao.taskCard.participantsSwipe",
  "miao.taskCard.detailsSwipe",
]);
export const UI_LAYOUT_SLOTS = Object.freeze([
  "header",
  "headerLeft",
  "headerRight",
  "topRight",
  "inline",
  "cardFooter",
  "bottomBar",
  "floating",
]);
export const UI_REGISTERED_ACTIONS = Object.freeze([
  "openDetails",
  "openParticipants",
  "openSecondFloor",
  "goBack",
  "openUpload",
]);
export const UI_GESTURE_ACTIONS = Object.freeze({
  "messages.pullToSecondFloor": "openSecondFloor",
  "secondFloor.swipeToExit": "goBack",
  "miao.taskCard.participantsSwipe": "openParticipants",
  "miao.taskCard.detailsSwipe": "openDetails",
});
export const UI_COMPONENT_IDS = Object.freeze({
  messages: ["xun.threadList.newThread", "xun.threadList.openSecondFloor"],
  miao: ["miao.taskCard.details", "miao.taskCard.participants"],
  secondFloor: ["secondFloor.album.upload", "secondFloor.file.upload"],
});
// Keep the contract aligned with positions that each fixed RN control renders.
// Unsupported positions must fail during preview, before they can be saved.
export const UI_COMPONENT_LAYOUT_SLOTS = Object.freeze({
  messages: {
    "xun.threadList.newThread": ["headerRight", "topRight"],
    "xun.threadList.openSecondFloor": [],
  },
  miao: {
    "miao.taskCard.details": [],
    "miao.taskCard.participants": ["topRight", "cardFooter"],
  },
  secondFloor: {
    "secondFloor.album.upload": [],
    "secondFloor.file.upload": [],
  },
});
export const UI_COMPONENT_PROPERTIES = Object.freeze({
  messages: {
    "xun.threadList.newThread": ["slot", "visible", "sizeScale", "icon", "label"],
    "xun.threadList.openSecondFloor": ["visible", "label"],
  },
  miao: {
    "miao.taskCard.details": ["visible", "order", "sizeScale", "icon", "label"],
    "miao.taskCard.participants": ["slot", "visible", "order", "sizeScale", "icon", "label"],
  },
  secondFloor: {
    "secondFloor.album.upload": ["visible", "sizeScale", "icon", "label"],
    "secondFloor.file.upload": ["visible", "sizeScale", "icon", "label"],
  },
});
const gestureDirections = ["up", "down", "left", "right"];

const surfaceDefaults = () => ({
  buttonRadius: 12,
  buttonScale: 1,
  cardRadius: 16,
  rowGap: 8,
});

export const defaultUIPreferences = () => ({
  schemaVersion: UI_PREFERENCES_SCHEMA_VERSION,
  revision: 0,
  density: "comfortable",
  fontScale: 1,
  surfaces: Object.fromEntries(
    UI_PREFERENCE_SURFACES.map((surface) => [surface, surfaceDefaults()]),
  ),
  hiddenModules: Object.fromEntries(
    UI_PREFERENCE_SURFACES.map((surface) => [surface, []]),
  ),
  layout: Object.fromEntries(
    UI_PREFERENCE_SURFACES.map((surface) => [
      surface,
      {
        moduleOrder: [...UI_SURFACE_MODULES[surface]],
        buttonSlots: {},
      },
    ]),
  ),
  gestures: {
    "messages.pullToSecondFloor": {
      enabled: true,
      direction: "down",
      distance: 96,
      velocityThreshold: 0.35,
      animationMs: 180,
      action: "openSecondFloor",
    },
    "secondFloor.swipeToExit": {
      enabled: true,
      direction: "up",
      distance: 55,
      velocityThreshold: 0.35,
      animationMs: 160,
      action: "goBack",
    },
    "miao.taskCard.participantsSwipe": {
      enabled: true,
      direction: "right",
      distance: 80,
      velocityThreshold: 0.35,
      animationMs: 230,
      action: "openParticipants",
    },
    "miao.taskCard.detailsSwipe": {
      enabled: true,
      direction: "left",
      distance: 80,
      velocityThreshold: 0.35,
      animationMs: 230,
      action: "openDetails",
    },
  },
  components: Object.fromEntries(
    UI_PREFERENCE_SURFACES.map((surface) => [surface, {}]),
  ),
});

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const fail = (message) => {
  throw new Error(message);
};

const assertInteger = (value, min, max, label) => {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`${label} must be an integer between ${min} and ${max}.`);
  }
};

const assertNumber = (value, min, max, label) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    fail(`${label} must be a number between ${min} and ${max}.`);
  }
};

const assertKnownKeys = (value, keys, label) => {
  if (!isPlainObject(value)) fail(`${label} must be an object.`);
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail(`${label}.${key} is not supported.`);
  }
};

const validateSurfacePatch = (value, label) => {
  assertKnownKeys(
    value,
    ["buttonRadius", "buttonScale", "cardRadius", "rowGap"],
    label,
  );
  if (Object.hasOwn(value, "buttonRadius"))
    assertInteger(value.buttonRadius, 0, 24, `${label}.buttonRadius`);
  if (Object.hasOwn(value, "buttonScale"))
    assertNumber(value.buttonScale, 0.8, 1.3, `${label}.buttonScale`);
  if (Object.hasOwn(value, "cardRadius"))
    assertInteger(value.cardRadius, 0, 28, `${label}.cardRadius`);
  if (Object.hasOwn(value, "rowGap"))
    assertInteger(value.rowGap, 0, 32, `${label}.rowGap`);
};

const validateLayoutPatch = (value, label, { allowHistoricalSlots = false } = {}) => {
  assertKnownKeys(value, ["moduleOrder", "buttonSlots"], label);
  if (Object.hasOwn(value, "moduleOrder")) {
    const surface = label.split(".").at(-1);
    if (!allowHistoricalSlots && UI_ORDERABLE_MODULES[surface].length === 0)
      fail(`${label}.moduleOrder is not supported.`);
    if (
      !Array.isArray(value.moduleOrder) ||
      new Set(value.moduleOrder).size !== value.moduleOrder.length ||
      value.moduleOrder.some(
        (module) =>
          !(allowHistoricalSlots ? UI_SURFACE_MODULES[surface] : UI_ORDERABLE_MODULES[surface])?.includes(module),
      )
    ) {
      fail(`${label}.moduleOrder contains an unsupported module.`);
    }
  }
  if (Object.hasOwn(value, "buttonSlots")) {
    assertKnownKeys(
      value.buttonSlots,
      allowHistoricalSlots
        ? historicalButtonSlotIds[label.split(".").at(-1)] || []
        : Object.keys(UI_BUTTON_LAYOUT_SLOTS[label.split(".").at(-1)] || {}),
      `${label}.buttonSlots`,
    );
    for (const [slot, position] of Object.entries(value.buttonSlots)) {
      const surface = label.split(".").at(-1);
      if (
        !UI_BUTTON_LAYOUT_SLOTS[surface]?.[slot]?.includes(position) &&
        !(allowHistoricalSlots && UI_LAYOUT_SLOTS.includes(position))
      )
        fail(`${label}.buttonSlots.${slot} has an unsupported slot.`);
    }
  }
};

const validateGesturePatch = (value, label, gestureId, { allowHistoricalSlots = false } = {}) => {
  assertKnownKeys(
    value,
    [
      "enabled",
      "direction",
      "distance",
      "velocityThreshold",
      "animationMs",
      "action",
    ],
    label,
  );
  if (Object.hasOwn(value, "enabled") && typeof value.enabled !== "boolean")
    fail(`${label}.enabled must be boolean.`);
  if (
    Object.hasOwn(value, "direction") &&
    !gestureDirections.includes(value.direction)
  )
    fail(`${label}.direction is unsupported.`);
  if (
    Object.hasOwn(value, "direction") &&
    gestureId.startsWith("miao.taskCard.") &&
    !["left", "right"].includes(value.direction)
  )
    fail(`${label}.direction only supports left or right.`);
  if (!allowHistoricalSlots && gestureId === "messages.pullToSecondFloor" &&
      Object.hasOwn(value, "direction") && !["down", "right"].includes(value.direction))
    fail(`${label}.direction only supports down or right to preserve scrolling and chat row swipes.`);
  if (Object.hasOwn(value, "distance"))
    assertInteger(value.distance, 40, 240, `${label}.distance`);
  if (Object.hasOwn(value, "velocityThreshold"))
    assertNumber(value.velocityThreshold, 0.1, 2, `${label}.velocityThreshold`);
  if (Object.hasOwn(value, "animationMs"))
    assertInteger(value.animationMs, 100, 400, `${label}.animationMs`);
  if (
    Object.hasOwn(value, "action") &&
    !UI_REGISTERED_ACTIONS.includes(value.action)
  )
    fail(`${label}.action is not registered.`);
  if (
    Object.hasOwn(value, "action") &&
    UI_GESTURE_ACTIONS[gestureId] !== value.action
  ) {
    fail(`${label}.action does not match the registered gesture action.`);
  }
};

const validateComponentsPatch = (value, label, { allowHistoricalSlots = false } = {}) => {
  assertKnownKeys(value, UI_PREFERENCE_SURFACES, label);
  for (const [surface, components] of Object.entries(value)) {
    assertKnownKeys(
      components,
      UI_COMPONENT_IDS[surface],
      `${label}.${surface}`,
    );
    for (const [component, config] of Object.entries(components)) {
      assertKnownKeys(
        config,
        allowHistoricalSlots ? ["slot", "visible", "order", "sizeScale", "icon", "label"] : UI_COMPONENT_PROPERTIES[surface][component],
        `${label}.${surface}.${component}`,
      );
      if (
        config.slot !== undefined &&
        !UI_COMPONENT_LAYOUT_SLOTS[surface][component].includes(config.slot) &&
        !(allowHistoricalSlots && UI_LAYOUT_SLOTS.includes(config.slot))
      )
        fail(`${label}.${surface}.${component}.slot is unsupported.`);
      if (config.visible !== undefined && typeof config.visible !== "boolean")
        fail(`${label}.${surface}.${component}.visible must be boolean.`);
      if (config.order !== undefined)
        assertInteger(
          config.order,
          0,
          64,
          `${label}.${surface}.${component}.order`,
        );
      if (config.sizeScale !== undefined)
        assertNumber(
          config.sizeScale,
          0.8,
          1.3,
          `${label}.${surface}.${component}.sizeScale`,
        );
      for (const key of ["icon", "label"]) {
        if (
          config[key] !== undefined &&
          (typeof config[key] !== "string" ||
            config[key].length > 40 ||
            /(?:https?:\/\/|javascript:|<\/?[a-z]|[{}])/i.test(config[key]))
        ) {
          fail(`${label}.${surface}.${component}.${key} is invalid.`);
        }
      }
    }
  }
};

export function validateUIPreferencePatch(patch, { allowHistoricalSlots = false } = {}) {
  if (!isPlainObject(patch)) fail("UI preference patch must be an object.");
  assertKnownKeys(
    patch,
    [
      "density",
      "fontScale",
      "surfaces",
      "hiddenModules",
      "layout",
      "gestures",
      "components",
    ],
    "patch",
  );
  if (
    Object.hasOwn(patch, "density") &&
    !UI_PREFERENCE_DENSITIES.includes(patch.density)
  ) {
    fail("patch.density is not supported.");
  }
  if (Object.hasOwn(patch, "fontScale"))
    assertNumber(patch.fontScale, 0.9, 1.2, "patch.fontScale");
  if (Object.hasOwn(patch, "surfaces")) {
    assertKnownKeys(patch.surfaces, UI_PREFERENCE_SURFACES, "patch.surfaces");
    for (const [surface, value] of Object.entries(patch.surfaces))
      validateSurfacePatch(value, `patch.surfaces.${surface}`);
  }
  if (Object.hasOwn(patch, "hiddenModules")) {
    assertKnownKeys(
      patch.hiddenModules,
      UI_PREFERENCE_SURFACES,
      "patch.hiddenModules",
    );
    for (const [surface, modules] of Object.entries(patch.hiddenModules)) {
      if (
        !Array.isArray(modules) ||
        modules.length > 12 ||
        modules.some(
          (module) =>
            typeof module !== "string" ||
            !UI_SURFACE_MODULES[surface].includes(module),
        )
      ) {
        fail(`patch.hiddenModules.${surface} must contain valid module keys.`);
      }
      if (new Set(modules).size !== modules.length)
        fail(`patch.hiddenModules.${surface} contains duplicates.`);
      const protectedModules = UI_PROTECTED_MODULES[surface] || [];
      const protectedModule = !allowHistoricalSlots && modules.find((module) =>
        protectedModules.includes(module),
      );
      if (protectedModule) {
        fail(
          `patch.hiddenModules.${surface}.${protectedModule} is required and cannot be hidden.`,
        );
      }
      if (!allowHistoricalSlots && modules.some(module => !UI_HIDEABLE_MODULES[surface].includes(module)))
        fail(`patch.hiddenModules.${surface} contains a module whose visibility is not supported.`);
    }
  }
  if (Object.hasOwn(patch, "layout")) {
    assertKnownKeys(patch.layout, UI_PREFERENCE_SURFACES, "patch.layout");
    for (const [surface, value] of Object.entries(patch.layout))
      validateLayoutPatch(value, `patch.layout.${surface}`, { allowHistoricalSlots });
  }
  if (Object.hasOwn(patch, "gestures")) {
    assertKnownKeys(patch.gestures, UI_GESTURE_IDS, "patch.gestures");
    for (const [gesture, value] of Object.entries(patch.gestures))
      validateGesturePatch(value, `patch.gestures.${gesture}`, gesture, { allowHistoricalSlots });
  }
  if (Object.hasOwn(patch, "components"))
    validateComponentsPatch(patch.components, "patch.components", { allowHistoricalSlots });
  return structuredClone(patch);
}

export function normalizeStoredUIPreferences(value) {
  if (value === undefined) return defaultUIPreferences();
  if (value === null) fail("Stored UI preferences must be an object.");
  return normalizeUIPreferences(value);
}

export function normalizeUIPreferences(value) {
  const defaults = defaultUIPreferences();
  if (value === null || value === undefined) return defaults;
  if (!isPlainObject(value)) fail("Stored UI preferences must be an object.");
  assertKnownKeys(
    value,
    [
      "schemaVersion",
      "revision",
      "density",
      "fontScale",
      "surfaces",
      "hiddenModules",
      "layout",
      "gestures",
      "components",
    ],
    "uiPreferences",
  );
  if (value.schemaVersion !== UI_PREFERENCES_SCHEMA_VERSION)
    fail("UI preference schema version is unsupported.");
  assertInteger(
    value.revision,
    0,
    Number.MAX_SAFE_INTEGER,
    "uiPreferences.revision",
  );
  const patch = validateUIPreferencePatch({
    ...(Object.hasOwn(value, "density") ? { density: value.density } : {}),
    ...(Object.hasOwn(value, "fontScale")
      ? { fontScale: value.fontScale }
      : {}),
    ...(Object.hasOwn(value, "surfaces") ? { surfaces: value.surfaces } : {}),
    ...(Object.hasOwn(value, "hiddenModules")
      ? { hiddenModules: value.hiddenModules }
      : {}),
    ...(Object.hasOwn(value, "layout") ? { layout: value.layout } : {}),
    ...(Object.hasOwn(value, "gestures") ? { gestures: value.gestures } : {}),
    ...(Object.hasOwn(value, "components")
      ? { components: value.components }
      : {}),
  }, { allowHistoricalSlots: true });
  return applyPatchToNormalized(
    { ...defaults, revision: value.revision },
    patch,
    { allowHistoricalSlots: true },
  );
}

export function applyUIPreferencePatch(current, patch) {
  const normalizedCurrent = normalizeCurrent(current);
  return applyPatchToNormalized(normalizedCurrent, patch);
}

function applyPatchToNormalized(normalizedCurrent, patch, options) {
  const normalizedPatch = validateUIPreferencePatch(patch, options);
  const next = structuredClone(normalizedCurrent);
  if (Object.hasOwn(normalizedPatch, "density"))
    next.density = normalizedPatch.density;
  if (Object.hasOwn(normalizedPatch, "fontScale"))
    next.fontScale = normalizedPatch.fontScale;
  for (const surface of UI_PREFERENCE_SURFACES) {
    if (normalizedPatch.surfaces?.[surface])
      next.surfaces[surface] = {
        ...next.surfaces[surface],
        ...normalizedPatch.surfaces[surface],
      };
    if (normalizedPatch.hiddenModules?.[surface])
      next.hiddenModules[surface] = [...normalizedPatch.hiddenModules[surface]];
    if (normalizedPatch.layout?.[surface]) {
      const layout = normalizedPatch.layout[surface];
      next.layout[surface] = {
        ...next.layout[surface],
        ...(layout.moduleOrder ? { moduleOrder: [...layout.moduleOrder] } : {}),
        ...(layout.buttonSlots
          ? {
              buttonSlots: {
                ...next.layout[surface].buttonSlots,
                ...layout.buttonSlots,
              },
            }
          : {}),
      };
    }
  }
  if (normalizedPatch.gestures) {
    for (const [gesture, value] of Object.entries(normalizedPatch.gestures))
      next.gestures[gesture] = { ...next.gestures[gesture], ...value };
  }
  const participants = next.gestures["miao.taskCard.participantsSwipe"];
  const details = next.gestures["miao.taskCard.detailsSwipe"];
  if (
    participants.enabled &&
    details.enabled &&
    participants.direction === details.direction
  ) {
    fail(
      "patch.gestures.miao.taskCard.participantsSwipe and detailsSwipe must use different directions.",
    );
  }
  if (normalizedPatch.components) {
    for (const surface of UI_PREFERENCE_SURFACES) {
      for (const [component, value] of Object.entries(
        normalizedPatch.components[surface] || {},
      )) {
        next.components[surface][component] = {
          ...next.components[surface][component],
          ...value,
        };
      }
    }
  }
  if (!options?.allowHistoricalSlots) assertSecondFloorReachable(next);
  return next;
}

function assertSecondFloorReachable(preferences) {
  const entrance = preferences.gestures["messages.pullToSecondFloor"];
  // RN shows an independent, ordinary button when its entrance gesture is
  // disabled. It does not depend on the new-thread control or VoiceOver.
  const accessibleEntrance = preferences.components.messages["xun.threadList.openSecondFloor"]?.visible !== false;
  if (!(entrance.enabled && ["down", "right"].includes(entrance.direction)) && !accessibleEntrance)
    fail("The second floor must remain reachable through a gesture or visible button.");
}

/** Inspect historical, readable values without changing them or exposing data. */
export function unsupportedUIPreferencePaths(value) {
  const preferences = normalizeUIPreferences(value);
  const defaults = defaultUIPreferences();
  const unsupported = [];
  for (const surface of UI_PREFERENCE_SURFACES) {
    if (preferences.hiddenModules[surface].some(module => !UI_HIDEABLE_MODULES[surface].includes(module)))
      unsupported.push(`hiddenModules.${surface}`);
    const order = preferences.layout[surface].moduleOrder;
    // Schema-one defaults contained virtual modules. Only changed ordering
    // needs remediation; unchanged defaults do not claim a new capability.
    if (JSON.stringify(order) !== JSON.stringify(defaults.layout[surface].moduleOrder)) {
      try { validateLayoutPatch({ moduleOrder: order }, `layout.${surface}`); }
      catch { unsupported.push(`layout.${surface}.moduleOrder`); }
    }
    for (const [button, slot] of Object.entries(preferences.layout[surface].buttonSlots)) {
      if (!UI_BUTTON_LAYOUT_SLOTS[surface]?.[button]?.includes(slot))
        unsupported.push(`layout.${surface}.buttonSlots.${button}`);
    }
    for (const [component, config] of Object.entries(preferences.components[surface])) {
      try { validateComponentsPatch({ [surface]: { [component]: config } }, "components"); }
      catch { unsupported.push(`components.${surface}.${component}`); }
    }
  }
  for (const [gesture, config] of Object.entries(preferences.gestures)) {
    try { validateGesturePatch(config, `gestures.${gesture}`, gesture); }
    catch { unsupported.push(`gestures.${gesture}`); }
  }
  try { assertSecondFloorReachable(preferences); }
  catch { unsupported.push("secondFloor.entrance"); }
  return unsupported;
}

function normalizeCurrent(value) {
  if (value === null || value === undefined) return defaultUIPreferences();
  return normalizeUIPreferences(value);
}

export function sanitizeUIPreferencePatch(patch) {
  return validateUIPreferencePatch(patch);
}
