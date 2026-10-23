# Crash Recovery: Live Resume vs. Finalize-Only

## Context

The GPS recording subsystem was ported from `../GpsLib` into this project
(`modules/gps-tracker` + `src/features/recording`). One deliberate change
during the port concerns what happens when the OS kills the app process
mid-recording. This document records the trade-off so it can be revisited
without re-deriving the reasoning.

## What GpsLib did — live resume

`TrackingService` was a started service with `START_STICKY`. If Android killed
the process (low memory, Doze, OEM aggression), the OS recreated the service
and `onStartCommand` detected the persisted active session, calling
`recoverSession()`. That method restored all stats, profile, custom options,
pause budgets and elevation totals; re-registered the location provider and
NMEA listener; rebuilt the GPX writer in append mode; and absorbed the
"death gap" (time between process death and restart) into the auto-paused or
manual-paused bucket so moving time stayed frozen. The recording continued
live after the user reopened the app.

## What the port does — finalize-only

The ported `TrackingService` has **no `recoverSession()` method** and
`onStartCommand` does not check for an active session. If the process dies:

- The service is gone; recording stops.
- The session directory (`meta.json` + `fixes.jsonl`) remains on disk, and the
  active session id stays in `SharedPreferences`.
- On next app launch, `listUnfinishedSessions()` (`src/features/recording/services/fixLog.ts`)
  finds sessions with no `savedActivityId` and no live service behind them, and
  the UI offers **Save** or **Discard** — replaying the partial fix log into an
  activity.

The user can still rescue the partial track, but the recording does not
continue live. The death gap is not absorbed (elapsed time = last fix − start,
or repaired from the last fix's `t`).

## Why the change (intentional, per `docs/recording-plan.md` §3.7)

- The plan's recovery model is "offer to save or discard," not "silently
  resume." This removes a large, fragile code path (state restoration, provider
  re-registration, GPX append, death-gap accounting) from the native side, which
  is outside the Sonar/test gate.
- The fix log is the contract: as long as fixes were flushed (every 10, and on
  pause/stop), the partial track is fully recoverable as an activity. A kill
  loses at most a handful of fixes.
- It matches the app's mental model: a recording is a single foreground
  session; if the OS kills it, the user decides whether the partial result is
  worth keeping.

## Trade-off

- **Gained**: simpler native code, no GPX append/recovery, no death-gap math,
  testable replay path.
- **Lost**: a recording interrupted by an aggressive OEM kill cannot be
  continued — it must be saved as a shorter activity (or discarded). For a
  cyclist whose phone dies at 40 km, the first 40 km are recoverable but the
  rest is lost.

## If you wanted live resume back

Port `recoverSession()` into the ported `TrackingService`, re-add death-gap
absorption into `meta.json` pause accounting, and re-register the
provider/altitude pipeline on `onStartCommand` when
`TrackingSession.phase == IDLE && activeSessionId != null`. That's a
substantial re-add and was explicitly dropped; weigh it against the OEM-kill
frequency in your user base.
