# GPS Recording — Implementation Plan

**Status:** rev 3 — *option C* (local Expo Module + canonical replay in TypeScript), audited against
the repo's current gates (AGENTS.md, `.gitignore`, Sonar scope, Jest config). Nothing implemented.

**Goal:** Offline Fitness produces its own activity data — record a track on the phone and write the
same `Activity` record + `streams/<id>.json` payload that an imported Strava track produces, so
maps, stats, calendar, export and WebDAV backup work unchanged. Roadmap item 4.

**Source of the native half:** `../GpsLib` (RN 0.87 test app + `packages/react-native-gps-lib`,
Android-only Kotlin). The library moves into this repo so there is one project to maintain.

---

## 0. What is already settled

| Finding | Evidence |
| --- | --- |
| Native packaging survives CNG | An aborted Phase-0 spike verified `expo-modules-autolinking` resolves a local package, `expo prebuild` wires it into gradle, and the Kotlin module compiles under RN 0.86 / SDK 57. The spike was abandoned for the maintenance reasons in §1, not for a technical failure. |
| The Expo Modules path needs no new dependency | `expo-modules-core@57.0.18` is already installed (transitive). |
| Local modules autolink without a `file:` dependency | `expo-modules-autolinking@57` supports `nativeModulesDir` and searches it first. A module under `modules/` needs no `package.json` entry, no lockfile entry, no symlink. |
| The architecture has an in-tree reference | `node_modules/expo-location` at this exact SDK: `expo-module.config.json` for both platforms, `Events(...)`, `AsyncFunction(...)`, and `services/LocationTaskService.kt` — a foreground location service. |
| Typed events are first-class | `EventEmitter` is exported from `expo-modules-core`; `LegacyEventEmitter` exists only for old-style code. |
| The app's own conversion core can build the record | `parseGpx` / `toStreamSet` / `trackBoundingBox` (`src/features/strava-import/services/gpxParser.ts`) and `buildManualActivity` (`src/features/activities/services/manualActivity.ts`) already encode every rule a record must satisfy. |
| `.gitignore` currently swallows the module | `android/` and `ios/` (`.gitignore:14-15`) match at *any* depth, so `modules/gps-tracker/android/…` and `.../ios/…` are ignored today (verified with `git check-ignore`). They must be anchored to the repo root (`/android/`, `/ios/`) in Phase 0, or the module ships with no native sources and `prebuild --clean` builds an empty module. |

### 0.1 Where the new code lands in the gates

| Gate | Scope (verified) | Consequence |
| --- | --- | --- |
| `npx tsc --noEmit` | `tsconfig.json` `include: ["**/*.ts", "**/*.tsx", "App.tsx"]` | `modules/gps-tracker/src/*.ts` is type-checked like app code |
| `npx expo lint --fix` | `eslint.config.mjs` ignores only `android/*`, `ios/*`, `python-app/*`, … | the module's TS facade is linted (Kotlin is not, by design) |
| `npm run check:imports` | walks `src/` only (`scripts/check-imports.cjs:139`) | duplicate/scattered imports in `modules/` are **not** machine-checked — keep one import per module there by hand |
| `npm run check:mobile-only` | bans `*.web.*`, `Platform.OS === 'web'`, web deps, a `web` script | the module adds no web surface; its iOS stub is native, not web |
| `npm run check:install-scripts` | `allowScripts` in `package.json` (AGENTS.md "Dependency Install Scripts") | `npx expo install expo-keep-awake` must not introduce an untrusted install script; deny or pin per policy |
| `npm test -- --watchAll=false` | `jest` config lives in **`package.json`** (no `jest.config.js`); `__tests__/helpers/` is ignored | fixtures go in `__tests__/recording/`; `jest.setup.js`'s `expo-file-system` mock needs `open()`/`FileHandle` (see Phase 2) |
| `scripts/sonar_gate.sh --scan` | whole project minus `sonar.exclusions`, which includes `**/android/**` | Kotlin (module *and* prebuilt app) stays outside the issue gate; the module's TS and `src/features/recording` are analysed with no config change (`sonar.sources` is ignored by SonarCloud — do not add it) |

---

## 1. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | **Keep the Kotlin internals** (service, providers, sensors, session storage, TTS). | Working and tested; the Android-specific parts must be native anyway. Only the wrapper is rewritten. |
| D2 | **Canonical replay in TypeScript.** Native captures and persists raw fixes; the app replays them at `stop` to produce the record and the stream. | One implementation of filtering / altitude / auto-pause / splits for both platforms and for both data sources (recorded *and* imported). It lands inside the analysed tree and Jest instead of in Kotlin, which `sonar.exclusions` (`**/android/**`) keeps out of the issue gate. |
| D3 | **The fix log is the contract, not GPX.** | A GPX round-trip loses accuracy/speed, and GPX text generation already exists in TS (`streamToGPX` in `shared/services/exportData.ts`). |
| D4 | **A local Expo Module** (`modules/gps-tracker/`), not a vendored legacy package. | Typed `AsyncFunction`/`Events`/`OnStartObserving` replace `ReadableMap` parsing, hand-built `WritableMap`s and a mutable static listener; lifecycle is defined instead of accidental; iOS gets a real file to fill in; no symlink/`file:` dependency to rot. |
| D5 | **The app owns permissions.** The module asks for none. | `expo-location` already owns foreground location here (`features/maps/hooks/useLocationPermission.ts`); on iOS the model is entirely different anyway. |
| D6 | **Capabilities, not throws.** `getCapabilities()`; iOS reports `canRecord: false`. | The JS bundle and the iOS build must not depend on the Android module existing. |
| D7 | **Android-only recording in the MVP**, with a compiled iOS stub. | No iOS hardware to test on; the stub plus a fixtures suite make a CoreLocation implementation a contribution rather than a rewrite. |
| D8 | **Splits (audio/haptic) are post-MVP.** The milestone arithmetic stays in TS when they land; only `speak(text)` / `vibrate()` are native. | Keeps the MVP focused on producing a correct record; nothing in the data contract depends on splits. |
| D9 | **Battery-exemption UI is post-MVP** (helpers stay in the module, capability-gated). | Recording works without the exemption; a prompt in the first version adds failure modes to the exact flow that must be boring. |
| D10 | **Fix logs are kept for 30 days, device-only, for debugging.** | The log is the only artefact that shows *why* a replay produced the numbers it did. One month covers "why did last week's ride come out short"; the retention is one constant so it can be shortened later without touching the format. |
| D11 | **Fix data is read in chunks, by TS, straight from the log file** — no fix array crosses the bridge. | A single array of several hundred thousand points is an OOM on a low-end phone and a stalled JS thread (and it is copied twice: native → bridge → JS objects). `expo-file-system@57` already gives `File.open()` → `FileHandle.readBytes(length)` with a settable `offset`, so chunked reading needs no native API at all. Decided now because it fixes both the module signature and the shape of the replay code. |

**Not ported at all:** `gpslogger/` (GPLv2 — must never enter this MIT app), `external/polar-ble-sdk`,
`TrackHistoryManager`, the native `shareGpx`/FileProvider machinery (sharing comes back post-MVP in
TypeScript, §7), `addWaypoint`, `.fit`/`.kml` output, any map-provider change.

---

## 2. Architecture

```
modules/gps-tracker/                     local Expo module (app code, both platforms)
  expo-module.config.json                { platforms: [apple, android], modules: [...] }
  src/GpsTrackerModule.ts                typed facade: requireNativeModule + EventEmitter
  src/GpsTracker.types.ts                RecordingOptions, RecordingStats, FixLogEntry, Capabilities
  android/src/main/AndroidManifest.xml    service (foregroundServiceType=location) only — no FileProvider (native share is not ported)
  android/src/main/java/com/gpslib/tracker/
      GpsTrackerModule.kt                DSL wrapper: AsyncFunction / Events / lifecycle hooks
      service/TrackingService.kt         kept: FGS, wake lock, notification, fix log
      provider/{Fused,Android}LocationProvider.kt   kept
      altitude/AltitudeProcessor.kt      reduced: report raw altitude + geoid + pressure
      service/SessionStorage.kt          retargeted: meta.json + fixes.jsonl
  ios/GpsTrackerModule.swift             stub: canRecord=false, other functions throw
  ios/GpsTracker.podspec

src/features/recording/                  app feature (TypeScript)
  screens/RecordingScreen.tsx            MVP UI
  components/                            stat tiles, control button, save sheet
  hooks/useRecording.ts                  capability gate + subscriptions
  hooks/useRecordingPermissions.ts       foreground + POST_NOTIFICATIONS (denial is non-fatal)
  config.ts                              FIX_LOG_RETENTION_DAYS + recording dir name
  services/replaySession.ts              filter → altitude fusion → auto-pause → splits
  services/profiles.ts                   profile → CaptureOptions (was ActivityProfile.kt)
  services/buildRecordedActivity.ts      record via manualActivity helpers
  services/fixLog.ts                     chunked JSONL reader + retention sweep (via the module)
  services/writeStreamFile.ts            encodeStreamSet + File.write
```

Deleted from the Kotlin after parity: `LocationFilterPipeline`, `ActivityProfile` (numbers move to
`profiles.ts`, capture parameters travel to Android as options), `GpxWriter`,
`SplitFeedbackManager`'s arithmetic (the class stays for its TTS/audio-focus internals until D8),
`AltitudeProcessor`'s fusion, `GpsLibPackage` (replaced by `expo-module.config.json`).

**Naming, so the three files agree:** file `GpsTrackerModule.kt` / `GpsTrackerModule.swift`, annotation
`Name("GpsTracker")` on both platforms, `expo-module.config.json` lists `"GpsTrackerModule"`, and TS
calls `requireNativeModule('GpsTracker')`. The Kotlin package stays `com.gpslib.tracker` (no reason
to churn it); `libraryVersion` in `meta.json` is a module constant bumped with the module, not the app.

**Typed surface (MVP):**

```ts
type Profile = 'walking' | 'hiking' | 'cycling' | 'swimming';

interface CaptureOptions {
  intervalMs: number; minDistanceM: number; accuracyCeilingM: number; useBarometer: boolean;
}

interface RecordingMeta {
  sessionId: string; profile: Profile; startedAtUtcMs: number;
  endedAtUtcMs?: number;                  // written at stop; repaired from the last fix on recovery
  deviceUtcOffsetSeconds: number; capture: CaptureOptions;
  pauses: { startUtcMs: number; endUtcMs?: number }[];   // manual pause/resume, in order
  fixCount?: number; logUri: string;      // absolute file URI of fixes.jsonl — never reconstructed in TS
  libraryVersion: string; savedActivityId?: string;
}

type RecordingPhase = 'idle' | 'recording' | 'paused' | 'stopped-unsaved';
interface RecordingState { phase: RecordingPhase; sessionId?: string; startedAtUtcMs?: number }
interface LiveStats { elapsedSec: number; distanceMeters: number; currentSpeedMps: number | null; altitudeM: number | null }
interface RecordingSummary { meta: RecordingMeta; liveStats: LiveStats }  // display only; replay is TS

getCapabilities(): Promise<{ canRecord: boolean; hasBarometer: boolean; canExemptBattery: boolean }>
startRecording(options: { profile: Profile; capture: CaptureOptions }): Promise<RecordingMeta>
pauseRecording(): Promise<void>
resumeRecording(): Promise<void>
stopRecording(): Promise<RecordingSummary>          // finalises meta, closes the writer
getRecordingState(): Promise<RecordingState>         // survives a JS reload
getSessionMeta(sessionId?: string): Promise<RecordingMeta>  // newest session when omitted
listSessions(): Promise<RecordingMeta[]>             // recovery + retention sweep + delete lookup
markSessionSaved(sessionId: string, activityId: string): Promise<void>  // sole writer of savedActivityId
discardSession(sessionId: string): Promise<void>
Events: 'onLocationUpdate' | 'onStateChange'
// onLocationUpdate: { t, lat, lon, eleM, speedMps }  — display only, may be dropped
// onStateChange:    RecordingState                  — the screen's only source of truth
```

**No fix array crosses the bridge** (D11, §3.6): the module hands out `meta` (which carries the
`fixes.jsonl` URI) and TS reads the file in chunks itself.

Screen-on comes from `expo-keep-awake` (already in the dependency tree; add it to
`package.json` with `npx expo install`) instead of a native `setKeepScreenOn` — one fewer native
method to maintain on two platforms.

---

## 3. The contract

### 3.1 Fix log (native → TS)

`<document>/recording/<sessionId>/meta.json` — the shape is in §2. It is written at start and
**completed at stop** (`endedAtUtcMs`, `fixCount`, the closing `endUtcMs` of the last pause), because
none of those can be known earlier. Rewrites write a temp file and rename, so a kill mid-write cannot
corrupt a session that recovery still has to offer. `logUri` comes from native so TS never
reconstructs a platform path (Android `filesDir` and iOS `Documents` differ, and `documentDirectory`
is not something to hardcode twice). `pauses` is a list, not a boolean, so pause intervals survive a
JS reload and a restart.

`fixes.jsonl` — one object per fix, appended by the service, flushed every N fixes and on
pause/stop:

```ts
interface FixLogEntry {
  t: number;                 // epoch ms from the fix
  lat: number; lon: number;
  ele: number | null;        // raw altitude as reported by the platform
  geoid: number | null;      // NMEA GGA geoid separation, when available
  pressure: number | null;   // hPa, when the barometer reported one
  hAcc: number; vAcc: number | null;
  speed: number | null; bearing: number | null;
  source: 'gps' | 'fused' | 'network' | 'unknown';
  accepted: boolean;
  reason?: string;           // capture-time rejection reason (display only)
}
```

Replay must be **deterministic over this log** and must not depend on what JS saw live. `accepted`
is metadata: replay re-derives acceptance from `capture`, so a future Swift implementation can use
a different live filter and still produce identical output.

### 3.2 Replay output (TS)

```ts
interface ReplayResult {
  stream: EncodableStreamSet;                              // latlng / altitude / time
  segments: { startIndex: number; endIndex: number }[];    // moving stretches, in order
  stats: { distanceMeters; elapsedTimeSec; movingTimeSec;
           elevationGainMeters; elevationLossMeters;
           maxSpeedMetersPerSec; averageSpeedMetersPerSec };
  rejected: { index: number; reason: string }[];           // points the filter dropped
  skipped: number;                                         // malformed lines (never fatal, §3.6)
}
```

Time accounting, fixed here so native and TS cannot disagree later:

- `elapsedTimeSec = endedAtUtcMs − startedAtUtcMs` — wall clock, **including** manual pauses;
- `movingTimeSec = elapsed − manual pause intervals (meta.pauses) − auto-pause gaps`, floored at 0;
- `averageSpeed = distance / movingTime`, and `0` when `movingTime` is `0` (a record is still saved);
- a manual pause is **not** re-detected as an auto-pause gap: capture stops, so no fixes exist inside
  it and the time is subtracted from `meta.pauses` only. Subtracting it twice is the obvious bug;
- a distance is never accumulated across a segment boundary — the gap resets the "previous point", so
  the straight line across a pause is not counted as travelled;
- the stream keeps every accepted fix and `time` stays monotonic across gaps (a paused import looks
  the same); `segments` is what tells charts where moving time resumes;
- no barometer (`pressure === null` everywhere) → raw `ele` with the smoothing window only, which is
  the no-barometer fixture's expectation.

Rules that must match the import path, because they decide what the map and charts read:

- coordinates rounded to 1e-6, altitude to 0.1 m (same rounding as `toStreamSet`);
- `time` = whole seconds since the first point, monotonic;
- bounding box from `trackBoundingBox(latlng)` (O(n), not the simplified track).

### 3.3 The stored activity

`buildRecordedActivity()` extends `buildManualActivity`'s date/time helpers (`local_date`,
`utc_offset` at the instant, mislabeled-Z `start_date_local`, `week_of_year`,
`deviceTimezoneLabel`):

- `id: recorded-<startUtcMs>-<counter>` — **the same `startUtcMs` and `counter` as the session id**, so
  a retried save reuses the identical id instead of creating a duplicate activity; name from the user
  (default: `<type> <local time>`);
- `distance`, `elapsed_time`, `moving_time`, `average_speed` (= distance / moving_time),
  `total_elevation_gain`, `elev_high`, `elev_low`, `start_latlng`, `end_latlng`, `bounding_box`
  from `ReplayResult`;
- swims are canonicalised **at write time**, not by the startup backfill: `moving_time` follows
  `rowToActivity`'s rule and `total_elevation_gain` is written as `0`, matching
  `correctSwimElevationGain` (`features/activities/services/fetchAndStoreStreams.ts:387`). Otherwise
  every recorded swim is "fixed" by a backfill on the next launch — a storage write per swim, and a
  backup push that disagrees with the record until it happens;
- no tombstone/sync work: an unknown record is pushed by the next backup like a manual entry, and
  restore never deletes device-only activities.

### 3.4 Stream write

`writeStreamFile(id, stream)` = `encodeStreamSet` (`shared/services/streamCodec.ts`) + `File.write`
into `APP_CONFIG.STREAMS_FOLDER`. It does not exist yet (restore writes raw server bytes); ~15 lines
next to `readStreamFile`, with no web fallback or lazy-folder workaround — the target is mobile only,
so the "storage unavailable" branch the older code carries has no reason to be copied.

### 3.5 Fix-log retention (D10)

`<document>/recording/<sessionId>/` is **kept for 30 days after the session ends**, then deleted by a
sweep at app start and after each successful save. One constant —
`FIX_LOG_RETENTION_DAYS = 30` in `src/features/recording/config.ts` — is the only thing to change
when the window shortens; no format or reader change is involved, so older sessions simply disappear
earlier.

The sweep deletes a session directory when `meta.json.savedActivityId` exists **and**
`endedAtUtcMs` is older than the window; it runs entirely through `listSessions()` +
`discardSession()` so TS never reconstructs the storage root. A session with no `savedActivityId` is
an unfinished recording and is handled by recovery (§3.7), never by the age sweep — otherwise a crash
during a month-old holiday would silently discard the offer to save it.

Cost, measured against the estimate: ~120 B per fix ≈ 430 KB/h at 1 Hz, so a heavy week (10 h) is
~4 MB and a full window is well under 50 MB. No size cap is needed at that rate; if one is ever
added it takes the oldest sessions first, after the age sweep.

**Privacy is part of the decision, not a footnote.** A month of raw breadcrumbs is the largest
location store this app has ever held, in a product that promises "no account, no tracking". So:

- fix logs **never leave the device**: not in the WebDAV backup (`backupSync` only walks
  `activities/` and `streams/`), not in the GPX/CSV export, not in `tool:seed`;
- deleting an activity offers to delete its session log (the `savedActivityId` mapping is what makes
  this exact rather than a guess);
- Settings gets a diagnostics row in Phase 4 — sessions retained, size on disk, **Delete all** — so
  the store is visible instead of implicit;
- `README.md`'s Fine print states the retention window and the device-only rule (Phase 5).

### 3.6 Reading the log (D11)

How fixes get into JS, decided before any code depends on it:

- **Size reality.** One fix per second: 2 h ≈ 7,200 fixes (<1 MB), 24 h ≈ 86,400 (~11 MB), a week
  ≈ 600,000 (~70 MB). The MVP is only *tested* up to ~10 h sessions, but the shape is chosen for the
  long tail because retrofitting it later changes the module signature and the replay engine together.
- **No array over the bridge.** `getSessionMeta` returns `meta` — which carries the `fixes.jsonl`
  path and `endedAtUtcMs` — and TS opens the file itself with `FileHandle.readBytes(n)` + `offset`
  (`expo-file-system@57`), in ~256 KB chunks. Same app sandbox, no permissions, no bridge copy.
- **Chunk boundaries are the reader's problem, not replay's.** `fixLog.ts` carries the partial
  trailing line between chunks and only yields complete JSONL records, so replay sees a plain
  sequence of fixes with no notion of pages.
- **Replay is a reducer.** `replaySession` folds fixes one at a time into a state object (distance,
  gain, current segment, the altitude smoothing window, auto-pause state), so memory is O(window),
  not O(fix count).
- **Tested small, on purpose.** Fixtures run through the real reader with a deliberately tiny chunk
  size, including one case where a record straddles a chunk boundary — pagination gets exercised
  without a 10-hour recording existing.
- **Failure semantics.** A truncated final line is tolerated (a session killed mid-write is normal);
  a malformed line mid-file is skipped and counted in `ReplayResult.skipped` rather than thrown — a
  damaged log must still produce a usable activity instead of losing the recording.

### 3.7 Lifecycle, errors, save order, recovery

The states and what each call does when it is called at the wrong moment:

- **start**: requires `canRecord` and `phase === 'idle'`. A second start while a session exists
  rejects with `E_SESSION_ACTIVE`, whose `userInfo` carries the existing `sessionId`, so a double-tap
  attaches to the running session instead of forking one. A stopped-but-unsaved session is not
  overwritten: it is recovered (see *Recovery at launch* below) or discarded.
- **pause / resume**: idempotent. Pausing while paused or resuming while recording is a no-op, not an
  error — the screen may fire them from a stale render.
- **stop**: finalises `meta.json` and closes the writer. Calling it on an already-stopped session
  returns the stored summary (idempotent); with no session at all it rejects `E_NO_SESSION`.
- **discardSession**: rejects `E_SESSION_ACTIVE` while the session is live (a stray tap must not kill
  a recording); it only deletes a stopped session's directory.
- **Events**: `onLocationUpdate` is display-only and may be dropped under load; `onStateChange` carries
  the phase and is the only thing the screen treats as truth. Live numbers are never canonical (§8).

**Save order (TS), each step retryable:** (1) replay the log; (2) `writeStreamFile`; (3) `addActivity`
(persists and triggers the existing backup sync); (4) `markSessionSaved`. Writing the stream *before*
the record is deliberate: a failure after (2) leaves an unreferenced stream file (harmless, and it is
overwritten on retry), whereas the reverse order would leave a record whose map is blank and a backup
that pushed it. If (2) or (3) fails the session stays `stopped-unsaved` with the log intact, and the
sheet keeps "Save" available. Steps (2) and (3) are idempotent because the ids are derived from the
session (§3.3).

**Deleting a recorded activity** uses the existing `useActivities.deleteActivity` path (storage
remove + tombstone), then offers to delete the session log. The reverse lookup
`activityId → sessionId` is `listSessions()` filtered on `savedActivityId`: the window is 30 days of
sessions, so it is cheap, and it avoids adding a session field to `Activity`, which would leak into
backups and change the shared record shape (D3).

**Recovery at launch:** `listSessions()` returns every session; each one whose meta has no
`savedActivityId` and whose service is not running is offered as *"Unfinished recording from <local
time> — Save / Discard"*. A missing `endedAtUtcMs` (killed mid-session) is repaired from the last
fix's `t` and marked `recovered: true` in the replay report. The log being the contract is exactly
what makes this recoverable.

**Degraded conditions** are states, not dialogs: location lost mid-session → the service keeps the
session and the notification reads "waiting for GPS"; permission denied or location services off at
start → `startRecording` rejects `E_LOCATION_UNAVAILABLE` and the screen shows actionable text with
`Linking.openSettings()`. Nothing in the flow auto-stops a recording because of a tunnel or a denied
notification.

---

## 4. Platform, permissions, gating

- **No `ACCESS_BACKGROUND_LOCATION`.** A `foregroundServiceType="location"` service started while
  the app is visible runs on the while-in-use grant. The note at `docs/status.md:253` saying to
  re-add it when the recorder lands is wrong and is corrected as part of this work.
- The module's `AndroidManifest.xml` declares `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`, `WAKE_LOCK`, `VIBRATE`; merging means
  `app.json` needs no new entries. `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is **deliberately absent
  from the MVP**: only D9's banner needs it, and it is a Play-policy-sensitive permission that should
  not be declared for a feature that does not ship.
- iOS is not left to rot: Phase 1 proves the stub compiles and the pod resolves
  (`npx expo prebuild --platform ios` + `pod install`), so the module cannot quietly become
  Android-only at the config level while claiming a stub.
- `POST_NOTIFICATIONS` (Android 13+) is requested by a new `useRecordingPermissions` hook; denial is
  **non-fatal** (the service runs, the notification is silent). Foreground location goes through
  `expo-location`, like the maps feature.
- Recording always *starts* from the screen, so Android 14's FGS-start rule needs no exemption.
- iOS: `ios/GpsTrackerModule.swift` returns `canRecord: false`; the drawer entry stays visible and
  the screen explains that recording is Android-only today.
- The service must outlive the JS module (the React instance can be destroyed while recording): the
  service owns the session state and the module binds to it through a holder object, replacing the
  current `TrackingService.listener` static. That is a design task in Phase 1, not a mechanical port.

---

## 5. MVP scope

**In:** record / pause / resume / stop; pick one of **four profiles — walking, hiking, cycling,
swimming** (swim included from day one: its capture tuning is the case where GPS behaves worst, so it
is the profile that most needs the replay pipeline exercised on real data); live elapsed, distance,
current speed, altitude; save with name; the saved activity appears everywhere an imported one does
(map, stats, calendar, export, WebDAV push); crash recovery of an in-flight session; recorded-activity
deletion through the existing paths; 30-day device-only fix-log retention with a visible
count/size and a **Delete all** control (§3.5).

**Out (see §7):** audio/haptic splits, battery-exemption prompt, waypoints, **share sheet**,
notification action buttons, iOS CoreLocation, `.fit`/`.kml`.

---

## 6. Phases

**Gates for every phase** (before a phase is called done, in this order): `npx tsc --noEmit`;
`npx expo lint --fix`; `npm run check:imports`; `npm run check:mobile-only`;
`npm run check:install-scripts`; `npm test -- --watchAll=false`; then
`scripts/sonar_gate.sh --scan` last (open issues are fixed, never muted — AGENTS.md). The manual
checklist in AGENTS.md still applies to anything user-visible.

**Branch from the current working tree, do not reset it.** The tree already carries other uncommitted
work (`.github/workflows/build.yml`, `App.tsx`, `app.json`, `package-lock.json` at the time of
writing); add to it, run `git status` first, and never reformat or revert files the task does not own
(AGENTS.md "Bulk Edits & Codemods").

### Phase 0 — module skeleton on the device (~0.5 day)

Risk retired: an Expo module that starts a foreground service and emits an event under bridgeless,
in this app's build.

- **First, un-ignore the native sources**: anchor `.gitignore`'s `android/` / `ios/` to `/android/` and
  `/ios/` (they currently match at any depth, so the module's Kotlin and Swift would never be
  committed — verified with `git check-ignore`, §0).
- `modules/gps-tracker/` with `expo-module.config.json`, a `GpsTrackerModule.kt` exposing
  `getCapabilities` + `start`/`stop` that forward to a *stub* service which emits `onTick`.
- `npx expo prebuild --platform android`, then `npm run android:dev` (debug build) or
  `npm run build:local` (release; bumps `versionCode`) — **ask before any `eas build`**.
- **Exit:** on a real device, `onTick` events arrive; the notification shows; `getCapabilities`
  answers from JS. Delete the stub service body in Phase 1.

### Phase 1 — port the internals behind the DSL (~2 days)

- Move `TrackingService`, both providers, `SessionStorage`, `AltitudeProcessor` into
  `modules/gps-tracker/android/…` unchanged except: no GPX call, no filter call, no profile class —
  capture parameters come from `RecordingOptions`.
- Rewrite the wrapper: `AsyncFunction`/`Property`/`Events`/`OnStartObserving`/`OnStopObserving`/
  `OnDestroy`; typed `Record` options; friendly JS errors instead of `Promise` rejections built by hand.
- Service-owned session state via the holder object (§4); `getRecordingState` survives a JS reload.
- iOS stub file + podspec so the iOS build compiles and reports `canRecord: false`.
- Delete `GpsLibPackage`, `GpxWriter`, `LocationFilterPipeline`, `ActivityProfile`.
- **Exit:** `npx expo prebuild --clean --platform android` + release build; iOS pod resolves
  (`prebuild --platform ios` + `pod install`); all gates at zero; recording produces a fix log
  (Phase 2 makes it complete).

### Phase 2 — the fix log (~1 day)

- `meta.json` written at start and **completed at stop** (`endedAtUtcMs`, `fixCount`, closed pause),
  with the atomic rewrite from §3.1; `fixes.jsonl` with its flush policy; the launch sweep that offers
  to save or discard a session left by a killed app (§3.7).
- `getSessionMeta` / `listSessions` / `markSessionSaved` / `discardSession`; **no fix array over the
  bridge** (§3.6). Native live stats shrink to display-only (elapsed, haversine distance, current
  speed, altitude) for the UI and the notification.
- `services/fixLog.ts` in the app: `FileHandle.readBytes` chunked reader that yields complete JSONL
  records, tolerant of a truncated last line.
- `jest.setup.js` already mocks `expo-file-system` as an in-memory class; the mock gains `open()` and a
  `FileHandle` (`readBytes`, settable `offset`, `size`) over the same map, so the chunk-boundary logic
  is exercised for real instead of mocked away.
- Kotlin writer tests are a JVM source set: `cd android && ./gradlew :gps-tracker:testDebugUnitTest`
  (autolinked subproject name = module directory). Informational — it is not part of the DoD gate.
- **Exit:** a 20-minute recording's log survives an app kill; JVM tests cover the writer; a Jest
  test reads a log through the real chunked reader with its chunk size forced small.

### Phase 3 — replay, record, stream (~2 days)

- `replaySession.ts` as a **streaming reducer** (accuracy ceiling → min distance → speed-jump
  rejection → stationary drift suppression → altitude fusion → auto-pause → splits) fed by the
  chunked reader, `profiles.ts`, `buildRecordedActivity.ts`, `writeStreamFile.ts`, wired through
  `useActivities().addActivity`.
- `profiles.ts` copies `ActivityProfile.kt`'s numbers **verbatim** (interval, min distance, accuracy
  ceiling, barometer on/off) into one table frozen by a unit test, so the port does not silently
  change capture behaviour.
- Fixtures: `__tests__/recording/fixtures/*.jsonl` + expected output — short walk, long-pause walk,
  cycling with barometer, cycling **without** a barometer, swim, a log with deliberate outliers, a
  malformed middle line, and one record straddling a chunk boundary (tiny chunk size, §3.6). These
  are also the artefact a future iOS contributor tests against.
- **Shadow mode (dev, `__DEV__` only):** replay the log in TS and compare against the Kotlin display
  numbers; log `recording.shadow_mismatch` on divergence.
- **Exit:** a recorded walk's record matches the import path's conventions; the map draws it; stats
  screens count it; Jest covers the filter rejects, the auto-pause gap, manual-pause time being
  subtracted exactly once, a DST-crossing start, altitude rounding, and a failed save retried into
  **one** activity; Sonar stays at zero.

### Phase 4 — the screen (~2 days)

- `RecordingScreen` + components, a rewrite of `GpsLib/App.tsx` (1,171 lines) rather than a copy:
  `useTheme()` + `createStyles(theme)` (no hex literals), ternaries instead of `&&`, no
  `try/finally`, no empty `catch`, elapsed from the event/state payloads (no parallel `setInterval`).
- `npx expo install expo-keep-awake` (not a direct dependency today) and keep the screen awake only
  while a session is live, releasing it on stop/unmount; if npm reports an install script, record the
  decision in `allowScripts` per AGENTS.md rather than approving everything.
- The degraded states from §3.7 are rendered as states, not alerts: permission denied → actionable
  text with `Linking.openSettings()`; GPS lost → "waiting for GPS"; unfinished session → Save/Discard
  sheet; `stopped-unsaved` → Save stays available.
- Entry point: extend `ManualEntryContext` into the **RECORD-CHOOSER** its doc comment anticipates
  (Record / Enter manually) plus a drawer `Record` item — no third entry point.
- Type mapping: `walking → Walk`, `hiking → Hike`, `cycling → Ride`, `swimming → Swim`.
- **Accessibility is part of the screen, not a later pass** (AGENTS.md "Accessibility & Contrast"):
  text ≥4.5:1 and large text/graphics ≥3:1 in both schemes for both palettes; live stat tiles read
  `theme.text` on `theme.surface` (never `theme.onPrimary` over a saturated fill); any progress or
  split bar uses a tinted fill with a solid stroke so overlaid numbers stay readable at every length.
- **Exit:** start → background 10 min → return → stop → save; the activity survives a restart,
  exports as GPX, pushes to WebDAV; dark mode + both palettes with contrast checked; no console
  errors in a release build.

### Phase 5 — docs and the gate (~0.5 day)

- `docs/architecture.md` (recording path in the mermaid + "imported and recorded produce the same
  payload"), `AGENTS.md` (feature tree, fragile areas, checklist), `README.md` (roadmap item 4,
  "Getting the data in" now has two paths, Fine print: Android-only recording today),
  `docs/status.md` (one entry), `modules/gps-tracker/README.md` (facade, fixtures, "iOS wanted").
- `scripts/sonar_gate.sh --scan` last.
- Housekeeping: decide where the generated study page lives (commit it under `docs/` or delete it) —
  `recording-plan.html` must not be left untracked at the repo root when the work is done.
- **Exit:** full DoD clean; a release APK recorded a real activity.

---

## 7. Post-MVP backlog (in rough order)

1. **Splits: audio + haptics.** Milestone arithmetic in `replaySession.ts`; native gains
   `speak(text)` + `vibrate(pattern)`; settings for interval/voice. (D8)
2. **Share GPX** — "Share" on an activity (recorded *or* imported), no native code:
   `streamToGPX` (`shared/services/exportData.ts`) writes a temp file and `Sharing.shareAsync`
   (`expo-sharing` is already a dependency and a configured plugin) opens the system sheet for
   Strava, Garmin, Drive or mail. The app's activity list is the history, so `TrackHistoryManager`
   stays unported; temp files are removed when the share sheet returns, like the export chunks
   already are. (~1 h)
3. **Battery-exemption banner** using the module's existing helpers. (D9)
4. **iOS CoreLocation implementation** behind the same `AsyncFunction`s, validated by the fixtures;
   Simulator GPX routes make this developable without hardware.
5. **Notification action buttons** (pause/resume from the shade).
6. **Waypoints / POI** — only if the map feature grows a use for them.

---

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| `.gitignore`'s un-anchored `android/` / `ios/` silently drop the module's native sources | Anchored to `/android/` `/ios/` in Phase 0, and `git check-ignore modules/gps-tracker/android` is part of the Phase 0 exit |
| Service outlives the module / React instance dies mid-recording | Session state lives in the service + holder, never in the module; `getRecordingState` rehydrates the screen (Phase 1) |
| JS suspended mid-recording → live numbers freeze | Canonical numbers never come from live JS; the log is native and replayed at `stop` |
| A kill mid-write corrupts `meta.json` or the log | Temp-file + rename for meta, truncation tolerated by the reader, `endedAtUtcMs` repaired from the last fix (§3.1, §3.7) |
| Manual pause + auto-pause subtract the same time twice | Manual pauses come only from `meta.pauses`, auto-pause only from replay segments (§3.2), with a fixture that has both |
| A failed save produces a duplicate activity on retry | Record id is derived from the session id, and the save order is stream → record → mark (§3.3, §3.7) |
| Replay drifts from the import path | Same rounding helpers, same bounding-box function, real fixtures, shadow-mode comparison |
| `expo-modules-core` API churn on SDK upgrades | Same cadence as the rest of the app; the module surface is deliberately small (11 functions, 2 events) |
| Fix logs grow unbounded on a long ride | ~120 B/fix ≈ 430 KB/h; chunked reader + reducer keep memory flat; age sweep at 30 days (§3.5) |
| No barometer on most phones | Raw altitude + smoothing only, covered by a no-barometer fixture (§3.2) |
| CNG regenerates native config | `expo-module.config.json` + the module's own manifest; proven by `prebuild --clean` in Phase 1 on both platforms |
| The ported screen drags Android-shaped UI habits in | Rewrite against `useTheme()`/`createStyles` and the JSX rules; review as app code, not vendor code |
| GPL contamination | `gpslogger/` is never copied; only `modules/gps-tracker` + `src/features/recording` enter the repo |

## 9. Open questions

None blocking. Answered so far:

- **Fix-log retention** — 30 days, device-only, with a visible count/size and a Delete-all control
  (D10, §3.5).
- **Swim profile** — in the MVP chooser, record canonicalised at write time (§3.3, §5).
- **Fix delivery shape** — chunked; TS reads the log file itself, replay is a reducer (D11, §3.6).
