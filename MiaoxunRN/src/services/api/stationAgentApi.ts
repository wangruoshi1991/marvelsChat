import { AITaskDTO, assertAITask } from '../../models/aiTask';
import {
  StationComicDiaryDTO,
  StationFileAssetDTO,
  StationVideoDraftDTO,
} from '../../models/api';
import { longRequestTimeoutMs, request } from './http';
import { assertSiteDocumentContract, siteDocumentHeaders } from '../aiContract';
import { assertSiteDocumentView } from '../../models/siteDocument';
import { assertStationSiteDraftList } from '../../models/siteDraftMetadata';

export const stationAgentApi = {
  async siteDocument(token: string, draftId: string) {
    assertSiteDocumentContract(token);
    const view = await request<unknown>(
      `/api/station/site-drafts/${encodeURIComponent(draftId)}/document`,
      { token, headers: siteDocumentHeaders },
    );
    assertSiteDocumentView(view, draftId);
    return view;
  },
  async stationSiteDrafts(token: string, limit = 10) {
    const drafts = await request<unknown>(
      `/api/station/site-drafts?limit=${limit}`,
      {
        token,
      },
    );
    assertStationSiteDraftList(drafts);
    return drafts;
  },

  async createStationSiteDraft(
    token: string,
    payload: { prompt: string; idempotencyKey: string },
  ) {
    assertSiteDocumentContract(token);
    const result = await request<{ task: AITaskDTO }>(
      '/api/station/site-drafts',
      {
        method: 'POST',
        token,
        body: payload,
        headers: siteDocumentHeaders,
      },
    );
    assertAITask(result.task);
    return result;
  },

  stationFileAssets(token: string, limit = 10) {
    return request<StationFileAssetDTO[]>(
      `/api/station/file-assets?limit=${limit}`,
      {
        token,
      },
    );
  },

  stationFileAsset(token: string, id: string) {
    return request<StationFileAssetDTO & { content: string | null }>(
      `/api/station/file-assets/${encodeURIComponent(id)}`,
      { token },
    );
  },
  deleteStationFileAsset(token: string, id: string) {
    return request<void>(`/api/station/file-assets/${encodeURIComponent(id)}`, {
      token,
      method: 'DELETE',
    });
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
};
