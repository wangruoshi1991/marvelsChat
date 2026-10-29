import {
  AgentIdentityContractError,
  assertAgentDirectoryIdentity,
  identityForAgent,
  isCompleteAgentIdentity,
} from '../src/features/messages/agentIdentity';

const identity = {
  avatarKind: 'agent-mark' as const,
  mark: '妙',
  shape: 'squircle' as const,
  colors: { background: '#123456', foreground: '#ffffff', accent: '#abcdef' },
};

test('directory identity is complete and is passed through unchanged', () => {
  const agent = { key: 'miaoxun-butler', identity };
  expect(isCompleteAgentIdentity(identity)).toBe(true);
  expect(identityForAgent(agent)).toBe(identity);
  expect(() =>
    assertAgentDirectoryIdentity([agent] as never, []),
  ).not.toThrow();
});

test('missing identity becomes an explicit contract error state', () => {
  const agent = { key: 'removed-agent', identity: null };
  expect(isCompleteAgentIdentity(agent.identity)).toBe(false);
  expect(identityForAgent(agent)).toEqual({
    status: 'unavailable',
    code: 'AGENT_IDENTITY_CONTRACT_ERROR',
    message: expect.stringContaining('removed-agent'),
  });
  expect(() => assertAgentDirectoryIdentity([agent] as never, [])).toThrow(
    AgentIdentityContractError,
  );
});
