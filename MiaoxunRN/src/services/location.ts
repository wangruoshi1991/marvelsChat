import { NativeModules } from 'react-native';

export type DeviceLocation = {
  latitude: number;
  longitude: number;
  horizontalAccuracy: number;
};

const nativeLocation = NativeModules.MiaoxunLocationModule as
  | {
      currentLocation?: () => Promise<DeviceLocation>;
    }
  | undefined;

const locationErrorText: Record<string, string> = {
  activity_unavailable: '当前页面暂时无法请求定位权限，请稍后重试。',
  location_busy: '定位请求正在进行，请稍候。',
  location_denied: '未获得定位权限，请在系统设置中允许妙讯访问位置。',
  location_disabled: '系统定位服务未开启，请先打开系统定位。',
  location_timeout:
    '定位超时，请确认系统定位已开启，并在室外或网络较好的环境重试。',
  location_unavailable: '当前设备暂时无法获取有效定位。',
  permission_unavailable: '当前安装包无法请求定位权限，请重新构建 App。',
};

function normalizeLocationError(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : '';
  return new Error(
    locationErrorText[code] || message || '定位失败，请稍后重试。',
  );
}

export async function getCurrentLocation() {
  if (!nativeLocation?.currentLocation) {
    throw new Error('当前安装包未接入定位模块，请重新构建 App。');
  }
  try {
    return await nativeLocation.currentLocation();
  } catch (error) {
    throw normalizeLocationError(error);
  }
}
