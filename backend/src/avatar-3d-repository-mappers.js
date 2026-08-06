import {
  mapAvatar3dJob,
  mapAvatar3dModel,
  mapAvatar3dPhoto as mapSharedAvatar3dPhoto,
  toIso,
} from "./repository-mappers.js";

export const terminalAvatar3dStatuses = new Set([
  "succeeded", "failed", "quality_failed", "cancelled", "submission_unknown",
]);

export const avatar3dNextStatuses = new Map([
  ["queued_references", new Set(["submitting_references", "failed", "cancelled"])],
  ["submitting_references", new Set(["processing_references", "failed", "submission_unknown"])],
  ["processing_references", new Set(["persisting_references", "failed"])],
  ["persisting_references", new Set(["awaiting_reference_confirmation", "failed"])],
  ["awaiting_reference_confirmation", new Set(["queued_3d", "cancelled"])],
  ["queued_3d", new Set(["submitting_3d", "cancelled"])],
  ["submitting_3d", new Set(["processing_3d", "failed", "submission_unknown"])],
  ["processing_3d", new Set(["persisting", "failed"])],
  ["persisting", new Set(["succeeded", "failed"])],
]);

export const referenceSetNextStatuses = new Map([
  ["queued", new Set(["submitting", "rejected", "failed"])],
  ["submitting", new Set(["processing", "failed"])],
  ["processing", new Set(["persisting", "failed"])],
  ["persisting", new Set(["awaiting_confirmation", "failed"])],
  ["awaiting_confirmation", new Set(["accepted", "rejected"])],
]);

export const mapAvatar3dPhoto = (row) => {
  const {
    qualityStatus: _qualityStatus,
    ...photo
  } = mapSharedAvatar3dPhoto(row);
  return photo;
};

export const mapPrivateJob = (row) => ({
  ...mapAvatar3dJob(row),
  modelProvider: row.model_provider || "tripo",
  prompt: row.prompt || "",
  promptPlan: row.prompt_plan || null,
  promptPlanVersion: row.prompt_plan_version || null,
  sourcePhotoId: row.source_photo_id || null,
  idempotencyKeyHash: row.idempotency_key_hash,
  modelProviderTaskId: row.model_provider_task_id || null,
  geometryQuality: row.geometry_quality || "standard",
  textureQuality: row.texture_quality || "standard",
  providerStatus: row.provider_status || null,
  claimedAt: toIso(row.claimed_at),
  retentionUntil: toIso(row.retention_until),
});

export const mapPrivatePhoto = (row) => ({
  ...mapAvatar3dPhoto(row),
  userId: row.user_id,
  sourceStorageKey: row.source_storage_key,
  normalizedStorageKey: row.normalized_storage_key || null,
  normalizedMimeType: row.normalized_mime_type || null,
  normalizedByteSize: row.normalized_byte_size === null || row.normalized_byte_size === undefined
    ? null
    : Number(row.normalized_byte_size),
  qualityStatus: row.quality_status || null,
  qualityMetadata: row.quality_metadata || null,
  retentionUntil: toIso(row.retention_until),
});

export const mapPrivateModel = (row) => ({
  ...mapAvatar3dModel(row),
  userId: row.user_id,
  providerTaskId: row.provider_task_id || null,
  glbStorageKey: row.glb_storage_key,
  glbMimeType: row.glb_mime_type,
  mobileGlbStorageKey: row.mobile_glb_storage_key || null,
  mobileGlbMimeType: row.mobile_glb_mime_type || null,
  mobileGlbByteSize: row.mobile_glb_byte_size === null || row.mobile_glb_byte_size === undefined
    ? null
    : Number(row.mobile_glb_byte_size),
  thumbnailStorageKey: row.thumbnail_storage_key || null,
  thumbnailMimeType: row.thumbnail_mime_type || null,
  thumbnailByteSize: row.thumbnail_byte_size === null || row.thumbnail_byte_size === undefined
    ? null
    : Number(row.thumbnail_byte_size),
  qualityMetrics: row.quality_metrics || null,
});

export const mapReferenceSet = (row) => ({
  id: row.id,
  jobId: row.job_id,
  status: row.status,
  expectedImageCount: Number(row.expected_image_count || 4),
  actualImageCount: Number(row.actual_image_count || 0),
  usageImageCount: Number(row.usage_image_count || 0),
  costVersion: row.cost_version || null,
  estimatedCostFen: Number(row.estimated_cost_fen || 0),
  confirmedAt: toIso(row.confirmed_at),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const mapPrivateReferenceSet = (row) => ({
  ...mapReferenceSet(row),
  sourcePhotoId: row.source_photo_id || null,
  promptPlan: row.prompt_plan || null,
  promptPlanVersion: row.prompt_plan_version || null,
  userId: row.user_id,
  provider: row.provider,
  providerTaskId: row.provider_task_id || null,
  providerRequestId: row.provider_request_id || null,
  providerStatus: row.provider_status || null,
  retentionUntil: toIso(row.retention_until),
});

export const mapReferenceImage = (row) => ({
  id: row.id,
  referenceSetId: row.reference_set_id,
  jobId: row.job_id,
  view: row.view,
  sequenceIndex: Number(row.sequence_index),
  mimeType: row.mime_type,
  byteSize: Number(row.byte_size || 0),
  width: Number(row.width || 0),
  height: Number(row.height || 0),
  status: row.status,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const mapPrivateReferenceImage = (row) => ({
  ...mapReferenceImage(row),
  userId: row.user_id,
  storageKey: row.storage_key,
  retentionUntil: toIso(row.retention_until),
});
