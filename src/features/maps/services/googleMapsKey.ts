// Whether a Google Maps API key was inlined into the bundle at build time.
//
// The key comes from EXPO_PUBLIC_GOOGLE_MAPS_API_KEY, which app.config.js
// writes into android.config.googleMaps.apiKey. When the key is absent the app
// builds and runs fine — maps simply cannot fetch tiles. This flag lets every
// map renderer degrade gracefully to a placeholder instead of showing a blank
// MapView, which is the "real offline mode" for users who leave the key empty.
export const HAS_GOOGLE_MAPS_KEY = Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);
