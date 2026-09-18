import { NativeModules } from 'react-native';

export type AIAssistHapticEvent = 'activation' | 'hover' | 'confirmation';

type MiaoxunHapticsNativeModule = {
  trigger: (event: AIAssistHapticEvent) => void;
};

export function triggerAIAssistHaptic(event: AIAssistHapticEvent) {
  const nativeHaptics = NativeModules.MiaoxunHapticsModule as
    | MiaoxunHapticsNativeModule
    | undefined;
  if (!nativeHaptics || typeof nativeHaptics.trigger !== 'function') {
    throw new Error(
      'MiaoxunHapticsModule is not registered for this mobile build.',
    );
  }
  nativeHaptics.trigger(event);
}
