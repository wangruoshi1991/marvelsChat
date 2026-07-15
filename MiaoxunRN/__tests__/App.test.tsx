/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  globalThis.fetch = jest.fn(
    async () =>
      ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify({
            data: {
              privacy: { version: '2026-07-15', url: '/legal/privacy' },
              terms: { version: '2026-07-15', url: '/legal/terms' },
            },
          }),
      } as unknown as Response),
  );
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

test('renders correctly', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(() => {
    renderer?.unmount();
  });
});
