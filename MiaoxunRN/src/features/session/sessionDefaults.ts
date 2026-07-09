import {
  ProfileDTO,
  StationContentDTO,
  ProfileVisibilityDTO,
} from '../../models/api';
import { RelationshipsState } from './sessionTypes';

export const syncIntervalMs = 30000;
export const realtimeReconnectDelaysMs = [1000, 2000, 5000, 10000];

export const emptyProfile: ProfileDTO = {
  userId: '',
  nickname: '未登录',
  avatarText: '妙',
  avatarConfig: {},
  bio: '登录后同步小站资料。',
  community: '未设置',
  activityArea: '未设置',
  miaoPoints: 0,
  followingCount: 0,
  followersCount: 0,
  collectionsCount: 0,
  stationConfig: {},
};

export const defaultProfileVisibility: ProfileVisibilityDTO = {
  showBio: true,
  showAiId: true,
  showCounts: true,
  showCommunity: true,
  showActivityArea: true,
  showCollections: true,
  showPosts: true,
  showAlbum: true,
  showDiary: true,
  showMusic: true,
  showFiles: false,
  showFollowingList: false,
  showFollowersList: false,
};

export const emptyRelationships: RelationshipsState = {
  following: [],
  followers: [],
  friends: [],
};

export const emptyStationContent: StationContentDTO = {
  diaryEntries: [],
  albums: [],
  mediaAssets: [],
  outfits: [],
  siteDrafts: [],
  modelJobs: [],
  modelAssets: [],
  fileAssets: [],
  comicDiaries: [],
  videoDrafts: [],
};

export const appErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;
