import { keyboardBottomInset } from '../src/features/messages/keyboardGeometry';

test('a docked keyboard moves the input above the keyboard and safe area', () => {
  expect(keyboardBottomInset({ screenY: 552, height: 300 }, 852, 34)).toBe(266);
});

test('offscreen hide frames retain height but leave no composer gap', () => {
  expect(keyboardBottomInset({ screenY: 667, height: 300 }, 667, 0)).toBe(0);
  expect(keyboardBottomInset({ screenY: 900, height: 300 }, 852, 34)).toBe(0);
});

test('window rotation uses the new screen boundary', () => {
  expect(keyboardBottomInset({ screenY: 192, height: 201 }, 393, 21)).toBe(180);
});

test('floating and zero-height keyboards do not reserve bottom space', () => {
  expect(keyboardBottomInset({ screenY: 300, height: 200 }, 852, 34)).toBe(0);
  expect(keyboardBottomInset({ screenY: 852, height: 0 }, 852, 34)).toBe(0);
});
