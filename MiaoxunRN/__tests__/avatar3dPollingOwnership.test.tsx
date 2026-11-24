import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useAvatar3d } from '../src/features/station/useAvatar3d';
import type {
  Avatar3DBootstrapDTO,
  Avatar3DJobStatus,
} from '../src/models/api';
import { apiClient } from '../src/services/apiClient';

const bootstrap = (status: Avatar3DJobStatus) =>
  ({ activeJob: { id: 'job', status } } as Avatar3DBootstrapDTO);

test.each(['success', 'error'])(
  'a late poll %s cannot replace a newer terminal manual refresh',
  async completion => {
    jest.useFakeTimers();
    let finishPoll!: () => void;
    const request = jest
      .spyOn(apiClient, 'avatar3dBootstrap')
      .mockResolvedValueOnce(bootstrap('processing_3d'))
      .mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finishPoll = () =>
              completion === 'success'
                ? resolve(bootstrap('processing_3d'))
                : reject(new Error('Old poll failed'));
          }),
      )
      .mockResolvedValueOnce(bootstrap('succeeded'));
    let current!: ReturnType<typeof useAvatar3d>;
    let renderer!: TestRenderer.ReactTestRenderer;
    function Harness({ polls }: { polls: boolean }) {
      current = useAvatar3d('owner', polls);
      return null;
    }
    try {
      await act(async () => {
        renderer = TestRenderer.create(<Harness polls />);
      });
      await act(async () => jest.advanceTimersByTime(5000));
      expect(request).toHaveBeenCalledTimes(2);
      await act(async () => {
        renderer.update(<Harness polls={false} />);
        await current.refresh();
      });
      expect(current.bootstrap?.activeJob?.status).toBe('succeeded');
      await act(async () => finishPoll());
      expect(current.bootstrap?.activeJob?.status).toBe('succeeded');
      expect(current.errorMessage).toBe('');
    } finally {
      await act(async () => renderer?.unmount());
      request.mockRestore();
      jest.useRealTimers();
    }
  },
);
