export type AvatarStyle = "realistic" | "cartoon";
export type AvatarQualityPreset = "standard" | "ultra";

export interface AvatarQualityOption {
  id: AvatarQualityPreset;
  label: string;
  description: string;
  estimatedCostFen: number;
}

export type AvatarJobStatus =
  | "queued_style"
  | "processing_style"
  | "awaiting_style_confirmation"
  | "queued_references"
  | "submitting_references"
  | "processing_references"
  | "persisting_references"
  | "awaiting_reference_confirmation"
  | "queued_3d"
  | "submitting_3d"
  | "processing_3d"
  | "persisting"
  | "succeeded"
  | "failed"
  | "quality_failed"
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
  defaultQualityPreset: AvatarQualityPreset;
  qualityPresets: AvatarQualityOption[];
  referenceGenerationEstimatedCostFen: number;
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
  quality: {
    level: "good" | "advisory";
    canContinue: true;
    suggestions: string[];
  } | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AvatarPhotoView = "front" | "left" | "back" | "right";

export interface AvatarJob {
  id: string;
  userId: string;
  style: AvatarStyle;
  qualityPreset: AvatarQualityPreset;
  generationMode: "legacy_photo_3d" | "face_first_multiview";
  referenceSetId: string | null;
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
  status: "preparing" | "active" | "deleted";
  byteSize: number;
  thumbnailAvailable: boolean;
  interactiveAvailable: boolean;
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
  generationMode: "face_first_multiview";
  photoId: string;
  bodyShape: "balanced" | "slender" | "athletic";
  pose: "natural";
  outfit: "business" | "smart_casual" | "casual" | "sport" | "formal";
  userDescription: string;
  qualityPreset: AvatarQualityPreset;
  acceptedPhotoRights: true;
  acceptedAdultSubject: true;
  acceptedFaceCompletion: true;
  acceptedReferenceCostVersion: string;
}

export interface AvatarReferenceSet {
  id: string;
  jobId: string;
  status: "queued" | "submitting" | "processing" | "persisting"
    | "awaiting_confirmation" | "accepted" | "rejected" | "failed" | "deleted";
  expectedImageCount: number;
  actualImageCount: number;
  usageImageCount: number;
  costVersion: string;
  estimatedCostFen: number;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvatarReferenceImage {
  id: string;
  referenceSetId: string;
  jobId: string;
  view: AvatarPhotoView;
  sequenceIndex: number;
  mimeType: "image/jpeg" | "image/png";
  byteSize: number;
  width: number;
  height: number;
  status: "active" | "deleted";
  createdAt: string;
  updatedAt: string;
}

export interface AvatarReferences {
  referenceSet: AvatarReferenceSet;
  images: AvatarReferenceImage[];
}

export interface AvatarReferenceConfirmation {
  job: AvatarJob;
  referenceSet: AvatarReferenceSet;
}

export interface AvatarCreateJobResult {
  created: boolean;
  job: AvatarJob;
  referenceSet: AvatarReferenceSet | null;
}
