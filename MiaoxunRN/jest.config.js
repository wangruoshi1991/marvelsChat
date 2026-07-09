module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  moduleNameMapper: {
    '\\.(glb|gltf|ktx)$': '<rootDir>/__mocks__/assetMock.js',
  },
};
