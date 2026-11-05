import {
  UIGestureId,
  UIGesturePreference,
  UIComponentPreference,
  UIPreferenceSurface,
  UIPreferences,
  UILayoutSlot,
} from './uiPreferenceTypes';

const registeredComponentIds: Record<UIPreferenceSurface, readonly string[]> = {
  messages: ['xun.threadList.newThread', 'xun.threadList.openSecondFloor'],
  miao: ['miao.taskCard.details', 'miao.taskCard.participants'],
  secondFloor: ['secondFloor.album.upload', 'secondFloor.file.upload'],
};

// Keep navigation and permission controls reachable even if a stale or
// malicious client state contains an invalid hiddenModules entry. The server
// contract rejects these patches; this renderer guard protects the live UI
// until a fresh bootstrap replaces the state.
const protectedModules: Record<UIPreferenceSurface, readonly string[]> = {
  messages: ['tabs'],
  miao: [],
  secondFloor: ['toolTray', 'permissions'],
};

export const defaultUIPreferences = (): UIPreferences => ({
  schemaVersion: 1,
  revision: 0,
  density: 'comfortable',
  fontScale: 1,
  surfaces: {
    messages: { buttonRadius: 12, buttonScale: 1, cardRadius: 16, rowGap: 8 },
    miao: { buttonRadius: 12, buttonScale: 1, cardRadius: 16, rowGap: 8 },
    secondFloor: {
      buttonRadius: 12,
      buttonScale: 1,
      cardRadius: 16,
      rowGap: 8,
    },
  },
  hiddenModules: { messages: [], miao: [], secondFloor: [] },
  layout: {
    messages: {
      moduleOrder: ['tabs', 'threadList', 'composer', 'voiceDock', 'taskInbox'],
      buttonSlots: {},
    },
    miao: {
      moduleOrder: ['profileHeader', 'agentList', 'taskFeed', 'navigation'],
      buttonSlots: {},
    },
    secondFloor: {
      moduleOrder: [
        'toolTray',
        'albums',
        'files',
        'relationships',
        'assets',
        'information',
        'permissions',
      ],
      buttonSlots: {},
    },
  },
  components: {},
  gestures: {
    'messages.pullToSecondFloor': {
      enabled: true,
      direction: 'down',
      distance: 96,
      velocityThreshold: 0.35,
      animationMs: 180,
      action: 'openSecondFloor',
    },
    'secondFloor.swipeToExit': {
      enabled: true,
      direction: 'up',
      // The fixed return affordance and measured-bottom page scrollers share
      // the prototype's short swipe threshold.
      distance: 55,
      velocityThreshold: 0.35,
      animationMs: 160,
      action: 'goBack',
    },
    'miao.taskCard.participantsSwipe': {
      enabled: true,
      direction: 'right',
      distance: 80,
      velocityThreshold: 0.35,
      animationMs: 230,
      action: 'openParticipants',
    },
    'miao.taskCard.detailsSwipe': {
      enabled: true,
      direction: 'left',
      distance: 80,
      velocityThreshold: 0.35,
      animationMs: 230,
      action: 'openDetails',
    },
  },
});

export function mergeUIPreferences(
  current: UIPreferences,
  next: UIPreferences,
): UIPreferences {
  const merged = defaultUIPreferences();
  merged.revision = next.revision;
  merged.density = next.density;
  merged.fontScale = next.fontScale;
  (Object.keys(merged.surfaces) as UIPreferenceSurface[]).forEach(surface => {
    merged.surfaces[surface] = {
      ...current.surfaces[surface],
      ...next.surfaces[surface],
    };
    merged.hiddenModules[surface] = [
      ...(next.hiddenModules[surface] || current.hiddenModules[surface] || []),
    ];
    merged.layout[surface] = {
      ...current.layout[surface],
      ...next.layout[surface],
      buttonSlots: {
        ...current.layout[surface].buttonSlots,
        ...next.layout[surface].buttonSlots,
      },
    };
  });
  merged.components = { ...current.components, ...next.components };
  merged.gestures = { ...current.gestures, ...next.gestures };
  return merged;
}

export const UI_DENSITY_FACTORS: Record<UIPreferences['density'], number> = {
  compact: 0.88,
  comfortable: 1,
  spacious: 1.14,
};

export function uiDensityFactor(
  density: UIPreferences['density'] | undefined,
): number {
  return UI_DENSITY_FACTORS[density || 'comfortable'];
}

/** Resolve a bounded spacing value from server-confirmed semantic tokens. */
export function uiRowGap(
  preferences: UIPreferences | undefined,
  surface: UIPreferenceSurface,
  base = 8,
): number {
  const configured = preferences?.surfaces?.[surface]?.rowGap;
  const rowGap =
    typeof configured === 'number' && Number.isFinite(configured)
      ? configured
      : base;
  return Math.max(
    0,
    Math.min(32, Math.round(rowGap * uiDensityFactor(preferences?.density))),
  );
}

/** Scale registered text only; model output never reaches a style object. */
export function uiFontSize(
  preferences: UIPreferences | undefined,
  base: number,
): number {
  const scale = preferences?.fontScale ?? 1;
  return Math.max(base * 0.8, Math.min(base * 1.35, base * scale));
}

export function uiButtonSlot(
  preferences: UIPreferences | undefined,
  surface: UIPreferenceSurface,
  buttonId: string,
  componentId?: string,
): UILayoutSlot | undefined {
  const componentSlot = componentId
    ? componentUIPreference(preferences, surface, componentId).slot
    : undefined;
  const configured = preferences?.layout?.[surface]?.buttonSlots?.[buttonId];
  return (componentSlot || configured) as UILayoutSlot | undefined;
}

/** Stable ordering for fixed registered controls; unknown ids are ignored. */
export function orderedUIComponents(
  preferences: UIPreferences | undefined,
  surface: UIPreferenceSurface,
  componentIds: readonly string[],
): string[] {
  const ids = new Set(componentIds);
  const order = new Map(
    componentIds.map((id, index) => [
      id,
      preferences?.components?.[surface]?.[id]?.order ?? index,
    ]),
  );
  return [...ids].sort((left, right) => {
    const byOrder = (order.get(left) ?? 0) - (order.get(right) ?? 0);
    return byOrder || componentIds.indexOf(left) - componentIds.indexOf(right);
  });
}

export function surfaceUIPreferences(
  preferences: UIPreferences,
  surface: UIPreferenceSurface,
) {
  return {
    ...preferences.surfaces[surface],
    density: preferences.density,
    fontScale: preferences.fontScale,
  };
}

/**
 * Read a registered component preference without letting an unknown id leak
 * into a renderer. The backend contract is the source of truth; this helper
 * only provides a typed, explicit client read path for the fixed catalog.
 */
export function componentUIPreference(
  preferences: UIPreferences | undefined,
  surface: UIPreferenceSurface,
  componentId: string,
): UIComponentPreference {
  if (!registeredComponentIds[surface].includes(componentId)) {
    return {};
  }
  return preferences?.components?.[surface]?.[componentId] || {};
}

export function isUIModuleVisible(
  preferences: UIPreferences | undefined,
  surface: UIPreferenceSurface,
  moduleId: string,
) {
  if (protectedModules[surface].includes(moduleId)) {
    return true;
  }
  return !(preferences?.hiddenModules?.[surface] || []).includes(moduleId);
}

/** Keep the server-provided order but append newly registered modules safely. */
export function orderedUIModules(
  preferences: UIPreferences | undefined,
  surface: UIPreferenceSurface,
  registered: readonly string[],
) {
  const configured = preferences?.layout?.[surface]?.moduleOrder || [];
  const order = new Map(configured.map((key, index) => [key, index]));
  return [...registered].sort(
    (left, right) =>
      (order.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function gestureUIPreference(
  preferences: UIPreferences | undefined,
  gestureId: UIGestureId,
): UIGesturePreference {
  const defaults = defaultUIPreferences().gestures[gestureId];
  return {
    ...(defaults as UIGesturePreference),
    ...(preferences?.gestures?.[gestureId] || {}),
  };
}
