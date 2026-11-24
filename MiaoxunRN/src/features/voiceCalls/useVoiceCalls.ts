import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { VoiceCallCapability } from '../../services/api/voiceCallApi';
import { voiceCallMediaAvailable } from '../../services/voiceCall/voiceCallMedia';
import { textFor } from '../../shared/i18n';
import type { Language } from '../session/sessionTypes';
import {
  createVoiceCallController,
  type VoiceCallDisplay,
} from './voiceCallController';

export function useVoiceCalls({
  token,
  userId,
  capability,
  language,
}: {
  token?: string | null;
  userId?: string;
  capability?: VoiceCallCapability;
  language: Language;
}) {
  const settings =
    voiceCallMediaAvailable() &&
    capability?.enabled === true &&
    Array.isArray(capability.iceServers)
      ? JSON.stringify(capability.iceServers)
      : null;
  const scope =
    token && userId && settings !== null
      ? JSON.stringify([token, userId, settings])
      : '';
  const languageRef = useRef(language);
  languageRef.current = language;
  const [current, setCurrent] = useState<{
    scope: string;
    display: VoiceCallDisplay | null;
  }>();
  const owner = useRef<
    | {
        scope: string;
        controller: ReturnType<typeof createVoiceCallController>;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    if (!scope || !token || !userId || settings === null) return;
    const controller = createVoiceCallController({
      token,
      userId,
      iceServers: JSON.parse(settings),
      text: (zh, en) => textFor(languageRef.current, zh, en),
      onDisplay: display => setCurrent({ scope, display }),
    });
    owner.current = { scope, controller };
    setCurrent({ scope, display: null });
    controller.setForeground(AppState.currentState === 'active');
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'inactive') controller.setForeground(state === 'active');
    });
    return () => {
      owner.current = undefined;
      listener.remove();
      controller.dispose();
    };
  }, [scope, settings, token, userId]);
  return {
    display: current?.scope === scope ? current.display : null,
    controller:
      owner.current?.scope === scope ? owner.current.controller : undefined,
  };
}
