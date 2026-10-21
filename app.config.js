// Dynamic Expo config: wraps app.json so that everything private stays out of
// git — the Google Maps API key (a secret) and the application identity (the
// Android package and the iOS bundle id, which carry the developer's handle and
// therefore their identity).
//
// Local runs pick up .env automatically via the Expo CLI. Copy .env.example to
// .env and fill it in; see the README.
const base = require('./app.json');

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
if (!googleMapsApiKey) {
  console.warn(
    '[app.config] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set: Android maps will have no API key.'
  );
}

// Per-developer identity. The fallbacks are the placeholders committed to the
// repository, so a fresh clone builds with a neutral id until .env is filled in.
const androidPackage = process.env.ANDROID_PACKAGE || base.expo.android.package;
if (!process.env.ANDROID_PACKAGE) {
  console.warn(
    '[app.config] ANDROID_PACKAGE is not set: building with the placeholder application id. ' +
      'Set it in .env to install alongside another build of this app.'
  );
}

const iosBundleId = process.env.IOS_BUNDLE_ID || base.expo.ios.bundleIdentifier;
if (!process.env.IOS_BUNDLE_ID) {
  console.warn('[app.config] IOS_BUNDLE_ID is not set: building with the placeholder bundle id.');
}

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    plugins: base.expo.plugins,
    android: {
      ...base.expo.android,
      package: androidPackage,
      config: {
        ...base.expo.android.config,
        googleMaps: {
          apiKey: googleMapsApiKey ?? ''
        }
      }
    },
    ios: {
      ...base.expo.ios,
      bundleIdentifier: iosBundleId
    }
  }
};
