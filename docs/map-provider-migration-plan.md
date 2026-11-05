# Plan: Migrate Maps from Google Maps (react-native-maps) to a Runtime-Token Provider

> **Status:** Draft / future reference. Not a short-term priority. The app already
> ships a "real offline mode" (no key → placeholder) via
> `src/features/maps/services/googleMapsKey.ts`, so this plan is only needed if
> we want **end users to enter their own map token in app settings without
> rebuilding**.
>
> **Trigger:** A hard requirement that a distributed APK works with maps using a
> user-supplied key/token, with no build-time secret.

## 1. Why the current stack cannot do this

`react-native-maps` on Android delegates to `com.google.android.gms:play-services-maps`,
which reads `com.google.android.geo.API_KEY` from `AndroidManifest.xml` at view-creation
time. There is no runtime JS/native setter. The key is therefore a **build-time secret**
inlined by `app.config.js` from `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`. The same is true on
iOS (the Google provider reads `GMSApiKey` from `Info.plist`).

Consequence: a user typing a key into Settings has no effect on the native map tiles.
The only keyless distribution model that works today is "no key → placeholder", which
`HAS_GOOGLE_MAPS_KEY` already implements.

## 2. Goal and non-goals

**Goal:** Allow a user to paste a map access token into Settings and have every map
surface (home minimap, full-screen map, activity flyover) render tiles using that token,
with no rebuild and no build-time secret.

**Non-goals:**
- Keeping Google Maps specifically. The provider may change (MapLibre/Mapbox/MapTiler).
- Offline tile caching (separate, larger effort; can layer on later).
- iOS parity beyond what the current stub already provides (iOS map screen is a
  placeholder today).

## 3. Candidate providers

| Provider | RN lib | Runtime token? | Notes |
|---|---|---|---|
| **MapLibre Native** | `@maplibre/maplibre-react-native` | Yes (via style URL / resource) | Open source, no key required for OSM raster tiles; vector tiles need a provider (MapTiler). Best "no account" fit. |
| **Mapbox GL** | `@rnmapbox/maps` | Yes (`MapboxGL.setAccessToken`) | Mature, but requires a Mapbox account/token; free tier capped. |
| **MapTiler** | (via MapLibre style URL) | Yes (token in style URL) | Good vector tiles; token can be a URL param set at runtime. |
| **Google Maps JS API in WebView** | none (WebView) | Yes (key in URL) | Cheapest to prototype, worst UX/perf; Flyover camera animation must be reimplemented in JS. Not recommended. |

**Recommendation: MapLibre Native** with a MapTiler (or self-hosted) style URL. It is the
only option that (a) supports a runtime token, (b) keeps native performance, and (c) can
fall back to keyless OSM raster tiles for a truly account-free mode. Mapbox is the
fallback if vector-tile quality/coverage matters more than "no account".

## 4. What the maps feature actually uses (API surface to port)

All map rendering lives in `src/features/maps/` (4 files consume `react-native-maps`):

| File | react-native-maps API used |
|---|---|
| `components/MiniMapComponent.android.tsx` | `MapView`, `Marker`, `Polyline`, `PROVIDER_GOOGLE`; refs: `fitToCoordinates`; props: `style`, `provider`, `ref`, `showsMyLocationButton`, `zoomControlEnabled`, `showsCompass`, `showsUserLocation`, `showsScale`, `loadingEnabled`, `loadingIndicatorColor`, `onMapReady`, `onMapLoaded`, `onLayout`, `initialRegion`, `userInterfaceStyle`, `key` |
| `components/FlyoverModal.tsx` | `MapView`, `MapType`, `Marker`, `Polyline`, `PROVIDER_GOOGLE`; refs: `fitToCoordinates`, `animateCamera`; props: `style`, `provider`, `mapType`, `initialRegion`, `onMapReady`, `showsCompass`, `showsScale`, `pitchEnabled`, `rotateEnabled`; `Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined` |
| `screens/MapsScreen.android.tsx` | `MapView`, `Heatmap`, `MapType`, `Marker`, `Polyline`, `PROVIDER_GOOGLE`, `Region`; refs: `fitToElements`, `fitToCoordinates`; props: `style`, `provider`, `ref`, `showsMyLocationButton`, `zoomControlEnabled`, `showsCompass`, `showsUserLocation`, `showsScale`, `loadingEnabled`, `loadingIndicatorColor`, `onMapReady`, `mapType`, `onRegionChangeComplete`, `initialRegion`, `userInterfaceStyle`, `mapPadding` |
| `components/FlyoverHeader.tsx` | `MapType` (type only) |

Overlays: markers (start pin, direction arrows, current-position marker), polylines
(primary track, overlay track, traveled route), heatmap (MapsScreen), plus
`fitToCoordinates` / `animateCamera` / `fitToElements` for framing.

Tests depend on the `react-native-maps` mock in `jest.setup.js` (`mock-map-view`,
`mock-marker`, `mock-polyline`, `mock-heatmap`, `PROVIDER_GOOGLE`). Any migration
must update that mock.

## 5. Migration steps

### Phase 0 — Preparation (no behavior change)
1. Add the new provider dependency (`@maplibre/maplibre-react-native` or `@rnmapbox/maps`)
   and remove `react-native-maps` from `package.json` only after Phase 4.
2. Create a thin wrapper module `src/features/maps/services/mapProvider.ts` exposing
   `setMapAccessToken(token: string | null)` and `getMapStyleUrl()` so screens never
   import the provider SDK directly. This is the seam the Settings screen will call.
3. Persist the token in `AsyncStorage` under a new key (e.g. `MAPS_ACCESS_TOKEN`),
   added to `STORAGE_KEYS` in `src/constants/index.ts`. Read it at app startup into
   the wrapper.

### Phase 1 — MiniMapComponent.android.tsx
- Replace `MapView`/`Marker`/`Polyline` with the provider's equivalents.
- Replace `fitToCoordinates` with the provider's camera API (`fitBounds` /
  `setCamera`).
- Keep the offline fallback (`MapsUnavailablePlaceholder`) but key it on
  `getMapStyleUrl() !== null` instead of `HAS_GOOGLE_MAPS_KEY`. (Keep
  `googleMapsKey.ts` as a deprecated alias or remove once unused.)
- Remove `PROVIDER_GOOGLE` usage.

### Phase 2 — FlyoverModal.tsx
- Replace `MapView`/`Marker`/`Polyline`/`MapType`.
- Replace `animateCamera` / `fitToCoordinates` / `fitMapToOverview` with the
  provider's camera animation API. The follow/north-up/overview camera modes and
  the throttle logic in `animateCameraByMode` are provider-agnostic and can stay.
- `FlyoverHeader`'s map-type cycle (`standard/satellite/hybrid/terrain`) maps to
  the provider's style variants; define a small style-cycle list in the wrapper.

### Phase 3 — MapsScreen.android.tsx
- Replace `MapView`/`Marker`/`Polyline`/`Heatmap`/`Region`.
- Replace `fitToElements` (Google-only convenience) with `fitToCoordinates` over
  the visible markers.
- Replace `onRegionChangeComplete` with the provider's region-change callback.
- `mapPadding` → provider's padding API (or keep as no-op if unsupported).

### Phase 4 — Tests and mocks
- Rewrite the `react-native-maps` mock in `jest.setup.js` to mock the new
  provider's components, OR mock `src/features/maps/services/mapProvider.ts` at a
  higher level. The latter is strongly preferred: screens depend on the wrapper,
  not the SDK, so tests mock the wrapper and never touch native map components.
- Update `MiniMapComponent.android.spec.tsx`, `FlyoverModal.spec.tsx`,
  `MapsScreen.android.spec.tsx` expectations accordingly.
- Keep `MapsUnavailablePlaceholder.spec.tsx` (still valid).

### Phase 5 — Settings UI and token entry
- Add a "Map provider" section to the Settings screen (drawer → Settings): a
  text input for the access token, stored via the wrapper, plus a "Clear" button.
- On save, call `setMapAccessToken(token)`; map surfaces re-render with the new
  style URL. No restart required if screens re-read the wrapper on render.
- Show a status line: "Maps enabled" / "Maps unavailable (no token)".

### Phase 6 — Cleanup
- Remove `react-native-maps` from `package.json` and `node_modules`.
- Remove `googleMapsKey.ts` (or keep as a deprecated no-op shim for one release).
- Update `app.config.js` to stop reading `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` into
  the manifest (or keep it for users who still want Google via a separate build
  flavor — decide based on whether we keep a Google fallback).
- Update `README.md` configuration table and the "Real offline mode" section.
- Update `docs/ontology.md` if any spatial invariant changes (unlikely — the
  coordinate shapes are provider-agnostic).
- Delete `src/features/maps/components/MiniMapComponent.tsx` iOS stub's map
  reference if iOS gets a real implementation (currently a "No maps (default)"
  stub; out of scope unless iOS maps are added).

## 6. Risks and unknowns

- **iOS:** The iOS map screen is currently a stub (`MapsScreen.tsx` renders
  "Maps Screen"). A migration is a good moment to either implement iOS maps or
  keep the stub. Decide before Phase 1 to avoid half-finished parity.
- **Heatmap:** `MapsScreen` uses `Heatmap` from react-native-maps. MapLibre/Mapbox
  have different heatmap APIs (layer-based). Verify the library supports heatmaps
  or drop the feature.
- **Map type cycle** (standard/satellite/hybrid/terrain): provider-specific style
  URLs. Need a style list per provider.
- **`fitToElements`** (Google-only convenience in MapsScreen) must be reimplemented
  as `fitToCoordinates` over visible markers.
- **Camera animation fidelity:** Flyover's follow/north-up/overview modes rely on
  `animateCamera` with heading/pitch/zoom. MapLibre supports `setCamera` with
  `zoom`/`pitch`/`bearing`/`center`, so it maps 1:1, but animation duration and
  easing differ. Expect visual tuning.
- **Tile availability / terms:** OSM raster tiles are free but have usage policy
  limits; vector tiles (MapTiler) need a token and have quotas. Document this.
- **Bundle size:** MapLibre native adds ~10–15 MB to the APK. Acceptable but
  note in README.
- **Tests:** The `react-native-maps` mock is central to `jest.setup.js`. Mocking
  at the wrapper level (Phase 4) is the only way to keep tests stable across
  provider swaps.

## 7. Effort estimate

Roughly 2–4 weeks for one developer, dominated by Phase 2 (Flyover camera) and
Phase 3 (MapsScreen heatmap + fit logic). Phases 0 and 5 are small. Phase 6 is
cleanup.

## 8. Decision points (to resolve before starting)

1. Provider choice: MapLibre (no account, OSM fallback) vs Mapbox (better tiles,
   requires account). Recommend MapLibre.
2. Keep Google as a build-time flavor or drop it entirely? Dropping simplifies
   `app.config.js` and the offline placeholder; keeping it doubles the map code.
   Recommend dropping Google once MapLibre ships.
3. iOS maps: implement now or keep stub? Recommend keeping the stub for this
   migration to limit scope; revisit separately.
4. Offline tile caching: out of scope for this plan; can be added later on top of
   MapLibre's offline manager.<|end|><|start|>Assistant to=write<|channel|>analysis <|constrain|>xml<|message|><rfl:parameter name="content">
# Plan: Migrate Maps from Google Maps (react-native-maps) to a Runtime-Token Provider

> **Status:** Draft / future reference. Not a short-term priority. The app already
> ships a "real offline mode" (no key → placeholder) via
> `src/features/maps/services/googleMapsKey.ts`, so this plan is only needed if
> we want **end users to enter their own map token in app settings without
> rebuilding**.
>
> **Trigger:** A hard requirement that a distributed APK works with maps using a
> user-supplied key/token, with no build-time secret.

## 1. Why the current stack cannot do this

`react-native-maps` on Android delegates to `com.google.android.gms:play-services-maps`,
which reads `com.google.android.geo.API_KEY` from `AndroidManifest.xml` at view-creation
time. There is no runtime JS/native setter. The key is therefore a **build-time secret**
inlined by `app.config.js` from `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`. The same is true on
iOS (the Google provider reads `GMSApiKey` from `Info.plist`).

Consequence: a user typing a key into Settings has no effect on the native map tiles.
The only keyless distribution model that works today is "no key → placeholder", which
`HAS_GOOGLE_MAPS_KEY` already implements.

## 2. Goal and non-goals

**Goal:** Allow a user to paste a map access token into Settings and have every map
surface (home minimap, full-screen map, activity flyover) render tiles using that token,
with no rebuild and no build-time secret.

**Non-goals:**
- Keeping Google Maps specifically. The provider may change (MapLibre/Mapbox/MapTiler).
- Offline tile caching (separate, larger effort; can layer on later).
- iOS parity beyond what the current stub already provides (iOS map screen is a
  placeholder today).

## 3. Candidate providers

| Provider | RN lib | Runtime token? | Notes |
|---|---|---|---|
| **MapLibre Native** | `@maplibre/maplibre-react-native` | Yes (via style URL / resource) | Open source, no key required for OSM raster tiles; vector tiles need a provider (MapTiler). Best "no account" fit. |
| **Mapbox GL** | `@rnmapbox/maps` | Yes (`MapboxGL.setAccessToken`) | Mature, but requires a Mapbox account/token; free tier capped. |
| **MapTiler** | (via MapLibre style URL) | Yes (token in style URL) | Good vector tiles; token can be a URL param set at runtime. |
| **Google Maps JS API in WebView** | none (WebView) | Yes (key in URL) | Cheapest to prototype, worst UX/perf; Flyover camera animation must be reimplemented in JS. Not recommended. |

**Recommendation: MapLibre Native** with a MapTiler (or self-hosted) style URL. It is the
only option that (a) supports a runtime token, (b) keeps native performance, and (c) can
fall back to keyless OSM raster tiles for a truly account-free mode. Mapbox is the
fallback if vector-tile quality/coverage matters more than "no account".

## 4. What the maps feature actually uses (API surface to port)

All map rendering lives in `src/features/maps/` (4 files consume `react-native-maps`):

| File | react-native-maps API used |
|---|---|
| `components/MiniMapComponent.android.tsx` | `MapView`, `Marker`, `Polyline`, `PROVIDER_GOOGLE`; refs: `fitToCoordinates`; props: `style`, `provider`, `ref`, `showsMyLocationButton`, `zoomControlEnabled`, `showsCompass`, `showsUserLocation`, `showsScale`, `loadingEnabled`, `loadingIndicatorColor`, `onMapReady`, `onMapLoaded`, `onLayout`, `initialRegion`, `userInterfaceStyle`, `key` |
| `components/FlyoverModal.tsx` | `MapView`, `MapType`, `Marker`, `Polyline`, `PROVIDER_GOOGLE`; refs: `fitToCoordinates`, `animateCamera`; props: `style`, `provider`, `mapType`, `initialRegion`, `onMapReady`, `showsCompass`, `showsScale`, `pitchEnabled`, `rotateEnabled`; `Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined` |
| `screens/MapsScreen.android.tsx` | `MapView`, `Heatmap`, `MapType`, `Marker`, `Polyline`, `PROVIDER_GOOGLE`, `Region`; refs: `fitToElements`, `fitToCoordinates`; props: `style`, `provider`, `ref`, `showsMyLocationButton`, `zoomControlEnabled`, `showsCompass`, `showsUserLocation`, `showsScale`, `loadingEnabled`, `loadingIndicatorColor`, `onMapReady`, `mapType`, `onRegionChangeComplete`, `initialRegion`, `userInterfaceStyle`, `mapPadding` |
| `components/FlyoverHeader.tsx` | `MapType` (type only) |

Overlays: markers (start pin, direction arrows, current-position marker), polylines
(primary track, overlay track, traveled route), heatmap (MapsScreen), plus
`fitToCoordinates` / `animateCamera` / `fitToElements` for framing.

Tests depend on the `react-native-maps` mock in `jest.setup.js` (`mock-map-view`,
`mock-marker`, `mock-polyline`, `mock-heatmap`, `PROVIDER_GOOGLE`). Any migration
must update that mock.

## 5. Migration steps

### Phase 0 — Preparation (no behavior change)
1. Add the new provider dependency (`@maplibre/maplibre-react-native` or `@rnmapbox/maps`)
   and remove `react-native-maps` from `package.json` only after Phase 4.
2. Create a thin wrapper module `src/features/maps/services/mapProvider.ts` exposing
   `setMapAccessToken(token: string | null)` and `getMapStyleUrl()` so screens never
   import the provider SDK directly. This is the seam the Settings screen will call.
3. Persist the token in `AsyncStorage` under a new key (e.g. `MAPS_ACCESS_TOKEN`),
   added to `STORAGE_KEYS` in `src/constants/index.ts`. Read it at app startup into
   the wrapper.

### Phase 1 — MiniMapComponent.android.tsx
- Replace `MapView`/`Marker`/`Polyline` with the provider's equivalents.
- Replace `fitToCoordinates` with the provider's camera API (`fitBounds` /
  `setCamera`).
- Keep the offline fallback (`MapsUnavailablePlaceholder`) but key it on
  `getMapStyleUrl() !== null` instead of `HAS_GOOGLE_MAPS_KEY`. (Keep
  `googleMapsKey.ts` as a deprecated alias or remove once unused.)
- Remove `PROVIDER_GOOGLE` usage.

### Phase 2 — FlyoverModal.tsx
- Replace `MapView`/`Marker`/`Polyline`/`MapType`.
- Replace `animateCamera` / `fitToCoordinates` / `fitMapToOverview` with the
  provider's camera animation API. The follow/north-up/overview camera modes and
  the throttle logic in `animateCameraByMode` are provider-agnostic and can stay.
- `FlyoverHeader`'s map-type cycle (`standard/satellite/hybrid/terrain`) maps to
  the provider's style variants; define a small style-cycle list in the wrapper.

### Phase 3 — MapsScreen.android.tsx
- Replace `MapView`/`Marker`/`Polyline`/`Heatmap`/`Region`.
- Replace `fitToElements` (Google-only convenience) with `fitToCoordinates` over
  the visible markers.
- Replace `onRegionChangeComplete` with the provider's region-change callback.
- `mapPadding` → provider's padding API (or keep as no-op if unsupported).

### Phase 4 — Tests and mocks
- Rewrite the `react-native-maps` mock in `jest.setup.js` to mock the new
  provider's components, OR mock `src/features/maps/services/mapProvider.ts` at a
  higher level. The latter is strongly preferred: screens depend on the wrapper,
  not the SDK, so tests mock the wrapper and never touch native map components.
- Update `MiniMapComponent.android.spec.tsx`, `FlyoverModal.spec.tsx`,
  `MapsScreen.android.spec.tsx` expectations accordingly.
- Keep `MapsUnavailablePlaceholder.spec.tsx` (still valid).

### Phase 5 — Settings UI and token entry
- Add a "Map provider" section to the Settings screen (drawer → Settings): a
  text input for the access token, stored via the wrapper, plus a "Clear" button.
- On save, call `setMapAccessToken(token)`; map surfaces re-render with the new
  style URL. No restart required if screens re-read the wrapper on render.
- Show a status line: "Maps enabled" / "Maps unavailable (no token)".

### Phase 6 — Cleanup
- Remove `react-native-maps` from `package.json` and `node_modules`.
- Remove `googleMapsKey.ts` (or keep as a deprecated no-op shim for one release).
- Update `app.config.js` to stop reading `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` into
  the manifest (or keep it for users who still want Google via a separate build
  flavor — decide based on whether we keep a Google fallback).
- Update `README.md` configuration table and the "Real offline mode" section.
- Update `docs/ontology.md` if any spatial invariant changes (unlikely — the
  coordinate shapes are provider-agnostic).
- Delete `src/features/maps/components/MiniMapComponent.tsx` iOS stub's map
  reference if iOS gets a real implementation (currently a "No maps (default)"
  stub; out of scope unless iOS maps are added).

## 6. Risks and unknowns

- **iOS:** The iOS map screen is currently a stub (`MapsScreen.tsx` renders
  "Maps Screen"). A migration is a good moment to either implement iOS maps or
  keep the stub. Decide before Phase 1 to avoid half-finished parity.
- **Heatmap:** `MapsScreen` uses `Heatmap` from react-native-maps. MapLibre/Mapbox
  have different heatmap APIs (layer-based). Verify the library supports heatmaps
  or drop the feature.
- **Map type cycle** (standard/satellite/hybrid/terrain): provider-specific style
  URLs. Need a style list per provider.
- **`fitToElements`** (Google-only convenience in MapsScreen) must be reimplemented
  as `fitToCoordinates` over visible markers.
- **Camera animation fidelity:** Flyover's follow/north-up/overview modes rely on
  `animateCamera` with heading/pitch/zoom. MapLibre supports `setCamera` with
  `zoom`/`pitch`/`bearing`/`center`, so it maps 1:1, but animation duration and
  easing differ. Expect visual tuning.
- **Tile availability / terms:** OSM raster tiles are free but have usage policy
  limits; vector tiles (MapTiler) need a token and have quotas. Document this.
- **Bundle size:** MapLibre native adds ~10–15 MB to the APK. Acceptable but
  note in README.
- **Tests:** The `react-native-maps` mock is central to `jest.setup.js`. Mocking
  at the wrapper level (Phase 4) is the only way to keep tests stable across
  provider swaps.

## 7. Effort estimate

Roughly 2–4 weeks for one developer, dominated by Phase 2 (Flyover camera) and
Phase 3 (MapsScreen heatmap + fit logic). Phases 0 and 5 are small. Phase 6 is
cleanup.

## 8. Decision points (to resolve before starting)

1. Provider choice: MapLibre (no account, OSM fallback) vs Mapbox (better tiles,
   requires account). Recommend MapLibre.
2. Keep Google as a build-time flavor or drop it entirely? Dropping simplifies
   `app.config.js` and the offline placeholder; keeping it doubles the map code.
   Recommend dropping Google once MapLibre ships.
3. iOS maps: implement now or keep stub? Recommend keeping the stub for this
   migration to limit scope; revisit separately.
4. Offline tile caching: out of scope for this plan; can be added later on top of
   MapLibre's offline manager.