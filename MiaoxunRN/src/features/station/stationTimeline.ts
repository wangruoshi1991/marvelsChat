import {
  StationAlbumDTO,
  StationContentDTO,
  StationDiaryEntryDTO,
  StationMediaAssetDTO,
  StationOutfitDTO,
} from '../../models/api';

export type StationTimelineItem =
  | {
      id: string;
      kind: 'diary';
      createdAt?: string | null;
      diary: StationDiaryEntryDTO;
    }
  | {
      id: string;
      kind: 'album';
      createdAt?: string | null;
      album: StationAlbumDTO;
    }
  | {
      id: string;
      kind: 'media';
      createdAt?: string | null;
      media: StationMediaAssetDTO;
      album?: StationAlbumDTO;
    }
  | {
      id: string;
      kind: 'outfit';
      createdAt?: string | null;
      outfit: StationOutfitDTO;
    };

const timestamp = (value?: string | null) => {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function buildStationTimeline(
  content: StationContentDTO,
): StationTimelineItem[] {
  const albumsById = new Map(content.albums.map(album => [album.id, album]));
  const items: StationTimelineItem[] = [
    ...content.diaryEntries.map(diary => ({
      id: `diary:${diary.id}`,
      kind: 'diary' as const,
      createdAt: diary.createdAt,
      diary,
    })),
    ...content.albums.map(album => ({
      id: `album:${album.id}`,
      kind: 'album' as const,
      createdAt: album.createdAt,
      album,
    })),
    ...content.mediaAssets
      .filter(media => media.status !== 'deleted')
      .map(media => ({
        id: `media:${media.id}`,
        kind: 'media' as const,
        createdAt: media.createdAt,
        media,
        album: media.albumId ? albumsById.get(media.albumId) : undefined,
      })),
    ...content.outfits.map(outfit => ({
      id: `outfit:${outfit.id}`,
      kind: 'outfit' as const,
      createdAt: outfit.createdAt,
      outfit,
    })),
  ];

  return items.sort(
    (left, right) => timestamp(right.createdAt) - timestamp(left.createdAt),
  );
}
