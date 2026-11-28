# 3D Flyover for Own Activities — Implementation Plan

Status: **Draft / pre-implementation**. Companion to commit `7e64fc1` (Android-only Google Maps 3D SDK flyover demo) and the temporary HomeScreen demo button.

This plan converts the demo (`FlyoverScreen` + `GoogleMap3DFlyover`) into a feature usable on real recorded/imported activities. It is verified against the current codebase (post-`7e64fc1`, post-keyboard-avoidance commit `bc3f95f`).

## 1. Goals & non-goals

**Goals**
- Let a user open a photorealistic 3D flyover of any GPS-backed activity from the activity detail screen.
- Reuse the existing stream cache (`loadRawStreamForActivity`) and the existing `GoogleMap3DFlyover` component, which already runs Douglas–Peucker simplification and drives the native animation engine.
- Keep Android-only behaviour explicit and non-crashing on iOS.

**Non-goals (for this slice)**
- No video export / screen capture.
- No live-stat sync (HR/speed) along the flyover.
- No editing of the flyover parameters from the UI (tilt/range stay at defaults, changeable later).
- No new native work beyond what `7e64fc1` already ships.

## 2. Data contract (verified)

Source of truth for a track: `StreamSet` (`src/features/activities/types/stravaActivityStream.model.ts`).

Relevant fields:
- `latlng?: StreamData<[number, number][]>` — `data` is an array of `[lat, lon]`.
- `altitude?: StreamData<number[]>` — `data` is an array of numbers, aligned with `latlng`.

Target type consumed by the component/native bridge: `Map3DCoordinate` (`modules/google-maps-3d/src/GoogleMaps3D.types.ts`):

```ts
export interface Map3DCoordinate {
  latitude: number;
  longitude: number;
  altitude?: number;
}
```

Conversion rules (to be implemented in §3):
- If `latlng` is missing/empty → no track (button hidden).
- Altitude array may be shorter or longer than `latlng`: pad with `0` when shorter, truncate when longer. (Native uses `AltitudeMode.CLAMP_TO_GROUND` for the polyline and `RELATIVE_TO_GROUND` for the camera, so `0` is safe.)
- Drop non-finite lat/lon points defensively (mirror `parseTrackPoints` in Kotlin).

## 3. Implementation slices

### Slice 1 — Coordinate conversion utility + tests
**New file:** `src/utils/activityTrack.ts`

```ts
import type { StreamSet } from '@/features/activities/types/stravaActivityStream.model';
import type { Map3DCoordinate } from '@/modules/google-maps-3d/src';

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
- Altitude shorter than latlng → trailing points get `0`.
- Altitude longer than latlng → truncated.
- Non-finite lat/lon dropped.

### Slice 2 — Entry point on the activity detail screen
**File:** `src/features/activities/screens/ActivityDetailScreen.tsx`

This screen already loads `rawStream` via `loadRawStreamForActivity(activity)` (line ~76) and stores it in `rawStream: StreamSet | null`.

Changes:
1. Import `activityToFlyoverCoordinates`, `STACK_ROUTES`, `Platform`, `Map3DCoordinate`.
2. Add memo:
   ```ts
   const flyoverCoordinates = useMemo(
     () => activityToFlyoverCoordinates(rawStream),
     [rawStream]
   );
   const hasFlyoverTrack = flyoverCoordinates.length >= 2;
   ```
3. Add a button (placement: in the header row next to the edit button, or as a row in the analysis view). Gate on `hasFlyoverTrack && Platform.OS === 'android'`:
   ```ts
   onPress={() => navigation.navigate(STACK_ROUTES.Flyover3D, {
     coordinates: flyoverCoordinates,
     title: activity.name
   })}
   ```
4. Provide an accessibility label and a disabled visual state when `!hasFlyoverTrack`.

Note: `STACK_ROUTES` is already imported in HomeScreen from `@/constants`; `ActivityDetailScreen` imports need checking (add if missing). `Platform` import from `react-native` needs adding.

### Slice 3 — Harden `FlyoverScreen` for real tracks
**File:** `src/screens/FlyoverScreen.tsx`

1. Remove (or `__DEV__`-gate) `SAMPLE_MOUNTAIN_TRACK` so production only shows real tracks.
2. Add empty-state:
   ```ts
   if (track.length < 2) {
     return <View ...><Text>This activity has no GPS track.</Text></View>;
   }
   ```
   before mounting `GoogleMap3DFlyover`.
3. Keep the existing `useFocusEffect` cleanup (already correct).
4. Keep `isFocused` gating (already correct).

### Slice 4 — Cleanup of demo scaffolding
- Remove the temporary "3D Flyover Demo" button + comment from `src/features/home/screens/HomeScreen.tsx`.
- Remove the sample track fallback from `FlyoverScreen` (or keep behind `__DEV__`).
- Keep `FlyoverScreen` registered in `RootStackNavigator` (now a real destination).

### Slice 5 (optional, post-MVP) — iOS handling
- Either hide the button on iOS (recommended) or show it disabled with "Android only" tooltip. The component already renders an informational fallback on non-Android, so leaving it visible is not crash-prone — just a dead-end UX. Decision: hide on iOS for this slice.

## 4. Performance considerations (verified)

- `GoogleMap3DFlyover` already applies Douglas–Peucker (`smoothingToleranceMeters`, default 8 m) via `simplifyGpsTrack` before bridging. No change needed for typical activities.
- Native side (`GoogleMap3DContainer.buildFlyoverKeyframes`) sub-samples to `MAX_KEYFRAMES = 120` and thins uniformly beyond that. Safe for marathon/ultra tracks.
- For very long activities (>50k points), the JS→native bridge transfer of the full array happens before simplification. If profiling shows jank, pre-simplify in `activityToFlyoverCoordinates` with a coarser tolerance for large inputs (e.g., `toleranceMeters = points.length > 20000 ? 25 : 8`).
- Stream loading is already async and cached; no new I/O on the flyover path beyond what the detail screen does.

## 5. Google Cloud / API prerequisites (no code change)
- The Maps API key is already injected via `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` → `app.config.js` → `AndroidManifest` meta-data `com.google.android.geo.API_KEY`.
- Ensure the key has **Maps 3D API / Map Tiles API** enabled in Google Cloud Console (standard Maps SDK scope may not cover 3D tiles). Billing must be active.

## 6. Testing plan
- Unit: `activityToFlyoverCoordinates` (§3 Slice 1).
- Unit: FlyoverScreen empty-state renders for `< 2` points (mock `GoogleMap3DFlyover`).
- Manual on-device (Android):
  - Open an activity with a GPS track → button visible → tap → flyover plays.
  - Pause / replay / speed change (1x/2x/4x).
  - Back navigation unmounts without crash (single-instance teardown).
  - Activity without GPS → button hidden.
  - iOS → button hidden (or fallback shown, per §5 decision).

## 7. Files touched (summary)
| File | Change |
|---|---|
| `src/utils/activityTrack.ts` | New: coordinate conversion |
| `__tests__/utils/activityTrack.spec.ts` | New: tests |
| `src/features/activities/screens/ActivityDetailScreen.tsx` | Add flyover button + memo |
| `src/screens/FlyoverScreen.tsx` | Remove sample fallback, add empty-state |
| `src/features/home/screens/HomeScreen.tsx` | Remove temporary demo button |
| `src/utils/gpsSmoothing.ts` | (optional) reuse; no change required |

## 8. Risks
- **Single-instance teardown race** (flagged in review of `7e64fc1`): rapid mount/unmount of the map during navigation could crash. Mitigate by keeping the `useFocusEffect` cleanup and testing back-navigation thoroughly.
- **Stream not yet loaded** when the button is tapped: `rawStream` starts `null`. The button is gated on `hasFlyoverTrack` (derived from `rawStream`), so it stays disabled until the stream resolves. Good.
- **Altitude gaps**: handled by `0` fallback + native clamp-to-ground.

## 9. Suggested first slice (smallest coherent change)
1. `activityToFlyoverCoordinates` + tests.
2. Button on `ActivityDetailScreen` (Android-only, gated on track length).
3. `FlyoverScreen` empty-state + remove sample fallback.
4. Remove temporary HomeScreen button.

After these four, the feature is usable end-to-end on real activities. Enhancements (live stats, camera controls UI, iOS) follow.