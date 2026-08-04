const reactNativeConfig = require('@react-native/eslint-config/flat');

module.exports = [
  {
    ignores: ['android/**', 'ios/**'],
  },
  ...reactNativeConfig,
  {
    files: ['jest.setup.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
      },
    },
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
];
