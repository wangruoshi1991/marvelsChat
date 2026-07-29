import {
  avatar3dPollingDelayMs,
  canCancelAvatar3dJob,
  createAvatar3dIdempotencyKey,
  isAvatar3dTerminalStatus,
  shouldPollAvatar3dJob,
} from '../src/features/station/avatar3dWorkflow';

describe('avatar3d workflow helpers', () => {
  it('creates RFC 4122 version 4 idempotency keys', () => {
    const keys = new Set(
      Array.from({ length: 20 }, () => createAvatar3dIdempotencyKey()),
    );
    expect(keys.size).toBe(20);
    for (const key of keys) {
      expect(key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });

  it('keeps submission_unknown terminal and non-cancellable', () => {
    expect(isAvatar3dTerminalStatus('submission_unknown')).toBe(true);
    expect(canCancelAvatar3dJob('submission_unknown')).toBe(false);
  });

  it('only permits cancellation before irreversible provider work', () => {
    expect(canCancelAvatar3dJob('queued_references')).toBe(true);
    expect(canCancelAvatar3dJob('awaiting_reference_confirmation')).toBe(true);
    expect(canCancelAvatar3dJob('queued_3d')).toBe(true);
    expect(canCancelAvatar3dJob('processing_references')).toBe(false);
    expect(canCancelAvatar3dJob('processing_3d')).toBe(false);
  });

  it('polls only background work and follows the backend runner cadence', () => {
    expect(shouldPollAvatar3dJob('processing_references')).toBe(true);
    expect(shouldPollAvatar3dJob('processing_3d')).toBe(true);
    expect(shouldPollAvatar3dJob('persisting')).toBe(true);
    expect(shouldPollAvatar3dJob('awaiting_reference_confirmation')).toBe(
      false,
    );
    expect(shouldPollAvatar3dJob('succeeded')).toBe(false);
    expect(avatar3dPollingDelayMs('processing_3d')).toBe(5000);
    expect(avatar3dPollingDelayMs('persisting')).toBe(3000);
    expect(avatar3dPollingDelayMs('queued_3d')).toBe(2000);
  });
});
