import { NativeModules } from 'react-native';

type QRCodeScannerNativeModule = {
  scan: () => Promise<string>;
};

const nativeScanner = NativeModules.QRCodeScannerModule as
  | QRCodeScannerNativeModule
  | undefined;

export async function scanQRCode() {
  if (!nativeScanner) {
    throw new Error('QRCodeScannerModule is not installed.');
  }
  const value = await nativeScanner.scan();
  if (!value.trim()) {
    throw new Error('二维码内容为空。');
  }
  return value;
}
