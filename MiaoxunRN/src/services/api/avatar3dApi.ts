import {
  Avatar3DBootstrapDTO,
  Avatar3DCreateJobPayload,
  Avatar3DJobDTO,
  Avatar3DModelDTO,
  Avatar3DPhotoDTO,
  Avatar3DPhotoUploadDTO,
  Avatar3DQualityPresetId,
  Avatar3DReferencesDTO,
} from '../../models/api';
import { buildApiUrl, request } from './http';

const appPath = '/api/avatar-3d/app';

export const avatar3dApi = {
  avatar3dBootstrap(token: string) {
    return request<Avatar3DBootstrapDTO>(`${appPath}/bootstrap`, { token });
  },

  prepareAvatar3dPhoto(
    token: string,
    body: {
      originalFilename: string;
      mimeType: 'image/jpeg' | 'image/png';
      byteSize: number;
    },
  ) {
    return request<Avatar3DPhotoUploadDTO>(`${appPath}/photos`, {
      body,
      method: 'POST',
      token,
    });
  },

  completeAvatar3dPhoto(token: string, photoId: string) {
    return request<Avatar3DPhotoDTO>(
      `${appPath}/photos/${encodeURIComponent(photoId)}/complete`,
      { body: {}, method: 'POST', token },
    );
  },

  deleteAvatar3dPhoto(token: string, photoId: string) {
    return request<void>(`${appPath}/photos/${encodeURIComponent(photoId)}`, {
      method: 'DELETE',
      token,
    });
  },

  createAvatar3dJob(
    token: string,
    body: Avatar3DCreateJobPayload,
    idempotencyKey: string,
  ) {
    return request<{ created: boolean; job: Avatar3DJobDTO }>(
      `${appPath}/jobs`,
      {
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
        method: 'POST',
        token,
      },
    );
  },

  getAvatar3dJob(token: string, jobId: string) {
    return request<Avatar3DJobDTO>(
      `${appPath}/jobs/${encodeURIComponent(jobId)}`,
      { token },
    );
  },

  getAvatar3dReferences(token: string, jobId: string) {
    return request<Avatar3DReferencesDTO>(
      `${appPath}/jobs/${encodeURIComponent(jobId)}/references`,
      { token },
    );
  },

  confirmAvatar3dReferences(
    token: string,
    jobId: string,
    body: {
      referenceSetId: string;
      qualityPreset: Avatar3DQualityPresetId;
      accepted: true;
      acceptedCostVersion: string;
    },
  ) {
    return request<{
      job: Avatar3DJobDTO;
      referenceSet: Avatar3DReferencesDTO['referenceSet'];
    }>(`${appPath}/jobs/${encodeURIComponent(jobId)}/references/confirm`, {
      body,
      method: 'POST',
      token,
    });
  },

  rejectAvatar3dReferences(
    token: string,
    jobId: string,
    referenceSetId: string,
  ) {
    return request<Avatar3DJobDTO>(
      `${appPath}/jobs/${encodeURIComponent(jobId)}/references/reject`,
      { body: { referenceSetId }, method: 'POST', token },
    );
  },

  cancelAvatar3dJob(token: string, jobId: string) {
    return request<Avatar3DJobDTO>(
      `${appPath}/jobs/${encodeURIComponent(jobId)}/cancel`,
      { body: {}, method: 'POST', token },
    );
  },

  getAvatar3dModel(token: string, modelId: string) {
    return request<Avatar3DModelDTO>(
      `${appPath}/models/${encodeURIComponent(modelId)}`,
      { token },
    );
  },

  deleteAvatar3dModel(token: string, modelId: string) {
    return request<void>(`${appPath}/models/${encodeURIComponent(modelId)}`, {
      method: 'DELETE',
      token,
    });
  },
};

export const avatar3dReferenceImageUrl = (
  jobId: string,
  view: 'front' | 'left' | 'back' | 'right',
) =>
  buildApiUrl(
    `${appPath}/jobs/${encodeURIComponent(jobId)}/references/${view}/file`,
  );

export const avatar3dModelThumbnailUrl = (modelId: string) =>
  buildApiUrl(`${appPath}/models/${encodeURIComponent(modelId)}/thumbnail`);
