# gps-tracker — local Expo module

Native half of the GPS recorder (roadmap item 4). The design lives in
[`docs/recording-plan.md`](../../docs/recording-plan.md); this file covers only
what exists in the tree today.

## Status: Phase 0 (skeleton)

Android: a location-typed foreground service starts from the module, shows a
notification, runs while the app is backgrounded and emits an `onTick` event
once a second. **It captures nothing** — the providers, the fix log (`meta.json`
+ `fixes.jsonl`) and the session state machine arrive in Phases 1–2 and replace
`TrackingService`'s ticker.

iOS: a compiled stub. `getCapabilities()` answers `canRecord: false` instead of
throwing, so the JS bundle is platform-agnostic (D6/D7).

## Layout

```
expo-module.config.json                  module registration (android FQCN, apple class)
src/GpsTrackerModule.ts                  typed facade: calls + event subscription
src/GpsTracker.types.ts                  Capabilities, Tick, event map
android/build.gradle                     expo-module-gradle-plugin
android/src/main/AndroidManifest.xml     FGS permissions + <service>
android/.../GpsTrackerModule.kt          AsyncFunction / Events / lifecycle hooks
android/.../service/TrackingBridge.kt    service → module seam (service owns state)
android/.../service/TrackingService.kt   Phase 0 stub (ticker + notification)
ios/GpsTrackerModule.swift               stub module
ios/GpsTracker.podspec
```

No `package.json` on purpose: the module is autolinked from `modules/` via
`app.json` → `expo.autolinking.nativeModulesDir`, so it has no lockfile entry
and no symlink to rot.

## Calling it from the app

`src/features/recording/services/gpsTracker.ts` is the single import point (the
module lives outside `src/`, and the relative path should not be repeated
across the app). The app owns the location permission; the module asks for none
(D5) — on Android 14+ a location-typed foreground service cannot start without
it, so `useRecording` requests it first.

## Verifying by hand

```bash
npx expo prebuild --platform android
npm run android:dev            # debug build + Metro
# Record tab → Start recording → grant location → ticks should increment
adb shell dumpsys activity services com.example.offlinefitness | grep -i tracker
```

Compile only, without a device:

```bash
cd android && ./gradlew :gps-tracker:compileDebugKotlin
```

## Rules that are easy to break

- **Never copy `../GpsLib/gpslogger/`** into this repo: it is GPLv2 and this app
  is MIT.
- **No `ACCESS_BACKGROUND_LOCATION`**: a location FGS started from the visible
  app runs on the while-in-use grant.
- **Service owns the session.** Do not cache recording state in the module; the
  React instance can be destroyed mid-recording.
- **No fix arrays over the bridge** (D11): native writes the log, TypeScript
  reads it in chunks.

## iOS contributions

The stub is the contract: implement the same `AsyncFunction`s behind
`CoreLocation`, and validate against the replay fixtures in
`__tests__/recording/` (Phase 3). Simulator GPX routes make that developable
without hardware.
