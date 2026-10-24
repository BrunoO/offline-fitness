# Review: heart-rate data structures & BLE heart-rate module

**Date:** 2026-10-23
**Branch:** `feat/heart-rate-data-structures`
**Scope:** 5 commits on top of `main` @ `eabeac6` — 39 files, +1744 / −56

```
0f88def feat: add activity-detail HR chart and max-HR setting (Scope 1 and 5)
37b2e21 feat: phase 5 HR data quality (RR validation, contact gaps, HR summary UI)
a5e67b5 feat: phase 5 HR data quality (RR validation, contact gaps, HR summary in UI, replay tests)
7e689d5 feat: phase 4 heart-rate robustness and UX (reconnect, RSSI, manual id, battery, empty state)
90fc3b4 feat: add BLE heart-rate detection, connection, and Record screen UI
9853706 feat: add heart-rate data structures for Polar H10 recording
```

## Verdict

Good structure and genuinely useful scaffolding: the local Expo module mirrors
`modules/gps-tracker` faithfully, the stream codec change is backward *and*
forward compatible, and the JS side carries real tests. Not mergeable as-is:
two native-parsing defects (one of which can crash the app), a data-model flaw
in how "no heart rate" is represented, and a Definition of Done that was never
verified for this branch.

## What is solid

- **Module layout** (`modules/heart-rate/`): `build.gradle`, podspec,
  `expo-module.config.json` and the iOS capability stub all follow the existing
  `modules/gps-tracker` pattern; autolinks via Expo's default `./modules` scan.
- **Codec compatibility** is thought through: the trailing-series trick keeps
  `version 1`, older readers ignore the extra bytes (the pre-change decoder only
  rejects `byteLength < expectedBytes`), newer readers derive the count. Existing
  backups and older app builds both survive.
- **Wiring is complete end to end**: `compressStreamSet`, `gpxParser`,
  `replaySession`, `buildRecordedActivity`, `writeStreamFile` →
  `readStreamFile`/`decodeStreamBytes` → `ActivityAnalysisView`.
- **Failure-tolerant log reader** (`heartRateLog.ts`): chunked read, per-line
  `try/catch`, truncated tail skipped instead of losing the recording — matches
  the `fixLog.ts` conventions.
- **Verification run for this review:** `tsc --noEmit` clean, Jest **478/478
  pass**, `check:imports` and `check:mobile-only` pass, lint **0 errors**.

---

## Blocking

### 1. Sensor-contact bits are read wrong per the BLE spec (FIXED)

`modules/heart-rate/android/src/main/java/com/gpslib/heartrate/HeartRateModule.kt:210-211`

Heart Rate Measurement flags: bit 1 (`0x02`) = contact **detected**, bit 2
(`0x04`) = contact **supported**.

```kotlin
val contactSupported = (flags and 0x06) != 0                 // true if *either* bit
val contact = if (contactSupported) (flags and 0x04) != 0 else null  // "supported", not "detected"
```

A strap reporting "detected, support flag clear" (`0x12`) yields `contact = false`
→ `heartRate.ts` drops a valid sample. A strap reporting "supported but not
detected" (`0x14`) yields `true` → a sample the sensor says is invalid gets logged.
The Polar H10 (`0x16`) happens to work, so H10-only manual testing will not
surface this.

### 2. `parseHr` has no length guards → app crash on malformed data (FIXED)

`HeartRateModule.kt:187-208`

With the 16-bit flag set and a 2-byte payload, `data[offset + 1]` indexes
`data[2]` → `ArrayIndexOutOfBoundsException` on the GATT callback thread, an
uncaught crash (no `try/catch` around `parseHr`). On a branch whose phase 4 is
titled "heart-rate robustness", a truncated notification from any
non-conforming strap taking the app down was the highest-severity finding here.

### 3. `0` used as the "no heart rate" sentinel (FIXED)

`replaySession.ts` (`nearestHeartRate`), `gpxParser.ts` (`toStreamSet`)

`nearestHeartRate` returned `0` for any fix without a sample within ±10 s, and
the GPX parser pushed `0` for every point without `<hr>`:

- the activity-detail chart plotted those zeros, so the HR line dived to 0 bpm
  and the y-domain collapsed (a 30 s sensor gap looked like cardiac arrest);
- the stored `average_heartrate`/`max_heartrate` (computed from samples, ignoring
  zeros) disagreed with the visible chart — two sources of truth.

### 4. The HR count is derived from "whatever bytes remain"

`streamCodec.ts:32, 128-145, 210-213`

`FLAG_HAS_HEARTRATE` is written by the encoder and **never read** by the decoder;
instead every trailing 4-byte word is assumed to be heart rate. The next series
appended to this format will be silently decoded as bpm by every build from this
branch. `__tests__/shared/streamCodec.spec.ts:70-83` currently codifies that by
asserting padding becomes `heartrate: [80]`. Fix: honour the flag and require
`byteLength === expectedBytes + count * 4`, or add an HR count field and bump the
version.

### 5. The generated Android manifest overrides the module's correct declarations (FIXED)

`app.json` declared `BLUETOOTH`/`BLUETOOTH_ADMIN` **without** `maxSdkVersion`, and
`BLUETOOTH_SCAN` **without** `usesPermissionFlags="neverForLocation"`. The app
manifest wins the merge, so
`modules/heart-rate/android/src/main/AndroidManifest.xml` (which declares both
correctly) was defeated — confirmed in the prebuilt
`android/app/src/main/AndroidManifest.xml`. Play Console warns on unbounded legacy
Bluetooth permissions for modern target SDKs. Fix: let the module manifest stay the
single source of truth (this repo already hit this class of conflict with the
`tools:replace` on `READ_EXTERNAL_STORAGE`).

### 6. The Sonar gate did not cover this branch

`scripts/sonar_gate.sh` returned PASSED, but the last three analyses on
SonarCloud are all `branch=main` (latest `eabeac6`, the branch point), and
`scripts/run_sonar_locally.sh` (needed for `--scan`) is gitignored and absent from
the worktree. DoD item 3 is **unverified**, not met; per AGENTS.md rule 4 that is a
blocked status. The branch also adds 4 new lint warnings (`HeartRateCard`
complexity 20 + 2 nested ternaries, `encodeStreamSet` complexity 17), the
prevention classes the repo treats as first-line defence.

---

## Should fix

7. **Permission gate prompts on every launch** — `useHeartRatePermissions.ts:7`:
   `granted` starts `false` and is only set inside `requestPermissions()`; no
   `PermissionsAndroid.check` on mount, so an already-granted user sees the
   "Bluetooth permission is required" card on every visit.
8. **Notification-initiated stop skips HR bookkeeping** — `useRecording.ts:161-205`
   vs `:291-310`: the external-stop branch neither `detachRecording()`s nor
   computes `heartRateSummary`, so samples keep appending to a finished session's
   log and the "HR avg/max" tile disappears only on that path.
9. **`maxHeartRate` is a write-only setting** — `SettingsModal.tsx:60,75,139,295-310`:
   nothing reads the key, the label promises zones that do not exist, the raw
   string is persisted on every keystroke.
10. **`LiveStats.heartRateBpm` is dead plumbing** — `RecordingModels.kt:55,80`,
    `GpsTrackerModule.kt:485,497`, `GpsTracker.types.ts:72`, `useRecording.ts`
    (three `heartRateBpm: null` literals). Nothing native assigns it.
11. **No user-visible error surface** — `heartRate.ts` swallows scan/connect
    errors into `simpleLogger`; `connectionState: 'error'` renders as "Not
    connected" in `HeartRateCard.tsx`.
12. **Native lifecycle** — no `OnDestroy()` in `HeartRateModule.kt`, no
    `scope.cancel()`: the GATT client leaks across JS reloads and the strap stays
    connected to a dead module instance. `kotlinx.coroutines` is imported but not
    declared in `modules/heart-rate/android/build.gradle` (transitive only).
13. **Reconnect gives up silently** — `heartRate.ts`: the retry timer's failure
    path is a no-op, `reconnectTimer` is not cleared after firing, and no UI signal
    is emitted after 3 attempts.
14. **Feature-layering / barrel violations** — `src/features/heart-rate` has no
    `index.ts`, callers deep-import the service and the card, and the heart-rate
    service reaches into `@/features/recording/services/heartRateLog` while
    recording imports heart-rate back.
15. **CSV import never populates the new HR fields** — `activityMapper.ts` maps no
    heart-rate columns, so imported activities (the primary ingestion path) always
    have `average_heartrate`/`max_heartrate` `undefined`.
16. **Docs incomplete / stale** — 3 of 5 commits undocumented; `docs/status.md`
    still says "Display work deferred" after the chart commit; the phase-2 entry
    claims "Data capture uses existing heart-rate log" (the log is new in the next
    commit); `docs/architecture.md` was not touched despite a new feature folder,
    native module, import paths and a cross-feature dependency; the `AGENTS.md`
    feature tree omits `heart-rate/`.
17. **Test quality** — `heartRateService.spec.ts` runs against the singleton and is
    order-dependent ("starts with disconnected state" only passes first); no
    coverage for reconnect, persisted auto-connect, the external-stop detach path or
    the contact-bit parsing; `parseHr` is a pure function that a JVM test could
    cover.

## Nits

- `ActivityAnalysisView.tsx`: the Swim workaround (an *altitude* hack) also
  suppresses the HR chart and HR data prep for swims.
- `ActivityAnalysisView.tsx`: `timeData[i]` indexed by `heartRateData.length`
  without a length check → silent `x: NaN` on any mismatch.
- `HeartRateCard.tsx`: ~130 lines of inline styles where every screen-level
  component uses `createStyles(theme)`; `borderColor: theme.textMuted` on the
  `TextInput` uses a text token for a border.
- `HeartRateCard.tsx`: "Forget device" calls `disconnect()`, identical to
  "Disconnect"; `heartRateService.forget()` is dead code.
- `HeartRateCard.tsx`: "No heart-rate sensors found" only renders while
  `scanning`, but the native scan auto-stops after 10 s, so it vanishes instead of
  reporting the empty result.
- `useRecording.ts`: `discard()` resets `summary` but not `heartRateSummary`.
- `heartRateLog.ts`: `new TextDecoder().decode(bytes)` per chunk without
  `{ stream: true }` — safe only because the JSONL payload is ASCII.
- `streamCodec.ts`: the layout doc comment still lists three series and flags bits
  0-2 while the header now carries `FLAG_HAS_HEARTRATE`.
- Two commits share the identical subject (`a5e67b5`, `37b2e21`) — squash before
  the PR.
- `app.json`: `NSBluetoothAlwaysUsageDescription` is added although iOS is a hard
  stub (`canScan: false`).

---

## Follow-up fixes applied in this session

| # | Finding | Change |
| --- | --- | --- |
| 1 | Contact bits | `parseHr` reads supported (`0x04`) and detected (`0x02`) separately |
| 2 | `parseHr` bounds | size guards before every read; the GATT notify path is wrapped in `try/catch` + `Log.e` |
| 3 | `0` sentinel | aligned HR series is `(number \| null)[]` end to end; `null` = no reading; chart skips gaps; codec maps `null` ↔ a documented on-disk marker |
| 5 | Android permissions | Bluetooth permissions removed from `app.json`; the module manifest is the single source of truth |

Findings 4 and 6–17 remain open.

## Suggested order for the rest

1. Codec contract (#4) — honour the flag / exact length, or a version bump.
2. Permission `check()` on mount, external-stop detach, error surfacing
   (#7, #8, #11).
3. Drop or wire `maxHeartRate` and `LiveStats.heartRateBpm` (#9, #10).
4. Barrel + layering cleanup, native `OnDestroy`, retry fixes (#14, #12, #13).
5. Docs for all five commits (`status.md`, `architecture.md`, `AGENTS.md`) and a
   real `sonar_gate.sh --scan` from a checkout that has the scanner script
   (#16, #6).
