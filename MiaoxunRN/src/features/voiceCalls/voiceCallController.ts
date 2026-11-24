import {
  voiceCallApi,
  type VoiceCallAction,
  type VoiceCallCapability,
  type VoiceCallRecord,
  type VoiceCallSignal,
} from '../../services/api/voiceCallApi';
import { MiaoxunApiError } from '../../services/api/http';
import { stopCurrentVoicePlayback } from '../../services/chatVoiceAudio';
import {
  releaseVoiceCallResources,
  reserveVoiceCallResources,
} from '../../services/voiceCall/voiceCallResources';
import { clearCallAudioRoute } from '../../services/voiceCall/voiceCallAudioRoute';
import { createVoiceCallMedia } from '../../services/voiceCall/voiceCallMedia';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';

import type { VoiceCallDisplay } from './VoiceCallSheet';
export type { VoiceCallDisplay } from './VoiceCallSheet';

type Run = {
  view: VoiceCallDisplay;
  call?: VoiceCallRecord;
  cursor: number;
  busy?: boolean;
  media?: ReturnType<typeof createVoiceCallMedia>;
  timer?: ReturnType<typeof setTimeout>;
  connectTimer?: ReturnType<typeof setTimeout>;
  disconnectTimer?: ReturnType<typeof setTimeout>;
  signalFailureSince?: number;
};
const retryableNetwork = (error: unknown) =>
  error instanceof MiaoxunApiError && (error.isNetworkError || error.isTimeout);
const isLive = (view: VoiceCallDisplay) =>
  view.phase !== 'ended' && view.phase !== 'failed';

export function createVoiceCallController({
  token,
  userId,
  iceServers,
  onDisplay,
  text,
}: {
  token: string;
  userId: string;
  iceServers: VoiceCallCapability['iceServers'];
  onDisplay: (display: VoiceCallDisplay | null) => void;
  text: (zh: string, en: string) => string;
}) {
  let run: Run | undefined;
  let foreground = false;
  let closed = false;
  let inboxBusy = false;
  let dismissedIncomingId: string | undefined;
  let inboxRevision = 0;
  let inboxTimer: ReturnType<typeof setTimeout> | undefined;
  const online = (owner: Run) => !closed && run === owner && isLive(owner.view);
  const update = (owner: Run, next: Partial<VoiceCallDisplay>) => {
    if (closed || run !== owner) return;
    owner.view = { ...owner.view, ...next };
    onDisplay(owner.view);
  };
  const newRun = (name: string, phase: VoiceCallDisplay['phase']) => {
    inboxRevision++;
    run = { view: { peerName: name, phase, muted: false }, cursor: 0 };
    reserveVoiceCallResources(run);
    stopCurrentVoicePlayback();
    onDisplay(run.view);
    return run;
  };
  const release = (owner: Run) => {
    clearTimeout(owner.timer);
    clearTimeout(owner.connectTimer);
    clearTimeout(owner.disconnectTimer);
    if (owner.media) {
      clearCallAudioRoute();
      owner.media.close();
    }
    owner.media = undefined;
    releaseVoiceCallResources(owner);
  };
  const closeRemote = async (call: VoiceCallRecord) => {
    if (call.state === 'ended') return;
    const selected: VoiceCallAction =
      call.state === 'accepted'
        ? 'hangup'
        : call.callerUserId === userId
        ? 'cancel'
        : 'decline';
    try {
      await voiceCallApi.action(token, call.id, selected);
    } catch (error) {
      // A peer can accept just before our ringing cancellation arrives.
      // Retry cleanup after reading the authoritative state.
      if (
        selected === 'cancel' &&
        error instanceof MiaoxunApiError &&
        error.status === 409
      ) {
        const latest = await voiceCallApi.load(token, call.id);
        if (latest.state === 'accepted') {
          await voiceCallApi.action(token, latest.id, 'hangup');
          return;
        }
        if (latest.state === 'ended') return;
      }
      throw error;
    }
  };
  const fail = (owner: Run, message: string) => {
    if (!online(owner)) return;
    release(owner);
    update(owner, { phase: 'failed', message });
    if (owner.call) closeRemote(owner.call).catch(() => undefined);
  };
  const endMessage = (call: VoiceCallRecord) => {
    switch (call.endReason) {
      case 'declined':
        return text('对方未接听', 'Call declined');
      case 'ring_timeout':
        return text('无人接听', 'No answer');
      case 'disconnected':
      case 'session_ended':
      case 'friendship_ended':
      case 'server_shutdown':
      case 'server_restart':
        return text('连接已中断', 'Connection lost');
      case 'duration_limit':
        return text('已达到本次通话时限', 'Call time limit reached');
      default:
        return undefined;
    }
  };
  const disconnected = text(
    '通话连接中断，请重试。',
    'The call connection was interrupted.',
  );
  const connectionFailed = text(
    '双向音频未能接通，请重试。',
    'Could not establish two-way audio.',
  );
  const send = async (owner: Run, signal: VoiceCallSignal) => {
    if (!online(owner) || !owner.call) return;
    const id = owner.call.id;
    const key = createIdempotencyKey();
    try {
      await voiceCallApi.send(token, id, key, signal);
    } catch (error) {
      if (!online(owner) || !retryableNetwork(error)) throw error;
      await voiceCallApi.send(token, id, key, signal);
    }
  };

  const openMedia = async (owner: Run, call: VoiceCallRecord) => {
    if (owner.media || !online(owner)) return;
    update(owner, { phase: 'connecting', peerName: call.peerName });
    owner.connectTimer = setTimeout(
      () => fail(owner, connectionFailed),
      30_000,
    );
    const media = createVoiceCallMedia({
      iceServers,
      sendSignal: signal => send(owner, signal),
      onConnection: state => {
        if (!online(owner)) return;
        if (state === 'connected') {
          clearTimeout(owner.connectTimer);
          clearTimeout(owner.disconnectTimer);
          owner.disconnectTimer = undefined;
          update(owner, {
            phase: 'connected',
            connectedAt: owner.view.connectedAt ?? Date.now(),
          });
        } else if (state === 'failed') {
          fail(owner, connectionFailed);
        } else if (!owner.disconnectTimer) {
          update(owner, { phase: 'connecting' });
          owner.disconnectTimer = setTimeout(
            () => fail(owner, disconnected),
            6000,
          );
        }
      },
    });
    owner.media = media;
    try {
      await media.start(call.callerUserId === userId);
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      fail(
        owner,
        name === 'NotAllowedError' ||
          name === 'SecurityError' ||
          name === 'NotFoundError'
          ? text(
              '请在系统设置中允许妙讯使用麦克风。',
              'Allow Miaoxun to use the microphone in system settings.',
            )
          : connectionFailed,
      );
    }
  };

  const refresh = async (owner: Run) => {
    if (!online(owner) || !owner.call || owner.busy) return;
    owner.busy = true;
    const id = owner.call.id;
    let retryDelay = 850;
    try {
      const call = await voiceCallApi.load(token, id);
      if (!online(owner)) return;
      owner.call = call;
      if (call.state === 'ended') {
        release(owner);
        update(owner, { phase: 'ended', message: endMessage(call) });
        return;
      }
      if (call.state === 'accepted') {
        await openMedia(owner, call);
        if (!online(owner)) return;
        const signals = await voiceCallApi.receive(token, id, owner.cursor);
        for (const signal of signals) {
          if (!online(owner) || !owner.media) return;
          await owner.media.receive(signal);
          owner.cursor = signal.id;
        }
      }
      owner.signalFailureSince = undefined;
    } catch (error) {
      if (owner.view.connectedAt && retryableNetwork(error)) {
        owner.signalFailureSince ??= Date.now();
        if (Date.now() - owner.signalFailureSince < 12_000) {
          retryDelay = 1200;
          return;
        }
      }
      if (
        error instanceof MiaoxunApiError &&
        error.code === 'VOICE_CALL_NOT_ACCEPTED'
      ) {
        // The peer can hang up between fetching call status and reading signals.
        retryDelay = 150;
        return;
      }
      fail(
        owner,
        error instanceof MiaoxunApiError ? disconnected : connectionFailed,
      );
    } finally {
      owner.busy = false;
      if (online(owner))
        owner.timer = setTimeout(() => refresh(owner), retryDelay);
    }
  };
  const checkInbox = async () => {
    if (inboxBusy || closed || !foreground || run) return;
    inboxBusy = true;
    const revision = inboxRevision;
    try {
      const call = await voiceCallApi.incoming(token);
      if (!call) dismissedIncomingId = undefined;
      if (
        call &&
        call.id !== dismissedIncomingId &&
        call.state === 'ringing' &&
        revision === inboxRevision &&
        !closed &&
        foreground &&
        !run
      ) {
        const owner = newRun(call.peerName, 'incoming');
        owner.call = call;
        refresh(owner);
      }
    } catch {
      // A temporary inbox network failure does not imply there is a call.
    } finally {
      inboxBusy = false;
    }
  };
  const inbox = () => {
    if (!foreground || closed) return;
    checkInbox();
    inboxTimer = setTimeout(inbox, 2500);
  };

  const background = () => {
    if (!run || !isLive(run.view)) return;
    const owner = run;
    release(owner);
    if (
      owner.call &&
      (owner.call.callerUserId === userId || owner.call.state === 'accepted')
    )
      closeRemote(owner.call).catch(() => undefined);
    if (owner.view.phase === 'incoming') {
      run = undefined;
      onDisplay(null);
    } else {
      update(owner, {
        phase: 'ended',
        message: text(
          '离开妙讯后已关闭麦克风。',
          'The microphone stopped when Miaoxun left the foreground.',
        ),
      });
    }
  };

  return {
    setForeground(active: boolean) {
      if (closed || foreground === active) return;
      foreground = active;
      clearTimeout(inboxTimer);
      if (active) inbox();
      else {
        inboxRevision++;
        background();
      }
    },
    async start(threadId: string, name: string) {
      if (closed || !foreground || run) return;
      const owner = newRun(name, 'dialing');
      const requestId = createIdempotencyKey();
      const dial = () => voiceCallApi.dial(token, threadId, requestId);
      try {
        const call = await dial().catch(error => {
          if (!retryableNetwork(error)) throw error;
          return dial();
        });
        if (!online(owner)) {
          closeRemote(call).catch(() => undefined);
          return;
        }
        owner.call = call;
        update(owner, { phase: 'outgoing', peerName: call.peerName });
        refresh(owner);
      } catch (error) {
        fail(
          owner,
          error instanceof MiaoxunApiError && error.status === 409
            ? text(
                '你或对方正在通话。',
                'You or the other person are already in a call.',
              )
            : text(
                '无法发起通话，请重试。',
                'Could not start the call. Try again.',
              ),
        );
      }
    },
    async accept() {
      const owner = run;
      if (
        !owner ||
        !online(owner) ||
        !foreground ||
        owner.view.phase !== 'incoming' ||
        !owner.call
      )
        return;
      clearTimeout(owner.timer);
      update(owner, { phase: 'connecting' });
      try {
        const call = await voiceCallApi.action(token, owner.call.id, 'accept');
        if (!online(owner)) {
          closeRemote(call).catch(() => undefined);
          return;
        }
        owner.call = call;
        refresh(owner);
      } catch {
        if (online(owner) && owner.call) {
          try {
            owner.call = await voiceCallApi.load(token, owner.call.id);
          } catch {
            // Keep the original ringing record so the normal cleanup can decline it.
          }
        }
        fail(
          owner,
          text(
            '来电已失效或已由另一设备接听。',
            'The call expired or was answered on another device.',
          ),
        );
      }
    },
    async end() {
      const owner = run;
      if (!owner || !online(owner)) return;
      const call = owner.call;
      if (call?.state === 'ringing' && call.callerUserId !== userId)
        dismissedIncomingId = call.id;
      run = undefined;
      release(owner);
      onDisplay(null);
      if (!call) return;
      const revision = inboxRevision;
      try {
        await closeRemote(call);
      } catch (error) {
        if (closed || inboxRevision !== revision) return;
        if (
          error instanceof MiaoxunApiError &&
          [404, 409].includes(error.status ?? 0)
        )
          return;
        return text(
          '音频已关闭，挂断回执待确认。',
          'Audio stopped. The server could not confirm hang-up.',
        );
      }
    },
    mute() {
      const owner = run;
      if (!owner?.media || owner.view.phase !== 'connected') return;
      const muted = !owner.view.muted;
      owner.media.mute(muted);
      update(owner, { muted });
    },
    dismiss() {
      if (!run || isLive(run.view)) return;
      run = undefined;
      onDisplay(null);
      checkInbox();
    },
    dispose() {
      closed = true;
      clearTimeout(inboxTimer);
      if (!run) return;
      release(run);
      if (run.call && isLive(run.view) && run.view.phase !== 'incoming')
        closeRemote(run.call).catch(() => undefined);
      run = undefined;
    },
  };
}
