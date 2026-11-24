import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { uploadChatAudio } from '../../services/api/chatAttachmentApi';
import {
  cancelVoiceRecording,
  finishVoiceRecording,
  maxChatVoiceDurationMs,
  prepareVoiceRecording,
  releaseVoiceRecording,
  startVoiceRecording,
} from '../../services/chatVoiceAudio';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';

type Mode = 'hold' | 'accessible' | 'locked';
type Status =
  | 'idle'
  | 'preparing'
  | 'recording'
  | 'finishing'
  | 'ready'
  | 'uploading'
  | 'failed';
type State = {
  status: Status;
  durationMs: number;
  mode: Mode | null;
  recordingId: string | null;
};

const idle: State = {
  status: 'idle',
  durationMs: 0,
  mode: null,
  recordingId: null,
};

type Recording = {
  id: string;
  scope: string;
  mode: Mode;
  status: Status;
  startedAt: number;
  clock?: ReturnType<typeof setInterval>;
  limit?: ReturnType<typeof setTimeout>;
  uri?: string;
  durationMs: number;
  submit: (attachmentId: string) => Promise<void>;
};

function stopClock(recording: Recording) {
  clearInterval(recording.clock);
  clearTimeout(recording.limit);
}

export function useChatVoice({
  scope,
  threadId,
  token,
  onError,
}: {
  scope: string;
  threadId: string;
  token?: string | null;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<State>(idle);
  const active = useRef<Recording | null>(null);
  const mounted = useRef(true);
  const owner = useRef({ scope, onError });
  owner.current = { scope, onError };
  const current = useCallback(
    (recording: Recording) =>
      mounted.current &&
      active.current === recording &&
      owner.current.scope === recording.scope,
    [],
  );
  const update = useCallback(
    (recording: Recording, status: Status) => {
      if (!current(recording)) return;
      recording.status = status;
      setState({
        status,
        mode: recording.mode,
        durationMs: recording.durationMs,
        recordingId: recording.id,
      });
    },
    [current],
  );
  const discard = useCallback(() => {
    const recording = active.current;
    active.current = null;
    if (recording) {
      stopClock(recording);
      cancelVoiceRecording(recording.id);
      releaseVoiceRecording(recording.id);
    }
    if (mounted.current) setState(idle);
  }, []);
  const report = useCallback((error: unknown) => {
    owner.current.onError(
      error instanceof Error ? error.message : '聊天语音操作失败，请重试。',
    );
  }, []);
  const upload = useCallback(
    async (recording = active.current) => {
      if (
        !recording?.uri ||
        !token ||
        !current(recording) ||
        !['ready', 'failed'].includes(recording.status)
      )
        return;
      update(recording, 'uploading');
      let attachmentId: string;
      try {
        const attachment = await uploadChatAudio({
          threadId,
          token,
          uri: recording.uri,
          filename: 'voice.m4a',
          idempotencyKey: recording.id,
        });
        attachmentId = attachment.id;
      } catch (error) {
        if (current(recording)) {
          update(recording, 'failed');
          report(error);
        }
        return;
      }
      if (!current(recording)) return;
      // Once the message owns the uploaded attachment, its existing exact
      // retry flow owns delivery. Keep upload retries on the original key.
      discard();
      try {
        await recording.submit(attachmentId);
      } catch (error) {
        if (owner.current.scope === recording.scope && mounted.current)
          report(error);
      }
    },
    [current, discard, report, threadId, token, update],
  );
  const finish = useCallback(
    async (cancelled = false) => {
      const recording = active.current;
      if (!recording || !current(recording)) return;
      if (recording.status !== 'preparing' && recording.status !== 'recording')
        return;
      if (cancelled || recording.status === 'preparing') {
        discard();
        return;
      }
      stopClock(recording);
      update(recording, 'finishing');
      try {
        const result = await finishVoiceRecording(recording.id);
        if (!current(recording)) {
          releaseVoiceRecording(recording.id);
          return;
        }
        recording.uri = result.uri;
        recording.durationMs = result.durationMs;
        update(recording, 'ready');
      } catch (error) {
        if (current(recording)) {
          discard();
          report(error);
        }
      }
    },
    [current, discard, report, update],
  );
  const lock = useCallback(() => {
    const recording = active.current;
    if (
      !recording ||
      !current(recording) ||
      recording.mode !== 'hold' ||
      recording.status !== 'recording'
    )
      return false;
    recording.mode = 'locked';
    update(recording, 'recording');
    return true;
  }, [current, update]);
  const start = useCallback(
    async (mode: Exclude<Mode, 'locked'>, submit: Recording['submit']) => {
      if (!token || active.current || AppState.currentState === 'background')
        return;
      const recording: Recording = {
        id: createIdempotencyKey(),
        scope,
        mode,
        submit,
        startedAt: 0,
        durationMs: 0,
        status: 'preparing',
      };
      active.current = recording;
      update(recording, 'preparing');
      try {
        const alreadyAllowed = await prepareVoiceRecording();
        if (!current(recording)) return;
        // A system consent prompt consumes the original touch. Require a
        // fresh intentional activation before opening the microphone.
        if (!alreadyAllowed) {
          discard();
          report(new Error('麦克风权限已开启，请重新录音。'));
          return;
        }
        await startVoiceRecording(recording.id);
        if (!current(recording)) {
          cancelVoiceRecording(recording.id);
          return;
        }
        recording.startedAt = Date.now();
        update(recording, 'recording');
        recording.clock = setInterval(() => {
          recording.durationMs = Date.now() - recording.startedAt;
          update(recording, 'recording');
        }, 250);
        recording.limit = setTimeout(() => {
          finish().catch(() => undefined);
        }, maxChatVoiceDurationMs - 250);
      } catch (error) {
        if (current(recording)) {
          discard();
          report(error);
        }
      }
    },
    [current, discard, finish, report, scope, token, update],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      discard();
    };
  }, [discard]);
  useEffect(() => {
    discard();
  }, [discard, scope]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', next => {
      if (next !== 'background') return;
      const status = active.current?.status;
      if (
        status === 'preparing' ||
        status === 'recording' ||
        status === 'finishing'
      )
        discard();
    });
    return () => listener.remove();
  }, [discard]);

  const isBusy = () => {
    const status = active.current?.status;
    return (
      status === 'preparing' ||
      status === 'recording' ||
      status === 'finishing' ||
      status === 'uploading'
    );
  };

  return { ...state, start, finish, lock, discard, upload, isBusy };
}

export type ChatVoiceControls = ReturnType<typeof useChatVoice>;
