import { NativeModules } from 'react-native';

// Keep the released app's existing records; separate variants use distinct
// services even where Simulator Keychain entitlement isolation is absent.
export function keychainService(name: string): string {
  const identifier = NativeModules.MiaoxunConfigModule?.bundleIdentifier;
  if (
    typeof identifier !== 'string' ||
    !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(identifier)
  ) {
    throw new Error('缺少有效的 App 标识，无法访问本机安全存储。');
  }
  return identifier === 'com.wangruoshi.miaoxun'
    ? name
    : `${name}.${identifier}`;
}
