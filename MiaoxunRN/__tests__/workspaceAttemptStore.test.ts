import * as Keychain from 'react-native-keychain';
import { workspaceAttemptStore } from '../src/services/workspaceAttemptStore';
const read = jest.mocked(Keychain.getGenericPassword);
const save = jest.mocked(Keychain.setGenericPassword);
const clear = jest.mocked(Keychain.resetGenericPassword);
const attempt = {
  goal: '页面',
  contextRefs: [],
  source: { page: 'miao.feed', module: null },
  idempotencyKey: 'key',
};
beforeEach(() => {
  jest.clearAllMocks();
  read.mockResolvedValue(false);
  save.mockResolvedValue(true as never);
  clear.mockResolvedValue(true);
});
test('storage service is account-specific and includes source with exact intent', async () => {
  await workspaceAttemptStore.save('owner', attempt);
  expect(save).toHaveBeenCalledWith(
    'owner',
    JSON.stringify(attempt),
    expect.objectContaining({
      service: expect.stringContaining('.workspace.owner'),
    }),
  );
});
test('credentials cannot be loaded by the wrong owner', async () => {
  read.mockResolvedValue({
    username: 'other',
    password: JSON.stringify(attempt),
    service: 'service',
    storage: '',
  } as never);
  await expect(workspaceAttemptStore.read('owner')).rejects.toThrow(
    '账号不匹配',
  );
});
test.each([
  'invalid',
  JSON.stringify({ ...attempt, contextRefs: [{ kind: 'url', id: 'remote' }] }),
  JSON.stringify({ ...attempt, idempotencyKey: 0 }),
])('invalid persisted content blocks resubmission: %s', async password => {
  read.mockResolvedValue({ username: 'owner', password } as never);
  await expect(workspaceAttemptStore.read('owner')).rejects.toThrow();
});
test('clearing earlier completion does not clear a newer attempt', async () => {
  read.mockResolvedValue({
    username: 'owner',
    password: JSON.stringify({ ...attempt, idempotencyKey: 'new' }),
  } as never);
  await workspaceAttemptStore.clear('owner', 'key');
  expect(clear).not.toHaveBeenCalled();
});

test('a false Keychain deletion result is an explicit failure and retains retryability', async () => {
  read.mockResolvedValue({
    username: 'owner',
    password: JSON.stringify(attempt),
  } as never);
  clear.mockResolvedValueOnce(false);
  await expect(workspaceAttemptStore.clear('owner', 'key')).rejects.toThrow(
    '无法清理',
  );
  await expect(
    workspaceAttemptStore.clear('owner', 'key'),
  ).resolves.toBeUndefined();
  expect(clear).toHaveBeenCalledTimes(2);
});

test('a receipt already cleared is idempotent without another Keychain deletion', async () => {
  read.mockResolvedValue(false);
  await expect(
    workspaceAttemptStore.clear('owner', 'key'),
  ).resolves.toBeUndefined();
  expect(clear).not.toHaveBeenCalled();
});
