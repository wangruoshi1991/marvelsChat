import { resolveAgentProductAccess } from '../src/features/agents/agentAccess';
import { AgentDTO, ProductCatalogProductDTO } from '../src/models/api';

const agent: AgentDTO & { contractHash?: string } = {
  key: 'site-builder',
  name: '建站',
  version: '1.0.0',
  category: 'station-builder',
  description: '真实建站能力',
  capabilities: [],
  permissions: ['station:read'],
  identity: {
    avatarKind: 'agent-mark',
    mark: '建',
    shape: 'circle',
    colors: {
      background: '#123456',
      foreground: '#ffffff',
      accent: '#abcdef',
    },
  },
  published: true,
  status: 'registered',
  contractHash: 'release-contract-1',
};

function product(
  dependency: Partial<
    ProductCatalogProductDTO['dependencies'][number] & { identity?: unknown }
  > = {},
): ProductCatalogProductDTO {
  return {
    id: 'product-site-builder',
    productKey: 'site-builder',
    version: '1.0.0',
    displayName: '建站 Agent',
    description: '真实产品',
    supportedPlatforms: ['ios', 'android'],
    status: 'published',
    productVersionId: 'product-version-1',
    contractHash: 'product-contract-1',
    dependencies: [
      {
        agentKey: agent.key,
        agentReleaseId: 'release-site-builder',
        version: agent.version,
        scopes: agent.permissions,
        contractHash: agent.contractHash!,
        ...dependency,
      },
    ],
  };
}

const options = (products: ProductCatalogProductDTO[]) => ({
  products,
  entitlements: [],
  catalogRevision: 'catalog-1',
});

describe('published product dependency contract gates Agent access', () => {
  test.each([
    ['version', { version: '9.9.9' }],
    ['scopes', { scopes: ['station:write'] }],
    ['contract hash', { contractHash: 'old-release-contract' }],
    [
      'identity',
      {
        identity: {
          ...agent.identity,
          mark: '旧',
        },
      },
    ],
    [
      'identity key',
      {
        identity: {
          ...agent.identity,
          key: 'another-agent',
        },
      },
    ],
  ])('%s mismatch is unavailable', (_label, dependency) => {
    expect(
      resolveAgentProductAccess(agent, options([product(dependency)])),
    ).toBe('product_unavailable');
  });

  test('missing product version identity is unavailable', () => {
    expect(
      resolveAgentProductAccess(
        agent,
        options(
          [product({})].map(item => ({ ...item, productVersionId: null })),
        ),
      ),
    ).toBe('product_unavailable');
  });

  test('a complete dependency identity without a key remains available', () => {
    expect(
      resolveAgentProductAccess(
        agent,
        options([
          product({
            identity: { ...agent.identity },
          }),
        ]),
      ),
    ).toBe('available');
  });

  test('multiple published products for one Agent are catalog unavailable', () => {
    expect(
      resolveAgentProductAccess(
        agent,
        options([
          product(),
          {
            ...product(),
            id: 'product-site-builder-2',
            productVersionId: 'product-version-2',
          },
        ]),
      ),
    ).toBe('catalog_unavailable');
  });
});
