import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { isVoiceCallActive } from './voiceCallResources';

export type CallAudioDevice = {
  id: string;
  kind: 'earpiece' | 'speaker' | 'bluetooth' | 'wired' | 'other';
  name?: string;
};

export type CallAudioSnapshot = {
  currentId: string | null;
  devices: CallAudioDevice[];
};

type NativeAudioRoute = ConstructorParameters<typeof NativeEventEmitter>[0] & {
  getRoutes(): Promise<CallAudioSnapshot>;
  setRoute(id: string): Promise<CallAudioSnapshot>;
  clearRoute(): Promise<void>;
};

const nativeRoute = () =>
  NativeModules.MiaoxunCallAudioRoute as NativeAudioRoute | undefined;

export class CallAudioRouteError extends Error {
  constructor(readonly reason: 'unavailable' | 'permission') {
    super(reason);
  }
}

export function observeCallAudioRoute(
  listener: (data: CallAudioSnapshot) => void,
): { remove(): void } | undefined {
  const bridge = nativeRoute();
  if (!bridge) return undefined;
  return new NativeEventEmitter(bridge).addListener(
    'MiaoxunCallAudioRouteChanged',
    listener,
  );
}

export async function readCallAudioRoute() {
  const bridge = nativeRoute();
  if (!bridge) throw new CallAudioRouteError('unavailable');
  return bridge.getRoutes();
}

export async function selectCallAudioRoute(
  device: CallAudioDevice,
  isCurrent: () => boolean,
) {
  const bridge = nativeRoute();
  if (!bridge) throw new CallAudioRouteError('unavailable');
  if (
    device.kind === 'bluetooth' &&
    Platform.OS === 'android' &&
    Platform.Version >= 31
  ) {
    const permission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
    if (
      (await PermissionsAndroid.request(permission)) !==
      PermissionsAndroid.RESULTS.GRANTED
    )
      throw new CallAudioRouteError('permission');
  }
  if (!isCurrent() || !isVoiceCallActive()) return undefined;
  return bridge.setRoute(device.id);
}

export function clearCallAudioRoute() {
  const bridge = nativeRoute();
  if (bridge) bridge.clearRoute().catch(() => undefined);
}
