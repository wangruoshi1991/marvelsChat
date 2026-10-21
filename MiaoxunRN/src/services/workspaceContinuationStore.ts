import { NativeModules } from 'react-native';
import * as Keychain from 'react-native-keychain';
import {
  WorkspaceContinuationAttempt,
  isWorkspaceContinuationAttempt,
} from '../models/agentWorkspace';
import { keychainService } from './keychainService';

function service(userId: string, workspaceId: string) {
  if (!userId.trim() || !workspaceId.trim())
    throw new Error('缺少账号或任务身份，无法读取修改提交记录。');
  const configured = NativeModules.MiaoxunConfigModule?.apiBaseURL;
  let origin: URL;
  try {
    origin = new URL(typeof configured === 'string' ? configured.trim() : '');
  } catch {
    throw new Error('缺少有效的服务地址，无法访问修改提交记录。');
  }
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    !origin.hostname ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    (origin.pathname && origin.pathname !== '/')
  )
    throw new Error('服务地址无效，无法访问修改提交记录。');
  return keychainService(
    `com.gary.miaoxun.rn.workspace-continuation.${encodeURIComponent(
      JSON.stringify([origin.origin, userId, workspaceId]),
    )}`,
  );
}

async function readRecord(scope: string, userId: string, workspaceId: string) {
  const saved = await Keychain.getGenericPassword({ service: scope });
  if (!saved) return null;
  if (saved.username !== userId)
    throw new Error('修改提交记录账号不匹配，请重试读取。');
  let value: unknown;
  try {
    value = JSON.parse(saved.password);
  } catch {
    throw new Error('无法读取待确认的修改提交记录。');
  }
  if (
    !isWorkspaceContinuationAttempt(value) ||
    value.workspaceId !== workspaceId
  )
    throw new Error('修改提交记录格式或任务身份不匹配，请重试读取。');
  return value;
}

// Serialize same-scope changes so a stale completion cannot erase a new record.
const mutations = new Map<string, Promise<unknown>>();
async function mutate<T>(scope: string, work: () => Promise<T>) {
  const previous = mutations.get(scope) || Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  mutations.set(scope, next);
  try {
    return await next;
  } finally {
    if (mutations.get(scope) === next) mutations.delete(scope);
  }
}

export const workspaceContinuationStore = {
  async read(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceContinuationAttempt | null> {
    return readRecord(service(userId, workspaceId), userId, workspaceId);
  },
  async save(userId: string, value: WorkspaceContinuationAttempt) {
    if (!isWorkspaceContinuationAttempt(value))
      throw new Error('修改提交记录格式不受支持，尚未发送请求。');
    const scope = service(userId, value.workspaceId);
    await mutate(scope, async () => {
      const existing = await readRecord(scope, userId, value.workspaceId);
      if (existing) {
        if (
          Object.keys(value).every(
            key =>
              value[key as keyof WorkspaceContinuationAttempt] ===
              existing[key as keyof WorkspaceContinuationAttempt],
          )
        )
          return;
        throw new Error('这项任务还有待确认的修改，请先核对原提交。');
      }
      const saved = await Keychain.setGenericPassword(
        userId,
        JSON.stringify(value),
        {
          service: scope,
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        },
      );
      if (!saved) throw new Error('无法保存修改提交记录，尚未发送请求。');
    });
  },
  async clear(userId: string, workspaceId: string, key: string) {
    const scope = service(userId, workspaceId);
    await mutate(scope, async () => {
      const existing = await readRecord(scope, userId, workspaceId);
      if (!existing) return;
      if (existing.idempotencyKey !== key)
        throw new Error('本机记录已变化，不能清理另一项修改提交。');
      const cleared = await Keychain.resetGenericPassword({ service: scope });
      if (!cleared) throw new Error('无法清理已确认的修改记录，请重试核对。');
    });
  },
};
