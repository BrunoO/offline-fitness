# gps-tracker — local Expo module

Native half of the GPS recorder (roadmap item 4). The design lives in
[`docs/recording-plan.md`](../../docs/recording-plan.md); this file covers what
exists in the tree today.

## Status: Phase 3 (replay, record, stream)

The legacy Kotlin internals (service, providers, session storage, altitude
sensor) are ported into this module, with three deliberate changes:

- **The service records, it does not decide.** The legacy service filtered
  fixes, fused the barometer into the altitude, accumulated gain and loss and
  wrote GPX. All of that arithmetic now belongs to the TypeScript replay
  (D2), so the service writes the raw fixes and the replay re-derives
  everything from the log.
- **The fix log is the contract** (D3): `meta.json` + `fixes.jsonl` in
  `<files>/recording/<sessionId>/`. TypeScript reads the log itself, in
  chunks (D11) — no fix array ever crosses the bridge.
- **The service owns the session.** The state lives in `TrackingSession`, a
  process-wide holder the service publishes and the module subscribes to. The
  legacy `TrackingService.listener` static is gone, and so is the module's
  dependency on a service singleton: the module binds to the service for each
  call.

iOS is a compiled stub: `getCapabilities()` answers `canRecord: false` and
every other call throws a friendly "Android-only" error (D6/D7).

## Layout

```
expo-module.config.json                  module registration (android FQCN, apple class)
src/GpsTracker.types.ts                  the typed surface (meta, state, options, events)
src/GpsTrackerModule.ts                  typed facade: calls + event subscription
src/index.ts                             barrel
android/build.gradle                     expo-module-gradle-plugin + play-services-location
android/src/main/AndroidManifest.xml     FGS permissions + <service>
android/.../GpsTrackerModule.kt          AsyncFunction / Events / lifecycle hooks
android/.../GpsTrackerRecords.kt         typed Record arguments (options)
android/.../capture/CaptureOptions.kt    the four capture numbers + RecordingOptions
android/.../provider/*.kt                fused and platform location providers
android/.../altitude/AltitudeProcessor.kt  raw altitude + geoid + pressure (no fusion)
android/.../service/TrackingService.kt   FGS, wake lock, notification, capture loop
android/.../service/TrackingSession.kt   the holder: session state, live stats, events
android/.../service/SessionStorage.kt    meta.json + fixes.jsonl on disk
android/.../service/FixLogWriter.kt      appends one JSON object per fix
android/.../service/FixLogEntry.kt       one line of fixes.jsonl
android/.../service/RecordingModels.kt   the native half of the contract
ios/GpsTrackerModule.swift               stub module
ios/GpsTracker.podspec
```

No `package.json` on purpose: the module is autolinked from `modules/` via
`app.json` → `expo.autolinking.nativeModulesDir`, so it has no lockfile entry
and no symlink to rot.

## The API

```ts
getCapabilities(): Promise<{ canRecord; hasBarometer; canExemptBattery }>
startRecording(options: { profile; capture }): Promise<RecordingMeta>
pauseRecording(): Promise<void>
resumeRecording(): Promise<void>
stopRecording(): Promise<RecordingSummary>
getRecordingState(): Promise<RecordingState>      // survives a JS reload
getSessionMeta(sessionId?): Promise<RecordingMeta> // newest session when omitted
listSessions(): Promise<RecordingMeta[]>
markSessionSaved(sessionId, activityId): Promise<void>
discardSession(sessionId): Promise<void>
// events: onStateChange (the truth about the phase), onLocationUpdate (display only)
```

Errors carry codes: `E_SESSION_ACTIVE` (a recording is already running),
`E_NO_SESSION`, `E_LOCATION_UNAVAILABLE`.

## What the log looks like

`meta.json` (written at start, completed at stop):

```json
{
  "sessionId": "s-1750000000000-1",
  "profile": "walking",
  "startedAtUtcMs": 1750000000000,
  "endedAtUtcMs": 1750000600000,
  "deviceUtcOffsetSeconds": 7200,
  "capture": { "intervalMs": 2000, "minDistanceM": 2.5, "accuracyCeilingM": 15, "useBarometer": true },
  "pauses": [{ "startUtcMs": 1750000300000, "endUtcMs": 1750000400000 }],
  "fixCount": 30,
  "logUri": "file:///data/user/0/com.example.offlinefitness/files/recording/s-.../fixes.jsonl",
  "libraryVersion": "0.1.0",
  "savedActivityId": null
}
```

`fixes.jsonl` — one object per line, flushed every 10 fixes and on
pause/stop:

```json
{"t":1750000001000,"lat":45.123456,"lon":6.654321,"ele":420.5,"geoid":45.2,"pressure":1013.2,"hAcc":4.5,"vAcc":6.0,"speed":1.4,"bearing":87.0,"source":"fused","accepted":true}
```

`accepted` is metadata: the replay re-derives acceptance from `capture`, so a
different live filter would still produce the same activity.

## Calling it from the app

`src/features/recording/services/gpsTracker.ts` is the single import point (the
module lives outside `src/`, and the relative path should not be repeated
across the app). The app owns the permissions: foreground location goes
through `expo-location`, `POST_NOTIFICATIONS` through `PermissionsAndroid`
(D5). The module asks for nothing.

## Verifying by hand

```bash
npx expo prebuild --platform android
npm run android:dev            # debug build + Metro
# Record tab → pick a profile → Start recording → grant location
# the live tiles move, the notification shows the distance
adb shell dumpsys activity services com.example.offlinefitness | grep -i tracker
adb shell run-as com.example.offlinefitness ls files/recording
```

Compile only, without a device:

```bash
cd android && ./gradlew :gps-tracker:compileDebugKotlin
```

The iOS pod resolves with:

```bash
npx expo prebuild --platform ios   # runs pod install
```

## Rules that are easy to break

- **Never copy `../GpsLib/gpslogger/`** into this repo: it is GPLv2 and this app
  is MIT.
- **No `ACCESS_BACKGROUND_LOCATION`**: a location FGS started from the visible
  app runs on the while-in-use grant.
- **The service owns the session.** Do not cache recording state in the module;
  the React instance can be destroyed mid-recording.
- **No fix arrays over the bridge** (D11): native writes the log, TypeScript
  reads it in chunks.
- **No canonical arithmetic in Kotlin**: the replay owns distance, gain, pace
  and auto-pause. Native reports what the platform measured.

## iOS contributions

The stub is the contract: implement the same functions behind `CoreLocation`,
and validate against the replay fixtures in `__tests__/recording/` (Phase 3).
Simulator GPX routes make that developable without hardware.
