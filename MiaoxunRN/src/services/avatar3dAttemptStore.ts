import * as Keychain from 'react-native-keychain';

import { Avatar3DPhotoDTO, Avatar3DQualityPresetId } from '../models/api';

const service = 'com.gary.miaoxun.rn.avatar3d.pending-submission';
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Avatar3DPendingSubmission = {
  version: 1;
  userId: string;
  idempotencyKey: string;
  photo: Avatar3DPhotoDTO;
  options: {
    bodyShape: 'balanced' | 'slender' | 'athletic';
    outfit: 'business' | 'smart_casual' | 'casual' | 'sport' | 'formal';
    qualityPreset: Avatar3DQualityPresetId;
    userDescription: string;
  };
  createdAt: string;
};

const isPendingSubmission = (
  value: unknown,
): value is Avatar3DPendingSubmission => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const item = value as Partial<Avatar3DPendingSubmission>;
  return Boolean(
    item.version === 1 &&
      typeof item.userId === 'string' &&
      typeof item.idempotencyKey === 'string' &&
      uuidPattern.test(item.idempotencyKey) &&
      item.photo &&
      typeof item.photo.id === 'string' &&
      item.options &&
      ['balanced', 'slender', 'athletic'].includes(item.options.bodyShape) &&
      ['business', 'smart_casual', 'casual', 'sport', 'formal'].includes(
        item.options.outfit,
      ) &&
      ['standard', 'ultra'].includes(item.options.qualityPreset) &&
      typeof item.options.userDescription === 'string' &&
      typeof item.createdAt === 'string',
  );
};

export const avatar3dAttemptStore = {
  async save(submission: Avatar3DPendingSubmission) {
    await Keychain.setGenericPassword(
      submission.userId,
      JSON.stringify(submission),
      { service },
    );
  },

  async read(userId: string) {
    const credentials = await Keychain.getGenericPassword({ service });
    if (!credentials || credentials.username !== userId) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(credentials.password);
      return isPendingSubmission(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },

  async clear() {
    await Keychain.resetGenericPassword({ service });
  },
};
