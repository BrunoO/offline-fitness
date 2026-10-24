// Metro configuration for Expo.
// `inlineRequires` defers module evaluation until first use, improving cold-start
// (TTI) on low-end Android devices. See react-native-best-practices (F4).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  inlineRequires: true
};

module.exports = config;