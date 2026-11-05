import {
  componentUIPreference,
  defaultUIPreferences,
  gestureUIPreference,
  isUIModuleVisible,
  mergeUIPreferences,
  orderedUIModules,
  orderedUIComponents,
  uiButtonSlot,
  uiDensityFactor,
  uiFontSize,
  uiRowGap,
} from '../src/features/ui/uiPreferences';

describe('UI preference session contract', () => {
  it('merges confirmed semantic tokens, components and gestures by revision', () => {
    const current = defaultUIPreferences();
    const next = {
      ...current,
      revision: 3,
      surfaces: {
        ...current.surfaces,
        miao: { ...current.surfaces.miao, cardRadius: 24 },
      },
      components: {
        ...current.components,
        miao: {
          'miao.taskCard.details': { slot: 'topRight' as const, visible: true },
        },
      },
      gestures: {
        ...current.gestures,
        'secondFloor.swipeToExit': {
          ...current.gestures['secondFloor.swipeToExit']!,
          distance: 72,
        },
      },
    };
    const merged = mergeUIPreferences(current, next);
    expect(merged.revision).toBe(3);
    expect(merged.surfaces.miao.cardRadius).toBe(24);
    expect(merged.components.miao?.['miao.taskCard.details']?.slot).toBe(
      'topRight',
    );
    expect(merged.gestures['secondFloor.swipeToExit']?.distance).toBe(72);
  });

  it('reads only registered component ids', () => {
    const preferences = defaultUIPreferences();
    preferences.components = {
      messages: {
        'xun.threadList.newThread': {
          visible: false,
          label: '新建',
        },
        'messages.unknown': { visible: false, label: '不应读取' },
      },
    };

    expect(
      componentUIPreference(
        preferences,
        'messages',
        'xun.threadList.newThread',
      ),
    ).toEqual({ visible: false, label: '新建' });
    expect(
      componentUIPreference(preferences, 'messages', 'messages.unknown'),
    ).toEqual({});
    expect(
      componentUIPreference(preferences, 'miao', 'messages.unknown'),
    ).toEqual({});
    expect(
      componentUIPreference(undefined, 'messages', 'xun.threadList.newThread'),
    ).toEqual({});
  });

  it('treats hidden modules as explicit visibility while preserving defaults', () => {
    const preferences = defaultUIPreferences();
    preferences.hiddenModules.messages = ['taskInbox'];

    expect(isUIModuleVisible(preferences, 'messages', 'tabs')).toBe(true);
    expect(isUIModuleVisible(preferences, 'messages', 'taskInbox')).toBe(false);
    expect(isUIModuleVisible(undefined, 'messages', 'taskInbox')).toBe(true);
    expect(isUIModuleVisible(preferences, 'messages', 'unregistered')).toBe(
      true,
    );
  });

  it('keeps second-floor navigation and permissions visible', () => {
    const preferences = defaultUIPreferences();
    preferences.hiddenModules.secondFloor = ['toolTray', 'permissions'];

    expect(isUIModuleVisible(preferences, 'secondFloor', 'toolTray')).toBe(
      true,
    );
    expect(isUIModuleVisible(preferences, 'secondFloor', 'permissions')).toBe(
      true,
    );
  });

  it('orders only registered modules and appends missing modules safely', () => {
    const preferences = defaultUIPreferences();
    preferences.layout.messages.moduleOrder = ['composer', 'unknown', 'tabs'];

    expect(
      orderedUIModules(preferences, 'messages', [
        'tabs',
        'threadList',
        'composer',
        'taskInbox',
      ]),
    ).toEqual(['composer', 'tabs', 'threadList', 'taskInbox']);
    expect(
      orderedUIModules(undefined, 'messages', ['tabs', 'threadList']),
    ).toEqual(['tabs', 'threadList']);
  });

  it('uses gesture defaults and applies only supplied fields', () => {
    const preferences = defaultUIPreferences();
    preferences.gestures['secondFloor.swipeToExit'] = {
      ...preferences.gestures['secondFloor.swipeToExit']!,
      enabled: false,
      direction: 'left',
      distance: 120,
    };

    expect(
      gestureUIPreference(preferences, 'secondFloor.swipeToExit'),
    ).toMatchObject({
      enabled: false,
      direction: 'left',
      distance: 120,
      velocityThreshold: 0.35,
      animationMs: 160,
      action: 'goBack',
    });
    expect(
      gestureUIPreference(undefined, 'messages.pullToSecondFloor'),
    ).toMatchObject({
      enabled: true,
      direction: 'down',
      distance: 96,
      velocityThreshold: 0.35,
      animationMs: 180,
      action: 'openSecondFloor',
    });
  });

  it('keeps button scale in the semantic surface token', () => {
    const preferences = defaultUIPreferences();
    expect(preferences.surfaces.messages.buttonScale).toBe(1);
    expect(preferences.surfaces.miao.buttonScale).toBe(1);
    expect(preferences.surfaces.secondFloor.buttonScale).toBe(1);
  });

  it('consumes bounded density, font and row-gap values', () => {
    const preferences = defaultUIPreferences();
    preferences.density = 'spacious';
    preferences.fontScale = 1.2;
    preferences.surfaces.miao.rowGap = 12;

    expect(uiDensityFactor(preferences.density)).toBe(1.14);
    expect(uiRowGap(preferences, 'miao')).toBe(14);
    expect(uiFontSize(preferences, 15)).toBe(18);
    expect(uiFontSize(undefined, 15)).toBe(15);
  });

  it('resolves fixed slots and component order without arbitrary coordinates', () => {
    const preferences = defaultUIPreferences();
    preferences.layout.messages.buttonSlots.newAction = 'headerRight';
    preferences.components = {
      miao: {
        'miao.taskCard.details': { order: 0 },
        'miao.taskCard.participants': { order: 1 },
      },
    };

    expect(uiButtonSlot(preferences, 'messages', 'newAction')).toBe(
      'headerRight',
    );
    expect(
      orderedUIComponents(preferences, 'miao', [
        'miao.taskCard.participants',
        'miao.taskCard.details',
      ]),
    ).toEqual(['miao.taskCard.details', 'miao.taskCard.participants']);
  });
});
