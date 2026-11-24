import { NativeModules } from 'react-native';
import type { VoiceCallCapability, VoiceCallSignal } from '../api/voiceCallApi';

export function voiceCallMediaAvailable() {
  return Boolean(NativeModules.WebRTCModule);
}

export function createVoiceCallMedia({
  iceServers,
  sendSignal,
  onConnection,
}: {
  iceServers: VoiceCallCapability['iceServers'];
  sendSignal: (signal: VoiceCallSignal) => Promise<unknown>;
  onConnection: (state: 'connected' | 'disconnected' | 'failed') => void;
}) {
  const { mediaDevices, RTCPeerConnection } =
    require('react-native-webrtc') as typeof import('react-native-webrtc');
  const peer = new RTCPeerConnection({ iceServers });
  let stream: Awaited<ReturnType<typeof mediaDevices.getUserMedia>> | undefined;
  let closed = false;
  let remoteAudio = false;
  let localDescriptionSent = false;
  let outgoingQueue = Promise.resolve<unknown>(undefined);
  const localIce: VoiceCallSignal[] = [];
  const remoteIce: Extract<VoiceCallSignal, { kind: 'ice' }>['payload'][] = [];

  const update = () => {
    if (closed) return;
    if (peer.connectionState === 'connected' && remoteAudio)
      onConnection('connected');
    else if (peer.connectionState === 'failed') onConnection('failed');
    else if (peer.connectionState === 'disconnected')
      onConnection('disconnected');
  };
  const queueCandidate = (signal: VoiceCallSignal) => {
    outgoingQueue = outgoingQueue
      .then(() => {
        if (!closed) return sendSignal(signal);
      })
      .catch(() => {
        // A late ICE candidate is optional once the active pair is connected.
        if (!closed && peer.connectionState !== 'connected')
          onConnection('failed');
      });
  };
  peer.onconnectionstatechange = update;
  peer.addEventListener('track', event => {
    if (event.track?.kind === 'audio') remoteAudio = true;
    update();
  });
  peer.addEventListener('icecandidate', event => {
    const candidate = event.candidate;
    if (closed || !candidate?.candidate) return;
    const signal: VoiceCallSignal = {
      kind: 'ice',
      payload: {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid ?? null,
        sdpMLineIndex: candidate.sdpMLineIndex ?? null,
      },
    };
    if (localDescriptionSent) queueCandidate(signal);
    else localIce.push(signal);
  });

  const describe = async (kind: 'offer' | 'answer') => {
    const description =
      kind === 'offer' ? await peer.createOffer({}) : await peer.createAnswer();
    if (closed) return;
    await peer.setLocalDescription(description);
    if (closed) return;
    const sdp = peer.localDescription?.sdp;
    if (!sdp) throw new Error('Voice call description unavailable');
    await sendSignal({ kind, payload: { type: kind, sdp } });
    if (closed) return;
    localDescriptionSent = true;
    localIce.splice(0).forEach(queueCandidate);
  };

  return {
    async start(initiator: boolean) {
      // The stream belongs to this call even if a native permission request
      // finishes after cancel or after an account switch.
      const captured = await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      if (closed) {
        captured.getTracks().forEach(track => track.stop());
        captured.release();
        return;
      }
      stream = captured;
      const audio = stream.getAudioTracks()[0];
      if (!audio) throw new Error('Microphone unavailable');
      peer.addTrack(audio, stream);
      if (initiator) await describe('offer');
    },
    async receive(signal: VoiceCallSignal) {
      if (closed) return;
      if (signal.kind === 'ice') {
        if (peer.remoteDescription) await peer.addIceCandidate(signal.payload);
        else remoteIce.push(signal.payload);
        return;
      }
      await peer.setRemoteDescription({
        type: signal.kind,
        sdp: signal.payload.sdp,
      });
      for (const candidate of remoteIce.splice(0)) {
        if (closed) return;
        await peer.addIceCandidate(candidate);
      }
      if (signal.kind === 'offer' && !closed) await describe('answer');
    },
    mute(muted: boolean) {
      stream?.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
    },
    close() {
      if (closed) return;
      closed = true;
      localIce.length = 0;
      remoteIce.length = 0;
      peer.onconnectionstatechange = null;
      stream?.getTracks().forEach(track => track.stop());
      peer.close();
      stream?.release();
    },
  };
}
