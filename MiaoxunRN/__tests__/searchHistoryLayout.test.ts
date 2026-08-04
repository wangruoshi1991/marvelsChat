import { calculateCollapsedHistoryLayout } from '../src/features/search/useSearchHistoryLayout';

test('fills every chip that fits within the first three rows', () => {
  const layout = calculateCollapsedHistoryLayout([
    { height: 32, y: 0 },
    { height: 32, y: 0 },
    { height: 32, y: 0 },
    { height: 32, y: 41 },
    { height: 32, y: 41 },
    { height: 32, y: 82 },
    { height: 32, y: 82 },
    { height: 32, y: 123 },
  ]);

  expect(layout).toEqual({ count: 7, height: 114 });
});

test('returns all items when they fit in fewer than three rows', () => {
  const layout = calculateCollapsedHistoryLayout([
    { height: 32, y: 0 },
    { height: 32, y: 0 },
    { height: 32, y: 41 },
  ]);

  expect(layout).toEqual({ count: 3, height: 73 });
});
