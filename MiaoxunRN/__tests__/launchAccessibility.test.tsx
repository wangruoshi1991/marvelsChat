import React from 'react';
import { AccessibilityInfo, Animated, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { LaunchAnimation } from '../src/app/LaunchAnimation';
import { palettes } from '../src/shared/theme';
import { SegmentedControl } from '../src/shared/ui';

const launchProps = {
  palette: palettes.light,
  language: 'zh',
  showIntro: true,
  isRestoring: true,
  onDismiss: jest.fn(),
} as const;
let renderer: TestRenderer.ReactTestRenderer;

afterEach(() => {
  act(() => renderer?.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('launch waits for the system preference, stops motion on change and ignores a stale initial read', async () => {
  jest.useFakeTimers();
  let finishRead!: (value: boolean) => void;
  const initial = new Promise<boolean>(resolve => {
    finishRead = resolve;
  });
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockReturnValue(initial);
  const subscribe = jest.fn().mockReturnValue({ remove: jest.fn() });
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation(subscribe);
  const timing = jest.spyOn(Animated, 'timing');
  await act(async () => {
    renderer = TestRenderer.create(<LaunchAnimation {...launchProps} />);
  });
  const change = subscribe.mock.calls.find(
    ([event]) => event === 'reduceMotionChanged',
  )![1] as (value: boolean) => void;
  expect(timing).not.toHaveBeenCalled();
  act(() => change(true));
  await act(async () => finishRead(false));
  expect(timing).not.toHaveBeenCalled();
  act(() => change(false));
  expect(timing.mock.calls.map(([, config]) => config.delay)).toEqual([
    100, 410, 720,
  ]);
  const stops = timing.mock.results.map(result =>
    jest.spyOn(result.value, 'stop'),
  );
  act(() => change(true));
  stops.forEach(stop => expect(stop).toHaveBeenCalledTimes(1));
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === '正在同步真实账号空间'),
  ).toBe(true);
});

test('the extended restore status stays static even when system motion is enabled', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  const timing = jest.spyOn(Animated, 'timing');
  await act(async () => {
    renderer = TestRenderer.create(
      <LaunchAnimation {...launchProps} showIntro={false} />,
    );
  });
  const lines = renderer.root
    .findAllByType(Animated.Text)
    .map(node => node.props.children);
  expect(lines).toEqual(['妙讯，', '与你一起成长的', '数字身份']);
  expect(
    renderer.root.findAllByProps({
      accessibilityRole: 'header',
      accessibilityLabel: '妙讯，与你一起成长的数字身份',
    }).length,
  ).toBeGreaterThan(0);
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === '正在同步真实账号空间'),
  ).toBe(true);
  expect(timing).not.toHaveBeenCalled();
});

test.each([false, true])(
  'dismisses after the restore ends with reduced motion set to %s',
  async reduced => {
    jest.useFakeTimers();
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(reduced);
    const onDismiss = jest.fn();
    await act(async () => {
      renderer = TestRenderer.create(
        <LaunchAnimation
          {...launchProps}
          showIntro={false}
          onDismiss={onDismiss}
        />,
      );
    });
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => {
      renderer.update(
        <LaunchAnimation
          {...launchProps}
          showIntro={false}
          isRestoring={false}
          onDismiss={onDismiss}
        />,
      );
    });
    if (!reduced) {
      expect(onDismiss).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(300));
    }
    expect(onDismiss).toHaveBeenCalledTimes(1);
  },
);

test('each segment announces its radio state and selection follows activation', () => {
  function Example() {
    const [value, setValue] = React.useState('light');
    return (
      <SegmentedControl
        palette={palettes.light}
        value={value}
        options={[
          { label: '浅色', value: 'light' },
          { label: '深色', value: 'dark' },
        ]}
        onChange={setValue}
      />
    );
  }
  act(() => {
    renderer = TestRenderer.create(<Example />);
  });
  const options = () =>
    renderer.root
      .findAllByProps({ accessibilityRole: 'radio' })
      .filter(node => typeof node.props.onPress === 'function');
  expect(
    renderer.root.findAllByProps({ accessibilityRole: 'radiogroup' }).length,
  ).toBeGreaterThan(0);
  expect(options().map(node => node.props.accessibilityRole)).toEqual([
    'radio',
    'radio',
  ]);
  expect(options().map(node => node.props.accessibilityState.checked)).toEqual([
    true,
    false,
  ]);
  act(() => options()[1].props.onPress());
  expect(options().map(node => node.props.accessibilityState.checked)).toEqual([
    false,
    true,
  ]);
});
