import { buildApiUrl } from './apiClient';

export const buildStationMediaFileUrl = (assetId: string) =>
  buildApiUrl(`/api/station/media-assets/${encodeURIComponent(assetId)}/file`);
