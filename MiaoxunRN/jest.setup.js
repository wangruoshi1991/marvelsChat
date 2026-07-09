/* eslint-env jest */

const ReactNative = require('react-native');

ReactNative.NativeModules.MiaoxunConfigModule = {
  apiBaseURL: 'http://127.0.0.1:4390',
};
ReactNative.NativeModules.QRCodeScannerModule = {
  scan: jest.fn(async () => 'miaoxun://ai/900202606160001'),
};

jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  resetGenericPassword: jest.fn(async () => true),
  setGenericPassword: jest.fn(async () => true),
}));

jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(async () => ({ didCancel: true })),
  launchImageLibrary: jest.fn(async () => ({ didCancel: true })),
}));

jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Camera: () => null,
    Map: ({ children }) =>
      React.createElement(View, { testID: 'maplibre-map' }, children),
  };
});

jest.mock('react-native-qrcode-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function QRCodeMock() {
    return React.createElement(View, { testID: 'qr-code' });
  };
});
