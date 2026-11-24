export type VoiceCallDisplay = {
  peerName: string;
  phase:
    | 'dialing'
    | 'outgoing'
    | 'incoming'
    | 'connecting'
    | 'connected'
    | 'ended'
    | 'failed';
  muted: boolean;
  connectedAt?: number;
  message?: string;
};

/** Only a call that actually connected can leave its full-screen controls. */
export function canMinimizeVoiceCall(
  display: VoiceCallDisplay | null,
): boolean {
  return Boolean(
    display &&
      (display.phase === 'connected' || display.phase === 'connecting') &&
      typeof display.connectedAt === 'number' &&
      Number.isFinite(display.connectedAt) &&
      display.connectedAt > 0,
  );
}
