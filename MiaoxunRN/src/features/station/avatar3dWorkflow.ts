import { Avatar3DJobStatus } from '../../models/api';

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

export const createAvatar3dIdempotencyKey = () => {
  const bytes = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256),
  );
  const timestamp = Date.now();
  for (let index = 0; index < 6; index += 1) {
    const timestampByte = Math.floor(timestamp / 2 ** (index * 8)) % 256;
    bytes[index] = (bytes[index] + timestampByte) % 256;
  }
  bytes[6] = (bytes[6] % 16) + 64;
  bytes[8] = (bytes[8] % 64) + 128;
  const hex = bytes.map(value => value.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
};
