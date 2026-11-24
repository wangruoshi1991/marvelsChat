import { useEffect, useRef, useState } from 'react';
import type { ChatAttachmentDTO } from '../../models/api';
import {
  playVoiceAttachment,
  playVoiceRecording,
  readVoicePlayback,
  seekVoicePlayback,
  setVoicePlaybackPaused,
  setVoicePlaybackRate,
  stopVoicePlayback,
  type VoicePlaybackRate,
  type VoicePlaybackState,
} from '../../services/chatVoiceAudio';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';

import {
  isVoiceCallActive,
  voiceCallConflictCopy,
} from '../../services/voiceCall/voiceCallResources';

type Phase = 'idle' | 'loading' | 'playing' | 'paused' | 'failed';
type State = Omit<VoicePlaybackState, 'phase'> & {
  phase: Phase;
  scope: string;
  changing: boolean;
  rate: VoicePlaybackRate;
};
type Run = {
  id: string;
  scope: string;
  timer?: ReturnType<typeof setTimeout>;
  changing: boolean;
  revision: number;
};

export function useVoicePlayback(
  attachment: ChatAttachmentDTO,
  token: string,
  onError: (message: string) => void,
) {
  return useVoiceTransport(
    token + ':' + attachment.id,
    attachment.durationMs ?? 0,
    id => playVoiceAttachment(id, attachment, token),
    onError,
  );
}

export function useRecordingPreview(
  recordingId: string,
  durationMs: number,
  onError: (message: string) => void,
) {
  return useVoiceTransport(
    recordingId,
    durationMs,
    id => playVoiceRecording(id, recordingId),
    onError,
  );
}

function useVoiceTransport(
  scope: string,
  durationMs: number,
  play: (id: string) => Promise<void>,
  onError: (message: string) => void,
) {
  const initial: State = {
    scope,
    phase: 'idle',
    positionMs: 0,
    durationMs,
    waveform: [],
    changing: false,
    rate: 1,
  };
  const [state, setState] = useState(initial);
  const active = useRef<Run | null>(null);
  const owner = useRef({ scope, onError });
  owner.current = { scope, onError };
  const mounted = useRef(false);
  const current = (run: Run) =>
    mounted.current &&
    active.current === run &&
    owner.current.scope === run.scope;
  const stop = () => {
    const run = active.current;
    if (!run || !current(run)) return;
    active.current = null;
    clearTimeout(run.timer);
    stopVoicePlayback(run.id);
    setState(value => ({
      ...value,
      phase: 'idle',
      positionMs: 0,
      changing: false,
      rate: 1,
    }));
  };

  useEffect(() => {
    mounted.current = true;
    setState(value =>
      value.scope === scope
        ? value
        : {
            scope,
            phase: 'idle',
            positionMs: 0,
            durationMs: 0,
            waveform: [],
            changing: false,
            rate: 1,
          },
    );
    return () => {
      mounted.current = false;
      const run = active.current;
      active.current = null;
      if (run) {
        clearTimeout(run.timer);
        stopVoicePlayback(run.id);
      }
    };
  }, [scope]);

  const fail = (run: Run, error: unknown) => {
    if (!current(run)) return;
    clearTimeout(run.timer);
    active.current = null;
    stopVoicePlayback(run.id);
    setState(value => ({
      ...value,
      phase: 'failed',
      positionMs: 0,
      changing: false,
      rate: 1,
    }));
    owner.current.onError(
      error instanceof Error ? error.message : '语音播放失败，请重试。',
    );
  };
  const poll = async (run: Run) => {
    if (!current(run)) return;
    try {
      const revision = run.revision;
      const next = await readVoicePlayback(run.id);
      if (!current(run)) return;
      const { phase } = next;
      if (phase === 'stopped') return;
      if (revision === run.revision && !run.changing)
        setState(value => ({
          ...value,
          ...next,
          waveform: next.waveform.length ? next.waveform : value.waveform,
          scope: run.scope,
          phase,
          changing: false,
        }));
      // Schedule only after the native read completes, so slow bridges cannot
      // accumulate overlapping reads. Only the active message owns a timer.
      run.timer = setTimeout(
        () => {
          poll(run);
        },
        phase === 'loading' ? 70 : 200,
      );
    } catch (error) {
      fail(run, error);
    }
  };
  const displayed = state.scope === scope ? state : initial;
  const isPrepared =
    displayed.phase === 'playing' || displayed.phase === 'paused';
  const canSeek = isPrepared && !displayed.changing && !isVoiceCallActive();
  const control = async (
    run: Run,
    perform: () => Promise<boolean>,
    confirmed: Partial<Pick<State, 'phase' | 'rate'>>,
    failure?: string,
  ) => {
    if (!current(run) || run.changing) return;
    run.changing = true;
    run.revision += 1;
    setState(value => ({ ...value, changing: true }));
    try {
      const changed = await perform();
      if (!current(run)) return;
      if (changed) {
        setState(value => ({ ...value, ...confirmed }));
      } else if (failure) {
        owner.current.onError(failure);
      }
    } catch (error) {
      if (failure) {
        if (current(run)) owner.current.onError(failure);
      } else {
        fail(run, error);
      }
    } finally {
      run.changing = false;
      if (current(run)) setState(value => ({ ...value, changing: false }));
    }
  };
  const seekToFraction = async (fraction: number) => {
    const run = active.current;
    if (
      !run ||
      !canSeek ||
      !Number.isFinite(fraction) ||
      displayed.durationMs <= 0
    )
      return;
    const target = Math.round(
      Math.max(0, Math.min(1, fraction)) * displayed.durationMs,
    );
    await control(
      run,
      () => seekVoicePlayback(run.id, target),
      {},
      '暂时无法跳转语音进度。',
    );
  };
  const cycleRate = async () => {
    const run = active.current;
    if (!run || !canSeek) return;
    const rate: VoicePlaybackRate =
      displayed.rate === 1 ? 1.5 : displayed.rate === 1.5 ? 2 : 1;
    await control(
      run,
      () => setVoicePlaybackRate(run.id, rate),
      { rate },
      '暂时无法调整语音速度。',
    );
  };
  const toggle = async () => {
    if (isVoiceCallActive()) {
      owner.current.onError(voiceCallConflictCopy.playback[0]);
      return;
    }
    const run = active.current;
    if (run && current(run)) {
      if (run.changing) return;
      if (displayed.phase === 'loading') {
        stop();
        return;
      }
      const paused = displayed.phase === 'playing';
      await control(run, () => setVoicePlaybackPaused(run.id, paused), {
        phase: paused ? 'paused' : 'playing',
      });
      return;
    }
    const next: Run = {
      id: createIdempotencyKey(),
      scope,
      changing: false,
      revision: 0,
    };
    active.current = next;
    setState({ ...initial, waveform: displayed.waveform, phase: 'loading' });
    play(next.id)
      .catch(error => fail(next, error))
      .finally(() => {
        if (!current(next)) return;
        clearTimeout(next.timer);
        active.current = null;
        setState(value => ({
          ...value,
          phase: 'idle',
          positionMs: 0,
          changing: false,
          rate: 1,
        }));
      });
    next.timer = setTimeout(() => {
      poll(next);
    }, 40);
  };
  return { ...displayed, toggle, stop, canSeek, cycleRate, seekToFraction };
}
