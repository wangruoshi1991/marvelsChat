import type { AgentDTO, RelationshipProfileDTO } from '../src/models/api';
import type { ChatThread } from '../src/features/session/sessionTypes';
import { buildSearchDirectory } from '../src/features/search/searchDirectory';

const thread = (overrides: Partial<ChatThread>): ChatThread => ({
  id: 'thread-1',
  title: '测试会话',
  avatarText: '测',
  kind: 'direct',
  pinned: false,
  lastContent: '',
  unreadCount: 0,
  messages: [],
  ...overrides,
});

const friend: RelationshipProfileDTO = {
  user: {
    id: 'friend-1',
    displayName: '小林',
    aiId: '000001000001',
    presenceStatus: 'online',
  },
  profile: {
    userId: 'friend-1',
    nickname: '小林',
    avatarText: '林',
    avatarConfig: {},
    bio: '产品设计师',
    community: '',
    activityArea: '',
    followersCount: 0,
    followingCount: 0,
    likesCount: 0,
    collectionsCount: 0,
  },
  relationType: 'friend',
};

const flatten = (groups: ReturnType<typeof buildSearchDirectory>) =>
  groups.flatMap(group => group.items);

test('matches friend conversations by synchronized message content', () => {
  const items = flatten(
    buildSearchDirectory({
      agents: [],
      friends: [friend],
      language: 'zh',
      normalizedQuery: '项目复盘',
      threads: [
        thread({
          peerUserId: 'friend-1',
          messages: [
            {
              id: 'message-1',
              threadId: 'thread-1',
              senderType: 'user',
              senderName: '小林',
              content: '周五下午进行项目复盘',
            },
          ],
        }),
      ],
    }),
  );

  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    kind: 'friend',
    title: '小林',
    subtitle: '周五下午进行项目复盘',
  });
});

test('matches group and agent threads without creating result categories', () => {
  const agents = [
    {
      key: 'calendar-agent',
      category: 'productivity',
      description: '日程助理',
    } as AgentDTO,
  ];
  const items = flatten(
    buildSearchDirectory({
      agents,
      friends: [],
      language: 'zh',
      normalizedQuery: '发布会',
      threads: [
        thread({
          id: 'agent-thread',
          title: '日程 Agent',
          agentId: 'calendar-agent',
          kind: 'agent',
          messages: [
            {
              id: 'agent-message',
              threadId: 'agent-thread',
              senderType: 'agent',
              senderName: '日程 Agent',
              content: '发布会安排在下周三',
            },
          ],
        }),
        thread({
          id: 'group-thread',
          title: '产品群',
          kind: 'group',
          messages: [
            {
              id: 'group-message',
              threadId: 'group-thread',
              senderType: 'user',
              senderName: '同事',
              content: '发布会素材已经确认',
            },
          ],
        }),
      ],
    }),
  );

  expect(items.map(item => item.kind).sort()).toEqual(['agent', 'thread']);
  expect(items.every(item => item.subtitle.includes('发布会'))).toBe(true);
});

test('does not match deleted or recalled messages', () => {
  const items = flatten(
    buildSearchDirectory({
      agents: [],
      friends: [friend],
      language: 'zh',
      normalizedQuery: '敏感内容',
      threads: [
        thread({
          peerUserId: 'friend-1',
          messages: [
            {
              id: 'message-1',
              threadId: 'thread-1',
              senderType: 'user',
              senderName: '小林',
              content: '敏感内容',
              recalledAt: '2026-07-16T00:00:00.000Z',
            },
          ],
        }),
      ],
    }),
  );

  expect(items).toHaveLength(0);
});
