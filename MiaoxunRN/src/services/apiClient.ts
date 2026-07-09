import {
  APIEnvelope,
  APIErrorEnvelope,
  AppSyncDTO,
  AuthResponse,
  BootstrapDTO,
  ButlerClientContextPayload,
  ButlerLocalActionResultPayload,
  FriendThreadDTO,
  LocationResolveDTO,
  MessageDTO,
  NotificationListDTO,
  OwnedAgentDTO,
  PresenceMode,
  ProfileDTO,
  ProfileVisibilityDTO,
  PublicProfileDTO,
  RelationshipProfileDTO,
  SearchHistoryDTO,
  SendMessageResponse,
  StationAlbumSuggestionDTO,
  StationAlbumDTO,
  StationComicDiaryDTO,
  StationContentDTO,
  StationDiaryEntryDTO,
  StationFileAssetDTO,
  StationGenerationJobDTO,
  StationMediaAssetDTO,
  StationMediaUploadDTO,
  StationModelAssetDTO,
  StationOutfitDTO,
  StationSiteDraftDTO,
  StationVideoDraftDTO,
  StationVisibility,
} from '../models/api';
import { NativeModules } from 'react-native';

const nativeConfig = NativeModules.MiaoxunConfigModule as
  | { apiBaseURL?: unknown }
  | undefined;

const defaultRequestTimeoutMs = 20000;
const longRequestTimeoutMs = 45000;

export class MiaoxunApiError extends Error {
  status?: number;
  isNetworkError: boolean;
  isTimeout: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      isNetworkError?: boolean;
      isTimeout?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'MiaoxunApiError';
    this.status = options.status;
    this.isNetworkError = options.isNetworkError || false;
    this.isTimeout = options.isTimeout || false;
  }
}

export const isAuthSessionError = (error: unknown) =>
  error instanceof MiaoxunApiError &&
  (error.status === 401 || error.status === 403);

export const API_BASE_URL =
  typeof nativeConfig?.apiBaseURL === 'string' ? nativeConfig.apiBaseURL : '';

const normalizedApiBaseURL = (() => {
  const value = API_BASE_URL.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+/.test(value)) {
    throw new Error('Miaoxun API_BASE_URL must be an absolute HTTP(S) URL.');
  }
  return value;
})();

const stripApiPrefix = (path: string) => path.replace(/^\/api(?=\/|$)/, '');
const sanitizeUrlForLog = (url: string) =>
  url.replace(/([?&]token=)[^&]+/gi, '$1[redacted]');

const sanitizeBodyForLog = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return `[array:${value.length}]`;
  }
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  Object.entries(input).forEach(([key, item]) => {
    if (/password|token|secret|key|authorization|credential/i.test(key)) {
      output[key] = '[redacted]';
      return;
    }
    if (key === 'data' && item && typeof item === 'object') {
      output[key] = summarizeDataForLog(item);
      return;
    }
    output[key] = sanitizeBodyForLog(item);
  });
  return output;
};

const summarizeDataForLog = (value: object) => {
  if (Array.isArray(value)) {
    return `[array:${value.length}]`;
  }
  const input = value as Record<string, unknown>;
  return {
    keys: Object.keys(input).slice(0, 16),
    registeredAgents:
      input.agents &&
      typeof input.agents === 'object' &&
      Array.isArray((input.agents as { registered?: unknown }).registered)
        ? (input.agents as { registered: unknown[] }).registered.length
        : undefined,
    ownedAgents:
      input.agents &&
      typeof input.agents === 'object' &&
      Array.isArray((input.agents as { owned?: unknown }).owned)
        ? (input.agents as { owned: unknown[] }).owned.length
        : undefined,
    stationContent:
      input.stationContent && typeof input.stationContent === 'object'
        ? Object.fromEntries(
            Object.entries(input.stationContent as Record<string, unknown>).map(
              ([key, item]) => [key, Array.isArray(item) ? item.length : null],
            ),
          )
        : undefined,
  };
};

const logNetworkEvent = (
  phase: 'request' | 'response' | 'error',
  payload: Record<string, unknown>,
) => {
  console.info('[MiaoxunNetwork]', {
    environment: __DEV__ ? 'debug' : 'testflight',
    apiBaseURL: API_BASE_URL,
    ...payload,
    phase,
  });
};

export const buildApiUrl = (path: string) => {
  const rawPath = path.startsWith('/') ? path : `/${path}`;
  const normalizedPath = normalizedApiBaseURL.endsWith('/api')
    ? stripApiPrefix(rawPath)
    : rawPath;
  return `${normalizedApiBaseURL}${normalizedPath}`;
};

export const buildRealtimeUrl = (path: string) =>
  buildApiUrl(path).replace(/^http/i, 'ws');

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  token?: string;
  body?: unknown;
  timeoutMs?: number;
};

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs || defaultRequestTimeoutMs,
  );
  const method = options.method || 'GET';
  const finalUrl = buildApiUrl(path);
  let response: Response;
  let responseText = '';

  try {
    logNetworkEvent('request', {
      method,
      url: sanitizeUrlForLog(finalUrl),
      hasAuthorization: Boolean(options.token),
      requestBody: options.body ? sanitizeBodyForLog(options.body) : undefined,
    });
    response = await fetch(finalUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    logNetworkEvent('error', {
      method,
      url: sanitizeUrlForLog(finalUrl),
      message: error instanceof Error ? error.message : 'Network error',
    });
    if (error instanceof Error && error.name === 'AbortError') {
      throw new MiaoxunApiError('请求超时，请确认手机与后端网络连接后重试。', {
        isNetworkError: true,
        isTimeout: true,
      });
    }
    throw new MiaoxunApiError(
      '网络连接失败，请确认手机与后端网络连接后重试。',
      {
        isNetworkError: true,
      },
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) {
    logNetworkEvent('response', {
      method,
      url: sanitizeUrlForLog(finalUrl),
      status: response.status,
      responseBody: null,
    });
    if (!response.ok) {
      throw new MiaoxunApiError(`请求失败：${response.status}`, {
        status: response.status,
      });
    }
    return undefined as T;
  }

  responseText = await response.text().catch(() => '');
  const payload = (responseText ? parseJson(responseText) : null) as
    | APIEnvelope<T>
    | APIErrorEnvelope
    | null;

  logNetworkEvent('response', {
    method,
    url: sanitizeUrlForLog(finalUrl),
    status: response.status,
    responseBody: payload
      ? sanitizeBodyForLog(payload)
      : responseText
      ? '[non-json response]'
      : null,
  });

  if (!response.ok) {
    const message =
      payload && 'error' in payload
        ? payload.error?.message || `请求失败：${response.status}`
        : `请求失败：${response.status}`;
    throw new MiaoxunApiError(message, { status: response.status });
  }

  if (!payload || !('data' in payload)) {
    throw new Error('后端响应格式无效。');
  }

  return payload.data;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export const apiClient = {
  login(identifier: string, password: string) {
    return request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: { identifier, password },
    });
  },

  register(
    contactType: 'email' | 'phone',
    contact: string,
    password: string,
    displayName: string,
  ) {
    return request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: {
        contactType,
        ...(contactType === 'email'
          ? { email: contact }
          : { phoneNumber: contact }),
        password,
        displayName,
      },
    });
  },

  logout(token: string) {
    return request<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
      token,
    });
  },

  updatePresence(token: string, presenceMode: PresenceMode) {
    return request<AuthResponse['user']>('/api/me/presence', {
      method: 'PATCH',
      token,
      body: { presenceMode },
    });
  },

  bootstrap(token: string) {
    return request<BootstrapDTO>('/api/app/bootstrap', { token });
  },

  sync(updatedAfter: string | null, token: string) {
    const query = updatedAfter
      ? `?updatedAfter=${encodeURIComponent(updatedAfter)}`
      : '';
    return request<AppSyncDTO>(`/api/app/sync${query}`, { token });
  },

  resolveScan(payload: string, token: string) {
    return request<PublicProfileDTO>('/api/scan/resolve', {
      method: 'POST',
      token,
      body: { payload },
    });
  },

  followUser(targetUserId: string, token: string) {
    return request<{ ok: boolean }>(`/api/social/follows/${targetUserId}`, {
      method: 'POST',
      token,
    });
  },

  unfollowUser(targetUserId: string, token: string) {
    return request<{ ok: boolean }>(`/api/social/follows/${targetUserId}`, {
      method: 'DELETE',
      token,
    });
  },

  requestFriend(targetUserId: string, token: string, message = '') {
    return request<{ id: string; status: string }>(
      `/api/social/friend-requests/${targetUserId}`,
      {
        method: 'POST',
        token,
        body: { message },
      },
    );
  },

  acceptFriendRequest(requestId: string, token: string) {
    return request<{ id: string; status: string }>(
      `/api/social/friend-requests/${requestId}/accept`,
      {
        method: 'POST',
        token,
      },
    );
  },

  rejectFriendRequest(requestId: string, token: string) {
    return request<{ id: string; status: string }>(
      `/api/social/friend-requests/${requestId}/reject`,
      {
        method: 'POST',
        token,
      },
    );
  },

  cancelFriendRequest(requestId: string, token: string) {
    return request<{ id: string; status: string }>(
      `/api/social/friend-requests/${requestId}/cancel`,
      {
        method: 'POST',
        token,
      },
    );
  },

  relationships(type: 'following' | 'followers' | 'friends', token: string) {
    return request<RelationshipProfileDTO[]>(
      `/api/social/relationships/${type}`,
      { token },
    );
  },

  friendThread(friendUserId: string, token: string) {
    return request<FriendThreadDTO>(
      `/api/social/friends/${friendUserId}/thread`,
      {
        method: 'POST',
        token,
      },
    );
  },

  searchUsers(query: string, token: string) {
    return request<PublicProfileDTO[]>(
      `/api/search/users?query=${encodeURIComponent(query)}`,
      { token },
    );
  },

  profileByAiId(aiId: string, token: string) {
    return request<PublicProfileDTO>(
      `/api/profiles/ai/${encodeURIComponent(aiId)}`,
      { token },
    );
  },

  saveSearchHistory(query: string, token: string, scope = 'all') {
    return request<SearchHistoryDTO[]>('/api/search/history', {
      method: 'POST',
      token,
      body: { query, scope },
    });
  },

  notifications(token: string) {
    return request<NotificationListDTO>('/api/notifications', { token });
  },

  markNotificationsRead(token: string) {
    return request<{ ok: boolean }>('/api/notifications/read', {
      method: 'POST',
      token,
    });
  },

  markNotificationRead(notificationId: string, token: string) {
    return request<{ ok: boolean }>(
      `/api/notifications/${notificationId}/read`,
      {
        method: 'POST',
        token,
      },
    );
  },

  messages(threadId: string, token: string) {
    return request<MessageDTO[]>(`/api/threads/${threadId}/messages`, {
      token,
    });
  },

  sendMessage(
    threadId: string,
    content: string,
    token: string,
    clientContext?: ButlerClientContextPayload | null,
    localActionResult?: ButlerLocalActionResultPayload | null,
    replyToMessageId?: string | null,
  ) {
    const body: {
      content: string;
      clientContext?: ButlerClientContextPayload;
      localActionResult?: ButlerLocalActionResultPayload;
      replyToMessageId?: string;
    } = { content };

    if (clientContext) {
      body.clientContext = clientContext;
    }
    if (localActionResult) {
      body.localActionResult = localActionResult;
    }
    if (replyToMessageId) {
      body.replyToMessageId = replyToMessageId;
    }

    return request<SendMessageResponse>(`/api/threads/${threadId}/messages`, {
      method: 'POST',
      token,
      body,
      timeoutMs: longRequestTimeoutMs,
    });
  },

  markThreadRead(threadId: string, token: string) {
    return request<{ ok: boolean }>(`/api/threads/${threadId}/read`, {
      method: 'POST',
      token,
    });
  },

  deleteMessage(threadId: string, messageId: string, token: string) {
    return request<{ ok: boolean }>(
      `/api/threads/${threadId}/messages/${messageId}`,
      {
        method: 'DELETE',
        token,
      },
    );
  },

  recallMessage(threadId: string, messageId: string, token: string) {
    return request<{ message: MessageDTO }>(
      `/api/threads/${threadId}/messages/${messageId}/recall`,
      {
        method: 'POST',
        token,
      },
    );
  },

  updateStationConfig(
    token: string,
    config: { language?: 'zh' | 'en'; appearance?: 'light' | 'dark' },
  ) {
    return request<ProfileDTO>('/api/me/station-config', {
      method: 'PATCH',
      token,
      body: config,
    });
  },

  updateProfile(
    token: string,
    profile: Pick<
      ProfileDTO,
      | 'nickname'
      | 'avatarText'
      | 'bio'
      | 'community'
      | 'activityArea'
      | 'avatarConfig'
    >,
  ) {
    return request<ProfileDTO>('/api/me/profile', {
      method: 'PATCH',
      token,
      body: profile,
    });
  },

  resolveLocation(
    token: string,
    coordinates: { latitude: number; longitude: number },
  ) {
    return request<LocationResolveDTO>('/api/location/resolve', {
      method: 'POST',
      token,
      body: coordinates,
      timeoutMs: longRequestTimeoutMs,
    });
  },

  updateProfileVisibility(
    token: string,
    visibility: Partial<ProfileVisibilityDTO>,
  ) {
    return request<ProfileVisibilityDTO>('/api/me/profile-visibility', {
      method: 'PATCH',
      token,
      body: visibility,
    });
  },

  stationContent(token: string) {
    return request<StationContentDTO>('/api/station/content', { token });
  },

  setAgentEnabled(token: string, agentId: string, enabled: boolean) {
    return request<OwnedAgentDTO>(`/api/me/agents/${agentId}`, {
      method: 'PATCH',
      token,
      body: { enabled },
    });
  },

  createStationDiary(
    token: string,
    payload: {
      title: string;
      body: string;
      mood?: string;
      visibility?: StationVisibility;
    },
  ) {
    return request<StationDiaryEntryDTO>('/api/station/diary', {
      method: 'POST',
      token,
      body: payload,
    });
  },

  updateStationDiary(
    token: string,
    entryId: string,
    payload: Partial<{
      title: string;
      body: string;
      mood: string;
      visibility: StationVisibility;
    }>,
  ) {
    return request<StationDiaryEntryDTO>(`/api/station/diary/${entryId}`, {
      method: 'PATCH',
      token,
      body: payload,
    });
  },

  deleteStationDiary(token: string, entryId: string) {
    return request<void>(`/api/station/diary/${entryId}`, {
      method: 'DELETE',
      token,
    });
  },

  createStationAlbum(
    token: string,
    payload: {
      title: string;
      description?: string;
      visibility?: StationVisibility;
    },
  ) {
    return request<StationAlbumDTO>('/api/station/albums', {
      method: 'POST',
      token,
      body: payload,
    });
  },

  updateStationAlbum(
    token: string,
    albumId: string,
    payload: Partial<{
      title: string;
      description: string;
      visibility: StationVisibility;
    }>,
  ) {
    return request<StationAlbumDTO>(`/api/station/albums/${albumId}`, {
      method: 'PATCH',
      token,
      body: payload,
    });
  },

  deleteStationAlbum(token: string, albumId: string) {
    return request<void>(`/api/station/albums/${albumId}`, {
      method: 'DELETE',
      token,
    });
  },

  createStationMediaAsset(
    token: string,
    payload: {
      albumId?: string | null;
      kind?: 'image' | 'video';
      originalFilename?: string;
      mimeType?: string;
      byteSize?: number | null;
      width?: number | null;
      height?: number | null;
      caption?: string;
    },
  ) {
    return request<StationMediaAssetDTO>('/api/station/media-assets', {
      method: 'POST',
      token,
      body: payload,
    });
  },

  updateStationMediaAsset(
    token: string,
    assetId: string,
    payload: Partial<{
      albumId: string | null;
      caption: string;
    }>,
  ) {
    return request<StationMediaAssetDTO>(
      `/api/station/media-assets/${assetId}`,
      {
        method: 'PATCH',
        token,
        body: payload,
      },
    );
  },

  deleteStationMediaAsset(token: string, assetId: string) {
    return request<void>(`/api/station/media-assets/${assetId}`, {
      method: 'DELETE',
      token,
    });
  },

  createStationMediaUploadUrl(
    token: string,
    assetId: string,
    payload: { mimeType: string; byteSize?: number | null },
  ) {
    return request<StationMediaUploadDTO>(
      `/api/station/media-assets/${assetId}/upload-url`,
      {
        method: 'POST',
        token,
        body: payload,
      },
    );
  },

  completeStationMediaUpload(
    token: string,
    assetId: string,
    payload: { storageKey: string },
  ) {
    return request<StationMediaAssetDTO>(
      `/api/station/media-assets/${assetId}/upload-complete`,
      {
        method: 'POST',
        token,
        body: payload,
      },
    );
  },

  createStationOutfit(
    token: string,
    payload: {
      title: string;
      note?: string;
      avatarConfig?: ProfileDTO['avatarConfig'];
      mediaAssetId?: string | null;
      visibility?: StationVisibility;
    },
  ) {
    return request<StationOutfitDTO>('/api/station/outfits', {
      method: 'POST',
      token,
      body: payload,
    });
  },

  stationSiteDrafts(token: string, limit = 10) {
    return request<StationSiteDraftDTO[]>(
      `/api/station/site-drafts?limit=${limit}`,
      {
        token,
      },
    );
  },

  createStationSiteDraft(
    token: string,
    payload: { prompt: string; apply?: boolean },
  ) {
    return request<{
      siteDraft: StationSiteDraftDTO;
      profile: ProfileDTO | null;
      generation: Record<string, unknown>;
    }>('/api/station/site-drafts', {
      method: 'POST',
      token,
      body: payload,
      timeoutMs: longRequestTimeoutMs,
    });
  },

  applyStationSiteDraft(token: string, draftId: string) {
    return request<{ siteDraft: StationSiteDraftDTO; profile: ProfileDTO }>(
      `/api/station/site-drafts/${draftId}/apply`,
      {
        method: 'POST',
        token,
      },
    );
  },

  stationModelJobs(token: string, limit = 10) {
    return request<StationGenerationJobDTO[]>(
      `/api/station/model-jobs?limit=${limit}`,
      { token },
    );
  },

  createStationModelJob(
    token: string,
    payload: {
      prompt: string;
      inputType?: 'text' | 'image';
      provider?: 'meshy';
      imageUrl?: string | null;
      sourceAssetId?: string | null;
      targetFormats?: Array<'glb' | 'obj' | 'fbx' | 'stl' | 'usdz' | '3mf'>;
      topology?: 'triangle' | 'quad';
      poseMode?: '' | 'a-pose' | 't-pose';
    },
  ) {
    return request<{
      job: StationGenerationJobDTO;
      provider: Record<string, unknown>;
    }>('/api/station/model-jobs', {
      method: 'POST',
      token,
      body: { provider: 'meshy', inputType: 'text', ...payload },
      timeoutMs: longRequestTimeoutMs,
    });
  },

  syncStationModelJob(token: string, jobId: string) {
    return request<{
      job: StationGenerationJobDTO;
      provider: Record<string, unknown>;
      storage?: Record<string, unknown>;
      modelAsset?: StationModelAssetDTO;
    }>(`/api/station/model-jobs/${jobId}/sync`, {
      method: 'POST',
      token,
      timeoutMs: longRequestTimeoutMs,
    });
  },

  stationFileAssets(token: string, limit = 10) {
    return request<StationFileAssetDTO[]>(
      `/api/station/file-assets?limit=${limit}`,
      {
        token,
      },
    );
  },

  createStationFileAsset(
    token: string,
    payload: {
      originalFilename: string;
      mimeType?: string;
      byteSize?: number | null;
      content?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return request<StationFileAssetDTO>('/api/station/file-assets', {
      method: 'POST',
      token,
      body: payload,
    });
  },

  preprocessStationFileAsset(
    token: string,
    fileAssetId: string,
    payload: {
      originalFilename?: string;
      mimeType?: string;
      byteSize?: number | null;
      content?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return request<StationFileAssetDTO>(
      `/api/station/file-assets/${fileAssetId}/preprocess`,
      {
        method: 'POST',
        token,
        body: payload,
      },
    );
  },

  stationAlbumSuggestions(token: string) {
    return request<StationAlbumSuggestionDTO[]>(
      '/api/station/album-suggestions',
      {
        token,
      },
    );
  },

  applyStationAlbumSuggestion(
    token: string,
    payload: {
      title: string;
      description?: string;
      visibility?: StationVisibility;
      mediaAssetIds: string[];
    },
  ) {
    return request<{
      album: StationAlbumDTO;
      mediaAssets: StationMediaAssetDTO[];
    }>('/api/station/album-suggestions/apply', {
      method: 'POST',
      token,
      body: payload,
    });
  },

  stationComicDiaries(token: string, limit = 10) {
    return request<StationComicDiaryDTO[]>(
      `/api/station/comic-diaries?limit=${limit}`,
      { token },
    );
  },

  createStationComicDiary(
    token: string,
    payload: {
      prompt: string;
      diaryEntryId?: string | null;
      mediaAssetIds?: string[];
      fileAssetIds?: string[];
      style?: 'slice-of-life' | 'cute' | 'manga' | 'storyboard';
      frameCount?: number;
    },
  ) {
    return request<StationComicDiaryDTO>('/api/station/comic-diaries', {
      method: 'POST',
      token,
      body: payload,
      timeoutMs: longRequestTimeoutMs,
    });
  },

  deleteStationComicDiary(token: string, comicDiaryId: string) {
    return request<void>(`/api/station/comic-diaries/${comicDiaryId}`, {
      method: 'DELETE',
      token,
    });
  },

  stationVideoDrafts(token: string, limit = 10) {
    return request<StationVideoDraftDTO[]>(
      `/api/station/video-drafts?limit=${limit}`,
      { token },
    );
  },

  createStationVideoDraft(
    token: string,
    payload: {
      prompt: string;
      diaryEntryId?: string | null;
      comicDiaryId?: string | null;
      mediaAssetIds?: string[];
      fileAssetIds?: string[];
      format?: 'short-clip' | 'vlog' | 'story' | 'promo';
      aspectRatio?: '9:16' | '16:9' | '1:1';
      durationSeconds?: number;
    },
  ) {
    return request<StationVideoDraftDTO>('/api/station/video-drafts', {
      method: 'POST',
      token,
      body: payload,
      timeoutMs: longRequestTimeoutMs,
    });
  },
};
