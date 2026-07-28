import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Avatar3DBootstrapDTO,
  Avatar3DCreateJobPayload,
  Avatar3DJobDTO,
  Avatar3DPhotoDTO,
  Avatar3DQualityPresetId,
  Avatar3DReferencesDTO,
} from '../../models/api';
import { apiClient, MiaoxunApiError } from '../../services/apiClient';
import {
  avatar3dAttemptStore,
  Avatar3DPendingSubmission,
} from '../../services/avatar3dAttemptStore';
import { uploadAndValidateAvatar3dPhoto } from '../../services/avatar3dUpload';
import { PickedStationMedia } from '../../services/stationMediaPicker';
import {
  createAvatar3dIdempotencyKey,
  isAvatar3dTerminalStatus,
} from './avatar3dWorkflow';

type BusyAction =
  | 'none'
  | 'loading'
  | 'validating'
  | 'creating'
  | 'confirming'
  | 'rejecting'
  | 'cancelling'
  | 'deleting';

type CreateOptions = Pick<
  Avatar3DCreateJobPayload,
  'bodyShape' | 'outfit' | 'qualityPreset' | 'userDescription'
>;

type PendingAttempt = {
  idempotencyKey: string;
  options: CreateOptions | null;
  photo: Avatar3DPhotoDTO;
  submissionUncertain: boolean;
};

const pollingDelayMs = 2500;

export function useAvatar3dWorkflow({
  token,
  initialBootstrap,
  onChanged,
}: {
  token: string;
  initialBootstrap: Avatar3DBootstrapDTO | null;
  onChanged: () => void;
}) {
  const [bootstrap, setBootstrap] = useState(initialBootstrap);
  const [job, setJob] = useState<Avatar3DJobDTO | null>(
    initialBootstrap?.activeJob || null,
  );
  const [references, setReferences] = useState<Avatar3DReferencesDTO | null>(
    null,
  );
  const [validatedPhoto, setValidatedPhoto] = useState<Avatar3DPhotoDTO | null>(
    null,
  );
  const [busyAction, setBusyAction] = useState<BusyAction>('none');
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingOptions, setPendingOptions] = useState<CreateOptions | null>(
    null,
  );
  const attemptRef = useRef<PendingAttempt | null>(null);
  const polledJobId = job?.id;
  const polledJobStatus = job?.status;

  const loadBootstrap = useCallback(
    async ({ keepTerminalJob = false } = {}) => {
      const next = await apiClient.avatar3dBootstrap(token);
      setBootstrap(next);
      const storedAttempt = await avatar3dAttemptStore.read(next.user.id);
      if (next.activeJob) {
        if (storedAttempt) {
          await apiClient
            .deleteAvatar3dPhoto(token, storedAttempt.photo.id)
            .catch(() => undefined);
          await avatar3dAttemptStore.clear().catch(() => undefined);
        }
        attemptRef.current = null;
        setPendingOptions(null);
        setValidatedPhoto(null);
        setJob(next.activeJob);
      } else if (storedAttempt) {
        attemptRef.current = {
          idempotencyKey: storedAttempt.idempotencyKey,
          options: storedAttempt.options,
          photo: storedAttempt.photo,
          submissionUncertain: true,
        };
        setPendingOptions(storedAttempt.options);
        setValidatedPhoto(storedAttempt.photo);
        setErrorMessage('检测到上次未确认的提交，请重试原提交。');
      } else if (!keepTerminalJob) {
        setJob(null);
        setReferences(null);
      }
      return next;
    },
    [token],
  );

  useEffect(() => {
    let active = true;
    setBusyAction('loading');
    loadBootstrap()
      .catch(error => {
        if (active) {
          setErrorMessage(
            error instanceof Error ? error.message : '3D形象加载失败',
          );
        }
      })
      .finally(() => {
        if (active) {
          setBusyAction('none');
        }
      });
    return () => {
      active = false;
    };
  }, [loadBootstrap]);

  useEffect(() => {
    if (
      !polledJobId ||
      !polledJobStatus ||
      isAvatar3dTerminalStatus(polledJobStatus)
    ) {
      return undefined;
    }

    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const nextJob = await apiClient.getAvatar3dJob(token, polledJobId);
        if (!active) {
          return;
        }
        setJob(nextJob);
        setErrorMessage('');
        if (nextJob.status === 'awaiting_reference_confirmation') {
          const nextReferences = await apiClient.getAvatar3dReferences(
            token,
            nextJob.id,
          );
          if (active) {
            setReferences(nextReferences);
          }
        }
        if (isAvatar3dTerminalStatus(nextJob.status)) {
          await loadBootstrap({ keepTerminalJob: true });
          if (active) {
            onChanged();
          }
          return;
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error ? error.message : '任务状态更新失败',
          );
        }
      }
      if (active) {
        timeout = setTimeout(poll, pollingDelayMs);
      }
    };

    timeout = setTimeout(poll, 500);
    return () => {
      active = false;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [loadBootstrap, onChanged, polledJobId, polledJobStatus, token]);

  const discardDraft = useCallback(async () => {
    const attempt = attemptRef.current;
    if (attempt && !attempt.submissionUncertain) {
      await apiClient
        .deleteAvatar3dPhoto(token, attempt.photo.id)
        .catch(() => undefined);
      await avatar3dAttemptStore.clear().catch(() => undefined);
      attemptRef.current = null;
      setPendingOptions(null);
      setValidatedPhoto(null);
    }
  }, [token]);

  const validatePhoto = useCallback(
    async (media: PickedStationMedia) => {
      if (attemptRef.current?.submissionUncertain) {
        throw new Error('上次提交结果尚未确认，请先重试原提交。');
      }
      await discardDraft();
      setBusyAction('validating');
      setErrorMessage('');
      try {
        const photo = await uploadAndValidateAvatar3dPhoto({ token, media });
        attemptRef.current = {
          idempotencyKey: createAvatar3dIdempotencyKey(),
          options: null,
          photo,
          submissionUncertain: false,
        };
        setValidatedPhoto(photo);
        return photo;
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : '照片检查失败',
        );
        throw error;
      } finally {
        setBusyAction('none');
      }
    },
    [discardDraft, token],
  );

  const createJob = useCallback(
    async (options: CreateOptions) => {
      const attempt = attemptRef.current;
      const snapshot = bootstrap;
      if (!attempt || !snapshot) {
        throw new Error('请先选择并检查照片。');
      }

      setBusyAction('creating');
      setErrorMessage('');
      const frozenOptions = attempt.options || options;
      const submission: Avatar3DPendingSubmission = {
        version: 1,
        userId: snapshot.user.id,
        idempotencyKey: attempt.idempotencyKey,
        photo: attempt.photo,
        options: frozenOptions,
        createdAt: new Date().toISOString(),
      };
      attemptRef.current = { ...attempt, options: frozenOptions };
      setPendingOptions(frozenOptions);
      let submissionStored = false;
      try {
        await avatar3dAttemptStore.save(submission);
        submissionStored = true;
        const result = await apiClient.createAvatar3dJob(
          token,
          {
            generationMode: 'face_first_multiview',
            photoId: attempt.photo.id,
            bodyShape: frozenOptions.bodyShape,
            pose: 'natural',
            outfit: frozenOptions.outfit,
            userDescription: frozenOptions.userDescription.trim(),
            qualityPreset: frozenOptions.qualityPreset,
            acceptedPhotoRights: true,
            acceptedAdultSubject: true,
            acceptedFaceCompletion: true,
            acceptedReferenceCostVersion: snapshot.feature.costVersion,
          },
          attempt.idempotencyKey,
        );
        await avatar3dAttemptStore.clear().catch(() => undefined);
        attemptRef.current = null;
        setPendingOptions(null);
        setValidatedPhoto(null);
        setReferences(null);
        setJob(result.job);
        onChanged();
      } catch (error) {
        if (!submissionStored) {
          attemptRef.current = { ...attempt, options: null };
          setPendingOptions(null);
          setErrorMessage('无法安全保存任务状态，请重试。');
          throw error;
        }
        try {
          const recovered = await loadBootstrap();
          if (recovered.activeJob) {
            await avatar3dAttemptStore.clear().catch(() => undefined);
            attemptRef.current = null;
            setPendingOptions(null);
            setValidatedPhoto(null);
            setJob(recovered.activeJob);
            onChanged();
            return;
          }
        } catch {
          // Retain the same photo and idempotency key when submission is ambiguous.
        }

        const definitive =
          error instanceof MiaoxunApiError &&
          typeof error.status === 'number' &&
          error.status < 500;
        if (definitive) {
          await apiClient
            .deleteAvatar3dPhoto(token, attempt.photo.id)
            .catch(() => undefined);
          await avatar3dAttemptStore.clear().catch(() => undefined);
          attemptRef.current = null;
          setPendingOptions(null);
          setValidatedPhoto(null);
        } else {
          attemptRef.current = {
            ...attempt,
            options: frozenOptions,
            submissionUncertain: true,
          };
        }
        setErrorMessage(
          error instanceof Error ? error.message : '任务创建失败',
        );
        throw error;
      } finally {
        setBusyAction('none');
      }
    },
    [bootstrap, loadBootstrap, onChanged, token],
  );

  const confirmReferences = useCallback(
    async (qualityPreset: Avatar3DQualityPresetId) => {
      if (!job || !references || !bootstrap) {
        return;
      }
      setBusyAction('confirming');
      setErrorMessage('');
      try {
        const result = await apiClient.confirmAvatar3dReferences(
          token,
          job.id,
          {
            referenceSetId: references.referenceSet.id,
            qualityPreset,
            accepted: true,
            acceptedCostVersion: bootstrap.feature.costVersion,
          },
        );
        setJob(result.job);
        setReferences(null);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : '确认视图失败',
        );
        throw error;
      } finally {
        setBusyAction('none');
      }
    },
    [bootstrap, job, references, token],
  );

  const rejectReferences = useCallback(async () => {
    if (!job || !references) {
      return;
    }
    setBusyAction('rejecting');
    setErrorMessage('');
    try {
      const nextJob = await apiClient.rejectAvatar3dReferences(
        token,
        job.id,
        references.referenceSet.id,
      );
      setJob(nextJob);
      setReferences(null);
      await loadBootstrap({ keepTerminalJob: true });
      onChanged();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '放弃视图失败');
      throw error;
    } finally {
      setBusyAction('none');
    }
  }, [job, loadBootstrap, onChanged, references, token]);

  const cancelJob = useCallback(async () => {
    if (!job) {
      return;
    }
    setBusyAction('cancelling');
    setErrorMessage('');
    try {
      const nextJob = await apiClient.cancelAvatar3dJob(token, job.id);
      setJob(nextJob);
      setReferences(null);
      await loadBootstrap({ keepTerminalJob: true });
      onChanged();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '取消任务失败');
      throw error;
    } finally {
      setBusyAction('none');
    }
  }, [job, loadBootstrap, onChanged, token]);

  const deleteModel = useCallback(
    async (modelId: string) => {
      setBusyAction('deleting');
      setErrorMessage('');
      try {
        await apiClient.deleteAvatar3dModel(token, modelId);
        await loadBootstrap();
        onChanged();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : '删除形象失败',
        );
        throw error;
      } finally {
        setBusyAction('none');
      }
    },
    [loadBootstrap, onChanged, token],
  );

  const dismissJob = useCallback(async () => {
    setJob(null);
    setReferences(null);
    await loadBootstrap();
  }, [loadBootstrap]);

  return {
    bootstrap,
    busyAction,
    cancelJob,
    confirmReferences,
    createJob,
    deleteModel,
    discardDraft,
    dismissJob,
    errorMessage,
    isSubmissionUncertain: Boolean(attemptRef.current?.submissionUncertain),
    job,
    pendingOptions,
    references,
    rejectReferences,
    setErrorMessage,
    validatePhoto,
    validatedPhoto,
  };
}
