import {
  ProfileDTO,
  StationAlbumDTO,
  StationContentDTO,
  StationDiaryEntryDTO,
  StationMediaAssetDTO,
  StationMediaUploadDTO,
  StationOutfitDTO,
  StationPostDTO,
  StationVisibility,
} from '../../models/api';
import { request } from './http';

export const stationContentApi = {
  stationContent(token: string) {
    return request<StationContentDTO>('/api/station/content', { token });
  },

  createStationPost(
    token: string,
    payload: {
      body?: string;
      locationLabel?: string;
      visibility?: StationVisibility;
      agentCapabilities?: string[];
      mediaAssetIds?: string[];
    },
  ) {
    return request<StationPostDTO>('/api/station/posts', {
      method: 'POST',
      token,
      body: payload,
    });
  },

  deleteStationPost(token: string, postId: string) {
    return request<void>(`/api/station/posts/${postId}`, {
      method: 'DELETE',
      token,
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
};
