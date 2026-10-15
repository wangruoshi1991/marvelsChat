import * as Keychain from 'react-native-keychain';
import { keychainService } from './keychainService';

export type SiteTaskAttempt = { prompt: string; idempotencyKey: string };
const service = (userId: string) =>
  keychainService(`com.gary.miaoxun.rn.site-task.${userId}`);

// Persist before submitting so a lost HTTP response can be replayed after reopening.
export const siteTaskAttemptStore = {
  async read(userId: string): Promise<SiteTaskAttempt | null> {
    const credentials = await Keychain.getGenericPassword({
      service: service(userId),
    });
    if (!credentials) return null;
    if (credentials.username !== userId)
      throw new Error('建站提交记录账号不匹配。');
    let value: SiteTaskAttempt;
    try {
      value = JSON.parse(credentials.password);
    } catch {
      throw new Error('无法读取待确认的建站提交记录。');
    }
    if (
      typeof value.prompt !== 'string' ||
      typeof value.idempotencyKey !== 'string'
    )
      throw new Error('建站提交记录格式不受支持。');
    return value;
  },
  async save(userId: string, attempt: SiteTaskAttempt) {
    const result = await Keychain.setGenericPassword(
      userId,
      JSON.stringify(attempt),
      { service: service(userId) },
    );
    if (!result) throw new Error('无法保存建站提交记录，请重试。');
  },
  async clear(userId: string, idempotencyKey: string) {
    const attempt = await this.read(userId);
    if (attempt?.idempotencyKey === idempotencyKey)
      await Keychain.resetGenericPassword({ service: service(userId) });
  },
};
