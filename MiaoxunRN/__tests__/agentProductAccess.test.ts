import { resolveAgentProductAccess } from '../src/features/agents/agentAccess';
import {
  AgentDTO,
  AgentIdentityDTO,
  ProductCatalogProductDTO,
  ProductEntitlementDTO,
} from '../src/models/api';

const agent: AgentDTO & {
  contractHash?: string;
  identity: AgentIdentityDTO;
} = {
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
const grant = (
  selected: ProductCatalogProductDTO,
  status: ProductEntitlementDTO['status'] = 'enabled',
): ProductEntitlementDTO => ({
  id: `entitlement-${selected.id}`,
  productId: selected.id,
  productVersionId: selected.productVersionId!,
  productKey: selected.productKey,
  version: selected.version!,
  status,
  grantedScopes: agent.permissions,
  contractHash: selected.contractHash,
  consentVersion: null,
  unavailableReason: null,
});

describe('published product dependency contract gates Agent access', () => {
  test('image identity is bound to its exact published asset and checksum', () => {
    const assetId = 'c222a222-2222-4222-8222-222222222222';
    const sha256 = 'a'.repeat(64);
    const imageIdentity: AgentIdentityDTO = {
      ...agent.identity,
      avatarKind: 'agent-image',
      avatar: {
        assetId,
        url: `/api/agent-avatar-assets/${assetId}/${sha256}.webp`,
        sha256,
        mimeType: 'image/webp',
        width: 512,
        height: 512,
      },
    };
    const imageAgent = { ...agent, identity: imageIdentity };
    expect(
      resolveAgentProductAccess(
        imageAgent,
        options([product({ identity: imageIdentity })]),
      ),
    ).toBe('available');
    const otherSha = 'b'.repeat(64);
    const otherIdentity = {
      ...imageIdentity,
      avatar: {
        ...imageIdentity.avatar,
        sha256: otherSha,
        url: `/api/agent-avatar-assets/${assetId}/${otherSha}.webp`,
      },
    };
    expect(
      resolveAgentProductAccess(
        imageAgent,
        options([product({ identity: otherIdentity })]),
      ),
    ).toBe('product_unavailable');
    expect(
      resolveAgentProductAccess(
        imageAgent,
        options([product({ identity: agent.identity })]),
      ),
    ).toBe('product_unavailable');
  });
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

  test('an exact enabled product remains usable beside an unrelated publication', () => {
    const original = product();
    const other = {
      ...product({ contractHash: 'new-release-contract' }),
      id: 'other-product',
      productVersionId: 'other-version',
    };
    expect(
      resolveAgentProductAccess(agent, {
        ...options([other, original]),
        entitlements: [grant(original)],
      }),
    ).toBe('available');
  });

  test('only the exact enabled version can resolve multiple product candidates', () => {
    const original = product();
    const other = { ...product(), productVersionId: 'product-version-2' };
    expect(
      resolveAgentProductAccess(agent, {
        ...options([other, original]),
        entitlements: [grant(original)],
      }),
    ).toBe('available');
    expect(
      resolveAgentProductAccess(agent, {
        ...options([other, original]),
        entitlements: [grant({ ...original, productVersionId: 'missing' })],
      }),
    ).toBe('catalog_unavailable');
  });

  test.each(['disabled', 'unavailable', 'reconsent_required'] as const)(
    '%s entitlement cannot auto-select among multiple products',
    status => {
      const original = product();
      expect(
        resolveAgentProductAccess(agent, {
          ...options([
            original,
            { ...product(), id: 'other', productVersionId: 'other-version' },
          ]),
          entitlements: [grant(original, status)],
        }),
      ).toBe('catalog_unavailable');
    },
  );

  test('multiple enabled products remain ambiguous instead of auto-selecting a grant', () => {
    const original = product();
    const other = {
      ...product(),
      id: 'other',
      productVersionId: 'other-version',
    };
    expect(
      resolveAgentProductAccess(agent, {
        ...options([other, original]),
        entitlements: [grant(original), grant(other)],
      }),
    ).toBe('catalog_unavailable');
  });

  test('an explicit identity conflict cannot be treated as an available recommendation', () => {
    expect(
      resolveAgentProductAccess(
        {
          ...agent,
          identity: null,
          identityError: {
            code: 'AGENT_PRODUCT_IDENTITY_CONFLICT',
            message: '已发布产品提供冲突身份',
          },
        },
        options([product()]),
      ),
    ).toBe('catalog_unavailable');
  });
});
