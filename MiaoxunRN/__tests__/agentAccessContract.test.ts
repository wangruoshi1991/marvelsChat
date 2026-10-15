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
  );
  expect(request).toHaveBeenLastCalledWith('/api/me/agents/album-manager', {
    method: 'PATCH',
    token: 'unit-token',
    body: {
      enabled: true,
      grantedScopes: ['album:read'],
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
  );
  expect(request).toHaveBeenLastCalledWith(
    '/api/me/agents/site-builder',
    expect.objectContaining({ body: { enabled: true, grantedScopes: [] } }),
  );
});
