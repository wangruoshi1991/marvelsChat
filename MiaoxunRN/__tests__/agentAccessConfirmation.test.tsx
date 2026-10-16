import React from 'react';
import { Alert, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { StationAgentsPanel } from '../src/features/station/StationAgentsPanel';
import { AgentDTO, OwnedAgentDTO } from '../src/models/api';
import {} from '../src/features/session/sessionDefaults';
import { palettes } from '../src/shared/theme';
import { mediaRetrievalApi } from '../src/services/api/mediaRetrievalApi';
import {
  AlbumAIConsentVersion,
  albumAssistantConsent,
} from '../src/features/station/albumAssistantAuthorization';

jest.mock('../src/features/station/StationCapabilityWorkspace', () => ({
  StationCapabilityWorkspace: () => null,
}));
jest.mock('../src/services/api/mediaRetrievalApi', () => ({
  mediaRetrievalApi: { status: jest.fn() },
}));

const agent: AgentDTO = {
  key: 'site-builder',
  name: '建站',
  version: '0.3.1',
  category: 'station-builder',
  description: '生成个人页面',
  capabilities: [],
  permissions: ['station:read', 'album:read'],
  status: 'registered',
};
const owned: OwnedAgentDTO = {
  id: agent.key,
  name: agent.name,
  description: agent.description,
  category: agent.category,
  enabled: true,
  grantedScopes: ['station:read', 'files:read'],
};
let renderer: TestRenderer.ReactTestRenderer;
let alert: jest.SpyInstance;
const props = () => ({
  palette: palettes.light,
  language: 'zh' as const,
  agents: [agent],
  ownedAgents: [owned],
  agentReadiness: {},
  onOpenAgentThread: jest.fn(),
  onSetAgentEnabled: jest.fn<
    Promise<OwnedAgentDTO>,
    [string, boolean, string[]?, AlbumAIConsentVersion?]
  >(async () => owned),
  onActionMessage: jest.fn(),
  onActionError: jest.fn(),
});
type AccessProps = ReturnType<typeof props>;
const albumProps = (): AccessProps => ({
  ...props(),
  agents: [
    {
      ...agent,
      key: 'album-manager',
      name: '相册管理',
      permissions: ['album:read', 'album:write'],
    },
  ],
  ownedAgents: [],
});
const renderSurface = (
  values: AccessProps,
  token = 'first-session',
  active = true,
) => <StationAgentsPanel {...values} token={token} active={active} />;
const accessButton = (label: string) =>
  renderer.root
    .findAll(item => typeof item.props.onPress === 'function')
    .find(item => item.props.accessibilityLabel === label);
function press(label: string) {
  const node = accessButton(label);
  expect(node).toBeDefined();
  act(() => node!.props.onPress());
}
beforeEach(() => {
  jest.mocked(mediaRetrievalApi.status).mockReset();
  alert = jest.spyOn(Alert, 'alert');
});
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  jest.restoreAllMocks();
});

describe('My Agents confirms the complete declaration when adding an agent', () => {
  test('first album access uses one combined confirmation and explicitly sends cloud consent', async () => {
    jest
      .mocked(mediaRetrievalApi.status)
      .mockResolvedValue({ enabled: false } as never);
    const values = albumProps();
    values.onSetAgentEnabled.mockImplementation(
      async (_id, _enabled, _scopes, consent) => {
        await albumAssistantConsent('first-session', 'zh', () => true, consent);
        return owned;
      },
    );
    act(() => {
      renderer = TestRenderer.create(renderSurface(values));
    });
    await act(async () => {
      press('添加相册管理');
    });
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][1]).toContain('授权范围：读取相册、整理相册');
    expect(alert.mock.calls[0][1]).toContain('云端 AI 分析');
    expect(alert.mock.calls[0][2][1].text).toBe('同意并添加');
    expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
    await act(async () => {
      await alert.mock.calls[0][2][1].onPress();
    });
    expect(values.onSetAgentEnabled).toHaveBeenCalledWith(
      'album-manager',
      true,
      ['album:read', 'album:write'],
      'media-retrieval-consent-v1',
    );
    expect(mediaRetrievalApi.status).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(values.onActionError).not.toHaveBeenCalled();
  });
  test.each(['cancel', 'dismiss'] as const)(
    'album confirmation %s does not grant either consent',
    async action => {
      jest
        .mocked(mediaRetrievalApi.status)
        .mockResolvedValue({ enabled: false } as never);
      const values = albumProps();
      act(() => {
        renderer = TestRenderer.create(renderSurface(values));
      });
      await act(async () => {
        press('添加相册管理');
      });
      act(() =>
        action === 'cancel'
          ? alert.mock.calls[0][2][0].onPress()
          : alert.mock.calls[0][3].onDismiss(),
      );
      await act(async () => {
        await alert.mock.calls[0][2][1].onPress();
      });
      expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
    },
  );
  test('existing album cloud consent is reused while scopes are still reviewed', async () => {
    jest.mocked(mediaRetrievalApi.status).mockResolvedValue({
      enabled: true,
      consentVersion: 'media-retrieval-consent-v1',
    } as never);
    const values = albumProps();
    act(() => {
      renderer = TestRenderer.create(renderSurface(values));
    });
    await act(async () => {
      press('添加相册管理');
    });
    expect(alert.mock.calls[0][1]).toContain('授权范围：读取相册、整理相册');
    expect(alert.mock.calls[0][1]).not.toContain('云端 AI 分析');
    await act(async () => {
      await alert.mock.calls[0][2][1].onPress();
    });
    expect(values.onSetAgentEnabled).toHaveBeenCalledWith(
      'album-manager',
      true,
      ['album:read', 'album:write'],
    );
  });
  test('a late album status after an account switch cannot open a confirmation or grant access', async () => {
    let complete!: (status: never) => void;
    jest.mocked(mediaRetrievalApi.status).mockImplementation(
      () =>
        new Promise(resolve => {
          complete = resolve;
        }),
    );
    const values = albumProps();
    act(() => {
      renderer = TestRenderer.create(renderSurface(values));
    });
    press('添加相册管理');
    act(() => renderer.update(renderSurface(values, 'other-account')));
    await act(async () => {
      complete({ enabled: false } as never);
    });
    expect(alert).not.toHaveBeenCalled();
    expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
  });
  test('failed album consent lookup shows an error without granting access', async () => {
    jest
      .mocked(mediaRetrievalApi.status)
      .mockRejectedValue(new Error('无法读取授权状态'));
    const values = albumProps();
    act(() => {
      renderer = TestRenderer.create(renderSurface(values));
    });
    await act(async () => {
      press('添加相册管理');
    });
    expect(alert).not.toHaveBeenCalled();
    expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
    expect(values.onActionError.mock.calls[0][0].message).toContain(
      '无法读取授权状态',
    );
  });
  test('different existing scopes require removal and re-adding without an update action', () => {
    const values = props();
    act(() => {
      renderer = TestRenderer.create(renderSurface(values));
    });
    expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
    expect(
      renderer.root
        .findAllByType(Text)
        .map(item => item.props.children)
        .flat()
        .join(' '),
    ).toContain('移除后重新添加');
    expect(
      renderer.root.findAll(
        item => item.props.accessibilityLabel === '更新建站授权',
      ),
    ).toHaveLength(0);
    expect(alert).not.toHaveBeenCalled();
  });
  test('cancel and dismiss invalidate confirmation and make no authorization call', async () => {
    const values = props();
    act(() => {
      renderer = TestRenderer.create(renderSurface(values));
    });
    press('移除 建站');
    act(() => alert.mock.calls[0][2][0].onPress());
    await act(async () => {
      await alert.mock.calls[0][2][1].onPress();
    });
    press('移除 建站');
    act(() => alert.mock.calls[1][3].onDismiss());
    await act(async () => {
      await alert.mock.calls[1][2][1].onPress();
    });
    expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
  });
  test('switching accounts and switching back cannot reuse the old confirmation', async () => {
    const values = props();
    act(() => {
      renderer = TestRenderer.create(renderSurface(values));
    });
    press('移除 建站');
    act(() => renderer.update(renderSurface(values, 'next-session')));
    act(() => renderer.update(renderSurface(values, 'first-session')));
    await act(async () => {
      await alert.mock.calls[0][2][1].onPress();
    });
    expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
  });
  test('grant changes invalidate confirmation even if the declared scopes are unchanged', async () => {
    const values = props();
    act(() => {
      renderer = TestRenderer.create(renderSurface(values));
    });
    press('移除 建站');
    act(() =>
      renderer.update(
        renderSurface({
          ...values,
          ownedAgents: [{ ...owned, grantedScopes: ['station:read'] }],
        }),
      ),
    );
    await act(async () => {
      await alert.mock.calls[0][2][1].onPress();
    });
    expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
  });
  test('removal is explicitly confirmed and sends an empty grant', async () => {
    const values = props();
    act(() => {
      renderer = TestRenderer.create(renderSurface(values));
    });
    press('移除 建站');
    expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
    expect(alert.mock.calls[0][1]).toContain(
      '移除后撤回：读取小站内容、读取文件素材',
    );
    await act(async () => {
      await alert.mock.calls[0][2][1].onPress();
    });
    expect(values.onSetAgentEnabled).toHaveBeenCalledWith(
      'site-builder',
      false,
      [],
    );
  });
  test('adding also requires the common scope confirmation', async () => {
    const values = { ...props(), ownedAgents: [] };
    act(() => {
      renderer = TestRenderer.create(renderSurface(values));
    });
    press('添加建站');
    expect(alert.mock.calls[0][1]).toContain(
      '授权范围：读取小站内容、读取相册',
    );
    expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
    await act(async () => {
      await alert.mock.calls[0][2][1].onPress();
    });
    expect(values.onSetAgentEnabled).toHaveBeenCalledWith(
      'site-builder',
      true,
      ['station:read', 'album:read'],
    );
    await act(async () => {
      await alert.mock.calls[0][2][1].onPress();
    });
    expect(values.onSetAgentEnabled).toHaveBeenCalledTimes(1);
  });
  test('unknown access scopes are never granted or exposed as internal codes', async () => {
    const values = {
      ...props(),
      ownedAgents: [],
      agents: [{ ...agent, permissions: ['station:read', 'internal:future'] }],
    };
    act(() => {
      renderer = TestRenderer.create(renderSurface(values));
    });
    press('添加建站');
    expect(alert).not.toHaveBeenCalled();
    expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
    expect(values.onActionError).toHaveBeenCalledTimes(1);
    expect(values.onActionError.mock.calls[0][0].message).toContain('无法识别');
    expect(values.onActionError.mock.calls[0][0].message).not.toContain(
      'internal:future',
    );
  });
  test('removal shows a readable warning for a grant this app cannot identify', async () => {
    const values = {
      ...props(),
      ownedAgents: [{ ...owned, grantedScopes: ['internal:future'] }],
    };
    act(() => {
      renderer = TestRenderer.create(renderSurface(values));
    });
    press('移除 建站');
    expect(alert.mock.calls[0][1]).toContain('需更新应用以查看此权限');
    expect(alert.mock.calls[0][1]).not.toContain('internal:future');
    expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
  });
});

test('leaving the existing station panel invalidates its confirmation', async () => {
  const values = props();
  act(() => {
    renderer = TestRenderer.create(renderSurface(values));
  });
  press('移除 建站');
  act(() => renderer.update(renderSurface(values, 'first-session', false)));
  await act(async () => {
    await alert.mock.calls[0][2][1].onPress();
  });
  expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
});

test('matched scopes show no update action and never cause an automatic grant', () => {
  const values = {
    ...props(),
    ownedAgents: [{ ...owned, grantedScopes: agent.permissions }],
  };
  act(() => {
    renderer = TestRenderer.create(renderSurface(values));
  });
  expect(
    renderer.root
      .findAllByType(Text)
      .map(item => item.props.children)
      .flat()
      .join(' '),
  ).not.toContain('查看并更新授权');
  expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
});

test('the Butler can be removed and added again through the same explicit confirmation', async () => {
  const butler = { ...agent, key: 'miaoxun-butler', name: '妙讯管家' };
  const butlerAccess = { ...owned, id: butler.key, name: butler.name };
  const values = { ...props(), agents: [butler], ownedAgents: [butlerAccess] };
  act(() => {
    renderer = TestRenderer.create(renderSurface(values));
  });
  press('移除 妙讯管家');
  await act(async () => {
    await alert.mock.calls[0][2][1].onPress();
  });
  expect(values.onSetAgentEnabled).toHaveBeenLastCalledWith(
    butler.key,
    false,
    [],
  );
  act(() => renderer.update(renderSurface({ ...values, ownedAgents: [] })));
  press('添加妙讯管家');
  expect(values.onSetAgentEnabled).toHaveBeenCalledTimes(1);
  await act(async () => {
    await alert.mock.calls[1][2][1].onPress();
  });
  expect(values.onSetAgentEnabled).toHaveBeenLastCalledWith(
    butler.key,
    true,
    butler.permissions,
  );
});

test('revoked album consent during review prevents a write and requires a new review', async () => {
  const values = albumProps();
  jest
    .mocked(mediaRetrievalApi.status)
    .mockResolvedValueOnce({
      enabled: true,
      consentVersion: 'media-retrieval-consent-v1',
    } as never)
    .mockResolvedValueOnce({ enabled: false } as never);
  const write = jest.fn();
  values.onSetAgentEnabled.mockImplementation(
    async (_id, _enabled, _scopes, consent) => {
      await albumAssistantConsent('first-session', 'zh', () => true, consent);
      write();
      return owned;
    },
  );
  act(() => {
    renderer = TestRenderer.create(renderSurface(values));
  });
  await act(async () => press('添加相册管理'));
  expect(alert.mock.calls[0][1]).not.toContain('云端 AI 分析');
  await act(async () => alert.mock.calls[0][2][1].onPress());
  expect(write).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledTimes(1);
  expect(values.onActionError).toHaveBeenCalledWith(
    expect.objectContaining({
      message: expect.stringContaining('重新查看范围及云端使用说明'),
    }),
  );
  expect(values.onActionMessage).not.toHaveBeenCalled();
});

test.each(['cancel', 'dismiss'] as const)(
  'ordinary addition %s invalidates the confirmation with zero writes',
  async method => {
    const values = { ...props(), ownedAgents: [] };
    act(() => {
      renderer = TestRenderer.create(renderSurface(values));
    });
    press('添加建站');
    act(() =>
      method === 'cancel'
        ? alert.mock.calls[0][2][0].onPress()
        : alert.mock.calls[0][3].onDismiss(),
    );
    await act(async () => alert.mock.calls[0][2][1].onPress());
    expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
    expect(values.onActionMessage).not.toHaveBeenCalled();
  },
);

test('an unmounted account cannot submit its displayed confirmation', async () => {
  const values = { ...props(), ownedAgents: [] };
  act(() => {
    renderer = TestRenderer.create(renderSurface(values));
  });
  press('添加建站');
  act(() => renderer.unmount());
  await act(async () => alert.mock.calls[0][2][1].onPress());
  expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
});

test.each(['declaration', 'ownership', 'in-place declaration'] as const)(
  'changed %s invalidates a still-mounted addition confirmation',
  async change => {
    const values: AccessProps = {
      ...props(),
      agents: [{ ...agent, permissions: [...agent.permissions] }],
      ownedAgents: [],
    };
    act(() => {
      renderer = TestRenderer.create(renderSurface(values));
    });
    press('添加建站');
    expect(alert.mock.calls[0][1]).toContain('读取小站内容、读取相册');
    if (change === 'in-place declaration') {
      values.agents[0].permissions.push('files:read');
    } else {
      act(() =>
        renderer.update(
          renderSurface({
            ...values,
            ...(change === 'declaration'
              ? {
                  agents: [
                    {
                      ...agent,
                      version: '0.4.0',
                      permissions: ['station:write'],
                    },
                  ],
                }
              : { ownedAgents: [owned] }),
          }),
        ),
      );
    }
    await act(async () => alert.mock.calls[0][2][1].onPress());
    expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
    expect(values.onActionError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('重新查看范围后确认'),
      }),
    );
  },
);

test('pending addition blocks duplicate requests and remains retryable after failure', async () => {
  const values = { ...props(), ownedAgents: [] };
  let reject!: (cause: Error) => void;
  values.onSetAgentEnabled.mockReturnValue(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  act(() => {
    renderer = TestRenderer.create(renderSurface(values));
  });
  press('添加建站');
  act(() => {
    alert.mock.calls[0][2][1].onPress();
  });
  expect(accessButton('添加建站')?.props.disabled).toBe(true);
  act(() => renderer.update(renderSurface(values)));
  press('添加建站');
  await act(async () => alert.mock.calls[0][2][1].onPress());
  expect(alert).toHaveBeenCalledTimes(1);
  expect(values.onSetAgentEnabled).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('服务端拒绝授权')));
  expect(values.onActionError).toHaveBeenCalledWith(
    expect.objectContaining({ message: '服务端拒绝授权' }),
  );
  expect(values.onActionMessage).not.toHaveBeenCalled();
  expect(accessButton('建站')).toBeUndefined();
  expect(accessButton('添加建站')?.props.disabled).toBe(false);
  press('添加建站');
  expect(alert).toHaveBeenCalledTimes(2);
  expect(values.onSetAgentEnabled).toHaveBeenCalledTimes(1);
});

test('removing an album Agent discloses revocation and renders the returned access state', async () => {
  const values = albumProps();
  const album = values.agents[0];
  const attached: OwnedAgentDTO = {
    ...owned,
    id: album.key,
    name: album.name,
    grantedScopes: [...album.permissions],
  };
  const removed = { ...attached, enabled: false, grantedScopes: [] };
  values.ownedAgents = [attached];
  values.onSetAgentEnabled.mockResolvedValue(removed);
  act(() => {
    renderer = TestRenderer.create(renderSurface(values));
  });
  press('移除 相册管理');
  expect(alert.mock.calls[0][1]).toContain('撤回相册 AI 授权并清理检索索引');
  expect(values.onSetAgentEnabled).not.toHaveBeenCalled();
  await act(async () => alert.mock.calls[0][2][1].onPress());
  expect(values.onSetAgentEnabled).toHaveBeenCalledWith(
    'album-manager',
    false,
    [],
  );
  act(() =>
    renderer.update(renderSurface({ ...values, ownedAgents: [removed] })),
  );
  expect(accessButton('移除 相册管理')).toBeUndefined();
  expect(accessButton('添加相册管理')).toBeDefined();
});
