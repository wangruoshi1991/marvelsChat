const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);

const config = {
  watchFolders: [path.resolve(__dirname, '../shared')],
  resolver: {
    // Shared contract sources use the same transform runtime as the mobile app.
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    assetExts: [...defaultConfig.resolver.assetExts, 'glb', 'gltf', 'ktx'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
