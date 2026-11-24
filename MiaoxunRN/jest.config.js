module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  // Let React's async work flush even while a test controls timeout timers.
  fakeTimers: {
    doNotFake: ['setImmediate', 'clearImmediate'],
  },
  moduleNameMapper: {
    '\\.(glb|gltf|html|ktx)$': '<rootDir>/__mocks__/assetMock.js',
  },
};
