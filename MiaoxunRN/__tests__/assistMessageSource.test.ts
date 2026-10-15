import {
  AssistMessageSource,
  normalizeAssistMessageSource,
} from '../src/features/assist/assistMessageSource';

test('assistance source is optional and follows the existing page contract limit', () => {
  expect(normalizeAssistMessageSource(undefined)).toBeUndefined();
  expect(
    normalizeAssistMessageSource({ currentPage: ' second-floor.albums ' }),
  ).toEqual({ currentPage: 'second-floor.albums' });
  expect(
    normalizeAssistMessageSource({ currentPage: 'x'.repeat(120) }),
  ).toEqual({ currentPage: 'x'.repeat(120) });
});

test.each([
  null,
  'miao.feed',
  {},
  { currentPage: 1 },
  { currentPage: '' },
  { currentPage: '  ' },
  { currentPage: 'x'.repeat(121) },
  { currentPage: 'miao.feed\nexecute' },
  { currentPage: 'miao.feed\u0000' },
])('malformed assistance source fails explicitly: %p', source => {
  expect(() =>
    normalizeAssistMessageSource(source as AssistMessageSource),
  ).toThrow('AI 请求来源无效');
});

test('a location snapshot does not preserve caller-supplied permission fields', () => {
  const source = {
    currentPage: 'miao.task',
    grantedScopes: ['agents:invoke'],
  };
  expect(normalizeAssistMessageSource(source)).toEqual({
    currentPage: 'miao.task',
  });
});
