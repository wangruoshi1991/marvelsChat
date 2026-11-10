import { buildChatTimeline } from '../src/features/messages/chatTimeline';
import { ChatMessage } from '../src/features/session/sessionTypes';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';
const message = (id: string, createdAt?: string): ChatMessage => ({
  id,
  threadId: 'thread',
  senderType: 'user',
  senderName: '我',
  content: id,
  createdAt,
});
test('timeline interleaves records, namespaces equal ids and keeps an updated node in place without duplicates', () => {
  const old = {
    workspace: agentWorkspace(),
    step: workspaceStep({
      id: 'same',
      createdAt: '2026-11-01T01:00:00Z',
      status: 'running',
    }),
  };
  const updated = {
    ...old,
    step: {
      ...old.step,
      status: 'succeeded' as const,
      updatedAt: '2026-11-02T00:00:00Z',
      summary: '完成',
    },
  };
  const items = buildChatTimeline(
    [
      message('same', '2026-11-01T00:00:00Z'),
      message('after', '2026-11-01T02:00:00Z'),
      message('local'),
    ],
    [old, updated],
  );
  expect(items.map(item => item.key)).toEqual([
    'message:same',
    'contribution:same',
    'message:after',
    'message:local',
  ]);
  expect(items[1]).toMatchObject({
    contribution: { step: { status: 'succeeded', summary: '完成' } },
  });
});
