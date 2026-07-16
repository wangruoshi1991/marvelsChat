import {
  HomepageDraftContentDTO,
  HomepageGenerationJobDTO,
  HomepageReleaseDTO,
  HomepageSiteDraftDTO,
  HomepageSiteDTO,
  HomepageVisibility,
} from '../../models/api';
import { request } from './http';

const resourceId = (value: string) => encodeURIComponent(value);

export const homepageApi = {
  homepageJobs(token: string, limit = 10) {
    return request<HomepageGenerationJobDTO[]>(
      `/api/station/homepage-jobs?limit=${limit}`,
      { token },
    );
  },

  createHomepageJob(
    token: string,
    payload: {
      prompt: string;
      mediaAssetIds: string[];
      idempotencyKey: string;
    },
  ) {
    return request<{ created: boolean; job: HomepageGenerationJobDTO }>(
      '/api/station/homepage-jobs',
      { method: 'POST', token, body: payload },
    );
  },

  homepageJob(token: string, jobId: string) {
    return request<HomepageGenerationJobDTO>(
      `/api/station/homepage-jobs/${resourceId(jobId)}`,
      { token },
    );
  },

  homepageDraft(token: string, draftId: string) {
    return request<HomepageSiteDraftDTO>(
      `/api/station/site-drafts/${resourceId(draftId)}`,
      { token },
    );
  },

  updateHomepageDraft(
    token: string,
    draftId: string,
    payload: { revision: number; draft: HomepageDraftContentDTO },
  ) {
    return request<HomepageSiteDraftDTO>(
      `/api/station/site-drafts/${resourceId(draftId)}`,
      { method: 'PATCH', token, body: payload },
    );
  },

  refineHomepageSection(
    token: string,
    draftId: string,
    payload: { revision: number; sectionId: string; instruction: string },
  ) {
    return request<{ source: 'model'; siteDraft: HomepageSiteDraftDTO }>(
      `/api/station/site-drafts/${resourceId(draftId)}/refine`,
      { method: 'POST', token, body: payload },
    );
  },

  createHomepagePreview(token: string, draftId: string) {
    return request<{ previewUrl: string; expiresAt: string }>(
      `/api/station/site-drafts/${resourceId(draftId)}/preview-token`,
      { method: 'POST', token },
    );
  },

  publishHomepage(
    token: string,
    draftId: string,
    payload: { revision: number; visibility: HomepageVisibility },
  ) {
    return request<{
      site: HomepageSiteDTO;
      release: HomepageReleaseDTO;
      siteDraft: HomepageSiteDraftDTO;
    }>(`/api/station/site-drafts/${resourceId(draftId)}/publish`, {
      method: 'POST',
      token,
      body: payload,
    });
  },

  homepageSite(token: string) {
    return request<{ site: HomepageSiteDTO | null }>('/api/station/site', {
      token,
    });
  },

  unpublishHomepage(token: string) {
    return request<{ site: HomepageSiteDTO | null }>(
      '/api/station/site/unpublish',
      { method: 'POST', token },
    );
  },

  homepageReleases(token: string, limit = 10) {
    return request<HomepageReleaseDTO[]>(
      `/api/station/site/releases?limit=${limit}`,
      { token },
    );
  },

  restoreHomepageRelease(token: string, releaseId: string) {
    return request<HomepageSiteDraftDTO>(
      `/api/station/site/releases/${resourceId(releaseId)}/restore`,
      { method: 'POST', token },
    );
  },
};
