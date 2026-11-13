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
import { MiaoxunApiError, request } from './http';
import { assertStationContentContract } from './stationContentContract';

type StationPostSubmission =
  | { status: 'submitted'; post: StationPostDTO }
  | { status: 'not_submitted' };
const postIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function parsePostSubmission(value: unknown): StationPostSubmission {
  const record = value as StationPostSubmission | null;
  if (record && typeof record === 'object') {
    if (record.status === 'not_submitted' && Object.keys(record).length === 1)
      return record;
    if (record.status === 'submitted') {
      const post = record.post;
      if (
        post &&
        postIdPattern.test(post.id) &&
        postIdPattern.test(post.userId) &&
        typeof post.body === 'string' &&
        typeof post.locationLabel === 'string' &&
        ['private', 'friends', 'public'].includes(post.visibility) &&
        Array.isArray(post.agentCapabilities) &&
        post.agentCapabilities.every(id => typeof id === 'string') &&
        Array.isArray(post.media) &&
        post.media.every(
          media =>
            postIdPattern.test(media?.id) &&
            media.status === 'uploaded' &&
            ['image', 'video'].includes(media.kind),
        ) &&
        typeof post.likedByMe === 'boolean' &&
        typeof post.favoritedByMe === 'boolean' &&
        [post.likeCount, post.commentCount, post.favoriteCount].every(
          count => Number.isSafeInteger(count) && count >= 0,
        )
      )
        return record;
    }
  }
  throw new MiaoxunApiError(
    '发布回执与当前 App 不匹配，请保留原记录并重试核验。',
    { code: 'STATION_POST_SUBMISSION_CONTRACT_MISMATCH' },
  );
}

export const stationContentApi = {
  stationMediaAsset(token: string, mediaAssetId: string) {
    return request<Pick<StationMediaAssetDTO, 'id' | 'kind' | 'status'>>(
      `/api/station/media-assets/${encodeURIComponent(mediaAssetId)}`,
      { token },
    );
  },
  async stationContent(token: string) {
    const content = await request<StationContentDTO>('/api/station/content', {
      token,
    });
    assertStationContentContract(content, '/api/station/content');
    return content;
  },

  createStationPost(
    token: string,
    payload: {
      clientRequestId?: string;
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

  async getStationPostSubmission(token: string, clientRequestId: string) {
    return parsePostSubmission(
      await request<unknown>(
        `/api/station/post-submissions/${encodeURIComponent(clientRequestId)}`,
        {
          token,
        },
      ),
    );
  },

  async resolveStationPostSubmission(token: string, clientRequestId: string) {
    return parsePostSubmission(
      await request<unknown>(
        `/api/station/post-submissions/${encodeURIComponent(
          clientRequestId,
        )}/resolve`,
        {
          token,
          method: 'POST',
          body: {},
        },
      ),
    );
  },

  deleteStationPost(token: string, postId: string) {
    return request<void>(`/api/station/posts/${postId}`, {
      method: 'DELETE',
      token,
    });
  },

  setStationPostInteraction(
    token: string,
    postId: string,
    interactionType: 'like' | 'favorite',
    active: boolean,
  ) {
    return request<{
      postId: string;
      likeCount: number;
      favoriteCount: number;
      likedByMe: boolean;
      favoritedByMe: boolean;
    }>(`/api/station/posts/${postId}/interactions`, {
      method: 'POST',
      token,
      body: { interactionType, active },
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
