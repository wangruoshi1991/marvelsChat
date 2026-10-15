import * as Keychain from 'react-native-keychain';
import { WorkspaceRequest, isWorkspaceRequest } from '../models/agentWorkspace';
import { keychainService } from './keychainService';
export type WorkspaceAttempt = WorkspaceRequest & { idempotencyKey: string };
const service = (userId: string) =>
  keychainService(`com.gary.miaoxun.rn.workspace.${userId}`);
export const workspaceAttemptStore = {
  async read(userId: string): Promise<WorkspaceAttempt | null> {
    const saved = await Keychain.getGenericPassword({
      service: service(userId),
    });
    if (!saved) return null;
    if (saved.username !== userId) throw new Error('协作提交记录账号不匹配。');
    let value: unknown;
    try {
      value = JSON.parse(saved.password);
    } catch {
      throw new Error('无法读取待恢复的协作提交。');
    }
    if (
      !isWorkspaceRequest(value) ||
      !('idempotencyKey' in value) ||
      typeof value.idempotencyKey !== 'string' ||
      !value.idempotencyKey
    )
      throw new Error('协作提交记录格式不受支持。');
    return value as WorkspaceAttempt;
  },
  async save(userId: string, value: WorkspaceAttempt) {
    const saved = await Keychain.setGenericPassword(
      userId,
      JSON.stringify(value),
      { service: service(userId) },
    );
    if (!saved) throw new Error('无法保存协作提交记录，请重试。');
  },
  async clear(userId: string, key: string) {
    const saved = await this.read(userId);
    if (saved?.idempotencyKey === key) {
      const cleared = await Keychain.resetGenericPassword({
        service: service(userId),
      });
      if (!cleared) throw new Error('无法清理已确认的协作提交记录，请重试。');
    }
  },
};
