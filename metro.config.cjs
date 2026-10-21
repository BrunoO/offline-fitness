const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Custom resolver to handle react-native-maps for web
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-maps' && platform === 'web') {
    try {
      // Attempt to resolve the web-specific module
      return context.resolveRequest(context, '@teovilla/react-native-web-maps', platform);
    } catch (e) {
      console.error('Failed to resolve @teovilla/react-native-web-maps. Ensure it is installed.');
      // If it fails, fall back to the original resolver logic for the original moduleName
      return context.resolveRequest(context, moduleName, platform);
    }
  }
  // For all other modules, just use the default resolver
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
