const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const root = path.resolve(__dirname, '..');

/**
 * Metro configuration for the example app.
 * Resolves the parent library source via watchFolders and extraNodeModules,
 * allowing live editing of the library during development.
 */
const config = {
  watchFolders: [root],
  resolver: {
    extraNodeModules: {
      'react-native-open-face': root,
    },
    // Prevent duplicate module resolution from the parent
    blockList: [
      new RegExp(`${root}/node_modules/react-native/.*`),
      new RegExp(`${root}/node_modules/react/.*`),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
