import { normalizeAvatarConfig } from "./avatar-service.js";
import { projectAvatarPhotoQuality } from "./avatar-3d-photo-quality.js";
import { normalizeLocationText } from "./location-labels.js";

export const toIso = (value) => (value instanceof Date ? value.toISOString() : value || null);

export const parseJson = (value, fallback = null) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const sqlLimit = (value, fallback = 80, max = 200) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
};

export const displayInitial = (name) => {
  const value = String(name || "").trim();
  return value ? [...value][0].toUpperCase() : "妙";
};

export const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
export const normalizeLoginName = (loginName) => String(loginName || "").trim().toLowerCase();
export const normalizePhoneNumber = (phoneNumber) => String(phoneNumber || "").replace(/\D/g, "");
export const normalizeDisplayName = (name) => String(name || "").trim().toLowerCase();
export const recallWindowMs = 60 * 1000;

export const normalizePresenceMode = (value) => (
  ["online", "offline", "hidden"].includes(value) ? value : "online"
);

const publicPresenceStatus = ({ presenceMode, isConnected }) =>
  presenceMode === "online" && isConnected ? "online" : "offline";

export const normalizeOnlineUserIds = (onlineUserIds = []) =>
  Array.from(new Set((onlineUserIds || []).map((id) => String(id || "").trim()).filter(Boolean)));

export const publicUser = (row) => ({
  id: row.id,
  loginName: row.login_name || null,
  email: row.email,
  phoneNumber: row.phone_number || null,
  displayName: row.display_name,
  aiId: row.ai_id,
  role: row.role,
  adminPermissions: parseJson(row.admin_permissions, []),
  status: row.status,
  presenceMode: normalizePresenceMode(row.presence_mode),
  createdAt: toIso(row.created_at),
  lastLoginAt: toIso(row.last_login_at),
});

export const mapProfile = (row) => ({
  userId: row.user_id,
  nickname: row.nickname,
  avatarText: row.avatar_text,
  bio: row.bio || "",
  community: normalizeLocationText(row.community),
  activityArea: normalizeLocationText(row.activity_area),
  avatarConfig: normalizeAvatarConfig(parseJson(row.avatar_config, {}), row.ai_id || row.user_id),
  miaoPoints: Number(row.miao_points || 0),
  followingCount: Number(row.following_count || 0),
  followersCount: Number(row.followers_count || 0),
  likesCount: Number(row.likes_count || 0),
  collectionsCount: Number(row.collections_count || 0),
  stationConfig: parseJson(row.station_config, {}),
  updatedAt: toIso(row.updated_at),
});

export const mapMiaoPointLedgerEntry = (row) => ({
  id: row.id,
  userId: row.user_id,
  amount: Number(row.amount || 0),
  balanceAfter:
    row.balance_after === null || row.balance_after === undefined
      ? null
      : Number(row.balance_after),
  title: row.title,
  description: row.description || "",
  eventType: row.event_type,
  sourceType: row.source_type || null,
  sourceId: row.source_id || null,
  createdAt: toIso(row.created_at),
});

export const mapStationDiaryEntry = (row) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  body: row.body,
  mood: row.mood || "",
  visibility: row.visibility,
  source: row.source,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const mapStationPost = (row, { media = [] } = {}) => {
  const agentCapabilities = parseJson(row.agent_capabilities, []);
  return {
    id: row.id,
    userId: row.user_id,
    body: row.body || "",
    locationLabel: row.location_label || "",
    visibility: row.visibility,
    agentCapabilities: Array.isArray(agentCapabilities) ? agentCapabilities : [],
    likeCount: Number(row.like_count || 0),
    commentCount: Number(row.comment_count || 0),
    favoriteCount: Number(row.favorite_count || 0),
    media,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
};

export const mapStationAlbum = (row) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  description: row.description || "",
  visibility: row.visibility,
  mediaCount: Number(row.media_count || 0),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const mapStationMediaAsset = (row) => ({
  id: row.id,
  userId: row.user_id,
  albumId: row.album_id || null,
  kind: row.kind,
  storageProvider: row.storage_provider,
  storageKey: row.storage_key || "",
  originalFilename: row.original_filename || "",
  mimeType: row.mime_type || "",
  byteSize: row.byte_size === null || row.byte_size === undefined ? null : Number(row.byte_size),
  width: row.width === null || row.width === undefined ? null : Number(row.width),
  height: row.height === null || row.height === undefined ? null : Number(row.height),
  caption: row.caption || "",
  tags: parseJson(row.tags, []),
  metadata: parseJson(row.metadata, {}),
  status: row.status,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const mapStationOutfit = (row) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  note: row.note || "",
  avatarConfig: normalizeAvatarConfig(parseJson(row.avatar_config, {}), row.user_id),
  mediaAssetId: row.media_asset_id || null,
  visibility: row.visibility,
  source: row.source,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const mapStationSiteDraft = (row) => ({
  id: row.id,
  userId: row.user_id,
  prompt: row.prompt || "",
  draft: parseJson(row.draft, {}),
  source: row.source || "fallback",
  status: row.status || "draft",
  modelProvider: row.model_provider || "",
  modelMissing: parseJson(row.model_missing, []),
  modelError: row.model_error || "",
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const mapAvatar3dJob = (row) => ({
  id: row.id,
  userId: row.user_id,
  style: row.style,
  qualityPreset: row.quality_preset || "standard",
  generationMode: row.generation_mode || "legacy_photo_3d",
  referenceSetId: row.reference_set_id || null,
  technicalRetryCount: Number(row.technical_retry_count || 0),
  qualityStatus: row.quality_status || null,
  status: row.status,
  progress: Number(row.progress || 0),
  photoCount: Number(row.photo_count || 0),
  acceptedCostVersion: row.accepted_cost_version,
  estimatedCostFen: Number(row.estimated_cost_fen || 0),
  stylePreviewId: row.style_preview_id || null,
  modelId: row.model_id || null,
  errorCode: row.safe_error_code || null,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  finishedAt: toIso(row.finished_at),
});

export const mapAvatar3dPhoto = (row) => ({
  id: row.id,
  jobId: row.job_id || null,
  view: row.view || null,
  originalFilename: row.original_filename,
  mimeType: row.source_mime_type,
  byteSize: Number(row.source_byte_size || 0),
  width: row.width === null || row.width === undefined ? null : Number(row.width),
  height: row.height === null || row.height === undefined ? null : Number(row.height),
  status: row.status,
  purpose: row.purpose || "reference",
  quality: projectAvatarPhotoQuality({
    qualityStatus: row.quality_status || null,
    qualityMetadata: row.quality_metadata || null,
  }),
  errorCode: row.safe_error_code || null,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const mapAvatar3dStylePreview = (row) => ({
  id: row.id,
  jobId: row.job_id,
  status: row.status,
  byteSize: Number(row.byte_size || 0),
  width: row.width === null || row.width === undefined ? null : Number(row.width),
  height: row.height === null || row.height === undefined ? null : Number(row.height),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const mapAvatar3dModel = (row) => ({
  id: row.id,
  jobId: row.job_id,
  title: row.title,
  status: row.status,
  modelProvider: row.model_provider || "tripo",
  qualityStatus: row.quality_status || null,
  byteSize: Number(row.glb_byte_size || 0),
  thumbnailAvailable: Boolean(row.thumbnail_storage_key),
  interactiveAvailable:
    row.status === "active" && Boolean(row.mobile_glb_storage_key),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const mapFileAsset = (row) => ({
  id: row.id,
  userId: row.user_id,
  originalFilename: row.original_filename,
  mimeType: row.mime_type || "",
  byteSize: row.byte_size === null || row.byte_size === undefined ? null : Number(row.byte_size),
  checksumSha256: row.checksum_sha256 || "",
  storageProvider: row.storage_provider || "inline",
  storageKey: row.storage_key || "",
  sourceKind: row.source_kind || "inline_text",
  status: row.status || "processed",
  preprocessingResult: parseJson(row.preprocessing_result, {}),
  metadata: parseJson(row.metadata, {}),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const mapStationComicDiary = (row) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  prompt: row.prompt || "",
  style: row.style || "slice-of-life",
  sourceDiaryEntryId: row.source_diary_entry_id || null,
  sourceMediaAssetIds: parseJson(row.source_media_asset_ids, []),
  sourceFileAssetIds: parseJson(row.source_file_asset_ids, []),
  frames: parseJson(row.frames, []),
  summary: row.summary || "",
  status: row.status || "draft",
  metadata: parseJson(row.metadata, {}),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const mapStationVideoDraft = (row) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  prompt: row.prompt || "",
  format: row.format || "short-clip",
  aspectRatio: row.aspect_ratio || "9:16",
  durationSeconds: Number(row.duration_seconds || 45),
  sourceDiaryEntryId: row.source_diary_entry_id || null,
  sourceComicDiaryId: row.source_comic_diary_id || null,
  sourceMediaAssetIds: parseJson(row.source_media_asset_ids, []),
  sourceFileAssetIds: parseJson(row.source_file_asset_ids, []),
  script: parseJson(row.script, {}),
  shots: parseJson(row.shots, []),
  summary: row.summary || "",
  status: row.status || "draft",
  metadata: parseJson(row.metadata, {}),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const mapVisibility = (row = {}) => ({
  showBio: row.show_bio !== false,
  showAiId: row.show_ai_id !== false,
  showCounts: row.show_counts !== false,
  showCommunity: row.show_community !== false,
  showActivityArea: row.show_activity_area !== false,
  showCollections: row.show_collections !== false,
  showPosts: row.show_posts !== false,
  showAlbum: row.show_album !== false,
  showDiary: row.show_diary !== false,
  showMusic: row.show_music !== false,
  showFiles: row.show_files === true,
  showFollowingList: row.show_following_list === true,
  showFollowersList: row.show_followers_list === true,
});

export const mapThread = (row) => ({
  id: row.id,
  title: row.title,
  status: row.status_text,
  avatarText: row.avatar_text,
  avatarConfig: row.peer_avatar_config
    ? normalizeAvatarConfig(parseJson(row.peer_avatar_config, {}), row.peer_ai_id || row.peer_user_id)
    : null,
  peerPresenceStatus: row.peer_user_id
    ? publicPresenceStatus({
        presenceMode: normalizePresenceMode(row.peer_presence_mode),
        isConnected: row.peer_is_connected === true,
      })
    : null,
  agentId: row.agent_id,
  peerUserId: row.peer_user_id || null,
  peerAiId: row.peer_ai_id || null,
  kind: row.kind,
  pinned: Boolean(row.pinned),
  muted: Boolean(row.muted),
  lastContent: row.last_content || "",
  lastMessageAt: toIso(row.last_message_at),
  unreadCount: Number(row.unread_count || 0),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const mapMessage = (row) => ({
  id: row.id,
  threadId: row.thread_id,
  userId: row.user_id || null,
  senderType: row.sender_type,
  senderName: row.sender_name,
  content: row.content,
  metadata: parseJson(row.metadata, {}),
  clientMessageId: row.client_message_id || null,
  deletedAt: toIso(row.deleted_at),
  recalledAt: toIso(row.recalled_at),
  createdAt: toIso(row.created_at),
});

export const mapAgentRun = (row) => ({
  id: row.id,
  agentId: row.agent_id,
  status: row.status,
  userId: row.user_id,
  userEmail: row.user_email || null,
  threadId: row.thread_id,
  latencyMs: row.latency_ms,
  tokenPrompt: row.token_prompt,
  tokenCompletion: row.token_completion,
  tokenTotal: row.token_total,
  costCents: row.cost_cents,
  errorMessage: row.error_message || "",
  provider: row.provider || "unknown",
  createdAt: toIso(row.created_at),
  finishedAt: toIso(row.finished_at),
});

export const mapPublicProfile = (row, relation = {}) => {
  const visibility = mapVisibility(row);
  const canShowCounts = relation.isSelf || visibility.showCounts;
  const canShowAiId = relation.isSelf || visibility.showAiId;
  const canShowBio = relation.isSelf || visibility.showBio;
  const canShowCommunity = relation.isSelf || visibility.showCommunity;
  const canShowActivityArea = relation.isSelf || visibility.showActivityArea;
  return {
    user: {
      id: row.user_id,
      displayName: row.display_name,
      aiId: canShowAiId ? row.ai_id : "",
      presenceStatus: publicPresenceStatus({
        presenceMode: normalizePresenceMode(row.presence_mode),
        isConnected: row.is_connected === true,
      }),
      presenceMode: relation.isSelf ? normalizePresenceMode(row.presence_mode) : undefined,
    },
    profile: {
      userId: row.user_id,
      nickname: row.nickname,
      avatarText: row.avatar_text,
      avatarConfig: normalizeAvatarConfig(parseJson(row.avatar_config, {}), row.ai_id || row.user_id),
      bio: canShowBio ? row.bio || "" : "",
      community: canShowCommunity ? normalizeLocationText(row.community) : "",
      activityArea: canShowActivityArea ? normalizeLocationText(row.activity_area) : "",
      miaoPoints: Number(row.miao_points || 0),
      followingCount: canShowCounts ? Number(row.following_count || 0) : 0,
      followersCount: canShowCounts ? Number(row.followers_count || 0) : 0,
      likesCount: canShowCounts ? Number(row.likes_count || 0) : 0,
      collectionsCount: canShowCounts && visibility.showCollections ? Number(row.collections_count || 0) : 0,
    },
    relation: {
      isSelf: Boolean(relation.isSelf),
      isFollowing: Boolean(relation.isFollowing),
      isFriend: Boolean(relation.isFriend),
      pendingFriendRequestId: relation.pendingFriendRequestId || null,
    },
    visibility,
  };
};

export const mapRelationshipProfile = (row) => ({
  user: {
    id: row.user_id,
    displayName: row.display_name,
    aiId: row.ai_id,
    presenceStatus: publicPresenceStatus({
      presenceMode: normalizePresenceMode(row.presence_mode),
      isConnected: row.is_connected === true,
    }),
  },
  profile: {
    userId: row.user_id,
    nickname: row.nickname,
    avatarText: row.avatar_text,
    avatarConfig: normalizeAvatarConfig(parseJson(row.avatar_config, {}), row.ai_id || row.user_id),
    bio: row.bio || "",
    community: normalizeLocationText(row.community),
    activityArea: normalizeLocationText(row.activity_area),
    followersCount: Number(row.followers_count || 0),
    followingCount: Number(row.following_count || 0),
    likesCount: Number(row.likes_count || 0),
    collectionsCount: Number(row.collections_count || 0),
  },
  relationType: row.relation_type,
  threadId: row.thread_id || null,
  createdAt: toIso(row.created_at),
});

export const mapSearchHistory = (row) => ({
  id: row.id,
  query: row.query_text,
  scope: row.scope,
  createdAt: toIso(row.created_at),
});
