import { profileApi } from '../src/services/api/profileApi';
import { request } from '../src/services/api/http';

jest.mock('../src/services/api/http', () => ({ request: jest.fn() }));

test('Agent authorization sends exactly the user-confirmed scopes with cloud consent', async () => {
  await profileApi.setAgentEnabled(
    'unit-token',
    'album-manager',
    true,
    'media-retrieval-consent-v1',
    'unit-attempt',
    ['album:read'],
    'product-version-album',
  );
  expect(request).toHaveBeenLastCalledWith('/api/me/agents/album-manager', {
    method: 'PATCH',
    token: 'unit-token',
    body: {
      enabled: true,
      consent: true,
      grantedScopes: ['album:read'],
      productVersionId: 'product-version-album',
      albumAIConsentVersion: 'media-retrieval-consent-v1',
    },
    headers: { 'Idempotency-Key': 'unit-attempt' },
  });
});

test('an empty confirmed grant is explicit and cannot become server-default permissions', async () => {
  await profileApi.setAgentEnabled(
    'unit-token',
    'site-builder',
    true,
    undefined,
    'unit-attempt',
    [],
    'product-version-site',
  );
  expect(request).toHaveBeenLastCalledWith(
    '/api/me/agents/site-builder',
    expect.objectContaining({
      body: {
        enabled: true,
        consent: true,
        grantedScopes: [],
        productVersionId: 'product-version-site',
      },
    }),
  );
});

test('enabling requires an explicitly reviewed product version while revocation does not', async () => {
  jest.mocked(request).mockClear();
  expect(() =>
    profileApi.setAgentEnabled(
      'unit-token',
      'site-builder',
      true,
      undefined,
      'attempt',
      ['station:read'],
    ),
  ).toThrow('确认当前产品版本');
  expect(request).not.toHaveBeenCalled();
  await profileApi.setAgentEnabled(
    'unit-token',
    'site-builder',
    false,
    undefined,
    'revoke-attempt',
    [],
  );
  expect(request).toHaveBeenLastCalledWith(
    '/api/me/agents/site-builder',
    expect.objectContaining({ body: { enabled: false, grantedScopes: [] } }),
  );
});
