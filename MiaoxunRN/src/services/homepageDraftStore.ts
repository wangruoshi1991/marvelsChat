import * as Keychain from 'react-native-keychain';

const service = 'com.gary.miaoxun.rn.homepage-draft';

export type HomepageLocalDraftState = {
  schemaVersion: 1;
  userId: string;
  prompt: string;
  selectedMediaAssetIds: string[];
  activeJobId: string | null;
  draftId: string | null;
  updatedAt: string;
};

const parseState = (
  value: string,
  expectedUserId: string,
): HomepageLocalDraftState | null => {
  try {
    const parsed = JSON.parse(value) as Partial<HomepageLocalDraftState>;
    if (
      parsed.schemaVersion !== 1 ||
      parsed.userId !== expectedUserId ||
      typeof parsed.prompt !== 'string' ||
      !Array.isArray(parsed.selectedMediaAssetIds) ||
      !parsed.selectedMediaAssetIds.every(item => typeof item === 'string') ||
      !(
        parsed.activeJobId === null || typeof parsed.activeJobId === 'string'
      ) ||
      !(parsed.draftId === null || typeof parsed.draftId === 'string') ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return null;
    }
    return parsed as HomepageLocalDraftState;
  } catch {
    return null;
  }
};

export const homepageDraftStore = {
  async save(value: HomepageLocalDraftState) {
    await Keychain.setGenericPassword(value.userId, JSON.stringify(value), {
      service,
    });
  },

  async read(userId: string) {
    const credentials = await Keychain.getGenericPassword({ service });
    if (!credentials || credentials.username !== userId) {
      return null;
    }
    return parseState(credentials.password, userId);
  },

  async clear() {
    await Keychain.resetGenericPassword({ service });
  },
};
