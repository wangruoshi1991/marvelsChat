import { request } from '../src/services/api/http';
import { groupChatApi } from '../src/services/api/groupChatApi';

jest.mock('../src/services/api/http', () => ({ request: jest.fn() }));

const requestMock = jest.mocked(request);

describe('group chat API contract', () => {
  beforeEach(() => requestMock.mockReset());

  test('creates a group with the established idempotency contract', async () => {
    requestMock.mockResolvedValue({
      data: { thread: { id: 'thread' }, messages: [] },
    } as never);
    const payload = {
      title: '周末计划',
      memberUserIds: ['friend-1', 'friend-2'],
      idempotencyKey: '6d0c8f4c-8a12-4fd0-9f13-4f803243aaa1',
    };

    await groupChatApi.create(payload, 'token');

    expect(requestMock).toHaveBeenCalledWith('/api/chat-groups', {
      method: 'POST',
      token: 'token',
      body: payload,
    });
  });

  test('reads members and leaves by group id', async () => {
    requestMock.mockResolvedValue([] as never);
    await groupChatApi.members('group-1', 'token');
    expect(requestMock).toHaveBeenLastCalledWith(
      '/api/chat-groups/group-1/members',
      { token: 'token' },
    );

    requestMock.mockResolvedValue({ ok: true } as never);
    await groupChatApi.leave('group-1', 'token');
    expect(requestMock).toHaveBeenLastCalledWith(
      '/api/chat-groups/group-1/membership',
      { method: 'DELETE', token: 'token' },
    );
  });
});
