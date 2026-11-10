import type { ComicRenderTaskDTO } from '../src/models/comicRender';

export const comicRenderTask = (
  overrides: Partial<ComicRenderTaskDTO> = {},
): ComicRenderTaskDTO => ({
  id: 'render-1',
  contractVersion: 1,
  comicDiaryId: 'comic-1',
  status: 'queued',
  phase: 'queued',
  revision: 1,
  progress: { total: 2, succeeded: 0, failed: 0, unknown: 0 },
  frames: [
    { frameIndex: 1, status: 'queued', mediaAssetId: null, errorCode: null },
    { frameIndex: 2, status: 'queued', mediaAssetId: null, errorCode: null },
  ],
  error: null,
  allowedActions: ['cancel'],
  createdAt: '2026-11-10T00:00:00Z',
  updatedAt: '2026-11-10T00:00:00Z',
  ...overrides,
});
