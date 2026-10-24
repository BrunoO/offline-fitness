# Altitude Stream & Elevation Gain Improvements

Reference notes for GPS/barometric altitude processing in recorded activities on Android.
Prompted by activity `recorded-1792829095198-1` (recorded on flat ground, showing an initial ~40m drop and noisy signal accumulating excessive elevation gain).

---

## 1. Problems Identified

### Problem 1: Initial ~40m Altitude Drop
* **WGS 84 Ellipsoid vs. Mean Sea Level (MSL)**: Android's `Location.getAltitude()` returns height above the WGS 84 reference ellipsoid ($h$). Geographic elevation used by humans and maps is orthometric height ($H$) relative to Mean Sea Level (the geoid):
  $$h = H + N \iff H = h - N$$
  where $N$ is the geoid undulation. In Western Europe (e.g. France), $N \approx +45\text{ m}$ to $+50\text{ m}$.
* **Asynchronous NMEA Sentence Delivery**: In `AltitudeProcessor.kt`, $N$ is parsed from NMEA `GGA` sentences. When starting a recording, location fixes from Android start immediately upon obtaining a GPS lock. However, the first NMEA sentences containing geoid separation arrive asynchronously 1 to 5 seconds later.
* **Fix Log & Replay Cliff**: `TrackingService.kt` logs `sample?.rawAltitudeMeters` ($h$) and `sample?.geoidHeightMeters` ($N$) into `FixLogEntry`. For the first few fixes, `geoid` is `null`. In `replaySession.ts`, `msl = location.geoid != null ? raw - location.geoid : raw`.
  * Fix 0: `geoid == null` $\implies$ altitude = $90\text{ m}$ (ellipsoid height).
  * Fix 3: NMEA arrives with `geoid = 48` $\implies$ altitude = $42\text{ m}$ (MSL height).
  * **Result**: An abrupt 48m drop occurs right at the start. This poisoned the altitude profile chart, caused false elevation loss, and distorted `state.baselineBaro` when fusing barometric pressure.

### Problem 2: Signal Noise & False Elevation Gain on Flat Ground
* **Inherent GPS Vertical Drift**: Unlike horizontal position, GPS vertical accuracy is typically 2× to 3× worse ($\pm 5\text{ m}$ to $\pm 15\text{ m}$ vertical accuracy) because all visible satellites are above the horizon. Multipath reflections and atmospheric delays cause GPS altitude to wander slowly over 10–30s periods even when stationary or on flat terrain.
* **Hysteresis Threshold Too Low for GPS**: `HYSTERESIS_THRESHOLD_M = 1.5` was tuned for barometric altimeters. GPS vertical random walk easily oscillates by $\pm 2\text{ m}$ to $\pm 3\text{ m}$. Each oscillation exceeding 1.5m triggered `gain += delta`. Over a 1-hour activity on dead-flat ground, dozens of oscillations accumulated 100m–200m+ of phantom elevation gain.
* **Inverted Barometer Fusion**: `BARO_WEIGHT_GPS = 0.7` and `BARO_WEIGHT_BARO = 0.3` injected 70% of noisy GPS altitude into the fused stream. A barometer has sub-meter relative accuracy ($\pm 0.1\text{ m}$ to $0.3\text{ m}$) and should dominate short-term elevation changes, with GPS only providing slow baseline correction. Furthermore, devices lacking a hardware barometer operated on 100% noisy GPS.
* **Unfiltered Elevation Gain Chart in UI**: In `ActivityAnalysisView.tsx`:
  ```typescript
  sumGain += Math.max(0, y - altitudeData[i - 1]);
  ```
  The elevation gain chart previously summed every single positive difference between consecutive stream points without any deadband or hysteresis. High-frequency sensor jitter of even 0.2m repeated over 1,000 points displayed a steadily climbing curve of hundreds of meters of fake gain.

---

## 2. Options Considered

### For Problem 1 (Initial Drop)
1. **Replay-Level Geoid Backfill (Implemented)**:
   * *Mechanism*: Since `replaySession.ts` operates on the full array of fixes in batch, pre-scan the session to find the first known `geoid` value (or nearest known geoid) and backfill early fixes that had `geoid == null`.
   * *Pros*: 100% TypeScript, works instantly on all existing and future recordings without native rebuilds. Completely eliminates the step drop.
2. **Android 14+ Platform MSL Altitude (Implemented)**:
   * *Mechanism*: In Android 14 (API 34+), `Location.hasMslAltitude()` and `Location.getMslAltitudeMeters()` are standard platform APIs backed by Google's native geoid model. `AltitudeProcessor.kt` now infers `geoidHeightMeters = raw - msl` on the very first fix if available.
   * *Pros*: Zero wait for NMEA sentences on modern Android devices.
3. **Embedded Offline Geoid Lookup Table (EGM96)**:
   * *Mechanism*: Bundle a compact ~15KB coarse grid lookup table to compute $N(\text{lat}, \text{lon})$ directly from coordinates.
   * *Pros*: Fully offline and works on Android < 14 even when devices emit no NMEA sentences.
   * *Status*: Reserved as future fallback if field devices without NMEA support are encountered.

### For Problem 2 (Noise & Elevation Gain)
1. **Adaptive Hysteresis Threshold (Implemented)**:
   * *Mechanism*: Use `HYSTERESIS_THRESHOLD_BARO_M = 1.5` for fixes with barometric pressure, and `HYSTERESIS_THRESHOLD_GPS_M = 3.5` for GPS-only fixes.
   * *Rationale*: Matches industry standards (Garmin, Strava, OpenTracks) where GPS-only tracking uses a 3.5m–5.0m deadband to ignore typical $\pm 2\text{ m}$ GPS vertical wander on flat ground while reliably detecting actual climbs.
2. **Inverted Barometer Complementary Filter (Implemented)**:
   * *Mechanism*: Change weights to `BARO_WEIGHT_GPS = 0.15` and `BARO_WEIGHT_BARO = 0.85`.
   * *Rationale*: Gives the barometer control over high-frequency slope and altitude changes while GPS gently anchors against long-term meteorological drift.
3. **Deadband Hysteresis in `ActivityAnalysisView.tsx` (Preexisting Reference)**:
   * *Note*: The elevation gain chart in `ActivityAnalysisView.tsx` already uses deadband hysteresis ($1.5\text{ m}$) in `computeData()` (implemented prior to this commit) to prevent display-side noise summation on flat ground.
4. **Bidirectional / Zero-Phase Smoothing (Future option)**:
   * *Mechanism*: Apply a forward-backward rolling average or Gaussian filter (e.g. 20–30s or 30–50m distance window) over the full track in `replaySession.ts`.
   * *Status*: Reserved if 1-pole EMA ($\alpha = 0.25$) proves too noisy on low-end GPS chipsets.
5. **DEM (Digital Elevation Model) Tile Snapping (Future option)**:
   * *Mechanism*: Query offline elevation raster tiles (e.g. SRTM 30m / 90m) to replace or constrain GPS altitude.
   * *Status*: High complexity and storage footprint; avoided in favor of algorithmic filtering.

---

## 3. Implementation Details

### 1. `modules/gps-tracker/android/.../AltitudeProcessor.kt`
* Added automatic derivation and caching of `geoidHeightMeters` from `raw - msl` when `Location.hasMslAltitude()` is true (Android 14+).
* Ensures `geoidHeightMeters` is available on the first fix before any NMEA GGA sentence arrives.

### 2. `src/features/recording/services/replaySession.ts`
* **Geoid Backfilling**:
  ```typescript
  const firstKnownGeoid = fixes.find(f => f.geoid != null)?.geoid ?? null;
  const effectiveGeoid = location.geoid ?? ctx.lastKnownGeoid ?? ctx.firstKnownGeoid;
  ```
  Early fixes that lacked NMEA GGA sentences now inherit the session's first known geoid, keeping orthometric MSL altitude smooth and continuous from fix 0.
* **Barometer Fusion Weights**:
  * `BARO_WEIGHT_GPS`: `0.7` $\to$ `0.15`
  * `BARO_WEIGHT_BARO`: `0.3` $\to$ `0.85`
* **Adaptive Hysteresis**:
  * `HYSTERESIS_THRESHOLD_BARO_M = 1.5`
  * `HYSTERESIS_THRESHOLD_GPS_M = 3.5`
  * Threshold evaluated per fix (`location.pressure != null`), applying the tighter barometric deadband only when pressure data is active.

### 3. `src/features/activities/components/ActivityAnalysisView.tsx` (Preexisting Reference)
* Note: Display-side deadband hysteresis in `computeData()` was implemented in earlier commits and is documented here as part of the overall elevation pipeline:
  * When `item.total_elevation_gain === 0`, all `elGain` points are rendered at 0.
  * When `item.total_elevation_gain > 0`, deadband hysteresis (`HYSTERESIS_THRESHOLD = 1.5`) is used to prevent point-to-point noise summation.

### 4. `__tests__/recording/replaySession.spec.ts`
* Added test `backfills geoid height to early fixes preventing initial elevation drop`.
* Added test `suppresses elevation gain from GPS vertical wander on flat ground`.
* Added test `accumulates elevation gain when a real climb exceeds the GPS threshold`.

---

## 4. Field Testing & Follow-up Tuning Levers

When evaluating future recorded activities in the field:

1. **Flat Route Verification**:
   * Record a 15–30 min activity on flat ground.
   * Check that the starting altitude matches local MSL elevation without an initial drop.
   * Check that `total_elevation_gain` stays $\le 5\text{ m}$ (ideally $0\text{ m}$).
   * Check that the elevation gain chart in `ActivityAnalysisView` remains flat.
2. **Hilly Route Verification**:
   * Record an activity with known climbs (e.g. 10m or 50m hill).
   * Verify that real climbs are registered and accumulate expected gain.
3. **If GPS noise is still too high on specific devices**:
   * Increase `HYSTERESIS_THRESHOLD_GPS_M` from `3.5` to `4.5` or `5.0`.
   * Add a secondary bidirectional rolling median filter (e.g. 5–7 fix window) across `ctx.altitude` in `replaySession.ts`.
   * Add a maximum physical grade limit ($\Delta\text{ele} / \Delta\text{dist} \le 25\%$) between consecutive fixes.
