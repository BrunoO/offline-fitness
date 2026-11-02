# Accidental Complexity: Translating the USN_WINDOWS Concept to Offline Fitness

**Date:** 2026-11-02
**Source:** `../USN_WINDOWS/.agents/rules/accidental-complexity-prevention-cpp.md`,
`../USN_WINDOWS/.opencode/skills/tech-debt/SKILL.md` (Lessons Ledger)
**Target:** Offline Fitness — React Native / Expo / TypeScript (Android + iOS)

## 1. What "accidental complexity" means in the source project

In `USN_WINDOWS` (a C++ desktop search app), *accidental complexity* is not the
complexity inherent to the problem domain, but complexity introduced by
implementation choices: premature abstractions, seam bloat, layering inversions,
test machinery leaking into production, hot-path hooks, degenerate static
classes, speculative generalisation (YAGNI violations), duplicated concurrency
primitives, loose pointer plumbing, speculative error handling, and silent
fallback degradation of algorithmic complexity.

The source project codifies these as a **Lessons Ledger** — ten concrete traps,
each with a "what happened here" anecdote and a mandatory invariant — plus a
six-question **Pre-refactoring Checklist**. The ledger is treated as a
non-negotiable invariant set, enforced by SonarQube rules, clang-tidy, and
code review.

This document translates that concept to Offline Fitness's stack and audits
the current codebase against it.

## 2. Translation principle

The *concept* transfers unchanged: complexity that is not demanded by the
problem, introduced by our own choices, and removable without changing
observable behaviour. What changes is the *vocabulary* of each trap, because
the runtime, type system, and component model differ:

| C++ / native trap | React Native / TypeScript analogue |
| --- | --- |
| Silent fallback degradation (container Big-O changes across `#ifdef`) | Platform branches (`.android.tsx`/`.ios.tsx`, `Platform.select`) or `__DEV__` branches where one path is O(n) and the other O(1); divergent algorithmic behaviour between iOS and Android |
| Seam role creep / bloated host (`ShortcutHost` doing crawl work) | A hook or context provider accumulating unrelated responsibilities (recording + HR + splits + save + permissions in one 700-line hook); a component that is both view and orchestrator |
| Layering inversion (`src/path` reaching into `src/index`) | `shared/` (leaf layer) importing from `features/`; portable import core (`strava-import`) pulling in RN value imports |
| Test doubles in production tree | `Fake*`/`Mock*`/`Stub*` classes or fixtures under `src/` |
| Hot-path test hooks (polling flags per candidate) | `__DEV__` / feature-flag checks inside `renderItem`, `.map`, `.filter`, or per-frame animation callbacks |
| Degenerate static classes (deleted ctor + only static methods) | TS classes with only `static` members, or `Manager`/`Handler`/`Utils` objects that are really namespaces |
| Speculative generalisation (single-impl `ISomething`) | Interfaces / generics / abstract base classes with a single concrete user; "for future use" props |
| Duplicate concurrency machinery (two `ThreadPool`s) | Multiple ad-hoc concurrency primitives (`Promise.all` wrappers, worker queues, mutex-like guards) doing the same job |
| Pointer plumbing vs value types | Functions taking 5+ loose scalar parameters instead of a cohesive options object |
| Speculative error handling (`SafeExecuteWithLogging<T>`) | Generic `try/catch` wrappers, `safeExecute` helpers with no concrete callers |
| Manual memoization as accidental complexity | `useMemo`/`useCallback`/`React.memo` added without evidence, fighting the React Compiler (see `docs/memoization-audit.md`) |

## 3. Audit of Offline Fitness against the traps

### 3.1 Already clean (verified by grep / file scan)

- **Test doubles in production tree:** none. `grep -rn "Fake\|Mock\|Stub" src/` returns no hits.
- **Degenerate static classes:** none. Only three `export class` declarations exist
  (`SplitDetector`, `LiveSlopeCalculator`, `WebDavTransportError`), all stateful.
- **I-prefixed / speculative interfaces:** none (`interface I…` count = 0).
- **Hot-path test hooks:** `__DEV__` appears exactly once in `src/`, and not inside
  any loop/render path.
- **Platform fallback degradation:** only two platform-specific file pairs
  (`MiniMapComponent`, `MapsScreen`); `Platform.select` usages are confined to
  styling (shadows/elevation), not algorithmic paths. No Big-O divergence found.
- **Duplicate concurrency machinery:** a single `runWithConcurrency` helper in
  `backupSync.ts`; no competing pools.
- **Import hygiene:** `npm run check:imports` reports 0 duplicate/scattered imports;
  `npm run check:mobile-only` passes.
- **Manual memoization:** tracked and justified in `docs/memoization-audit.md`;
  `React.memo` is not used anywhere. The compiler is the authority.

### 3.2 Open candidates (accidental complexity still present)

1. **Seam role creep / god units**
   - `src/features/recording/hooks/useRecording.ts` (711 lines) — recording state,
     heart-rate sampling, splits, slope, fix-log replay, save, and permissions in
     one hook. The lint-cleanup plan (WP3/WP4) targets complexity; this hook is
     the recording analogue of a bloated host.
   - `src/features/activities/screens/DetailsScreen.tsx` (was complexity 23, now
     refactored into slot helpers — see recent commit `3ac4535` and the
     in-progress WP3 work). Still 1175 lines; further split of the search/type/
     hide-no-stream pipeline into `useFilteredActivities` is planned.
   - `src/features/activities/components/ActivityAnalysisView.tsx` (879 lines),
     `HomeScreen.tsx` (816), `RecordingScreen.tsx` (1252) — large orchestrators
     mixing data, layout, and side effects.

2. **Layering inversions (accepted, but real)**
   - `shared/` imports from `features/` in at least 8 files (`CustomDrawer`,
     `SettingsModal`, `trackComparison`, `exportData`, `streaks`, plus others).
     These are documented as necessary for UI composition but are genuine
     inversions of the "shared is leaf" rule.
   - The portable import core (`strava-import` + `shared/services/streamCodec` +
     utils) is guarded by `__tests__/stravaImport/importCorePortability.spec.ts`;
     this guard is the right mechanism and should be extended, not relaxed.

3. **Speculative / unused surface**
   - Knip reported 3 unused exports (`MIN_PACE_SPEED_BY_PROFILE`,
     `MIN_DISTANCE_FOR_AVG_SPEED_M`, `STATIONARY_HOLD_MS`) — now cleared in WP1.
     Recurrence risk: new exports added "for later".

4. **Speculative error handling / magic**
   - `readSplitIntervalMeters` and similar helpers embed `try/catch` with
     hardcoded fallbacks (`1000`) inline; acceptable but scattered. No generic
     `safeExecute` wrapper exists (good), but fallback constants are not
     centralised (see DRY below).

5. **DRY — constants**
   - `1000` (ms/split interval) and similar literals recur; the project already
     has a DRY-constants rule in USN; here `APP_CONFIG` and `@/constants` carry
     some but not all.

6. **Manual memoization noise**
   - 173 `useMemo` + 94 `useCallback` remain. The audit classifies most as
     tied to list/map performance; many are candidates for removal once profiled.
     Risk: hooks kept "just in case" become accidental complexity and hide
     stale-data timing bugs.

7. **Await-in-loop**
   - 14 `no-await-in-loop` warnings remain (WP5). Some are genuinely sequential
     (ZIP streaming, ordered export); others are candidates for chunked
     `Promise.all`. Each must be either refactored or explicitly justified with
     a scoped disable + rationale.

8. **Complexity budget**
   - `complexity` (>15) warnings: 0 after the in-progress refactor (was 3:
     `DetailsScreen` 23, `buildManualActivity` 20, `BackupSection` 17). WP4
     (`buildManualActivity`, `BackupSection`) still pending.

## 4. What does *not* translate (and why)

- **Namespaces over static classes** — TS modules already are namespaces; the
  anti-pattern manifests instead as `*Manager`/`*Handler` *classes* or
  mutable singletons. Offline Fitness has none in `src/` beyond stateful
  services, which is correct.
- **Interface segregation via `ISomething`** — TS interfaces are structural;
  the risk is *wide* interfaces and god hooks, not nominal hierarchy. The
  relevant check is "does any caller use only a subset of this hook's return?".
- **Pointer plumbing** — TS has no pointers; the analogue is long parameter
  lists. Most services here take 1–3 args; spot-check before adding new ones.
- **Hot-path purity** — JS is single-threaded; the analogue is main-thread
  jank in list renderers and animation worklets, not data races. Keep heavy work
  out of `renderItem` and Reanimated worklets.

## 5. Recommended actions (mapped to existing plan)

These align with `docs/lint-cleanup-plan.md` rather than duplicating it:

| # | Action | Owner (plan) | Effort |
| --- | --- | --- | --- |
| 1 | Finish WP4: split `buildManualActivity` and `BackupSection` | WP4 | ~1 day |
| 2 | WP5: resolve 14 await-in-loop sites (refactor or justified disable) | WP5 | ~2–3 days |
| 3 | Extract `useFilteredActivities` from DetailsScreen (WP3) | WP3 | ~1 day |
| 4 | Split `useRecording` into focused hooks (recording state / HR / save) | new | ~2 days |
| 5 | Profile and prune unjustified `useMemo`/`useCallback` per audit | memoization audit | ongoing |
| 6 | Centralise recurring literals into `@/constants` / `APP_CONFIG` | DRY | small |
| 7 | Keep the portable-import-core guard test green; extend it to new modules | architecture | ongoing |
| 8 | Add a "Pre-refactoring Checklist" (§6) to PR review for this repo | process | small |

## 6. Pre-refactoring Checklist (adapted for TS/RN)

Before introducing an abstraction, hook, or new module, answer:

1. **Multiplicity:** do at least two distinct concrete callers/implementations
   exist right now? If no, do not create a new interface/hook/generic.
2. **Interface focus:** does any caller use only a subset of this hook's return
   or this component's props? If yes, split it.
3. **Complexity invariant:** if touching a platform branch or fallback path, does
   it preserve the same algorithmic complexity and behaviour on both platforms?
4. **Physical location:** are all test doubles, fixtures, and mocks under
   `__tests__/`, never `src/`?
5. **Hot-path cleanliness:** are any feature flags, `__DEV__` checks, or heavy
   computations inside `renderItem`, `.map`/`.filter`, or animation worklets?
6. **Encapsulation:** are related parameters passed as a cohesive options object
   rather than 5+ loose args?
7. **Memoization:** is this `useMemo`/`useCallback`/`React.memo` justified by
   a dependency-stability or measured-performance reason the compiler cannot see?
   If not, write plain code.

## 7. References

- Source rules: `../USN_WINDOWS/.agents/rules/accidental-complexity-prevention-cpp.md`
- Source ledger: `../USN_WINDOWS/.opencode/skills/tech-debt/SKILL.md`
- This project's lint plan: `docs/lint-cleanup-plan.md`
- Memoization audit: `docs/memoization-audit.md`
- Architecture / import rules: `docs/architecture.md`
- Ontology (invariants): `docs/ontology.md`
- Sonar gate: `scripts/sonar_gate.sh`

## 8. Caveats

- This audit is a **scout/verify-level** review performed from grep and file-size
  signals, not a full line-by-line refactor. Items in §3.2 are candidates, not
  confirmed defects; each requires a targeted read before action.
- No code was changed by this study except a one-line type fix in
  `DetailsScreen.tsx` (`visible` prop) that was necessary to keep `tsc --noEmit`
  green after the in-progress WP3 refactor; that change is behaviour-preserving.
- Sonar gate status was not re-run (requires network + `SONARQUBE_TOKEN`);
  the last known state is 0 open issues per `docs/lint-cleanup-plan.md`.
