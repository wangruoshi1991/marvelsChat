import { Avatar3DJobStatus } from '../../models/api';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';

const terminalStatuses = new Set<Avatar3DJobStatus>([
  'succeeded',
  'failed',
  'quality_failed',
  'cancelled',
  'submission_unknown',
]);

const cancellableStatuses = new Set<Avatar3DJobStatus>([
  'queued_references',
  'awaiting_reference_confirmation',
  'queued_3d',
]);

const pollingStatuses = new Set<Avatar3DJobStatus>([
  'queued_references',
  'submitting_references',
  'processing_references',
  'persisting_references',
  'queued_3d',
  'submitting_3d',
  'processing_3d',
  'persisting',
]);

export const isAvatar3dTerminalStatus = (status: Avatar3DJobStatus) =>
  terminalStatuses.has(status);

export const canCancelAvatar3dJob = (status: Avatar3DJobStatus) =>
  cancellableStatuses.has(status);

export const shouldPollAvatar3dJob = (status: Avatar3DJobStatus) =>
  pollingStatuses.has(status);

export const avatar3dPollingDelayMs = (status: Avatar3DJobStatus) => {
  if (status === 'persisting' || status === 'persisting_references') {
    return 3000;
  }
  if (status === 'processing_3d' || status === 'processing_references') {
    return 5000;
  }
  return 2000;
};

export const createAvatar3dIdempotencyKey = createIdempotencyKey;
