import {
  HomepageDraftContentDTO,
  HomepageFeatureDTO,
  HomepageGenerationJobDTO,
  HomepageReleaseDTO,
  HomepageSiteDraftDTO,
  HomepageSiteDTO,
  HomepageVisibility,
  StationMediaAssetDTO,
} from '../../models/api';
import { PickedStationMedia } from '../../services/stationMediaPicker';

export type HomepageSession = {
  token: string;
  user: { id: string; displayName: string } | null;
  homepageV1: HomepageFeatureDTO;
  stationContent: { mediaAssets: StationMediaAssetDTO[] };
  homepageSite: () => Promise<{ site: HomepageSiteDTO | null }>;
  homepageJobs: (limit?: number) => Promise<HomepageGenerationJobDTO[]>;
  homepageReleases: (limit?: number) => Promise<HomepageReleaseDTO[]>;
  homepageDraft: (draftId: string) => Promise<HomepageSiteDraftDTO>;
  createHomepageJob: (payload: {
    prompt: string;
    mediaAssetIds: string[];
    idempotencyKey: string;
  }) => Promise<{ created: boolean; job: HomepageGenerationJobDTO }>;
  homepageJob: (jobId: string) => Promise<HomepageGenerationJobDTO>;
  updateHomepageDraft: (
    draftId: string,
    payload: { revision: number; draft: HomepageDraftContentDTO },
  ) => Promise<HomepageSiteDraftDTO>;
  refineHomepageSection: (
    draftId: string,
    payload: { revision: number; sectionId: string; instruction: string },
  ) => Promise<{ source: 'model'; siteDraft: HomepageSiteDraftDTO }>;
  createHomepagePreview: (
    draftId: string,
  ) => Promise<{ previewUrl: string; expiresAt: string }>;
  publishHomepage: (
    draftId: string,
    payload: { revision: number; visibility: HomepageVisibility },
  ) => Promise<{
    site: HomepageSiteDTO;
    release: HomepageReleaseDTO;
    siteDraft: HomepageSiteDraftDTO;
  }>;
  unpublishHomepage: () => Promise<{ site: HomepageSiteDTO | null }>;
  restoreHomepageRelease: (releaseId: string) => Promise<HomepageSiteDraftDTO>;
  createStationMediaAsset: (payload: {
    kind: 'image';
    originalFilename: string;
    mimeType: string;
    byteSize: number | null;
    width: number | null;
    height: number | null;
    localMedia: PickedStationMedia;
  }) => Promise<StationMediaAssetDTO>;
};

export type HomepageScreenMode = 'home' | 'create' | 'editor' | 'preview';

export type HomepageUploadStatus =
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'failed';

export type HomepageUploadItem = {
  localId: string;
  media: PickedStationMedia;
  status: HomepageUploadStatus;
  assetId: string | null;
};
