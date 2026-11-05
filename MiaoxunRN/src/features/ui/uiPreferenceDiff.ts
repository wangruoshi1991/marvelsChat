import type {
  UIGestureId,
  UIPreferencePreviewDTO,
  UIPreferenceSurface,
  UIPreferences,
} from './uiPreferenceTypes';

export type UIPreferenceChange = {
  path: string;
  before: unknown;
  after: unknown;
};

const surfaces: UIPreferenceSurface[] = ['messages', 'miao', 'secondFloor'];

const gestureIds: UIGestureId[] = [
  'messages.pullToSecondFloor',
  'secondFloor.swipeToExit',
  'miao.taskCard.participantsSwipe',
  'miao.taskCard.detailsSwipe',
];

const sameValue = (left: unknown, right: unknown) => {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return left === right;
  }
};

const addChange = (
  changes: UIPreferenceChange[],
  path: string,
  before: unknown,
  after: unknown,
) => {
  if (!sameValue(before, after)) changes.push({ path, before, after });
};

/**
 * Creates a reviewable before/after summary from the server preview. The
 * server remains the authority; this helper only reads the already validated
 * patch and never applies it locally.
 */
export function describeUIPreferenceChanges(
  current: UIPreferences,
  preview: UIPreferencePreviewDTO,
): UIPreferenceChange[] {
  const changes: UIPreferenceChange[] = [];
  // The API snapshot is authoritative for the preview. The session may have
  // advanced while the model request was running, so never show a stale local
  // value as the "before" side of a confirmation.
  const before = preview.beforePreferences || current;
  const patch = preview.patch || {};

  if (Object.prototype.hasOwnProperty.call(patch, 'density')) {
    addChange(changes, 'density', before.density, preview.preferences.density);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'fontScale')) {
    addChange(
      changes,
      'fontScale',
      before.fontScale,
      preview.preferences.fontScale,
    );
  }

  for (const surface of surfaces) {
    const surfacePatch = patch.surfaces?.[surface];
    if (surfacePatch) {
      for (const key of Object.keys(surfacePatch) as Array<
        keyof UIPreferences['surfaces'][UIPreferenceSurface]
      >) {
        addChange(
          changes,
          `${surface}.${String(key)}`,
          before.surfaces[surface][key],
          preview.preferences.surfaces[surface][key],
        );
      }
    }

    const layoutPatch = patch.layout?.[surface];
    if (layoutPatch?.moduleOrder) {
      addChange(
        changes,
        `${surface}.moduleOrder`,
        before.layout[surface].moduleOrder,
        preview.preferences.layout[surface].moduleOrder,
      );
    }
    for (const slot of Object.keys(layoutPatch?.buttonSlots || {})) {
      addChange(
        changes,
        `${surface}.buttonSlots.${slot}`,
        before.layout[surface].buttonSlots[slot] ?? 'default',
        preview.preferences.layout[surface].buttonSlots[slot] ?? 'default',
      );
    }

    const hiddenPatch = patch.hiddenModules?.[surface];
    if (hiddenPatch) {
      addChange(
        changes,
        `${surface}.hiddenModules`,
        before.hiddenModules[surface],
        preview.preferences.hiddenModules[surface],
      );
    }

    const componentPatch = patch.components?.[surface] || {};
    for (const [componentId, component] of Object.entries(componentPatch)) {
      for (const key of Object.keys(component)) {
        addChange(
          changes,
          `${surface}.components.${componentId}.${key}`,
          before.components[surface]?.[componentId]?.[
            key as keyof NonNullable<
              UIPreferences['components'][UIPreferenceSurface]
            >[string]
          ],
          preview.preferences.components[surface]?.[componentId]?.[
            key as keyof NonNullable<
              UIPreferences['components'][UIPreferenceSurface]
            >[string]
          ],
        );
      }
    }
  }

  for (const gestureId of gestureIds) {
    const gesturePatch = patch.gestures?.[gestureId];
    if (!gesturePatch) continue;
    for (const key of Object.keys(gesturePatch)) {
      addChange(
        changes,
        `${gestureId}.${key}`,
        before.gestures[gestureId]?.[
          key as keyof NonNullable<UIPreferences['gestures'][UIGestureId]>
        ],
        preview.preferences.gestures[gestureId]?.[
          key as keyof NonNullable<UIPreferences['gestures'][UIGestureId]>
        ],
      );
    }
  }

  return changes;
}

export function formatUIPreferenceValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'default';
  if (Array.isArray(value)) return value.join(' → ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
