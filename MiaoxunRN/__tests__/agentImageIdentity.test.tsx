import React from 'react';
import { Image, Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';

import { AgentGlyphAvatar } from '../src/features/messages/AgentGlyphAvatar';
import {
  isCompleteAgentIdentity,
  identityForAgent,
} from '../src/features/messages/agentIdentity';
import { AgentIdentityDTO } from '../src/models/api';
import { buildApiUrl } from '../src/services/api/http';

const assetId = 'c222a222-2222-4222-8222-222222222222';
const sha256 = 'a'.repeat(64);
const identity: AgentIdentityDTO = {
  avatarKind: 'agent-image',
  mark: '图',
  shape: 'rounded',
  colors: {
    background: '#123456',
    foreground: '#ffffff',
    accent: '#abcdef',
  },
  avatar: {
    assetId,
    url: `/api/agent-avatar-assets/${assetId}/${sha256}.webp`,
    sha256,
    mimeType: 'image/webp',
    width: 512,
    height: 512,
  },
};

test('published image identity accepts only normalized content-addressed assets', () => {
  expect(isCompleteAgentIdentity(identity)).toBe(true);
  expect(identityForAgent({ key: 'image-agent', identity })).toBe(identity);
  for (const change of [
    { url: `https://example.com${identity.avatar.url}` },
    { url: `//example.com${identity.avatar.url}` },
    { url: `${identity.avatar.url}?token=secret` },
    { url: `/api/other/${assetId}/${sha256}.webp` },
    { sha256: 'b'.repeat(64) },
    { assetId: 'invalid' },
    { mimeType: 'image/svg+xml' },
    { headers: { Authorization: 'secret' } },
    { width: 0 },
    { height: 511 },
  ]) {
    expect(
      isCompleteAgentIdentity({
        ...identity,
        avatar: { ...identity.avatar, ...change },
      }),
    ).toBe(false);
  }
  expect(
    isCompleteAgentIdentity({ ...identity, avatarKind: 'agent-mark' }),
  ).toBe(false);
});

test('Agent image uses configured API origin and reports load errors without a mark fallback', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <AgentGlyphAvatar agentId="image-agent" identity={identity} size={40} />,
    );
  });
  const image = renderer.root.findByType(Image);
  expect(image.props.source).toEqual({
    uri: buildApiUrl(identity.avatar.url),
  });
  expect(renderer.root.findAllByType(Text)).toHaveLength(0);
  await act(async () => {
    image.props.onError({ nativeEvent: { error: 'unavailable' } });
  });
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  expect(
    renderer.root.findByProps({
      accessibilityLabel: 'Agent image-agent 头像加载失败',
    }),
  ).toBeDefined();
  expect(JSON.stringify(renderer.toJSON())).not.toContain('图');

  const nextSha = 'b'.repeat(64);
  await act(async () => {
    renderer.update(
      <AgentGlyphAvatar
        agentId="image-agent"
        identity={{
          ...identity,
          avatar: {
            ...identity.avatar,
            sha256: nextSha,
            url: `/api/agent-avatar-assets/${assetId}/${nextSha}.webp`,
          },
        }}
        size={40}
      />,
    );
  });
  expect(renderer.root.findByType(Image).props.source.uri).toContain(nextSha);
  await act(async () => renderer.unmount());
});

test('invalid image identity renders a contract error before any remote load', () => {
  const element = AgentGlyphAvatar({
    agentId: 'image-agent',
    identity: {
      ...identity,
      avatar: { ...identity.avatar, url: 'https://example.com/avatar.webp' },
    },
    size: 40,
  });
  expect(element.props.testID).toBe('agent-identity-error-image-agent');
});
