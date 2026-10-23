// Dynamic Expo config: wraps app.json so that everything private stays out of
// git — the Google Maps API key (a secret) and the application identity (the
// Android package and the iOS bundle id, which carry the developer's handle and
// therefore their identity).
//
// Exported as a function so Expo hands us the app.json values as `config`:
// consuming the static config structurally (instead of a manual
// `require('./app.json')`) is what expo-doctor's config check looks for, and
// what keeps `increment-version.cjs`'s versionCode bumps from silently
// dropping out of builds if this file is ever edited carelessly.
//
// Local runs pick up .env automatically via the Expo CLI. Copy .env.example to
// .env and fill it in; see the README.
const fs = require('fs');
const path = require('path');

function buildConfig({ config }) {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!googleMapsApiKey) {
    console.warn(
      '[app.config] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set: Android maps will have no API key.'
    );
  }

  // Per-developer identity. The fallbacks are the placeholders committed to the
  // repository, so a fresh clone builds with a neutral id until .env is filled in.
  // Note: `config` is app.json's `expo` object already unwrapped by Expo.
  const androidPackage = process.env.ANDROID_PACKAGE || config.android.package;
  if (!process.env.ANDROID_PACKAGE) {
    console.warn(
      '[app.config] ANDROID_PACKAGE is not set: building with the placeholder application id. ' +
        'Set it in .env to install alongside another build of this app.'
    );
  }

  const iosBundleId = process.env.IOS_BUNDLE_ID || config.ios.bundleIdentifier;
  if (!process.env.IOS_BUNDLE_ID) {
    console.warn('[app.config] IOS_BUNDLE_ID is not set: building with the placeholder bundle id.');
  }

  // Version code lives in a gitignored file so builds never dirty app.json.
  // Fall back to app.json's value (committed baseline) on a fresh clone.
  let versionCode = config.android && config.android.versionCode;
  const versionFilePath = path.resolve(process.cwd(), '.version-code');
  if (fs.existsSync(versionFilePath)) {
    const parsed = parseInt(fs.readFileSync(versionFilePath, 'utf8').trim(), 10);
    if (Number.isFinite(parsed)) {
      versionCode = parsed;
    }
  }

  return {
    ...config,
    android: {
      ...config.android,
      versionCode,
      package: androidPackage,
      config: {
        ...config.android.config,
        googleMaps: {
          apiKey: googleMapsApiKey ?? ''
        }
      }
    },
    ios: {
      ...config.ios,
      bundleIdentifier: iosBundleId
    }
  };
}

module.exports = buildConfig;
