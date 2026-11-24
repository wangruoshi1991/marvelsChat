import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { assertVoiceCallResourceAvailable } from './voiceCall/voiceCallResources';
import type { ChatAttachmentDTO } from '../models/api';
import { handleAuthenticatedResponse } from './api/http';

export const maxChatVoiceDurationMs = 60_000;
export const chatVoiceMessageContent = '[语音]';
export type VoicePlaybackRate = 1 | 1.5 | 2;

type Recording = { uri: string; durationMs: number };
type Playback = { status: number; outcome: 'finished' | 'stopped' | 'failed' };
export type VoicePlaybackState = {
  phase: 'loading' | 'playing' | 'paused' | 'stopped';
  positionMs: number;
  durationMs: number;
  waveform: number[];
};

type ChatVoiceAudioBridge = {
  prepareRecording(): Promise<boolean>;
  startRecording(id: string): Promise<void>;
  finishRecording(id: string): Promise<Recording>;
  cancelRecording(id: string): void;
  releaseRecording(id: string): void;
  playAttachment(
    id: string,
    attachmentId: string,
    token: string,
  ): Promise<Playback>;
  stopPlayback(id: string): void;
  getPlaybackState(id: string): Promise<VoicePlaybackState>;
  setPlaybackPaused(id: string, paused: boolean): Promise<boolean>;
  playRecording(id: string, recordingId: string): Promise<Playback>;
  seekPlayback(id: string, positionMs: number): Promise<boolean>;
  setPlaybackRate(id: string, rate: VoicePlaybackRate): Promise<boolean>;
};

function nativeAudio() {
  return NativeModules.MiaoxunChatVoiceModule as
    | ChatVoiceAudioBridge
    | undefined;
}

function requireAudio() {
  const bridge = nativeAudio();
  if (!bridge) throw new Error('当前安装包不支持聊天语音。');
  return bridge;
}

export async function prepareVoiceRecording() {
  assertVoiceCallResourceAvailable('microphone');
  const bridge = requireAudio();
  if (Platform.OS !== 'android') return bridge.prepareRecording();
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(permission)) return true;
  const result = await PermissionsAndroid.request(permission);
  if (result !== PermissionsAndroid.RESULTS.GRANTED)
    throw new Error('未获得麦克风权限，请在系统设置中开启。');
  return false;
}
export function startVoiceRecording(id: string) {
  assertVoiceCallResourceAvailable('microphone');
  return requireAudio().startRecording(id);
}
export const finishVoiceRecording = (id: string) =>
  requireAudio().finishRecording(id);
export const cancelVoiceRecording = (id: string) =>
  nativeAudio()?.cancelRecording(id);
export const releaseVoiceRecording = (id: string) =>
  nativeAudio()?.releaseRecording(id);
let currentVoicePlaybackId: string | undefined;
export function stopVoicePlayback(id: string) {
  if (currentVoicePlaybackId === id) currentVoicePlaybackId = undefined;
  nativeAudio()?.stopPlayback(id);
}
export function stopCurrentVoicePlayback() {
  if (currentVoicePlaybackId) stopVoicePlayback(currentVoicePlaybackId);
}

async function trackPlayback(id: string, start: () => Promise<Playback>) {
  currentVoicePlaybackId = id;
  try {
    return await start();
  } finally {
    if (currentVoicePlaybackId === id) currentVoicePlaybackId = undefined;
  }
}

function requirePlaybackControls() {
  const bridge = requireAudio();
  if (
    typeof bridge.getPlaybackState !== 'function' ||
    typeof bridge.setPlaybackPaused !== 'function' ||
    typeof bridge.playRecording !== 'function' ||
    typeof bridge.seekPlayback !== 'function' ||
    typeof bridge.setPlaybackRate !== 'function'
  )
    throw new Error('当前安装包需要更新才能使用新版语音播放。');
  return bridge;
}

export async function readVoicePlayback(
  id: string,
): Promise<VoicePlaybackState> {
  const result = await requirePlaybackControls().getPlaybackState(id);
  if (
    !result ||
    !['loading', 'playing', 'paused', 'stopped'].includes(result.phase) ||
    !Number.isFinite(result.positionMs) ||
    !Number.isFinite(result.durationMs) ||
    result.positionMs < 0 ||
    result.durationMs < 0 ||
    !Array.isArray(result.waveform) ||
    (result.waveform.length !== 0 && result.waveform.length !== 32) ||
    result.waveform.some(
      value => !Number.isFinite(value) || value < 0 || value > 1,
    )
  )
    throw new Error('语音播放状态无效，请重试。');
  return result;
}

export const setVoicePlaybackPaused = (id: string, paused: boolean) =>
  requirePlaybackControls().setPlaybackPaused(id, paused);

export const seekVoicePlayback = (id: string, positionMs: number) =>
  requirePlaybackControls().seekPlayback(id, positionMs);

export const setVoicePlaybackRate = (id: string, rate: VoicePlaybackRate) =>
  requirePlaybackControls().setPlaybackRate(id, rate);

export async function playVoiceRecording(id: string, recordingId: string) {
  assertVoiceCallResourceAvailable('playback');
  const result = await trackPlayback(id, () =>
    requirePlaybackControls().playRecording(id, recordingId),
  );
  if (result.outcome === 'failed') throw new Error('无法试听录音，请重试。');
}

export async function playVoiceAttachment(
  id: string,
  attachment: ChatAttachmentDTO,
  token: string,
) {
  assertVoiceCallResourceAvailable('playback');
  const path = `/api/chat-attachments/${attachment.id}/content`;
  if (
    !/^[0-9a-f-]{36}$/i.test(attachment.id) ||
    attachment.kind !== 'audio' ||
    attachment.mimeType !== 'audio/mp4' ||
    attachment.downloadPath !== path
  )
    throw new Error('聊天语音引用无效。');

  const result = await trackPlayback(id, () =>
    requirePlaybackControls().playAttachment(id, attachment.id, token),
  );
  await handleAuthenticatedResponse({
    status: result.status,
    method: 'GET',
    path,
    token,
  });
  if (result.outcome === 'failed') throw new Error('无法播放语音，请重试。');
}

export function voiceDurationLabel(durationMs: number) {
  const totalSeconds = Math.max(1, Math.ceil(durationMs / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(
    2,
    '0',
  )}`;
}
