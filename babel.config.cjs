// Babel config for Expo and Jest

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          'react-compiler': {
            // Default infer mode: compile components/hooks only.
            // 'all_errors' fails the release bundle on unimplemented compiler TODOs
            // (e.g. try/finally). Skip those functions instead of aborting Metro.
            panicThreshold: 'none'
          }
        }
      ],
      '@babel/preset-typescript'
    ],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            '@': './src',
            '@/features': './src/features',
            '@/shared': './src/shared',
            '@/constants': './src/constants',
            '@/theme': './src/theme'
          }
        }
      ],
      // IMPORTANT: worklets plugin must be listed last (replaces react-native-reanimated/plugin in SDK 55+)
      'react-native-worklets/plugin'
    ]
  };
};
