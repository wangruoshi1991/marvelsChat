import * as Keychain from 'react-native-keychain';
import { MiaoxunApiError } from '../../services/api/http';
import { RetrievalAction } from './mediaRetrievalTypes';

export type PendingRetrievalOperation = {
  action: RetrievalAction;
  key: string;
  chargeReview?: boolean;
};
export type RetrievalJournal = {
  read(): Promise<PendingRetrievalOperation | null>;
  write(value: PendingRetrievalOperation | null): Promise<void>;
};

export function mediaRetrievalJournal(userId: string): RetrievalJournal {
  if (!userId) throw new Error('Media retrieval requires an account identity.');
  const service = `com.wangruoshi.miaoxun.retrieval.${userId}`;
  const storageError = () =>
    new MiaoxunApiError('无法保存检索操作，请稍后重试。', {
      code: 'retrieval_local_storage',
      retryable: true,
    });
  return {
    async read() {
      try {
        const credentials = await Keychain.getGenericPassword({ service });
        if (!credentials) return null;
        const value = JSON.parse(credentials.password);
        if (
          credentials.username !== userId ||
          !value ||
          !['enable', 'reindex', 'purge'].includes(value.action) ||
          typeof value.key !== 'string' ||
          !/^[A-Za-z0-9._-]{8,160}$/.test(value.key) ||
          (value.chargeReview !== undefined &&
            typeof value.chargeReview !== 'boolean')
        )
          throw storageError();
        return {
          action: value.action,
          key: value.key,
          chargeReview: value.chargeReview === true,
        };
      } catch {
        throw storageError();
      }
    },
    async write(value) {
      try {
        if (value) {
          const saved = await Keychain.setGenericPassword(
            userId,
            JSON.stringify(value),
            { service },
          );
          if (!saved) throw storageError();
        } else {
          await Keychain.resetGenericPassword({ service });
          // A platform may report false for an absent entry. Verify absence
          // rather than treating that return value as either success or failure.
          if (await Keychain.getGenericPassword({ service }))
            throw storageError();
        }
      } catch {
        throw storageError();
      }
    },
  };
}
