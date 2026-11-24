import { NativeModules } from 'react-native';

export type HapticEvent = 'activation' | 'hover' | 'confirmation';

type MiaoxunHapticsNativeModule = {
  trigger: (event: HapticEvent) => void;
};

export function triggerHaptic(event: HapticEvent) {
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
