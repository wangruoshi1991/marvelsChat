import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  prepareSpeechRecognition,
  startSpeechRecognition,
  SpeechPermissionPreparation,
  SpeechRecognitionSession,
} from '../../services/speechToText';

type SpeechMode = 'tap' | 'hold';
type Owner = { threadId: string; token?: string | null };
type ActiveSpeech = Owner & {
  mode: SpeechMode;
  prefix: string;
  permission: SpeechPermissionPreparation | null;
  session: SpeechRecognitionSession | null;
};

/** Own both permission and microphone lifetimes; only this exact chat session may update its draft. */
export function useChatSpeech({
  threadId,
  token,
  language,
  onText,
  onError,
}: Owner & {
  language: 'zh' | 'en';
  onText: (text: string, prefix: string, mode: SpeechMode) => void;
  onError: (error: unknown) => void;
}) {
  const [isRecognizing, setIsRecognizing] = useState(false);
  const active = useRef<ActiveSpeech | null>(null);
  const mounted = useRef(true);
  const owner = useRef({ threadId, token });
  owner.current = { threadId, token };
  const callbacks = useRef({ onText, onError });
  callbacks.current = { onText, onError };
  const background = useRef(AppState.currentState === 'background');
  const isCurrent = useCallback(
    (session: ActiveSpeech) =>
      mounted.current &&
      !background.current &&
      active.current === session &&
      owner.current.threadId === session.threadId &&
      owner.current.token === session.token,
    [],
  );
  const cancel = useCallback(() => {
    const previous = active.current;
    active.current = null;
    previous?.permission?.cancel();
    previous?.session?.cancel();
    if (mounted.current) setIsRecognizing(false);
  }, []);
  const start = useCallback(
    (mode: SpeechMode, prefix: string) => {
      if (active.current || !mounted.current || background.current) return;
      const current: ActiveSpeech = {
        ...owner.current,
        mode,
        prefix: prefix.trimEnd(),
        permission: null,
        session: null,
      };
      active.current = current;
      setIsRecognizing(true);
      const settle = () => {
        if (active.current !== current) return;
        active.current = null;
        if (mounted.current) setIsRecognizing(false);
      };
      try {
        current.permission = prepareSpeechRecognition();
        current.permission.result
          .then(() => {
            if (!isCurrent(current)) return;
            current.permission = null;
            const recognition = startSpeechRecognition(language, update => {
              if (!isCurrent(current) || current.mode !== 'hold') return;
              const text = update.text.trim();
              if (text)
                callbacks.current.onText(text, current.prefix, current.mode);
            });
            current.session = recognition;
            return recognition.result;
          })
          .then(text => {
            if (isCurrent(current) && typeof text === 'string' && text.trim()) {
              callbacks.current.onText(
                text.trim(),
                current.prefix,
                current.mode,
              );
            }
          })
          .catch(error => {
            if (isCurrent(current)) callbacks.current.onError(error);
          })
          .finally(settle);
      } catch (error) {
        if (isCurrent(current)) callbacks.current.onError(error);
        settle();
      }
    },
    [isCurrent, language],
  );
  const finish = useCallback(() => {
    const current = active.current;
    if (!current || current.mode !== 'hold') return;
    if (current.session) current.session.finish();
    else cancel(); // A released permission gesture must never open the microphone later.
  }, [cancel]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel();
    };
  }, [cancel]);
  useEffect(() => {
    cancel();
  }, [cancel, threadId, token]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      background.current = state === 'background';
      // System permission prompts may make the App inactive; only background
      // is a navigation-away boundary for this permission/microphone session.
      if (background.current) cancel();
    });
    return () => subscription.remove();
  }, [cancel]);
  return { isRecognizing, start, finish, cancel };
}
