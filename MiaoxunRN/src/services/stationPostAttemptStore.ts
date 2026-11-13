import { NativeModules } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { StationVisibility } from '../models/api';
import { keychainService } from './keychainService';

export type StationPostPayload = {
  body: string;
  locationLabel: string;
  visibility: StationVisibility;
  agentCapabilities: string[];
  mediaAssetIds: string[];
};
export type StationPostAttempt = {
  version: 1;
  clientRequestId: string;
  requestHash: string;
  payload: StationPostPayload;
  attachments: {
    assetId: string;
    kind: 'image' | 'video';
    source: 'existingAsset' | 'pickedLocalFile';
  }[];
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// SHA-256 over UTF-8, kept local because RN has no WebCrypto dependency. This is
// an integrity fingerprint; the backend independently hashes and authorizes it.
/* eslint-disable no-bitwise -- SHA-256 uses 32-bit bit operations by definition. */
export function hashStationPostPayload(payload: StationPostPayload): string {
  const canonical = JSON.stringify({
    body: payload.body,
    locationLabel: payload.locationLabel,
    visibility: payload.visibility,
    agentCapabilities: payload.agentCapabilities,
    mediaAssetIds: payload.mediaAssetIds,
  });
  const bytes = Array.from(unescape(encodeURIComponent(canonical)), value =>
    value.charCodeAt(0),
  );
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let index = 7; index >= 0; index--)
    bytes.push(Math.floor(bitLength / 2 ** (index * 8)) & 255);
  const primes: number[] = [];
  for (let candidate = 2; primes.length < 64; candidate++)
    if (primes.every(prime => candidate % prime !== 0)) primes.push(candidate);
  const state = primes
    .slice(0, 8)
    .map(prime => ((Math.sqrt(prime) % 1) * 2 ** 32) | 0);
  const constants = primes.map(prime => ((Math.cbrt(prime) % 1) * 2 ** 32) | 0);
  const rotate = (value: number, shift: number) =>
    (value >>> shift) | (value << (32 - shift));
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = Array.from({ length: 64 }, () => 0);
    for (let index = 0; index < 16; index++)
      words[index] =
        (bytes[offset + index * 4] << 24) |
        (bytes[offset + index * 4 + 1] << 16) |
        (bytes[offset + index * 4 + 2] << 8) |
        bytes[offset + index * 4 + 3];
    for (let index = 16; index < 64; index++) {
      const x = words[index - 15],
        y = words[index - 2];
      words[index] =
        (words[index - 16] +
          (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) +
          words[index - 7] +
          (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) |
        0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index++) {
      const t1 =
        (h +
          (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) +
          ((e & f) ^ (~e & g)) +
          constants[index] +
          words[index]) |
        0;
      const t2 =
        ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) +
          ((a & b) ^ (a & c) ^ (b & c))) |
        0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, h].forEach((value, index) => {
      state[index] = (state[index] + value) | 0;
    });
  }
  return state
    .map(value => (value >>> 0).toString(16).padStart(8, '0'))
    .join('');
}
/* eslint-enable no-bitwise */

function valid(value: unknown): value is StationPostAttempt {
  if (!value || typeof value !== 'object') return false;
  const attempt = value as StationPostAttempt,
    payload = attempt.payload;
  return (
    attempt.version === 1 &&
    uuid.test(attempt.clientRequestId) &&
    /^[0-9a-f]{64}$/.test(attempt.requestHash) &&
    !!payload &&
    typeof payload.body === 'string' &&
    payload.body.length <= 5000 &&
    typeof payload.locationLabel === 'string' &&
    payload.locationLabel.length <= 120 &&
    ['private', 'friends', 'public'].includes(payload.visibility) &&
    Array.isArray(payload.agentCapabilities) &&
    payload.agentCapabilities.length <= 8 &&
    payload.agentCapabilities.every(id => typeof id === 'string') &&
    Array.isArray(payload.mediaAssetIds) &&
    payload.mediaAssetIds.length <= 9 &&
    payload.mediaAssetIds.every(id => uuid.test(id)) &&
    new Set(payload.mediaAssetIds).size === payload.mediaAssetIds.length &&
    Array.isArray(attempt.attachments) &&
    attempt.attachments.length === payload.mediaAssetIds.length &&
    attempt.attachments.every(
      (item, index) =>
        item.assetId === payload.mediaAssetIds[index] &&
        ['image', 'video'].includes(item.kind) &&
        ['existingAsset', 'pickedLocalFile'].includes(item.source),
    ) &&
    attempt.requestHash === hashStationPostPayload(payload)
  );
}
function service(userId: string) {
  const origin = new URL(
    String(NativeModules.MiaoxunConfigModule?.apiBaseURL || ''),
  );
  if (
    !userId ||
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/'
  )
    throw new Error('账号或服务地址无效，无法访问发布记录。');
  return keychainService(
    `com.gary.miaoxun.rn.station-post.${encodeURIComponent(
      JSON.stringify([origin.origin, userId]),
    )}`,
  );
}
async function read(
  scope: string,
  userId: string,
): Promise<StationPostAttempt | null> {
  const saved = await Keychain.getGenericPassword({ service: scope });
  if (!saved) return null;
  if (saved.username !== userId) throw new Error('发布记录账号不匹配。');
  let value: unknown;
  try {
    value = JSON.parse(saved.password);
  } catch {
    throw new Error('无法读取待核验的发布记录。');
  }
  if (!valid(value))
    throw new Error('发布记录格式或内容校验失败，请保留记录并重试核验。');
  return value;
}
const mutations = new Map<string, Promise<unknown>>();
async function mutate<T>(scope: string, work: () => Promise<T>) {
  const next = (mutations.get(scope) || Promise.resolve())
    .catch(() => undefined)
    .then(work);
  mutations.set(scope, next);
  try {
    return await next;
  } finally {
    if (mutations.get(scope) === next) mutations.delete(scope);
  }
}
export const stationPostAttemptStore = {
  async read(userId: string) {
    const scope = service(userId);
    // Recovery after a token change must observe a native write already in
    // flight for the same account, including a write whose reply was lost.
    await mutations.get(scope)?.catch(() => undefined);
    return read(scope, userId);
  },
  async save(userId: string, attempt: StationPostAttempt) {
    if (!valid(attempt)) throw new Error('发布记录无效，尚未发送。');
    const scope = service(userId);
    await mutate(scope, async () => {
      const existing = await read(scope, userId);
      if (existing) throw new Error('还有待核验的发布，请先核对原结果。');
      const saved = await Keychain.setGenericPassword(
        userId,
        JSON.stringify(attempt),
        {
          service: scope,
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        },
      );
      if (!saved) throw new Error('无法保存发布记录，尚未发送。');
    });
  },
  async clear(userId: string, clientRequestId: string) {
    const scope = service(userId);
    await mutate(scope, async () => {
      const existing = await read(scope, userId);
      if (!existing) return;
      if (existing.clientRequestId !== clientRequestId)
        throw new Error('不能清理另一项发布记录。');
      if (!(await Keychain.resetGenericPassword({ service: scope })))
        throw new Error('无法清理已核验的发布记录，请再次核验。');
    });
  },
};
