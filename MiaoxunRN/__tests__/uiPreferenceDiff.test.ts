import { defaultUIPreferences } from '../src/features/ui/uiPreferences';
import {
  describeUIPreferenceChanges,
  formatUIPreferenceValue,
} from '../src/features/ui/uiPreferenceDiff';
import type { UIPreferencePreviewDTO } from '../src/features/ui/uiPreferenceTypes';

const previewFor = (
  patch: UIPreferencePreviewDTO['patch'],
  preferences: UIPreferencePreviewDTO['preferences'],
): UIPreferencePreviewDTO => ({
  id: 'preview-1',
  status: 'pending',
  baseRevision: 0,
  expiresAt: '2026-11-04T00:00:00.000Z',
  patch,
  beforePreferences: defaultUIPreferences(),
  preferences,
  intent: '调整界面',
  rationale: '测试预览',
  affectedSurfaces: ['miao'],
});

describe('UI preference preview diff', () => {
  it('reports semantic values, button slots and gesture directions', () => {
    const current = defaultUIPreferences();
    const next = defaultUIPreferences();
    next.fontScale = 1.1;
    next.layout.miao.buttonSlots = { agentEntry: 'topRight' };
    next.components.miao = {
      'miao.taskCard.details': { slot: 'headerRight', order: 2 },
    };
    next.gestures['miao.taskCard.detailsSwipe'] = {
      ...next.gestures['miao.taskCard.detailsSwipe']!,
      direction: 'up',
    };

    const changes = describeUIPreferenceChanges(
      current,
      previewFor(
        {
          fontScale: 1.1,
          layout: { miao: { buttonSlots: { agentEntry: 'topRight' } } },
          components: {
            miao: {
              'miao.taskCard.details': { slot: 'headerRight', order: 2 },
            },
          },
          gestures: {
            'miao.taskCard.detailsSwipe': { direction: 'up' },
          },
        } as unknown as UIPreferencePreviewDTO['patch'],
        next,
      ),
    );

    expect(changes).toEqual(
      expect.arrayContaining([
        { path: 'fontScale', before: 1, after: 1.1 },
        {
          path: 'miao.buttonSlots.agentEntry',
          before: 'default',
          after: 'topRight',
        },
        {
          path: 'miao.components.miao.taskCard.details.slot',
          before: undefined,
          after: 'headerRight',
        },
        {
          path: 'miao.taskCard.detailsSwipe.direction',
          before: 'left',
          after: 'up',
        },
      ]),
    );
  });

  it('does not show unchanged values and formats arrays for review', () => {
    const current = defaultUIPreferences();
    const preview = previewFor({ fontScale: 1 }, { ...current, fontScale: 1 });

    expect(describeUIPreferenceChanges(current, preview)).toEqual([]);
    expect(formatUIPreferenceValue(['tabs', 'composer'])).toBe(
      'tabs → composer',
    );
    expect(formatUIPreferenceValue(undefined)).toBe('default');
  });

  it('uses the server snapshot as the before value when the session moved on', () => {
    const serverBefore = defaultUIPreferences();
    const serverAfter = defaultUIPreferences();
    serverAfter.fontScale = 1.1;
    const current = { ...serverBefore, fontScale: 1.2 };
    const changes = describeUIPreferenceChanges(current, {
      ...previewFor({ fontScale: 1.1 }, serverAfter),
      beforePreferences: serverBefore,
    });

    expect(changes).toContainEqual({
      path: 'fontScale',
      before: 1,
      after: 1.1,
    });
  });
});
