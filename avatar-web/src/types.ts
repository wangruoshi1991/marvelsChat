export type AvatarStyle = "realistic" | "cartoon";

export type AvatarJobStatus =
  | "queued_style"
  | "processing_style"
  | "awaiting_style_confirmation"
  | "queued_3d"
  | "submitting_3d"
  | "processing_3d"
  | "persisting"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "submission_unknown";

export interface AvatarUser {
  id: string;
  displayName: string;
  email?: string | null;
  aiId?: string;
}

export interface AvatarFeature {
  enabled: boolean;
  generationAvailable: boolean;
  dailyLimit: number;
  retentionDays: number;
  costVersion: string;
  estimatedCostsFen: Record<AvatarStyle, number>;
}

export interface AvatarQuota {
  dailyUsed: number;
  dailyRemaining: number;
  hasActiveJob: boolean;
}

export interface AvatarPhoto {
  id: string;
  jobId: string | null;
  view: AvatarPhotoView | null;
  originalFilename: string;
  mimeType: "image/jpeg" | "image/png";
  byteSize: number;
  width: number | null;
  height: number | null;
  status: "uploading" | "uploaded" | "ready" | "failed" | "deleted";
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AvatarPhotoView = "front" | "left" | "back" | "right";

export interface AvatarJob {
  id: string;
  userId: string;
  style: AvatarStyle;
  status: AvatarJobStatus;
  progress: number;
  photoCount: number;
  acceptedCostVersion: string;
  estimatedCostFen: number;
  stylePreviewId: string | null;
  modelId: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface AvatarModel {
  id: string;
  jobId: string;
  title: string;
  status: "active" | "deleted";
  byteSize: number;
  thumbnailAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AvatarBootstrap {
  user: AvatarUser;
  csrfToken: string;
  feature: AvatarFeature;
  quota: AvatarQuota;
  jobs: AvatarJob[];
  activeJob: AvatarJob | null;
  models: AvatarModel[];
}

export interface AvatarSession {
  user: AvatarUser;
  csrfToken: string;
}

export interface AvatarUpload {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface AvatarPreparedPhoto {
  photo: AvatarPhoto;
  upload: AvatarUpload;
}

export interface AvatarCreateJobInput {
  style: AvatarStyle;
  photos: Array<{ photoId: string; view: AvatarPhotoView }>;
  acceptedPhotoRights: true;
  acceptedCostVersion: string;
}

export interface AvatarCreateJobResult {
  created: boolean;
  job: AvatarJob;
}
