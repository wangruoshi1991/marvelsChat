import React from 'react';
import {
  AccessibilityInfo,
  AppState,
  AppStateStatus,
  PanResponder,
  Text,
} from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  VoiceShortcutDock,
  voiceShortcutActionAt,
} from '../src/features/agents/VoiceShortcutDock';
import {
  startSpeechRecognition,
  prepareSpeechRecognition,
  SpeechRecognitionUpdate,
} from '../src/services/speechToText';
import { palettes } from '../src/shared/theme';

jest.mock('../src/services/speechToText', () => ({
  startSpeechRecognition: jest.fn(),
  prepareSpeechRecognition: jest.fn(),
}));
const startSpeech = jest.mocked(startSpeechRecognition);
const prepareSpeech = jest.mocked(prepareSpeechRecognition);
let renderer: TestRenderer.ReactTestRenderer;
let stateChange: (state: AppStateStatus) => void;
const compose = jest.fn();
const butler = jest.fn();
const feed = jest.fn();
const expanded = jest.fn();
let update: (value: SpeechRecognitionUpdate) => void;
let resolve: (text: string) => void;
let reject: (reason: Error) => void;
let finish: jest.Mock;
let cancel: jest.Mock;
const props = {
  palette: palettes.light,
  language: 'zh' as const,
  onCompose: compose,
  onOpenButler: butler,
  onToggleFeed: feed,
  onExpandedChange: expanded,
};
const trigger = () =>
  renderer.root.findAll(
    node => typeof node.props.onPanResponderGrant === 'function',
  )[0];
const action = (label: string) =>
  renderer.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
const text = () =>
  renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .join(' ');
const hold = (locationX = 26, locationY = 26) =>
  act(() => {
    trigger().props.onPanResponderGrant({
      nativeEvent: { locationX, locationY },
    });
    jest.advanceTimersByTime(480);
  });
const move = (dx: number, dy: number) =>
  act(() => trigger().props.onPanResponderMove({}, { dx, dy }));
const release = (dx?: number, dy?: number) =>
  act(() => trigger().props.onPanResponderRelease({}, { dx, dy }));
const listening = () =>
  act(() =>
    update({ requestId: 'current', state: 'listening', text: '整理周末照片' }),
  );

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest
    .spyOn(PanResponder, 'create')
    .mockImplementation(
      config =>
        ({ panHandlers: config } as unknown as ReturnType<
          typeof PanResponder.create
        >),
    );
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    stateChange = listener;
    return { remove: jest.fn() };
  });
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  finish = jest.fn();
  cancel = jest.fn();
  startSpeech.mockImplementation((_, callback) => {
    update = callback!;
    return {
      result: new Promise<string>((done, fail) => {
        resolve = done;
        reject = fail;
      }),
      finish,
      cancel,
    };
  });
  // The dock now reads the system "reduce motion" preference through a shared
  // hook that starts disabled and enables motion once the read resolves, so the
  // mount has to flush that promise inside `act`.
  await act(async () => {
    renderer = TestRenderer.create(<VoiceShortcutDock {...props} />);
  });
});
afterEach(() => {
  act(() => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('short tap does not expose the shortcuts or start speech', () => {
  expect(trigger().props.accessibilityHint).toContain(
    '轻点仅关闭已展开的快捷入口',
  );
  act(() => trigger().props.onAccessibilityTap());
  expect(expanded).not.toHaveBeenCalledWith(true);
  act(() => trigger().props.onPanResponderGrant());
  release();
  expect(startSpeech).not.toHaveBeenCalled();
  expect(action('切换到键盘')).toBeUndefined();
  expect(action('打开妙管家')).toBeUndefined();
  expect(action('切换到瀑布')).toBeUndefined();
  expect(expanded).not.toHaveBeenCalledWith(true);
});

test('a long hold exposes the three shortcuts', () => {
  hold();
  expect(startSpeech).toHaveBeenCalledTimes(1);
  expect(action('切换到键盘')).toBeDefined();
  expect(action('打开妙管家')).toBeDefined();
  expect(action('切换到瀑布')).toBeDefined();
  expect(
    renderer.root.findAllByProps({ testID: 'voice-menu-backdrop' }),
  ).toHaveLength(0);
  expect(
    renderer.root.findByProps({ testID: 'voice-trigger-halo' }),
  ).toBeDefined();
});

test('long press prepares, receives real partials, and release in place cancels without navigation', async () => {
  hold();
  expect(text()).toContain('正在准备麦克风');
  expect(text()).not.toContain('正在听');
  expect(expanded).toHaveBeenLastCalledWith(true);
  listening();
  expect(text()).toContain('整理周末照片');
  release();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(expanded).toHaveBeenLastCalledWith(false);
  await act(async () => resolve('迟到的识别结果'));
  expect(compose).not.toHaveBeenCalled();
  expect(butler).not.toHaveBeenCalled();
  expect(text()).not.toContain('迟到');
});

test.each([
  ['keyboard', 0, -64],
  ['butler', -64, 0],
] as const)(
  'slide to %s waits for a transcription before delivering editable text once',
  async (target, dx, dy) => {
    hold();
    listening();
    move(dx, dy);
    release();
    expect(expanded).toHaveBeenLastCalledWith(false);
    expect(action('切换到键盘')).toBeUndefined();
    expect(finish).toHaveBeenCalledTimes(1);
    expect(compose).not.toHaveBeenCalled();
    expect(butler).not.toHaveBeenCalled();
    await act(async () => resolve('整理周末照片并做一本相册'));
    expect(target === 'keyboard' ? compose : butler).toHaveBeenCalledWith(
      '整理周末照片并做一本相册',
    );
    expect(target === 'keyboard' ? butler : compose).not.toHaveBeenCalled();
    expect(expanded).toHaveBeenLastCalledWith(false);
  },
);

test('slide to feed cancels audio and changes only task presentation', async () => {
  hold();
  listening();
  move(0, 64);
  release();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(feed).toHaveBeenCalledTimes(1);
  await act(async () => resolve('discarded'));
  expect(compose).not.toHaveBeenCalled();
  expect(butler).not.toHaveBeenCalled();
});

test('release while system permission is pending cancels and ignores its late event', async () => {
  hold();
  release();
  act(() =>
    update({ requestId: 'current', state: 'listening', text: '不应进入' }),
  );
  await act(async () => resolve('不应进入'));
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(expanded).toHaveBeenLastCalledWith(false);
  expect(text()).not.toContain('不应进入');
  expect(compose).not.toHaveBeenCalled();
});

test('release collapses shortcuts while a native error stays explicit and a new hold can reopen them', async () => {
  hold();
  await act(async () => reject(new Error('未获得麦克风权限。')));
  release();
  expect(text()).toContain('未获得麦克风权限。');
  expect(expanded).toHaveBeenLastCalledWith(false);
  expect(action('切换到键盘')).toBeUndefined();
  hold();
  act(() => action('切换到键盘').props.onPress());
  expect(compose).toHaveBeenCalledWith(undefined);
});

test('a fast release selects its actual destination without an intermediate move', async () => {
  hold();
  listening();
  release(0, -64);
  expect(finish).toHaveBeenCalledTimes(1);
  expect(expanded).toHaveBeenLastCalledWith(false);
  release(0, -64);
  expect(finish).toHaveBeenCalledTimes(1);
  await act(async () => resolve('快速手势草稿'));
  expect(compose).toHaveBeenCalledTimes(1);
  expect(compose).toHaveBeenCalledWith('快速手势草稿');
});

test('a release back at the trigger cancels even when the last move was over a shortcut', async () => {
  hold();
  listening();
  move(0, -64);
  release(0, 0);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(finish).not.toHaveBeenCalled();
  await act(async () => resolve('不应带入'));
  expect(compose).not.toHaveBeenCalled();
});

test.each([
  [26, 0],
  [0, 26],
  [26, 52],
  [52, 26],
])(
  'a stationary hold at trigger edge %s,%s cancels instead of selecting a nearby shortcut',
  async (x, y) => {
    hold(x, y);
    listening();
    release(0, 0);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(finish).not.toHaveBeenCalled();
    expect(expanded).toHaveBeenLastCalledWith(false);
    await act(async () => resolve('不应带入'));
    expect(compose).not.toHaveBeenCalled();
    expect(butler).not.toHaveBeenCalled();
    expect(feed).not.toHaveBeenCalled();
  },
);

test('selection stays aligned with the visible button when the initial touch is off centre', async () => {
  hold(6, 6);
  listening();
  // Starting 20 points above and left of the trigger requires a 60pt move
  // to reach the new 80pt-separated keyboard option center.
  release(20, -60);
  expect(finish).toHaveBeenCalledTimes(1);
  await act(async () => resolve('对准按钮'));
  expect(compose).toHaveBeenCalledWith('对准按钮');
});

test('the final recognition state ignores a late native update after failure', async () => {
  hold();
  await act(async () => reject(new Error('识别失败')));
  release();
  act(() =>
    update({ requestId: 'current', state: 'listening', text: '迟到内容' }),
  );
  expect(text()).toContain('识别失败');
  expect(text()).not.toContain('迟到内容');
  expect(expanded).toHaveBeenLastCalledWith(false);
});

test('releasing twice in place cannot reopen a completed hold', () => {
  hold();
  release();
  release();
  expect(expanded.mock.calls.map(([value]) => value)).toEqual([true, false]);
  expect(action('切换到键盘')).toBeUndefined();
});

test('short dragging without a move event does not open shortcuts on release', () => {
  act(() => trigger().props.onPanResponderGrant());
  release(0, 30);
  expect(startSpeech).not.toHaveBeenCalled();
  expect(expanded).not.toHaveBeenCalledWith(true);
});

test('reduce motion closes the visual menu immediately while keeping a new hold usable', async () => {
  jest
    .mocked(AccessibilityInfo.isReduceMotionEnabled)
    .mockResolvedValueOnce(true);
  await act(async () =>
    renderer.update(<VoiceShortcutDock {...props} key="reduced-motion" />),
  );
  hold();
  expect(action('切换到键盘')).toBeDefined();
  release();
  expect(
    renderer.root.findAllByProps({ accessibilityLabel: '切换到键盘' }),
  ).toHaveLength(0);
  hold();
  expect(action('切换到键盘')).toBeDefined();
});

test('closing buttons stop accepting touches and a new hold survives the previous exit animation', () => {
  hold();
  act(() => jest.advanceTimersByTime(300));
  release();
  expect(action('切换到键盘')).toBeUndefined();
  const closingButtons = renderer.root.findAllByProps({
    accessibilityLabel: '切换到键盘',
  });
  expect(
    closingButtons.every(button => button.props.accessibilityState.disabled),
  ).toBe(true);
  act(() => jest.advanceTimersByTime(70));
  hold();
  act(() => jest.advanceTimersByTime(300));
  expect(action('切换到键盘')).toBeDefined();
  expect(expanded).toHaveBeenLastCalledWith(true);
});

test('xun shares the compact target geometry and opens tasks without starting audio', () => {
  act(() => renderer.update(<VoiceShortcutDock {...props} tone="xun" />));
  expect(trigger().props.accessibilityLabel).toBe('打开语音快捷菜单');
  expect(trigger().props.accessibilityActions[0].label).toBe('打开语音菜单');
  hold();
  // The visible V15 labels are 语音 / 未读 / 规划; the action lookup keeps
  // the longer accessibility label so VoiceOver still explains each action.
  expect(action('替我规划')).toBeDefined();
  expect(action('查看任务')).toBeUndefined();
  expect(action('切换' + '到瀑布')).toBeUndefined();
  expect(
    renderer.root.findByProps({ testID: 'voice-menu-backdrop' }),
  ).toBeDefined();
  expect(
    renderer.root.findByProps({ testID: 'voice-trigger-halo' }),
  ).toBeDefined();
  expect(voiceShortcutActionAt(0, -80)).toBe('keyboard');
  expect(voiceShortcutActionAt(-80, 0)).toBe('butler');
  release(0, 64);
  expect(feed).toHaveBeenCalledTimes(1);
  expect(startSpeech).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  expect(expanded).toHaveBeenLastCalledWith(false);
  expect(voiceShortcutActionAt(0, 0)).toBeNull();
  expect(voiceShortcutActionAt(0, 80)).toBe('feed');
  expect(voiceShortcutActionAt(-56, -56)).toBeNull();
});

test('switching back to miao restores the miao long-press action label', () => {
  act(() => renderer.update(<VoiceShortcutDock {...props} tone="xun" />));
  act(() => renderer.update(<VoiceShortcutDock {...props} tone="miao" />));
  expect(trigger().props.accessibilityLabel).toBe('长按进行语音输入');
  expect(trigger().props.accessibilityActions[0].label).toBe('开始语音输入');
});

test('xun voice recognition uses the V15 confirmation card structure', () => {
  act(() => renderer.unmount());
  act(() => {
    renderer = TestRenderer.create(<VoiceShortcutDock {...props} tone="xun" />);
  });
  hold();
  expect(startSpeech).not.toHaveBeenCalled();
  expect(
    renderer.root.findAllByProps({ accessibilityLabel: '语音识别内容' }),
  ).toHaveLength(0);
  move(0, -80);
  release(0, -80);
  expect(startSpeech).toHaveBeenCalledTimes(1);
  listening();
  expect(renderer.root.findAllByProps({ testID: 'voice-pulse' })).toHaveLength(
    0,
  );
  expect(text()).toContain('语音');
  expect(text()).toContain('正在识别你的意图');
  expect(text()).toContain('等待语音');
  expect(text()).toContain('重新说');
  expect(text()).toContain('确认执行');
  expect(
    renderer.root.findByProps({ accessibilityLabel: '语音识别内容' }),
  ).toBeDefined();
  expect(
    renderer.root.findByProps({ accessibilityLabel: '确认执行' }).props
      .disabled,
  ).toBe(true);
});

test('xun ready card can restart recognition without closing the card', async () => {
  act(() => renderer.update(<VoiceShortcutDock {...props} tone="xun" />));
  hold();
  move(0, -64);
  release(0, -64);
  listening();
  await act(async () => resolve('重新识别前的草稿'));
  expect(
    renderer.root.findByProps({ accessibilityLabel: '语音识别内容' }).props
      .value,
  ).toBe('重新识别前的草稿');
  await act(async () =>
    renderer.root.findByProps({ accessibilityLabel: '重新说' }).props.onPress(),
  );
  expect(startSpeech).toHaveBeenCalledTimes(2);
  expect(text()).toContain('正在识别你的意图');
  expect(
    renderer.root.findByProps({ accessibilityLabel: '语音识别内容' }).props
      .value,
  ).toBe('');
  expect(expanded).toHaveBeenLastCalledWith(false);
});

test('xun ready card closes when the outside backdrop is pressed', async () => {
  act(() => renderer.update(<VoiceShortcutDock {...props} tone="xun" />));
  hold();
  move(0, -64);
  release(0, -64);
  listening();
  await act(async () => resolve('待关闭的语音草稿'));
  const backdrop = renderer.root.findByProps({
    testID: 'xun-status-backdrop',
  });
  await act(async () => backdrop.props.onPress());
  expect(expanded).toHaveBeenLastCalledWith(false);
  expect(
    renderer.root.findAllByProps({ testID: 'xun-status-backdrop' }),
  ).toHaveLength(0);
});

test.each([
  [24, true],
  [25, false],
])(
  'switching to xun keeps the new trigger center and compact option boundary aligned at %spt',
  async (dx, selectsOption) => {
    act(() => renderer.update(<VoiceShortcutDock {...props} tone="xun" />));
    hold(27, 27);
    release(dx, -80);
    expect(startSpeech).toHaveBeenCalledTimes(selectsOption ? 1 : 0);
    expect(finish).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    await act(async () => resolve('讯页边缘滑选'));
    if (selectsOption) {
      expect(
        renderer.root.findByProps({ accessibilityLabel: '确认执行' }).props
          .disabled,
      ).toBe(false);
      await act(async () =>
        renderer.root
          .findByProps({ accessibilityLabel: '确认执行' })
          .props.onPress(),
      );
    }
    expect(compose).toHaveBeenCalledTimes(selectsOption ? 1 : 0);
  },
);

test.each(['resolve', 'reject'] as const)(
  'account changes ignore an old %s and keep the new draft separate',
  async outcome => {
    const nextCompose = jest.fn();
    hold();
    listening();
    release(0, -64);
    const oldResolve = resolve;
    const oldReject = reject;
    act(() =>
      renderer.update(
        <VoiceShortcutDock
          {...props}
          key="new-owner"
          onCompose={nextCompose}
        />,
      ),
    );
    await act(async () => {
      if (outcome === 'resolve') oldResolve('旧账号草稿');
      else oldReject(new Error('旧账号错误'));
    });
    expect(compose).not.toHaveBeenCalled();
    expect(nextCompose).not.toHaveBeenCalled();
    hold();
    listening();
    release(0, -64);
    await act(async () => resolve('新账号草稿'));
    expect(nextCompose).toHaveBeenCalledWith('新账号草稿');
  },
);

test('background and later remount cannot route a previous session result', async () => {
  hold();
  listening();
  act(() => stateChange('background'));
  expect(cancel).toHaveBeenCalledTimes(1);
  await act(async () => resolve('旧会话'));
  expect(compose).not.toHaveBeenCalled();
  expect(butler).not.toHaveBeenCalled();
});

test('active false cancels audio even when component remains mounted', async () => {
  hold();
  listening();
  act(() => renderer.update(<VoiceShortcutDock {...props} active={false} />));
  expect(cancel).toHaveBeenCalledTimes(1);
  await act(async () => resolve('离开后的结果'));
  expect(compose).not.toHaveBeenCalled();
});

test('leaving a route while the menu is open clears it before the dock returns', () => {
  hold();
  expect(action('切换到键盘')).toBeDefined();
  act(() => renderer.update(<VoiceShortcutDock {...props} active={false} />));
  expect(
    renderer.root.findAllByProps({ accessibilityLabel: '切换到键盘' }),
  ).toHaveLength(0);

  act(() => renderer.update(<VoiceShortcutDock {...props} active />));
  expect(
    renderer.root.findAllByProps({ accessibilityLabel: '切换到键盘' }),
  ).toHaveLength(0);
  hold();
  expect(action('切换到键盘')).toBeDefined();
});

test('scroll movement before threshold never starts a microphone or opens menu', () => {
  act(() => trigger().props.onPanResponderGrant());
  move(0, 30);
  act(() => jest.advanceTimersByTime(480));
  release();
  expect(startSpeech).not.toHaveBeenCalled();
  expect(expanded).not.toHaveBeenCalledWith(true);
});

test('first-use permissions complete separately and require a new hold before audio starts', async () => {
  let authorize!: () => void;
  const cancelPreparation = jest.fn();
  prepareSpeech.mockReturnValueOnce({
    result: new Promise<void>(done => {
      authorize = done;
    }),
    cancel: cancelPreparation,
  });
  hold();
  await act(async () =>
    reject(
      Object.assign(new Error('首次使用请先开启语音权限，再长按说话。'), {
        code: 'speech_permission_required',
      }),
    ),
  );
  release();
  expect(prepareSpeech).not.toHaveBeenCalled();
  act(() => action('开启语音权限').props.onPress());
  expect(text()).toContain('请完成系统语音授权');
  act(() => stateChange('inactive'));
  expect(cancelPreparation).not.toHaveBeenCalled();
  await act(async () => authorize());
  act(() => stateChange('active'));
  expect(text()).toContain('权限已开启，请重新长按说话');
  expect(startSpeech).toHaveBeenCalledTimes(1);
  expect(compose).not.toHaveBeenCalled();
  expect(butler).not.toHaveBeenCalled();
  hold();
  expect(startSpeech).toHaveBeenCalledTimes(2);
  expect(text()).toContain('正在准备麦克风');
});

test('background cancels permission preparation and late permission completion cannot reopen the dock', async () => {
  let authorize!: () => void;
  const cancelPreparation = jest.fn();
  prepareSpeech.mockReturnValueOnce({
    result: new Promise<void>(done => {
      authorize = done;
    }),
    cancel: cancelPreparation,
  });
  hold();
  await act(async () =>
    reject(
      Object.assign(new Error('permission required'), {
        code: 'speech_permission_required',
      }),
    ),
  );
  release();
  act(() => action('开启语音权限').props.onPress());
  act(() => stateChange('background'));
  expect(cancelPreparation).toHaveBeenCalledTimes(1);
  await act(async () => authorize());
  expect(expanded).toHaveBeenLastCalledWith(false);
  expect(startSpeech).toHaveBeenCalledTimes(1);
  expect(text()).not.toContain('权限已开启');
});

test('a release arriving after an inactive cancellation cannot reopen shortcuts', () => {
  hold();
  listening();
  act(() => stateChange('inactive'));
  release();
  expect(expanded).toHaveBeenLastCalledWith(false);
  expect(action('切换到键盘')).toBeUndefined();
  expect(cancel).toHaveBeenCalledTimes(1);
});

test('denied permission shows an explicit settings action without starting audio again', async () => {
  let failPermission!: (cause: Error) => void;
  prepareSpeech.mockReturnValueOnce({
    result: new Promise<void>((_, fail) => {
      failPermission = fail;
    }),
    cancel: jest.fn(),
  });
  hold();
  await act(async () =>
    reject(
      Object.assign(new Error('permission required'), {
        code: 'speech_permission_required',
      }),
    ),
  );
  release();
  act(() => action('开启语音权限').props.onPress());
  await act(async () =>
    failPermission(
      Object.assign(new Error('未获得麦克风权限，请前往系统设置开启。'), {
        code: 'speech_denied',
      }),
    ),
  );
  expect(text()).toContain('未获得麦克风权限');
  expect(action('打开系统设置')).toBeDefined();
  expect(startSpeech).toHaveBeenCalledTimes(1);
});
