import { pendingButlerClarification } from '../src/features/messages/butlerClarification';
import { ChatMessage, ChatThread } from '../src/features/session/sessionTypes';

const references = [
  {
    kind: 'station-album' as const,
    id: '3ed01032-e8f5-4999-87d2-894603573a25',
    version: 'a'.repeat(64),
    title: '选中的相册',
  },
];
const snapshot = {
  contextRefs: references,
  source: { currentPage: 'second-floor.albums' },
};
const question: ChatMessage = {
  id: '2c71ea6b-26f1-4560-8722-9d979e531f97',
  threadId: 'thread',
  senderType: 'agent',
  senderName: '妙管家',
  content: '希望如何安排页面？',
  metadata: { butlerClarification: snapshot },
};
const followup: ChatMessage = {
  id: 'd67a841d-334c-43b9-9773-34a1dc4c86c2',
  threadId: 'thread',
  senderType: 'user',
  senderName: 'Tester',
  content: '先放旅行照片',
  metadata: { butlerClarification: snapshot },
};
const thread = (last: ChatMessage): ChatThread => ({
  id: 'thread',
  agentId: 'miaoxun-butler',
  title: '妙管家',
  avatarText: '妙',
  kind: 'agent',
  pinned: false,
  lastContent: last.content,
  unreadCount: 0,
  messages: [question, last],
});

test('a persisted follow-up still processing restores the original scope and source when reopened', () => {
  const recovered = pendingButlerClarification(thread(followup));
  expect(recovered).toEqual({
    messageId: followup.id,
    references,
    source: snapshot.source,
  });
  expect(recovered!.references).not.toBe(references);
  expect(recovered!.references[0]).not.toBe(references[0]);
  expect(recovered!.source).not.toBe(snapshot.source);
});

test.each([
  { metadata: {} },
  {
    metadata: {
      butlerClarification: snapshot,
      butlerContextReset: true,
    },
  },
  { id: 'local-unsent' },
  { localStatus: 'sending' as const },
  { localStatus: 'failed' as const },
])(
  'missing server snapshot, reset or optimistic follow-ups cannot recover an older scope: %o',
  change => {
    expect(
      pendingButlerClarification(thread({ ...followup, ...change })),
    ).toBeNull();
  },
);

test('a user message without a server snapshot never inherits from an earlier Agent question', () => {
  expect(
    pendingButlerClarification(
      thread({
        ...followup,
        metadata: { contextRefs: references },
      }),
    ),
  ).toBeNull();
});

test('the latest normal Agent response consumes the pending scope', () => {
  expect(
    pendingButlerClarification({
      ...thread(followup),
      messages: [
        question,
        followup,
        { ...question, id: 'completed-reply', content: '已完成', metadata: {} },
      ],
    }),
  ).toBeNull();
});

test('Agent clarification behavior stays intact and other Agent conversations do not recover Butler scope', () => {
  expect(pendingButlerClarification(thread(question))?.references).toEqual(
    references,
  );
  expect(
    pendingButlerClarification({
      ...thread(followup),
      agentId: 'site-builder',
    }),
  ).toBeNull();
});
