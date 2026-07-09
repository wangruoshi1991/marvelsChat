import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  AvatarConfigDTO,
  ProfileDTO,
  StationContentDTO,
  StationComicDiaryDTO,
  StationFileAssetDTO,
  StationGenerationJobDTO,
  StationSiteDraftDTO,
  StationVideoDraftDTO,
  StationVisibility,
} from '../../models/api';
import { apiClient } from '../../services/apiClient';
import { PickedStationMedia } from '../../services/stationMediaPicker';
import { uploadStationMediaAsset } from '../../services/stationMediaUpload';
import { emptyStationContent } from './sessionDefaults';

type CreateStationMediaAssetPayload = {
  albumId?: string | null;
  kind?: 'image' | 'video';
  originalFilename?: string;
  mimeType?: string;
  byteSize?: number | null;
  width?: number | null;
  height?: number | null;
  caption?: string;
  localMedia?: PickedStationMedia;
};

export function useStationActions({
  token,
  avatarConfig,
  setStationContent,
  setProfile,
}: {
  token: string;
  avatarConfig: AvatarConfigDTO;
  setStationContent: Dispatch<SetStateAction<StationContentDTO>>;
  setProfile: Dispatch<SetStateAction<ProfileDTO>>;
}) {
  const refreshStationContent = useCallback(async () => {
    if (!token) {
      return emptyStationContent;
    }
    const content = await apiClient.stationContent(token);
    setStationContent(content);
    return content;
  }, [setStationContent, token]);

  const createStationDiary = useCallback(
    async (payload: {
      title: string;
      body: string;
      mood?: string;
      visibility?: StationVisibility;
    }) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const entry = await apiClient.createStationDiary(token, payload);
      setStationContent(current => ({
        ...current,
        diaryEntries: [entry, ...current.diaryEntries],
      }));
      return entry;
    },
    [setStationContent, token],
  );

  const updateStationDiary = useCallback(
    async (
      entryId: string,
      payload: Partial<{
        title: string;
        body: string;
        mood: string;
        visibility: StationVisibility;
      }>,
    ) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const entry = await apiClient.updateStationDiary(token, entryId, payload);
      setStationContent(current => ({
        ...current,
        diaryEntries: current.diaryEntries.map(item =>
          item.id === entry.id ? entry : item,
        ),
      }));
      return entry;
    },
    [setStationContent, token],
  );

  const deleteStationDiary = useCallback(
    async (entryId: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      await apiClient.deleteStationDiary(token, entryId);
      setStationContent(current => ({
        ...current,
        diaryEntries: current.diaryEntries.filter(item => item.id !== entryId),
      }));
    },
    [setStationContent, token],
  );

  const createStationAlbum = useCallback(
    async (payload: {
      title: string;
      description?: string;
      visibility?: StationVisibility;
    }) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const album = await apiClient.createStationAlbum(token, payload);
      setStationContent(current => ({
        ...current,
        albums: [album, ...current.albums],
      }));
      return album;
    },
    [setStationContent, token],
  );

  const updateStationAlbum = useCallback(
    async (
      albumId: string,
      payload: Partial<{
        title: string;
        description: string;
        visibility: StationVisibility;
      }>,
    ) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const album = await apiClient.updateStationAlbum(token, albumId, payload);
      setStationContent(current => ({
        ...current,
        albums: current.albums.map(item =>
          item.id === album.id ? album : item,
        ),
      }));
      return album;
    },
    [setStationContent, token],
  );

  const deleteStationAlbum = useCallback(
    async (albumId: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      await apiClient.deleteStationAlbum(token, albumId);
      setStationContent(current => ({
        ...current,
        albums: current.albums.filter(item => item.id !== albumId),
        mediaAssets: current.mediaAssets.filter(
          asset => asset.albumId !== albumId,
        ),
      }));
    },
    [setStationContent, token],
  );

  const createStationMediaAsset = useCallback(
    async (payload: CreateStationMediaAssetPayload) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const { localMedia, ...assetPayload } = payload;
      const asset = await apiClient.createStationMediaAsset(
        token,
        assetPayload,
      );
      setStationContent(current => ({
        ...current,
        mediaAssets: [asset, ...current.mediaAssets],
        albums: asset.albumId
          ? current.albums.map(album =>
              album.id === asset.albumId
                ? { ...album, mediaCount: album.mediaCount + 1 }
                : album,
            )
          : current.albums,
      }));
      if (!localMedia) {
        return asset;
      }
      const uploadedAsset = await uploadStationMediaAsset({
        token,
        asset,
        media: localMedia,
      });
      setStationContent(current => ({
        ...current,
        mediaAssets: current.mediaAssets.map(item =>
          item.id === uploadedAsset.id ? uploadedAsset : item,
        ),
      }));
      return uploadedAsset;
    },
    [setStationContent, token],
  );

  const updateStationMediaAsset = useCallback(
    async (
      assetId: string,
      payload: Partial<{
        albumId: string | null;
        caption: string;
      }>,
    ) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const asset = await apiClient.updateStationMediaAsset(
        token,
        assetId,
        payload,
      );
      setStationContent(current => ({
        ...current,
        mediaAssets: current.mediaAssets.map(item =>
          item.id === asset.id ? asset : item,
        ),
      }));
      return asset;
    },
    [setStationContent, token],
  );

  const deleteStationMediaAsset = useCallback(
    async (assetId: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      await apiClient.deleteStationMediaAsset(token, assetId);
      setStationContent(current => {
        const deletedAsset = current.mediaAssets.find(
          item => item.id === assetId,
        );
        const deletedAlbumId = deletedAsset?.albumId;
        return {
          ...current,
          mediaAssets: current.mediaAssets.filter(item => item.id !== assetId),
          albums: deletedAlbumId
            ? current.albums.map(album =>
                album.id === deletedAlbumId
                  ? {
                      ...album,
                      mediaCount: Math.max(0, album.mediaCount - 1),
                    }
                  : album,
              )
            : current.albums,
        };
      });
    },
    [setStationContent, token],
  );

  const createStationOutfit = useCallback(
    async (payload: {
      title: string;
      note?: string;
      visibility?: StationVisibility;
    }) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const outfit = await apiClient.createStationOutfit(token, {
        ...payload,
        avatarConfig,
      });
      setStationContent(current => ({
        ...current,
        outfits: [outfit, ...current.outfits],
      }));
      return outfit;
    },
    [avatarConfig, setStationContent, token],
  );

  const createStationComicDiary = useCallback(
    async (payload: {
      prompt: string;
      diaryEntryId?: string | null;
      mediaAssetIds?: string[];
      fileAssetIds?: string[];
      style?: 'slice-of-life' | 'cute' | 'manga' | 'storyboard';
      frameCount?: number;
    }) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const draft = await apiClient.createStationComicDiary(token, payload);
      setStationContent(current => ({
        ...current,
        comicDiaries: [draft, ...(current.comicDiaries || [])],
      }));
      return draft;
    },
    [setStationContent, token],
  );

  const createStationSiteDraft = useCallback(
    async (payload: { prompt: string; apply?: boolean }) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const result = await apiClient.createStationSiteDraft(token, payload);
      setStationContent(current => ({
        ...current,
        siteDrafts: [
          result.siteDraft,
          ...(current.siteDrafts || []).filter(
            (item: StationSiteDraftDTO) => item.id !== result.siteDraft.id,
          ),
        ],
      }));
      if (result.profile) {
        setProfile(result.profile);
      }
      return result;
    },
    [setProfile, setStationContent, token],
  );

  const applyStationSiteDraft = useCallback(
    async (draftId: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const result = await apiClient.applyStationSiteDraft(token, draftId);
      setProfile(result.profile);
      setStationContent(current => ({
        ...current,
        siteDrafts: (current.siteDrafts || []).map(
          (item: StationSiteDraftDTO) =>
            item.id === result.siteDraft.id
              ? result.siteDraft
              : { ...item, status: item.status === 'applied' ? 'draft' : item.status },
        ),
      }));
      return result;
    },
    [setProfile, setStationContent, token],
  );

  const createStationModelJob = useCallback(
    async (payload: {
      prompt: string;
      inputType?: 'text' | 'image';
      provider?: 'meshy';
      imageUrl?: string | null;
      sourceAssetId?: string | null;
    }) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const result = await apiClient.createStationModelJob(token, payload);
      setStationContent(current => ({
        ...current,
        modelJobs: [
          result.job,
          ...(current.modelJobs || []).filter(
            (item: StationGenerationJobDTO) => item.id !== result.job.id,
          ),
        ],
      }));
      return result;
    },
    [setStationContent, token],
  );

  const syncStationModelJob = useCallback(
    async (jobId: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const result = await apiClient.syncStationModelJob(token, jobId);
      setStationContent(current => ({
        ...current,
        modelJobs: (current.modelJobs || []).map(
          (item: StationGenerationJobDTO) =>
            item.id === result.job.id ? result.job : item,
        ),
        modelAssets: result.modelAsset
          ? [
              result.modelAsset,
              ...(current.modelAssets || []).filter(
                asset =>
                  asset.generationJobId !== result.job.id &&
                  asset.id !== result.modelAsset?.id,
              ),
            ]
          : current.modelAssets || [],
      }));
      return result;
    },
    [setStationContent, token],
  );

  const createStationFileAsset = useCallback(
    async (payload: {
      originalFilename: string;
      mimeType?: string;
      byteSize?: number | null;
      content?: string;
      metadata?: Record<string, unknown>;
    }) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const asset = await apiClient.createStationFileAsset(token, payload);
      setStationContent(current => ({
        ...current,
        fileAssets: [
          asset,
          ...(current.fileAssets || []).filter(
            (item: StationFileAssetDTO) => item.id !== asset.id,
          ),
        ],
      }));
      return asset;
    },
    [setStationContent, token],
  );

  const preprocessStationFileAsset = useCallback(
    async (
      fileAssetId: string,
      payload: {
        originalFilename?: string;
        mimeType?: string;
        byteSize?: number | null;
        content?: string;
        metadata?: Record<string, unknown>;
      },
    ) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const asset = await apiClient.preprocessStationFileAsset(
        token,
        fileAssetId,
        payload,
      );
      setStationContent(current => ({
        ...current,
        fileAssets: (current.fileAssets || []).map(
          (item: StationFileAssetDTO) => (item.id === asset.id ? asset : item),
        ),
      }));
      return asset;
    },
    [setStationContent, token],
  );

  const applyStationAlbumSuggestion = useCallback(
    async (payload: {
      title: string;
      description?: string;
      visibility?: StationVisibility;
      mediaAssetIds: string[];
    }) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const result = await apiClient.applyStationAlbumSuggestion(
        token,
        payload,
      );
      setStationContent(current => ({
        ...current,
        albums: [
          result.album,
          ...current.albums.filter(album => album.id !== result.album.id),
        ],
        mediaAssets: current.mediaAssets.map(asset => {
          const movedAsset = result.mediaAssets.find(
            item => item.id === asset.id,
          );
          return movedAsset || asset;
        }),
      }));
      return result;
    },
    [setStationContent, token],
  );

  const listStationAlbumSuggestions = useCallback(async () => {
    if (!token) {
      throw new Error('请先登录。');
    }
    return apiClient.stationAlbumSuggestions(token);
  }, [token]);

  const createStationVideoDraft = useCallback(
    async (payload: {
      prompt: string;
      diaryEntryId?: string | null;
      comicDiaryId?: string | null;
      mediaAssetIds?: string[];
      fileAssetIds?: string[];
      format?: 'short-clip' | 'vlog' | 'story' | 'promo';
      aspectRatio?: '9:16' | '16:9' | '1:1';
      durationSeconds?: number;
    }) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const draft = await apiClient.createStationVideoDraft(token, payload);
      setStationContent(current => ({
        ...current,
        videoDrafts: [
          draft,
          ...(current.videoDrafts || []).filter(
            (item: StationVideoDraftDTO) => item.id !== draft.id,
          ),
        ],
      }));
      return draft;
    },
    [setStationContent, token],
  );

  const deleteStationComicDiary = useCallback(
    async (comicDiaryId: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      await apiClient.deleteStationComicDiary(token, comicDiaryId);
      setStationContent(current => ({
        ...current,
        comicDiaries: (current.comicDiaries || []).filter(
          (item: StationComicDiaryDTO) => item.id !== comicDiaryId,
        ),
      }));
    },
    [setStationContent, token],
  );

  const resolveLocation = useCallback(
    async (coordinates: { latitude: number; longitude: number }) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      return apiClient.resolveLocation(token, coordinates);
    },
    [token],
  );

  return {
    refreshStationContent,
    createStationDiary,
    updateStationDiary,
    deleteStationDiary,
    createStationAlbum,
    updateStationAlbum,
    deleteStationAlbum,
    createStationMediaAsset,
    updateStationMediaAsset,
    deleteStationMediaAsset,
    createStationOutfit,
    createStationSiteDraft,
    applyStationSiteDraft,
    createStationModelJob,
    syncStationModelJob,
    createStationFileAsset,
    preprocessStationFileAsset,
    listStationAlbumSuggestions,
    applyStationAlbumSuggestion,
    createStationComicDiary,
    deleteStationComicDiary,
    createStationVideoDraft,
    resolveLocation,
  };
}
