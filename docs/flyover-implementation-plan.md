# 3D Flyover for Own Activities — Implementation Plan

Status: **Reviewed / ready for implementation**. Companion to commit `7e64fc1` (Android-only Google Maps 3D SDK flyover demo), the `ExpoView` R8 release fix on `GoogleMap3DContainer`, the `gpsSmoothing.ts` complexity refactor, and the temporary `HomeScreen` demo button.

This plan converts the demo (`FlyoverScreen` + `GoogleMap3DFlyover`) into a feature usable on real recorded/imported activities. It is verified against the current codebase (post-`7e64fc1`, post-`bc3f95f`).

## 1. Goals & non-goals

**Goals**
- Let a user open a photorealistic 3D flyover of any GPS-backed activity from `ActivityDetailScreen`.
- Reuse the existing stream cache (`loadRawStreamForActivity`) and `GoogleMap3DFlyover`, which already runs Douglas–Peucker simplification in JS before bridging to the native animation engine.
- Keep Android-only and API-key-gated behaviour explicit and non-crashing on iOS or keyless builds.
- Coexist cleanly with the existing 2.5D `FlyoverModal` in `MiniMapComponent.android.tsx` (which stays untouched for now).

**Non-goals (for this slice)**
- No video export / screen capture.
- No live-stat sync (HR/speed) along the flyover.
- No editing of the flyover parameters from the UI (tilt/range stay at defaults, changeable later).
- No new native work beyond `7e64fc1` + the `ExpoView` R8 constructor fix already applied in `GoogleMap3DContainer.kt`.

## 2. Data contract (verified)

Source of truth for a track: `StreamSet` (`src/features/activities/types/stravaActivityStream.model.ts`).

Relevant fields:
- `latlng?: StreamData<[number, number][]>` — `data` is an array of `[lat, lon]`.
- `altitude?: StreamData<number[]>` — `data` is an array of numbers, aligned with `latlng`.

Target type consumed by the component/native bridge: `Map3DCoordinate` (re-exported from `@/components/GoogleMap3DFlyover` and defined in `modules/google-maps-3d/src/GoogleMaps3D.types.ts`):

```ts
export interface Map3DCoordinate {
  latitude: number;
  longitude: number;
  altitude?: number;
}
```

Conversion rules (to be implemented in §3):
- If `latlng` is missing/empty → return `[]` (entry point hidden / empty-state shown).
- Altitude array may be shorter or longer than `latlng`: pad with `0` when shorter, truncate when longer. (Native uses `AltitudeMode.CLAMP_TO_GROUND` for the polyline and `RELATIVE_TO_GROUND` for the camera, so `0` is safe.)
- Drop non-finite lat/lon points defensively (mirrors `parseTrackPoints` in Kotlin).

## 3. Implementation slices

### Slice 1 — Coordinate conversion utility + tests
**New file:** `src/utils/activityTrack.ts`

> Note on imports: `@/*` maps to `./src/*` in `tsconfig.json` (not `./modules/*`). Import `Map3DCoordinate` from `@/components/GoogleMap3DFlyover` (which re-exports the type) rather than `@/modules/...`.

```ts
import type { Map3DCoordinate } from '@/components/GoogleMap3DFlyover';
import type { StreamSet } from '@/features/activities/types/stravaActivityStream.model';

export function activityToFlyoverCoordinates(stream: StreamSet | null): Map3DCoordinate[] {
  const latlng = stream?.latlng?.data;
  if (!latlng || latlng.length === 0) return [];
  const altitudes = stream?.altitude?.data ?? [];
  const result: Map3DCoordinate[] = [];
  for (let i = 0; i < latlng.length; i += 1) {
    const [lat, lon] = latlng[i];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    result.push({
      latitude: lat,
      longitude: lon,
      altitude: Number.isFinite(altitudes[i]) ? altitudes[i] : 0
    });
  }
  return result;
}
```

**Tests:** `__tests__/utils/activityTrack.spec.ts`
- Missing `latlng` → `[]`.
- Missing `altitude` → all altitudes `0`.
- Altitude shorter than `latlng` → trailing points get `0`.
- Altitude longer than `latlng` → truncated.
- Non-finite lat/lon dropped.

### Slice 2 — Navigation contract & entry point on `ActivityDetailScreen`
**Files:**
- `src/shared/types/types.ts` (`RootStackParamList['Flyover3D']`)
- `src/features/activities/screens/ActivityDetailScreen.tsx`

**Avoid passing raw coordinate arrays in `route.params`:**
Real GPS tracks can contain 10,000–50,000 points. Passing `coordinates` through `navigation.navigate` retains large arrays in React Navigation state and slows transitions. Instead, add `activityId?: string` to `RootStackParamList['Flyover3D']` (matching `ActivityDetail`) and let `FlyoverScreen` load the cached stream via `loadRawStreamForActivity(activity)` from `useActivitiesContext()`. Keep `coordinates?: Map3DCoordinate[]` optional for unit tests or direct callers.

```ts
Flyover3D:
  | {
      activityId?: string;
      coordinates?: { latitude: number; longitude: number; altitude?: number }[];
      title?: string;
    }
  | undefined;
```

**Changes in `ActivityDetailScreen.tsx`:**
This screen already loads `rawStream` via `loadRawStreamForActivity(activity)` (line ~76) and renders a module-level `HeaderEditButton` via `navigation.setOptions({ headerRight })`.

1. Check track availability directly from `rawStream` (React Compiler handles memoization — no manual `useMemo` needed unless stabilizing a hook dependency):
   ```ts
   const canOpen3DFlyover =
     Platform.OS === 'android' &&
     HAS_GOOGLE_MAPS_KEY &&
     activityToFlyoverCoordinates(rawStream).length >= 2;
   ```
   (`HAS_GOOGLE_MAPS_KEY` is exported from `@/features/maps/services/googleMapsKey`.)
2. Add a module-level header actions component (e.g., `HeaderActions` wrapping the new 3D Flyover button + existing `HeaderEditButton`) so buttons do not remount on every render. Use ternary `? ... : null` (never `&&`) in JSX.
3. Label clearly (`accessibilityLabel="Open 3D flyover"`, e.g. `cube-outline` or `earth-outline` icon) so it is distinct from the existing 2.5D `FlyoverModal` button inside `MiniMapComponent`.
4. On press:
   ```ts
   navigation?.navigate?.(STACK_ROUTES.Flyover3D, {
     activityId: activity.id,
     title: activity.name
   });
   ```

### Slice 3 — Load activity streams & harden `FlyoverScreen`
**File:** `src/screens/FlyoverScreen.tsx`

1. Support loading by `route.params?.activityId`:
   - Look up `activity` in `useActivitiesContext().globalActivities`.
   - Load `rawStream` via `loadRawStreamForActivity(activity)` inside a cleanup-guarded `useEffect` (showing a loading state until resolved), then convert with `activityToFlyoverCoordinates(rawStream)`.
   - Fall back to `route.params?.coordinates` when passed directly (tests / dev).
2. Remove (or `__DEV__`-gate) `SAMPLE_MOUNTAIN_TRACK` so production only shows real tracks.
3. Add an empty-state view when loading has finished and `track.length < 2`:
   ```tsx
   if (!isLoadingTrack && track.length < 2) {
     return (
       <View style={styles.emptyContainer}>
         <Text style={styles.emptyText}>This activity has no GPS track.</Text>
       </View>
     );
   }
   ```
   (with a working back button so the user isn't trapped).
4. Keep the existing `useFocusEffect` cleanup and `isFocused` gating (already correct).
5. Optional small polish: keep the screen awake while `isPlaying` is true via `expo-keep-awake` (`activateKeepAwakeAsync` / `deactivateKeepAwake`), matching `FlyoverModal.tsx`.

### Slice 4 — Cleanup of demo scaffolding
- Remove the temporary `"3D Flyover Demo"` button + comment from `src/features/home/screens/HomeScreen.tsx`.
- Remove the sample track fallback from `FlyoverScreen` (or keep behind `__DEV__`).
- Keep `FlyoverScreen` registered in `RootStackNavigator` (now a real destination).

### Slice 5 (post-MVP) — iOS handling
- Hide the 3D flyover button on iOS (via `Platform.OS === 'android'`). `GoogleMap3DFlyover` already renders an informational fallback on non-Android, so direct navigation cannot crash, while hiding the button avoids a dead-end UX.

## 4. Performance considerations (verified)

- `GoogleMap3DFlyover` runs Douglas–Peucker simplification (`simplifyGpsTrack`, default `smoothingToleranceMeters = 8`) in **JS before** sending `preparedCoordinates` across the native bridge — the full raw array is never bridged.
- Native side (`GoogleMap3DContainer.buildFlyoverKeyframes`) sub-samples to `MAX_KEYFRAMES = 120` and thins uniformly beyond that. Safe for marathon/ultra tracks.
- Passing `activityId` instead of `coordinates` in `route.params` avoids serializing/retaining large arrays in React Navigation state.
- For very long activities (>20k points), if profiling shows JS-thread jank during `simplifyGpsTrack`, use a coarser tolerance for large inputs (e.g., `points.length > 20000 ? 25 : 8`).
- Stream loading uses the existing local FileSystem cache (`loadRawStreamForActivity`); no network I/O is added.

## 5. Google Cloud / API prerequisites (verified on-device)
- The Maps API key is injected via `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` → `app.config.js` → `AndroidManifest.xml` meta-data `com.google.android.geo.API_KEY`.
- The key **must** have **Maps 3D SDK for Android** (and **Map Tiles API**) enabled in Google Cloud Console and included in the key's **API restrictions** if restricted. Having only 2D **Maps SDK for Android** enabled causes `Authentication failed: Failed to fetch MapConfigs` at runtime. Billing must be active.
- Release builds rely on `GoogleMap3DContainer` extending `ExpoView` (fixed after `7e64fc1`) so `expo-modules-core`'s ProGuard/R8 rules preserve its `(Context, AppContext)` constructor.

## 6. Testing plan
- Unit: `activityToFlyoverCoordinates` (§3 Slice 1).
- Unit: `FlyoverScreen` renders empty-state for `< 2` points and loads by `activityId` (mock `GoogleMap3DFlyover` and `loadRawStreamForActivity`).
- Unit: `ActivityDetailScreen` shows the 3D flyover button only on Android when `HAS_GOOGLE_MAPS_KEY` and `>= 2` valid GPS points.
- Manual on-device (Android release build):
  - Open an activity with a GPS track → 3D flyover button visible → tap → flyover loads and plays.
  - Pause / replay / speed change (1x/2x/4x).
  - Back navigation unmounts cleanly without crash (single-instance teardown).
  - Activity without GPS → button hidden.
  - iOS → button hidden (per Slice 5 decision).
- Repo gates: `npx tsc --noEmit`, `npx expo lint`, `npm run check:imports`, `npm run check:mobile-only`, `npm run check:install-scripts`, `npm test -- --watchAll=false`, and `scripts/sonar_gate.sh --scan` (0 open issues).

## 7. Files touched (summary)
| File | Change |
|---|---|
| `src/utils/activityTrack.ts` | New: `StreamSet` → `Map3DCoordinate[]` conversion |
| `__tests__/utils/activityTrack.spec.ts` | New: conversion unit tests |
| `src/shared/types/types.ts` | Add `activityId?: string` to `RootStackParamList['Flyover3D']` |
| `src/features/activities/screens/ActivityDetailScreen.tsx` | Add Android + key + track-gated 3D flyover header button |
| `src/screens/FlyoverScreen.tsx` | Load stream by `activityId`, remove sample fallback, add empty-state |
| `src/features/home/screens/HomeScreen.tsx` | Remove temporary demo button |
| `src/utils/gpsSmoothing.ts` | Reused as-is (complexity already refactored) |

## 8. Risks
- **Single-instance teardown race** (flagged in review of `7e64fc1`): rapid mount/unmount of `Map3DView` during navigation could race. Mitigate by keeping `useFocusEffect` cleanup + `isFocused` gating and testing rapid back/re-entry on-device.
- **Stream not yet loaded** when `ActivityDetailScreen` mounts: `rawStream` starts `null`, so `canOpen3DFlyover` stays `false` until the stream resolves.
- **Altitude gaps**: handled by `0` fallback + native `CLAMP_TO_GROUND` / `RELATIVE_TO_GROUND`.
- **Two flyover entry points**: `MiniMapComponent.android.tsx` still exposes the existing 2.5D `FlyoverModal`. Keep the 3D button clearly labeled/icon-distinguished, and decide later whether to merge or retire the 2.5D modal.

## 9. Suggested first slice (smallest coherent change)
1. `activityToFlyoverCoordinates` + tests.
2. Add `activityId` param + header button on `ActivityDetailScreen` (Android-only, `HAS_GOOGLE_MAPS_KEY`, `>= 2` GPS points).
3. `FlyoverScreen` stream loading by `activityId` + empty-state + remove sample fallback.
4. Remove temporary `HomeScreen` demo button.

After these four, the feature is usable end-to-end on real activities. Enhancements (live stats, camera controls UI, iOS, or unifying with `FlyoverModal`) follow.
