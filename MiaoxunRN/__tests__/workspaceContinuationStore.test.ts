import { NativeModules } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { workspaceContinuationStore } from '../src/services/workspaceContinuationStore';
const records = new Map<string, { username: string; password: string }>();
const read = jest.mocked(Keychain.getGenericPassword);
const save = jest.mocked(Keychain.setGenericPassword);
const clear = jest.mocked(Keychain.resetGenericPassword);
const attempt = {
  workspaceId: 'workspace',
  revision: 4,
  currentRound: 1,
  text: '精简开头',
  idempotencyKey: 'continue-original-key',
};
const config = NativeModules.MiaoxunConfigModule;
beforeEach(() => {
  jest.clearAllMocks();
  records.clear();
  config.bundleIdentifier = 'com.wangruoshi.miaoxun';
  config.apiBaseURL = 'https://example.test';
  read.mockImplementation(async options => {
    const record = records.get(options!.service!);
    return record
      ? ({ ...record, service: options!.service! } as never)
      : false;
  });
  save.mockImplementation(async (username, password, options) => {
    records.set(options!.service!, { username, password });
    return true as never;
  });
  clear.mockImplementation(async options => {
    records.delete(options!.service!);
    return true;
  });
});
afterEach(() => {
  config.bundleIdentifier = 'com.wangruoshi.miaoxun';
  config.apiBaseURL = 'http://127.0.0.1:4390';
});

test('pending records are protected on this device and scoped by owner, task, API and bundle', async () => {
  await workspaceContinuationStore.save('owner', attempt);
  expect(save).toHaveBeenCalledWith(
    'owner',
    JSON.stringify(attempt),
    expect.objectContaining({
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  );
  expect(await workspaceContinuationStore.read('owner', 'workspace')).toEqual(
    attempt,
  );
  expect(
    await workspaceContinuationStore.read('other', 'workspace'),
  ).toBeNull();
  expect(
    await workspaceContinuationStore.read('owner', 'other-workspace'),
  ).toBeNull();
  config.apiBaseURL = 'https://other-api.test';
  expect(
    await workspaceContinuationStore.read('owner', 'workspace'),
  ).toBeNull();
  config.apiBaseURL = 'https://example.test';
  config.bundleIdentifier = 'com.wangruoshi.miaoxun.development';
  expect(
    await workspaceContinuationStore.read('owner', 'workspace'),
  ).toBeNull();
  config.bundleIdentifier = 'com.wangruoshi.miaoxun';
  expect(await workspaceContinuationStore.read('owner', 'workspace')).toEqual(
    attempt,
  );
});

test.each([
  'invalid',
  JSON.stringify({ ...attempt, workspaceId: 'other' }),
  JSON.stringify({ ...attempt, text: ' ' }),
  JSON.stringify({ ...attempt, revision: -1 }),
  JSON.stringify({ ...attempt, revision: 0 }),
  JSON.stringify({ ...attempt, currentRound: 0 }),
  JSON.stringify({ ...attempt, idempotencyKey: 'tiny' }),
  JSON.stringify({ ...attempt, userId: 'injected' }),
])(
  'malformed or misbound records fail explicitly without being deleted: %s',
  async password => {
    read.mockResolvedValue({ username: 'owner', password } as never);
    await expect(
      workspaceContinuationStore.read('owner', 'workspace'),
    ).rejects.toThrow();
    expect(clear).not.toHaveBeenCalled();
  },
);

test('mismatched owners and invalid native API configuration fail before continuing', async () => {
  read.mockResolvedValue({
    username: 'other',
    password: JSON.stringify(attempt),
  } as never);
  await expect(
    workspaceContinuationStore.read('owner', 'workspace'),
  ).rejects.toThrow('账号不匹配');
  read.mockClear();
  config.apiBaseURL = 'https://name:secret@example.test/path';
  await expect(
    workspaceContinuationStore.read('owner', 'workspace'),
  ).rejects.toThrow('服务地址');
  expect(read).not.toHaveBeenCalled();
});

test('a pending intent cannot be overwritten and a stale key cannot delete it', async () => {
  await workspaceContinuationStore.save('owner', attempt);
  await expect(
    workspaceContinuationStore.save('owner', {
      ...attempt,
      text: 'another request',
      idempotencyKey: 'different-key',
    }),
  ).rejects.toThrow('还有待确认');
  await expect(
    workspaceContinuationStore.clear(
      'owner',
      attempt.workspaceId,
      'different-key',
    ),
  ).rejects.toThrow('另一项');
  expect(
    await workspaceContinuationStore.read('owner', attempt.workspaceId),
  ).toEqual(attempt);
  expect(clear).not.toHaveBeenCalled();
});

test('storage failures retain the pending record and clearing is idempotent only for confirmed absence', async () => {
  save.mockResolvedValueOnce(false as never);
  await expect(
    workspaceContinuationStore.save('owner', attempt),
  ).rejects.toThrow('尚未发送');
  await workspaceContinuationStore.save('owner', attempt);
  clear.mockResolvedValueOnce(false);
  await expect(
    workspaceContinuationStore.clear(
      'owner',
      attempt.workspaceId,
      attempt.idempotencyKey,
    ),
  ).rejects.toThrow('无法清理');
  expect(
    await workspaceContinuationStore.read('owner', attempt.workspaceId),
  ).toEqual(attempt);
  await workspaceContinuationStore.clear(
    'owner',
    attempt.workspaceId,
    attempt.idempotencyKey,
  );
  await workspaceContinuationStore.clear(
    'owner',
    attempt.workspaceId,
    attempt.idempotencyKey,
  );
  expect(clear).toHaveBeenCalledTimes(2);
});

test('concurrent writes cannot replace a different pending submission', async () => {
  const outcomes = await Promise.allSettled([
    workspaceContinuationStore.save('owner', attempt),
    workspaceContinuationStore.save('owner', {
      ...attempt,
      idempotencyKey: 'competing-request',
    }),
  ]);
  expect(outcomes.map(outcome => outcome.status)).toEqual([
    'fulfilled',
    'rejected',
  ]);
  expect(
    await workspaceContinuationStore.read('owner', attempt.workspaceId),
  ).toEqual(attempt);
});
