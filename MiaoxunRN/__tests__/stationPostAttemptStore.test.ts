import { NativeModules } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { createHash } from 'crypto';
import {
  hashStationPostPayload,
  StationPostAttempt,
  stationPostAttemptStore,
} from '../src/services/stationPostAttemptStore';
const records = new Map<string, { username: string; password: string }>();
const userId = '11111111-1111-4111-8111-111111111111';
const attempt = (): StationPostAttempt => {
  const payload = {
    body: '🌿 我的漫画',
    locationLabel: '',
    visibility: 'private' as const,
    agentCapabilities: [],
    mediaAssetIds: ['22222222-2222-4222-8222-222222222222'],
  };
  return {
    version: 1,
    clientRequestId: '33333333-3333-4333-8333-333333333333',
    payload,
    requestHash: hashStationPostPayload(payload),
    attachments: [
      {
        assetId: payload.mediaAssetIds[0],
        kind: 'image',
        source: 'existingAsset',
      },
    ],
  };
};
beforeEach(() => {
  jest.clearAllMocks();
  records.clear();
  jest
    .mocked(Keychain.getGenericPassword)
    .mockImplementation(
      async options => (records.get(options!.service!) || false) as never,
    );
  jest
    .mocked(Keychain.setGenericPassword)
    .mockImplementation(async (username, password, options) => {
      records.set(options!.service!, { username, password });
      return true as never;
    });
  jest
    .mocked(Keychain.resetGenericPassword)
    .mockImplementation(async options => {
      records.delete(options!.service!);
      return true;
    });
});
afterEach(() => {
  NativeModules.MiaoxunConfigModule.apiBaseURL = 'http://127.0.0.1:4390';
});
test('canonical UTF8 payload fingerprint agrees with independent SHA256 and preserves frame order', () => {
  const payload = attempt().payload;
  expect(hashStationPostPayload(payload)).toBe(
    createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  );
  expect(
    hashStationPostPayload({
      ...payload,
      mediaAssetIds: [
        ...payload.mediaAssetIds,
        '44444444-4444-4444-8444-444444444444',
      ],
    }),
  ).not.toBe(hashStationPostPayload(payload));
});
test('durable intent is protected and isolated by account and API without overwriting unresolved publication', async () => {
  const value = attempt();
  await stationPostAttemptStore.save(userId, value);
  expect(await stationPostAttemptStore.read(userId)).toEqual(value);
  expect(await stationPostAttemptStore.read('other')).toBeNull();
  expect(
    jest.mocked(Keychain.setGenericPassword).mock.calls[0][2]!.accessible,
  ).toBe(Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY);
  NativeModules.MiaoxunConfigModule.apiBaseURL = 'https://another.example';
  expect(await stationPostAttemptStore.read(userId)).toBeNull();
  NativeModules.MiaoxunConfigModule.apiBaseURL = 'http://127.0.0.1:4390';
  await expect(
    stationPostAttemptStore.save(userId, {
      ...value,
      clientRequestId: '55555555-5555-4555-8555-555555555555',
    }),
  ).rejects.toThrow();
  await expect(
    stationPostAttemptStore.clear(
      userId,
      '55555555-5555-4555-8555-555555555555',
    ),
  ).rejects.toThrow();
  expect(await stationPostAttemptStore.read(userId)).toEqual(value);
});
test('tampering, keychain read failure and failed clear preserve the original record explicitly', async () => {
  const value = attempt();
  await stationPostAttemptStore.save(userId, value);
  const record = [...records.values()][0];
  const original = record.password;
  record.password = JSON.stringify({
    ...value,
    payload: { ...value.payload, body: 'changed' },
  });
  await expect(stationPostAttemptStore.read(userId)).rejects.toThrow();
  record.password = original;
  jest.mocked(Keychain.resetGenericPassword).mockResolvedValueOnce(false);
  await expect(
    stationPostAttemptStore.clear(userId, value.clientRequestId),
  ).rejects.toThrow();
  expect(await stationPostAttemptStore.read(userId)).toEqual(value);
  jest
    .mocked(Keychain.getGenericPassword)
    .mockRejectedValueOnce(new Error('locked'));
  await expect(stationPostAttemptStore.read(userId)).rejects.toThrow('locked');
  expect(records.size).toBe(1);
});

test('a recovery read waits for an in-flight native save instead of incorrectly observing no intent', async () => {
  const value = attempt();
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(done => {
    entered = done;
  });
  const held = new Promise<void>(done => {
    release = done;
  });
  jest
    .mocked(Keychain.setGenericPassword)
    .mockImplementationOnce(async (username, password, options) => {
      entered();
      await held;
      records.set(options!.service!, { username, password });
      return true as never;
    });
  const saving = stationPostAttemptStore.save(userId, value);
  await started;
  let completed = false;
  const reading = stationPostAttemptStore.read(userId).then(record => {
    completed = true;
    return record;
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(completed).toBe(false);
  release();
  await saving;
  expect(await reading).toEqual(value);
});
