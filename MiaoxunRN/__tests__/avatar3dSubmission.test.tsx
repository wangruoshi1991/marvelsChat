import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { useAvatar3dWorkflow } from '../src/features/station/useAvatar3dWorkflow';
import { apiClient, MiaoxunApiError } from '../src/services/apiClient';
import {
  avatar3dAttemptStore,
  Avatar3DPendingSubmission,
} from '../src/services/avatar3dAttemptStore';
import type { Avatar3DBootstrapDTO, Avatar3DJobDTO } from '../src/models/api';

const other = { id: 'other', status: 'succeeded' } as Avatar3DJobDTO;
const original = { id: 'original', status: 'failed' } as Avatar3DJobDTO;
const bootstrap = {
  user: { id: 'me' },
  feature: { costVersion: 'new' },
  activeJob: other,
} as Avatar3DBootstrapDTO;
const pending = {
  version: 1,
  userId: 'me',
  idempotencyKey: 'original-key',
  acceptedReferenceCostVersion: 'old',
  options: {
    qualityPreset: 'standard',
    bodyShape: 'balanced',
    outfit: 'casual',
    userDescription: '',
  },
  photo: { id: 'photo' },
} as Avatar3DPendingSubmission;
let state: ReturnType<typeof useAvatar3dWorkflow>;
let tree: Renderer.ReactTestRenderer;
const changed = jest.fn();
function Probe() {
  state = useAvatar3dWorkflow({
    token: 'token',
    initialBootstrap: bootstrap,
    onChanged: changed,
  });
  return null;
}
beforeEach(() => {
  jest.spyOn(apiClient, 'avatar3dBootstrap').mockResolvedValue(bootstrap);
  jest.spyOn(avatar3dAttemptStore, 'read').mockResolvedValue(pending);
  jest.spyOn(avatar3dAttemptStore, 'save').mockResolvedValue(undefined);
  jest.spyOn(avatar3dAttemptStore, 'clear').mockResolvedValue(undefined);
  jest.spyOn(apiClient, 'deleteAvatar3dPhoto').mockResolvedValue(undefined);
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  jest.restoreAllMocks();
  changed.mockClear();
});

it('restores the exact saved terminal job even when another job is active', async () => {
  const lookup = jest
    .spyOn(apiClient, 'findAvatar3dSubmission')
    .mockResolvedValue({ job: original });
  await act(async () => {
    tree = Renderer.create(<Probe />);
  });
  expect(lookup).toHaveBeenCalledWith('token', 'original-key');
  expect(state.job).toEqual(original);
  expect(avatar3dAttemptStore.clear).toHaveBeenCalledTimes(1);
  expect(apiClient.deleteAvatar3dPhoto).not.toHaveBeenCalled();
});

it('retains an unmatched pending draft and recovers an ambiguous explicit retry by key', async () => {
  jest
    .spyOn(apiClient, 'findAvatar3dSubmission')
    .mockResolvedValueOnce({ job: null })
    .mockResolvedValueOnce({ job: original });
  const create = jest
    .spyOn(apiClient, 'createAvatar3dJob')
    .mockRejectedValue(new Error('response lost'));
  await act(async () => {
    tree = Renderer.create(<Probe />);
  });
  expect(state.job).toBeNull();
  expect(state.isSubmissionUncertain).toBe(true);
  expect(avatar3dAttemptStore.clear).not.toHaveBeenCalled();
  await act(async () => {
    await state.createJob({ ...pending.options, outfit: 'sport' });
  });
  expect(create).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledWith(
    'token',
    expect.objectContaining({
      photoId: 'photo',
      outfit: 'casual',
      acceptedReferenceCostVersion: 'old',
    }),
    'original-key',
  );
  expect(state.job).toEqual(original);
  expect(changed).toHaveBeenCalledTimes(1);
});

it('reports a definitive conflict without accepting another job', async () => {
  const lookup = jest
    .spyOn(apiClient, 'findAvatar3dSubmission')
    .mockResolvedValue({ job: null });
  const error = new MiaoxunApiError('Already active', { status: 409 });
  jest.spyOn(apiClient, 'createAvatar3dJob').mockRejectedValue(error);
  await act(async () => {
    tree = Renderer.create(<Probe />);
  });
  await act(async () => {
    await expect(state.createJob(pending.options)).rejects.toBe(error);
  });
  expect(state.job).toBeNull();
  expect(state.errorMessage).toBe('Already active');
  expect(lookup).toHaveBeenCalledTimes(2);
  expect(apiClient.deleteAvatar3dPhoto).toHaveBeenCalledWith('token', 'photo');
  expect(changed).not.toHaveBeenCalled();
});
