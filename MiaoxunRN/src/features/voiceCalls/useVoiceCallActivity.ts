import { useSyncExternalStore } from 'react';
import {
  isVoiceCallActive,
  subscribeToVoiceCallResources,
} from '../../services/voiceCall/voiceCallResources';

export function useVoiceCallActivity() {
  return useSyncExternalStore(subscribeToVoiceCallResources, isVoiceCallActive);
}
