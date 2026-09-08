export type APIEnvelope<T> = {
  data: T;
};

export type APIErrorEnvelope = {
  error?: {
    message?: string;
    requestId?: string;
    details?: {
      code?: string;
      [key: string]: unknown;
    };
  };
};

export type UserDTO = {
  id: string;
  loginName?: string | null;
  email: string;
  phoneNumber?: string | null;
  displayName: string;
  aiId: string;
  role: string;
  adminPermissions?: string[];
  status?: string | null;
  presenceMode?: PresenceMode;
  createdAt?: string | null;
  lastLoginAt?: string | null;
};

export type PresenceMode = 'online' | 'offline' | 'hidden';
export type PublicPresenceStatus = 'online' | 'offline';

type SessionDTO = {
  token: string;
  expiresAt: string;
};

export type ProfileDTO = {
  userId: string;
  nickname: string;
  avatarText: string;
  avatarConfig: AvatarConfigDTO;
  bio: string;
  community: string;
  activityArea: string;
  miaoPoints: number;
  followingCount: number;
  followersCount: number;
  likesCount: number;
  collectionsCount: number;
  stationConfig: {
    language?: 'zh' | 'en';
    appearance?: 'light' | 'dark';
    siteDraftId?: string;
    siteLayout?: StationSiteDraftContentDTO;
  };
};

export type AvatarConfigDTO = {
  version?: 2;
  seed?: string;
  body?: 'compact' | 'standard' | 'tall' | 'strong';
  face?: 'soft' | 'oval' | 'angular' | 'round';
  skinTone?: 'porcelain' | 'warm' | 'tan' | 'deep';
  hairStyle?: 'short' | 'bob' | 'wave' | 'curly' | 'undercut';
  hairColor?: 'black' | 'brown' | 'copper' | 'silver' | 'blue';
  outfit?: 'street' | 'campus' | 'tech' | 'artist' | 'sport';
  accent?: 'sunrise' | 'mint' | 'sky' | 'rose' | 'violet';
  pose?: 'casual' | 'hello' | 'ready';
  eyeStyle?: 'round' | 'bright' | 'calm' | 'sharp';
  browStyle?: 'soft' | 'straight' | 'bold' | 'tilt';
  mouthStyle?: 'smile' | 'calm' | 'confident' | 'cute';
  top?: 'hoodie' | 'shirt' | 'jacket' | 'sweater' | 'uniform';
  bottom?: 'cargo' | 'jeans' | 'shorts' | 'skirt' | 'track';
  shoes?: 'sneaker' | 'boot' | 'canvas' | 'runner';
  action?: 'stand' | 'cross-arms' | 'wave' | 'soccer' | 'question' | 'sit';
  expression?: 'calm' | 'smile' | 'focus';
  accessory?: 'none' | 'spark' | 'cap' | 'glasses' | 'headphones';
};

export type LocationResolveDTO = {
  latitude: number;
  longitude: number;
  community: string;
  activityArea: string;
  communityCandidates: LocationCandidateDTO[];
  activityAreaCandidates: LocationCandidateDTO[];
  displayName: string;
  country: string;
  provider: string;
};

export type LocationCandidateDTO = {
  id: string;
  type: string;
  name: string;
  detail: string;
};

export type ThreadDTO = {
  id: string;
  title: string;
  status?: string | null;
  avatarText: string;
  avatarConfig?: AvatarConfigDTO | null;
  peerPresenceStatus?: PublicPresenceStatus | null;
  agentId?: string | null;
  peerUserId?: string | null;
  peerAiId?: string | null;
  kind: string;
  pinned: boolean;
  muted?: boolean;
  lastContent: string;
  lastMessageAt?: string | null;
  unreadCount: number;
};

export type MessageDTO = {
  id: string;
  threadId: string;
  userId?: string | null;
  senderType: 'user' | 'agent' | 'system' | string;
  senderName: string;
  content: string;
  metadata?: Record<string, unknown>;
  clientMessageId?: string | null;
  deletedAt?: string | null;
  recalledAt?: string | null;
  createdAt?: string | null;
};

export type AgentDTO = {
  key: string;
  name: string;
  version: string;
  category: string;
  description: string;
  capabilities: string[];
  permissions: string[];
  identity?: AgentIdentityDTO | null;
  status: string;
};

export type AgentIdentityDTO = {
  avatarKind: 'agent-mark';
  mark: string;
  shape: 'circle' | 'squircle' | 'rounded';
  colors: {
    background: string;
    foreground: string;
    accent: string;
  };
};

export type OwnedAgentDTO = {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  grantedScopes: string[];
  createdAt?: string | null;
};

type AgentProviderStatusDTO = {
  provider: string;
  configured: boolean;
  missing: string[];
};

export type AgentReadinessDTO = {
  configured: boolean;
  requiredEnv: string[];
  missingEnv: string[];
  optionalEnv: string[];
  missingOptionalEnv: string[];
  capabilityNeeds: string[];
  providers: Record<string, AgentProviderStatusDTO>;
};

export type ModuleDTO = {
  key: string;
  title: string;
  status: string;
  label: string;
  description: string;
  needs?: string[] | null;
};

export type NoticeDTO = {
  id: string;
  kind: string;
  title: string;
  body: string;
  targetType?: string | null;
  targetId?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
  payload?: Record<string, unknown>;
  readAt?: string | null;
  createdAt?: string | null;
};

export type NotificationListDTO = {
  items: NoticeDTO[];
  unreadCount: number;
};

export type ProfileVisibilityDTO = {
  showBio: boolean;
  showAiId: boolean;
  showCounts: boolean;
  showCommunity: boolean;
  showActivityArea: boolean;
  showCollections: boolean;
  showPosts: boolean;
  showAlbum: boolean;
  showDiary: boolean;
  showMusic: boolean;
  showFiles: boolean;
  showFollowingList: boolean;
  showFollowersList: boolean;
};

export type PublicProfileDTO = {
  user: {
    id: string;
    displayName: string;
    aiId: string;
    presenceStatus?: PublicPresenceStatus;
    presenceMode?: PresenceMode;
  };
  profile: {
    userId: string;
    nickname: string;
    avatarText: string;
    avatarConfig: AvatarConfigDTO;
    bio: string;
    community: string;
    activityArea: string;
    miaoPoints: number;
    followingCount: number;
    followersCount: number;
    likesCount: number;
    collectionsCount: number;
  };
  relation: {
    isSelf: boolean;
    isFollowing: boolean;
    isFriend: boolean;
    pendingFriendRequestId?: string | null;
  };
  visibility?: ProfileVisibilityDTO;
};

export type RelationshipProfileDTO = {
  user: {
    id: string;
    displayName: string;
    aiId: string;
    presenceStatus?: PublicPresenceStatus;
  };
  profile: {
    userId: string;
    nickname: string;
    avatarText: string;
    avatarConfig: AvatarConfigDTO;
    bio: string;
    community: string;
    activityArea: string;
    followersCount: number;
    followingCount: number;
    likesCount: number;
    collectionsCount: number;
  };
  relationType: string;
  threadId?: string | null;
  createdAt?: string | null;
};

export type FriendThreadDTO = {
  thread: ThreadDTO;
  messages: MessageDTO[];
};

export type SearchHistoryDTO = {
  id: string;
  query: string;
  scope: string;
  createdAt?: string | null;
};

export type StationVisibility = 'private' | 'friends' | 'public';

export type MiaoPointLedgerEntryDTO = {
  id: string;
  userId: string;
  amount: number;
  balanceAfter?: number | null;
  title: string;
  description: string;
  eventType: string;
  sourceType?: string | null;
  sourceId?: string | null;
  createdAt: string;
};

export type StationDiaryEntryDTO = {
  id: string;
  userId: string;
  title: string;
  body: string;
  mood: string;
  visibility: StationVisibility;
  source: 'manual' | 'agent';
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type StationAlbumDTO = {
  id: string;
  userId: string;
  title: string;
  description: string;
  visibility: StationVisibility;
  mediaCount: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type StationMediaAssetDTO = {
  id: string;
  userId: string;
  albumId?: string | null;
  kind: 'image' | 'video';
  storageProvider: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  byteSize?: number | null;
  width?: number | null;
  height?: number | null;
  caption: string;
  status: 'pending_upload' | 'uploaded' | 'rejected' | 'deleted';
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type StationPostDTO = {
  id: string;
  userId: string;
  body: string;
  locationLabel: string;
  visibility: StationVisibility;
  agentCapabilities: string[];
  likeCount: number;
  commentCount: number;
  favoriteCount: number;
  media: StationMediaAssetDTO[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type StationOutfitDTO = {
  id: string;
  userId: string;
  title: string;
  note: string;
  avatarConfig: AvatarConfigDTO;
  mediaAssetId?: string | null;
  visibility: StationVisibility;
  source: 'manual' | 'agent';
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type StationContentDTO = {
  posts: StationPostDTO[];
  diaryEntries: StationDiaryEntryDTO[];
  albums: StationAlbumDTO[];
  mediaAssets: StationMediaAssetDTO[];
  outfits: StationOutfitDTO[];
  siteDrafts: StationSiteDraftDTO[];
  fileAssets: StationFileAssetDTO[];
  comicDiaries: StationComicDiaryDTO[];
  videoDrafts: StationVideoDraftDTO[];
};

export type StationMediaUploadDTO = {
  asset: StationMediaAssetDTO;
  upload: {
    method: 'PUT';
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
    objectKey: string;
    storageProvider: string;
  };
};

export type StationSiteDraftDTO = {
  id: string;
  userId?: string;
  prompt: string;
  draft: StationSiteDraftContentDTO;
  source: string;
  status?: string;
  modelProvider?: string;
  modelMissing?: string[];
  modelError?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type StationSiteDraftContentDTO = {
  version?: number;
  language?: 'zh' | 'en';
  title?: string;
  theme?: string;
  summary?: string;
  sections?: StationSiteSectionDTO[];
};

export type StationSiteSectionDTO = {
  type?: string;
  title?: string;
  subtitle?: string;
  body?: string;
  assetIds?: string[];
  diaryEntryIds?: string[];
  actions?: Array<{
    label?: string;
    kind?: string;
    href?: string;
  }>;
};

export type Avatar3DQualityPresetId = 'standard' | 'ultra';

export type Avatar3DJobStatus =
  | 'queued_references'
  | 'submitting_references'
  | 'processing_references'
  | 'persisting_references'
  | 'awaiting_reference_confirmation'
  | 'queued_3d'
  | 'submitting_3d'
  | 'processing_3d'
  | 'persisting'
  | 'succeeded'
  | 'failed'
  | 'quality_failed'
  | 'cancelled'
  | 'submission_unknown';

export type Avatar3DModelDTO = {
  id: string;
  jobId: string;
  title: string;
  status: 'preparing' | 'active' | 'deleted';
  modelProvider?: string;
  qualityStatus?: string | null;
  byteSize: number;
  thumbnailAvailable: boolean;
  interactiveAvailable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Avatar3DBootstrapDTO = {
  user: UserDTO;
  feature: {
    enabled: boolean;
    generationAvailable: boolean;
    dailyLimit: number;
    retentionDays: number;
    costVersion: string;
    referenceGenerationEstimatedCostFen: number;
    defaultQualityPreset: Avatar3DQualityPresetId;
    qualityPresets: Array<{
      id: Avatar3DQualityPresetId;
      label: string;
      description: string;
      estimatedCostFen: number;
    }>;
  };
  quota: {
    dailyUsed: number;
    dailyRemaining: number;
    hasActiveJob: boolean;
  };
  jobs: Avatar3DJobDTO[];
  activeJob: Avatar3DJobDTO | null;
  models: Avatar3DModelDTO[];
};

export type Avatar3DJobDTO = {
  id: string;
  userId?: string;
  style: string;
  qualityPreset: Avatar3DQualityPresetId;
  generationMode: 'face_first_multiview';
  referenceSetId: string | null;
  status: Avatar3DJobStatus;
  progress: number;
  photoCount: number;
  acceptedCostVersion: string;
  estimatedCostFen: number;
  modelId: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export type Avatar3DPhotoDTO = {
  id: string;
  jobId: string | null;
  view: string | null;
  originalFilename: string;
  mimeType: 'image/jpeg' | 'image/png';
  byteSize: number;
  width: number | null;
  height: number | null;
  status: string;
  purpose: string;
  quality: {
    level: 'good' | 'advisory';
    canContinue: boolean;
    suggestions: string[];
  } | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Avatar3DPhotoUploadDTO = {
  photo: Avatar3DPhotoDTO;
  upload: {
    method: 'PUT';
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
  };
};

type Avatar3DReferenceSetDTO = {
  id: string;
  jobId: string;
  status: string;
  expectedImageCount: number;
  actualImageCount: number;
  usageImageCount: number;
  costVersion: string | null;
  estimatedCostFen: number;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Avatar3DReferenceImageDTO = {
  id: string;
  referenceSetId: string;
  jobId: string;
  view: 'front' | 'left' | 'back' | 'right';
  sequenceIndex: number;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type Avatar3DReferencesDTO = {
  referenceSet: Avatar3DReferenceSetDTO;
  images: Avatar3DReferenceImageDTO[];
};

export type Avatar3DCreateJobPayload = {
  generationMode: 'face_first_multiview';
  photoId: string;
  bodyShape: 'balanced' | 'slender' | 'athletic';
  pose: 'natural';
  outfit: 'business' | 'smart_casual' | 'casual' | 'sport' | 'formal';
  userDescription: string;
  qualityPreset: Avatar3DQualityPresetId;
  acceptedPhotoRights: true;
  acceptedAdultSubject: true;
  acceptedFaceCompletion: true;
  acceptedReferenceCostVersion: string;
};

export type StationFileAssetDTO = {
  id: string;
  userId?: string;
  originalFilename: string;
  mimeType: string;
  byteSize?: number | null;
  storageProvider: string;
  sourceKind: string;
  status: string;
  preprocessingResult?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type StationAlbumSuggestionDTO = {
  title: string;
  description: string;
  visibility?: StationVisibility;
  mediaAssetIds: string[];
  reason?: string;
  tags?: string[];
};

export type StationComicDiaryDTO = {
  id: string;
  userId?: string;
  title: string;
  prompt: string;
  style: string;
  sourceDiaryEntryId?: string | null;
  sourceMediaAssetIds?: string[];
  sourceFileAssetIds?: string[];
  frames: Array<Record<string, unknown>>;
  summary: string;
  status?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type StationVideoDraftDTO = {
  id: string;
  userId?: string;
  title: string;
  prompt: string;
  format: string;
  aspectRatio: string;
  durationSeconds: number;
  sourceDiaryEntryId?: string | null;
  sourceComicDiaryId?: string | null;
  sourceMediaAssetIds?: string[];
  sourceFileAssetIds?: string[];
  script: Record<string, unknown>;
  shots: Array<Record<string, unknown>>;
  summary: string;
  status?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type BootstrapDTO = {
  serverTime: string;
  user: UserDTO;
  profile: ProfileDTO;
  threads: ThreadDTO[];
  messagesByThread: Record<string, MessageDTO[]>;
  notices: NoticeDTO[];
  unreadNoticeCount: number;
  profileVisibility: ProfileVisibilityDTO;
  searchHistory: SearchHistoryDTO[];
  relationships: {
    following: RelationshipProfileDTO[];
    followers: RelationshipProfileDTO[];
    friends: RelationshipProfileDTO[];
  };
  stationContent: StationContentDTO;
  agents: {
    registered: AgentDTO[];
    owned: OwnedAgentDTO[];
  };
  agentReadiness: Record<string, AgentReadinessDTO>;
  modules: Record<string, ModuleDTO>;
};

export type AppSyncDTO = {
  threads: ThreadDTO[];
  messagesByThread: Record<string, MessageDTO[]>;
  notices: NoticeDTO[];
  unreadNoticeCount: number;
  serverTime: string;
};

export type ButlerClientContextPayload = {
  currentPage: string;
  language: 'zh' | 'en';
  appearance: 'light' | 'dark';
  profileSnapshot: {
    nickname: string;
    followersCount: number;
    followingCount: number;
    collectionsCount: number;
    miaoPoints: number;
  };
  enabledAgentIds: string[];
};

export type ButlerLocalActionResultPayload = {
  type: string;
  status: 'applied' | 'rejected' | 'unsupported';
  message: string;
};

export type SendMessageResponse = {
  messages: MessageDTO[];
  agentRun?: {
    id: string;
    agentId: string;
    status: string;
    provider: string;
    latencyMs?: number | null;
    tokenTotal?: number | null;
  } | null;
};

export type AuthResponse = {
  user: UserDTO;
  session: SessionDTO;
};

export type AccountDeletionDTO = {
  deleted: true;
};
