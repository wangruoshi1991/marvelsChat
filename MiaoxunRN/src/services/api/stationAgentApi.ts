import {
  ProfileDTO,
  StationAlbumDTO,
  StationAlbumSuggestionDTO,
  StationComicDiaryDTO,
  StationFileAssetDTO,
  StationMediaAssetDTO,
  StationSiteDraftDTO,
  StationVideoDraftDTO,
  StationVisibility,
} from '../../models/api';
import { longRequestTimeoutMs, request } from './http';

export const stationAgentApi = {
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
