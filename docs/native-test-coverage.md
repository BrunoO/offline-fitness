# Native (Kotlin) Test Coverage — Accepted Gap

## Context

The GPS recording subsystem was ported from `../GpsLib` into this project
(`modules/gps-tracker` + `src/features/recording`). `../GpsLib` shipped Kotlin
unit tests for `ActivityProfile`, `AltitudeProcessor`, `LocationFilterPipeline`,
`GpxWriter`, `SessionStorage`, and `SplitFeedbackManager`. The ported module
ships **no Kotlin tests at all**. This document records why that is an
accepted, deliberate gap rather than an oversight.

## Decision

**Accept the gap.** Do not port the Kotlin unit tests into this repository.

## Rationale

1. **The arithmetic moved to TypeScript and is tested there.** Decision D2 in
   `docs/recording-plan.md` moved filtering, altitude fusion, auto-pause, and
   splits into the canonical TS replay so it lives in the analysed/tested tree
   (outside Sonar's `**/android/**` exclusion). The GpsLib Kotlin tests were
   re-implemented as Jest specs:

   | GpsLib Kotlin test | Ported TS equivalent |
   |---|---|
   | `ActivityProfileTest` | `__tests__/recording/profiles.spec.ts` |
   | `AltitudeProcessorTest` | `__tests__/recording/replaySession.spec.ts` |
   | `LocationFilterPipelineTest` | `__tests__/recording/replaySession.spec.ts` |
   | `GpxWriterTest` | `__tests__/shared/exportData.spec.ts` |
   | `SessionStorageTest` | `__tests__/recording/fixLog.spec.ts` |
   | `SplitFeedbackManagerTest` | `__tests__/recording/splits.spec.ts` |

   The logic that GpsLib tested is covered — arguably better, since it runs in
   Jest with fast feedback and is inside the Sonar gate.

2. **No Kotlin test runner exists in this repo.** Jest is configured with the
   `jest-expo` preset; there is no Robolectric or instrumented-test harness.
   Adding one is a separate build-pipeline project (Gradle test config, CI
   emulator provisioning), not a copy-paste.

3. **The native side is now thin glue.** After the port, `TrackingService`
   mostly wires the location provider, wake lock, notification, and fix-log
   writer. The interesting decisions live in TS. What remains native is largely
   Android-framework interaction that cannot be meaningfully asserted without a
   device.

4. **The GpsLib tests were Android-instrumented** (Mockito over `Context`/
   `Location`). Porting them verbatim would require the same harness, which
   sits outside the Sonar gate anyway.

## What is genuinely untested (the real risk)

- Provider fallback (fused → platform `LocationManager`).
- GPS-lost detection (10 s threshold).
- Notification action buttons (pause/resume/stop from the shade).
- Wake-lock acquire/release lifecycle.
- `SessionStorage` atomic write + active-session id persistence.
- `FixLogWriter` flush-every-10 + trailing-line tolerance (read side is
  covered by `fixLog.spec.ts`).

These are the areas where a regression would be silent today.

## Mitigations in place

- Native capture is covered by **manual testing** (see the manual testing
  checklist in `AGENTS.md`).
- The TS replay tests exercise the algorithmic core end-to-end over fixture
  fix logs.
- Native changes are rare and reviewed by hand; the thinness of the native
  layer keeps the blast radius small.

## Reversal path (if regressions appear)

1. Add a Robolectric-based unit test harness to `modules/gps-tracker`
   (Gradle `testImplementation` for Robolectric + JUnit, a `test` source set).
2. Start with `SessionStorage` and `FixLogWriter` (pure I/O, easiest to assert).
3. Add CI step running `./gradlew test` for the module.
4. Optionally add an instrumented smoke test (Espresso/UI Automator) that
   starts a recording and verifies a fix lands.

Until then, this gap is accepted and documented.
