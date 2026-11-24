import { request } from './http';

export type VoiceCallCapability = {
  enabled: true;
  iceServers: { urls: string | string[] }[];
};
export type VoiceCallRecord = {
  id: string;
  callerUserId: string;
  calleeUserId: string;
  peerUserId: string;
  peerName: string;
  state: 'ringing' | 'accepted' | 'ended';
  endReason?: string | null;
  createdAt: string;
  acceptedAt?: string | null;
};
export type VoiceCallAction = 'accept' | 'decline' | 'cancel' | 'hangup';
export type VoiceCallSignal =
  | {
      kind: 'offer' | 'answer';
      payload: { type: 'offer' | 'answer'; sdp: string };
    }
  | {
      kind: 'ice';
      payload: {
        candidate: string;
        sdpMid: string | null;
        sdpMLineIndex: number | null;
      };
    };

const path = '/api/voice-calls';
const options = (token: string) => ({ token, timeoutMs: 8000 });
export const voiceCallApi = {
  dial: async (token: string, threadId: string, requestId: string) =>
    (
      await request<{ call: VoiceCallRecord }>(path, {
        ...options(token),
        method: 'POST',
        body: { threadId, requestId },
      })
    ).call,
  incoming: async (token: string) =>
    (
      await request<{ call: VoiceCallRecord | null }>(
        path + '/incoming',
        options(token),
      )
    ).call,
  load: async (token: string, id: string) =>
    (await request<{ call: VoiceCallRecord }>(path + '/' + id, options(token)))
      .call,
  action: async (token: string, id: string, action: VoiceCallAction) =>
    (
      await request<{ call: VoiceCallRecord }>(path + '/' + id + '/action', {
        ...options(token),
        method: 'POST',
        body: { action },
      })
    ).call,
  send: (
    token: string,
    id: string,
    requestId: string,
    signal: VoiceCallSignal,
  ) =>
    request<{ id: number }>(path + '/' + id + '/signals', {
      ...options(token),
      method: 'POST',
      body: { ...signal, requestId },
    }),
  receive: async (token: string, id: string, after: number) =>
    (
      await request<{ signals: (VoiceCallSignal & { id: number })[] }>(
        path + '/' + id + '/signals?after=' + after,
        options(token),
      )
    ).signals,
};
