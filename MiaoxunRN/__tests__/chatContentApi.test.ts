import { chatContentApi } from '../src/services/api/chatContentApi';
import { messageApi } from '../src/services/api/messageApi';
import { request } from '../src/services/api/http';
import { setAIContractSession } from '../src/services/aiContract';
import { parseContentPreview } from '../src/models/chatContentPreview';

jest.mock('../src/services/api/http', () => ({ request: jest.fn() }));
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const proposal = {
  id,
  version: 1,
  revision: 1,
  snapshotHash: 'a'.repeat(64),
  kind: 'diary',
  status: 'pending',
  threadId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  inputMessageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  outputMessageId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  snapshot: { title: '散步', body: '走过桥', mood: '' },
  sources: [],
  allowedActions: ['confirm', 'reject'],
  expiresAt: '2099-01-01T00:00:00Z',
  result: null,
};
beforeEach(() => {
  jest.resetAllMocks();
  setAIContractSession('owner', { chatContent: 1 });
});
test('transmits a versioned reference and continuation selector through the existing message API', async () => {
  jest.mocked(request).mockResolvedValue({ messages: [] });
  await messageApi.sendMessage(
    'thread',
    '修改结尾',
    'owner',
    undefined,
    undefined,
    undefined,
    45000,
    [],
    undefined,
    undefined,
    undefined,
    { id, revision: 2 },
  );
  expect(request).toHaveBeenCalledWith(
    '/api/threads/thread/messages',
    expect.objectContaining({
      headers: expect.objectContaining({ 'X-Miaoxun-Chat-Content': '1' }),
      body: {
        content: '修改结尾',
        contextRefs: [],
        contentPreviewContext: { id, revision: 2 },
      },
    }),
  );
});
test('confirmation sends the immutable snapshot identity and rejects a mismatching receipt', async () => {
  const preview = parseContentPreview(proposal);
  const confirmed = {
    ...proposal,
    status: 'confirmed',
    revision: 2,
    allowedActions: [],
    result: { diaryEntryId: id },
  };
  jest.mocked(request).mockResolvedValue(confirmed);
  expect(
    (await chatContentApi.confirm('owner', preview, 'stable-key')).status,
  ).toBe('confirmed');
  expect(request).toHaveBeenCalledWith(
    `/api/chat-content-previews/${id}/confirm`,
    expect.objectContaining({
      body: {
        revision: 1,
        snapshotHash: 'a'.repeat(64),
        idempotencyKey: 'stable-key',
      },
    }),
  );
  for (const change of [
    { id: proposal.inputMessageId },
    { snapshotHash: 'b'.repeat(64) },
    { threadId: proposal.inputMessageId },
    { outputMessageId: proposal.inputMessageId },
    { revision: 0 },
  ]) {
    jest.mocked(request).mockResolvedValue({ ...confirmed, ...change });
    await expect(
      chatContentApi.confirm('owner', preview, 'stable-key'),
    ).rejects.toThrow();
  }
});
test('a preview read never accepts a different resource ID', async () => {
  jest
    .mocked(request)
    .mockResolvedValue({ ...proposal, id: proposal.inputMessageId });
  await expect(chatContentApi.get('owner', id)).rejects.toThrow('当前请求');
});
