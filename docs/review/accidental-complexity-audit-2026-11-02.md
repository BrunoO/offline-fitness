# Accidental Complexity Audit — 2026-11-02

Audit of the Offline Fitness codebase against `docs/accidental-complexity-study.md`
(translation of the USN_WINDOWS accidental-complexity ledger + React Native /
TypeScript-specific traps). Performed at scout/verify level from grep, file-size,
and structural signals; each finding cites file:line. No code changed by this audit.

## Summary

- **Overall:** the codebase is in good shape against most traps. The C++
  traps that do not apply (test doubles in `src/`, static classes, I-prefixed
  interfaces, hot-path hooks, platform Big-O divergence, duplicate concurrency)
  are all clean. The remaining risk is concentrated in three areas:
  1. **God units** (large orchestrator files/hooks) — the same items already
     tracked by `docs/lint-cleanup-plan.md` WP3/WP4 and the memoization audit.
  2. **Stringly-typed navigation and ids** — route names and activity ids are
     bare strings; no branded types or typed route map.
  3. **Non-exhaustive switches** — no `assertNever` helper; switches over
     `StatKey`/`Profile` rely on TS control-flow without an explicit guard.
- **Lint:** 0 errors, 14 `no-await-in-loop` warnings (all documented WP5 sites).
- **TypeScript:** `tsc --noEmit` passes (0 errors).
- **Imports:** `check:imports` and `check:mobile-only` pass.
- **Sonar:** last known state 0 open (not re-run; requires network + token).

## Audit by trap (from `docs/accidental-complexity-study.md`)

### C++-translated traps

| # | Trap | Status | Evidence / notes |
| --- | --- | --- | --- |
| 1 | Silent fallback degradation | **Clean** | Only 2 platform file pairs (`MiniMapComponent`, `MapsScreen`); `Platform.select` used 12×, all styling (shadows/elevation). No algorithmic divergence. |
| 2 | Seam role creep / god units | **Open** | `RecordingScreen.tsx` 1252 lines, `useRecording.ts` 711, `ActivityAnalysisView.tsx` 879, `HomeScreen.tsx` 816, `DetailsScreen.tsx` 1175 (post-refactor). These mix data, layout, and side effects. Tracked by lint plan WP3/WP4. |
| 3 | Layering inversion | **Accepted** | `shared/` imports `features/` in 8 files (`CustomDrawer`, `SettingsModal`, `trackComparison`, `exportData`, `streaks`, …). Documented as UI composition necessity. Portable import core guarded by `importCorePortability.spec.ts`. |
| 4 | Test doubles in production | **Clean** | `grep Fake\|Mock\|Stub src/` → 0 hits. |
| 5 | Hot-path test hooks | **Clean** | `__DEV__` appears once in `src/`, not in any loop/render path. |
| 6 | Degenerate static classes | **Clean** | Only 3 `export class`: `SplitDetector`, `LiveSlopeCalculator`, `WebDavTransportError` — all stateful. |
| 7 | Speculative generalisation | **Clean-ish** | No `interface I…`. 143 interfaces; generics (`readChunkedJsonl`, `runWithConcurrency`, `sampleCoordinates`) each have multiple callers. |
| 8 | Duplicate concurrency machinery | **Clean** | Single `runWithConcurrency` in `backupSync.ts`; no competing pools. |
| 9 | Pointer plumbing | **Clean** | No function takes ≥5 params; max found is 4 (`haversineMeters`, `writeLatLngSeries`). |
| 10 | Speculative error handling | **Clean** | No `safeExecute`/`safeCall`/`withErrorHandling` wrappers. |
| 11 | Manual memoisation noise | **Tracked** | 173 `useMemo` + 94 `useCallback`; audit in `docs/memoization-audit.md`. Prune with profiling. |

### React Native / TypeScript-specific traps (§3.3 of the study)

| Trap | Status | Evidence / notes |
| --- | --- | --- |
| Type erosion (`any`, `as`, `@ts-ignore`) | **Clean** | 1 `any` (none in product code beyond constants), 1 justified `@ts-expect-error` (FlashList v2 ref, `DetailsScreen.tsx:1140`). `as never` used 3× for icon names (`RecordingScreen.tsx:209/351/652/672`) — low risk but could be typed. |
| Primitive obsession / stringly-typed IDs | **Open** | `id: string`, `type: string` pervade types; no branded types. Storage keys centralised (`STORAGE_KEYS`), but route names (`'Details'`, `'Logs'`, `'Profile'`, `'Record'`, `'RecordsScreen'`, `'Stats'`) are bare literals in `navigation.navigate(...)`. |
| Derived state stored as state | **Clean** | `HomeScreen` converted `weeklySummary`/`recentAchievements` and `dayStreak`/`weekStreak`/`goalWeekStreak` to `useMemo`. Other `useState`+`useEffect`-set patterns (`useRecording` unfinished list, `BackupSection` restore reload, `ActivityAnalysisView` trend line, `ProfileScreen` load) are genuine side effects, not derived state. |
| Context value not memoised | **Clean** | `ActivitiesContext` splits data/sync and memoises both; `ManualEntryContext`, `SettingsContext`, `ThemeProvider` use `useMemo`. |
| Nested component definitions | **Clean** | No component declared inside another component (only handlers). |
| Index as list key | **Clean** | No `key={index}` / `key={i}` found. |
| Floating promises | **Clean** | Enforced as hard error by `eslint.config.mjs`. |
| Stale closures in effects/callbacks | **Watch** | Recording tick timers and HR sampling intervals; cleanup present in sampled sites (e.g. `HomeScreen` clearInterval). Verify remaining timer sites. |
| Effect-as-event-handler | **Watch** | `useRecording` orchestrates side effects; candidate for splitting event handlers out of effects. |
| Platform `if` scattered in logic | **Clean** | `Platform.OS` used 4× (permissions/maps); styling uses `Platform.select`. |
| Hardcoded dimensions/colours | **Clean** | Colours only in `src/theme/`; `useTheme()` enforced by AGENTS.md. |
| Missing cleanup (timers/listeners) | **Clean** | Audited all 17 `setTimeout`/`setInterval` sites across 9 files (`MapsScreen.android`, `MiniMapComponent.android`, `HomeScreen`, `heartRate.ts`, `webdavTransport`, `StatsTab`, `exportData`, `RecordingScreen`, `useRecording`): every component/hook site returns a cleanup (`clearTimeout`/`clearInterval`); service sites (`webdavTransport`, `heartRate`) clear on completion/disconnect; the `exportData` site is a one-shot cooldown in an async loop. No leaks found. |
| Unsafe list virtualisation | **Clean** | `FlashList` used for activity lists. |
| Over-broad global state | **Watch** | `useRecording` (711 lines) holds UI-local state alongside recording orchestration. |
| Stringly-typed navigation/storage | **Open** | Route names are bare literals (see above). Storage keys centralised (good). |
| Memoisation as accidental complexity | **Tracked** | See `docs/memoization-audit.md`. |
| Generic over-engineering | **Clean-ish** | Few generics, each multi-caller. |
| Non-exhaustive switches | **Open** | `switch (key)` over `StatKey` (`RecordingScreen.tsx:568`) and `switch (profile)` (`buildRecordedActivity.ts:9`) have no `assertNever` default; no `assertNever` helper exists anywhere. New union members could silently fall through. |
| `eslint-disable` accumulation | **Clean-ish** | All 15 disables are the documented await-in-loop sites (WP5). No other disables. |
| Premature async abstraction | **Clean** | No generic `safeExecute`/`safeCall` wrappers. |

## Top findings (prioritised)

1. **God units** (medium risk) — `RecordingScreen.tsx` (1252), `useRecording.ts` (711),
   `ActivityAnalysisView.tsx` (879), `HomeScreen.tsx` (816), `DetailsScreen.tsx` (1175).
   Already in lint plan WP3/WP4; recommend also splitting `useRecording` into
   recording-state / HR / save hooks.
2. **Stringly-typed route names** (low risk) — 6 bare route literals in
   `navigation.navigate(...)`. Recommend a typed route map (e.g. `RootDrawerParamList`
   already exists; ensure all call sites use it and add a `RouteName` const map).
3. **Non-exhaustive switches** (low–medium risk) — add an `assertNever` helper and
   apply it to `StatKey` and profile switches so new members fail at compile time.
4. **`as never` icon casts** (low risk) — 3 sites in `RecordingScreen.tsx`;
   replace with a typed icon-name union or a lookup map.
5. **Await-in-loop** (medium risk, highest effort) — 14 sites; WP5 plan (refactor
   to chunked `Promise.all` or justified scoped disable) still pending.
6. **Memoisation pruning** (low risk, ongoing) — profile before removing the
   173 `useMemo`/94 `useCallback`.

## Already clean / strengths worth preserving

- Split context pattern (`ActivitiesDataContext` vs `ActivitiesSyncContext`) prevents
  whole-tree re-renders during sync.
- Portable import core guard test (`importCorePortability.spec.ts`) enforces the
  layering boundary automatically.
- Import hygiene (`check:imports`) and mobile-only guard (`check:mobile-only`) pass.
- No test doubles, no static classes, no `any`, no `index` keys, no nested
  components — these invariants are holding.
- Scoped `eslint-disable` discipline (only await-in-loop, all 15 documented).

## Recommended next steps

1. Finish lint plan WP4 (complexity: `buildManualActivity`, `BackupSection`).
2. WP5 (await-in-loop) — one file per commit with tests.
3. WP3 (extract `useFilteredActivities` from DetailsScreen).
4. Add `assertNever` and apply to `StatKey`/profile switches.
5. Introduce a typed route-name map and replace bare literals.
6. Split `useRecording` (new work package).
7. Profile and prune unjustified memoisation per `docs/memoization-audit.md`.
8. Re-run `scripts/sonar_gate.sh --scan` before closing any of the above.

## Caveats

- Scout/verify-level: findings based on grep/file-size signals, not line-by-line
  review. Each "Open/Watch" item needs a targeted read before action.
- Sonar gate not re-run (network + `SONARQUBE_TOKEN` required).
- `docs/status.md` not updated by this audit (no code changed).