import { resolveMessageMenuAnchor } from '../src/features/messages/MessageActionSheet';

test('xun new menu anchor accounts for the pull hint above the header', () => {
  expect(resolveMessageMenuAnchor(true, 125, true)).toBe(102);
  expect(resolveMessageMenuAnchor(true, 52, true)).toBe(46);
  expect(resolveMessageMenuAnchor(true)).toBeUndefined();
});

test('xun task tab keeps its measured anchor because it has no pull hint', () => {
  expect(resolveMessageMenuAnchor(true, 125, false)).toBe(125);
  expect(resolveMessageMenuAnchor(true, 125)).toBe(125);
});

test('other message themes keep their measured menu anchor', () => {
  expect(resolveMessageMenuAnchor(false, 125)).toBe(125);
  expect(resolveMessageMenuAnchor(false)).toBeUndefined();
});
