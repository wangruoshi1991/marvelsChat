import { NativeModules } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { tokenStore } from '../src/services/tokenStore';
import { siteTaskAttemptStore } from '../src/services/siteTaskAttemptStore';
import { avatar3dAttemptStore } from '../src/services/avatar3dAttemptStore';

const productionIdentifier = 'com.wangruoshi.miaoxun';
const developmentIdentifier = `${productionIdentifier}.development`;
const credentials = new Map<string, { username: string; password: string }>();
const storage = 'KeystoreAESGCM_NoAuth' as Keychain.STORAGE_TYPE;

beforeEach(() => {
  credentials.clear();
  NativeModules.MiaoxunConfigModule.bundleIdentifier = productionIdentifier;
  jest
    .mocked(Keychain.setGenericPassword)
    .mockImplementation(async (username, password, options) => {
      credentials.set(options!.service!, { username, password });
      return { service: options!.service!, storage };
    });
  jest.mocked(Keychain.getGenericPassword).mockImplementation(async options => {
    const stored = credentials.get(options!.service!);
    return stored ? { ...stored, service: options!.service!, storage } : false;
  });
  jest
    .mocked(Keychain.resetGenericPassword)
    .mockImplementation(async options => {
      credentials.delete(options!.service!);
      return true;
    });
});

afterEach(() => {
  NativeModules.MiaoxunConfigModule.bundleIdentifier = productionIdentifier;
  jest.resetAllMocks();
});

test('development login never reads or clears the released login service', async () => {
  await tokenStore.save('released-test-token');
  expect(credentials.has('com.gary.miaoxun.rn.auth')).toBe(true);
  NativeModules.MiaoxunConfigModule.bundleIdentifier = developmentIdentifier;
  expect(await tokenStore.read()).toBe('');
  await tokenStore.save('development-test-token');
  expect(await tokenStore.read()).toBe('development-test-token');
  await tokenStore.clear();
  NativeModules.MiaoxunConfigModule.bundleIdentifier = productionIdentifier;
  expect(await tokenStore.read()).toBe('released-test-token');
});

test('pending site and avatar submissions use separate variant services', async () => {
  const site = { prompt: 'Unit test input', idempotencyKey: 'test-attempt' };
  await siteTaskAttemptStore.save('test-owner', site);
  credentials.set('com.gary.miaoxun.rn.avatar3d.pending-submission', {
    username: 'test-owner',
    password: '{}',
  });
  NativeModules.MiaoxunConfigModule.bundleIdentifier = developmentIdentifier;
  expect(await siteTaskAttemptStore.read('test-owner')).toBeNull();
  expect(await avatar3dAttemptStore.read('test-owner')).toBeNull();
  await siteTaskAttemptStore.save('test-owner', {
    ...site,
    prompt: 'Development input',
  });
  await siteTaskAttemptStore.clear('test-owner', site.idempotencyKey);
  await avatar3dAttemptStore.clear();
  expect(
    credentials.has('com.gary.miaoxun.rn.avatar3d.pending-submission'),
  ).toBe(true);
  NativeModules.MiaoxunConfigModule.bundleIdentifier = productionIdentifier;
  expect(await siteTaskAttemptStore.read('test-owner')).toEqual(site);
});

test('missing native application identity fails before any secure-store access', async () => {
  delete NativeModules.MiaoxunConfigModule.bundleIdentifier;
  jest.mocked(Keychain.getGenericPassword).mockClear();
  await expect(tokenStore.read()).rejects.toThrow('缺少有效的 App 标识');
  await expect(siteTaskAttemptStore.read('test-owner')).rejects.toThrow(
    '缺少有效的 App 标识',
  );
  expect(Keychain.getGenericPassword).not.toHaveBeenCalled();
});
