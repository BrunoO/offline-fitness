# AI Agent Guidelines for Offline Fitness

This document provides essential context and rules for AI agents working on this project. **Read this first** before making significant changes.

## Project Overview

**Offline Fitness** is a React Native/Expo mobile application that provides offline-friendly personal analytics for Strava activities. The app focuses on:
- Personal activity tracking and visualization (maps, charts, statistics)
- Offline-first data storage and caching
- Performance analysis and trends
- **NOT** social features or real-time sharing

**Definition of Done:**
- ✅ No new TypeScript errors (`npx tsc --noEmit`)
- ✅ No new ESLint errors (`npx expo lint --fix`)
- ✅ **Zero open Sonar issues** (`scripts/sonar_gate.sh`; run with `--scan` if the code changed since the last scan). This is a hard completion criterion, not advisory: a task is NOT done while any issue is `OPEN`/`CONFIRMED` on SonarCloud. See "Sonar Quality Gate" below for the agent rules around it.
- ✅ No new circular dependency warnings
- ✅ UI remains responsive on low-end Android devices
- ✅ Works on both iOS and Android
- ✅ Dark mode support maintained
- ✅ **WCAG 2.1 AA Compliance**: All text and UI elements must maintain required contrast ratios (≥4.5:1 for regular text, ≥3.0:1 for large text/graphical UI). Overlapping text on charts/streaks must use tinted fills or adaptive text colors across all palettes in both light and dark modes.
- ✅ No console errors in production builds

## Operational Constraints

### Build & Deployment

- **Builds are local only**: We do not use EAS Build. All builds run locally (`npx expo prebuild`, `npm run build:local*`, `npx expo run:android`/`run:ios`). There is no remote build quota to worry about.
- **Local Development**: Agents may freely run:
  - `npx expo start` (dev server)
  - `npx expo start --android` / `--ios` (platform-specific)
  - `npm run lint` (linting)
  - `npm test` (tests)
  - `npx tsc --noEmit` (type checking)
- **Prebuild**: `npx expo prebuild` is safe to run for verification, but avoid `--clean` unless necessary (it's slow).

### Code Quality Checks

**Before committing significant changes:**
1. Run `npx expo lint --fix` to auto-fix linting issues
2. Run `npx tsc --noEmit` to verify TypeScript compilation
3. Run `npm run check:imports` to verify no duplicate or scattered imports
4. Run `npm run check:mobile-only` to verify no web target came back
5. Run `npm run check:install-scripts` to verify every dependency install script has a recorded decision
6. Run `npm test -- --watchAll=false` to verify tests pass
7. Check for circular dependency warnings in build output
8. Run `scripts/sonar_gate.sh --scan` - the task is only complete at 0 open Sonar issues (see "Sonar Quality Gate")

**Recommended Non-Blocking Guardrail:**
- Run `npm run check:knip` to check for dead code, unused files, and redundant dependencies (configured in `knip.json`).

**Linting Rules:**
- Use `npx expo lint --fix` to automatically fix issues
- Never disable linting rules without discussion
- Follow the ESLint flat config in `eslint.config.mjs`

### Dependency Install Scripts

npm 11+ blocks dependency install scripts by default and prints a review
prompt for every package whose script it skipped:

```
npm warn install-scripts 3 packages have install scripts not yet covered by allowScripts
```

That prompt is a **decision point, not a defect** - the script was skipped, so
the question is only whether anything needs it. Each install script is
reviewed exactly once and the outcome is recorded in `package.json` under
`allowScripts`, which keeps the warning gone and the decision auditable in git
instead of living in each developer's npm state.

**Current policy: no dependency install script is trusted.** The three known
packages are denied (`false`), because their functionality is delivered by
prebuilt optional dependencies rather than by their scripts:

| Package | Script | Why the denial is safe |
| --- | --- | --- |
| `esbuild` | `postinstall: node install.js` | The native binary ships in the `@esbuild/<platform>` optional dependency; the postinstall only swaps the JS shim for it (startup speed) and checks the version. The JS API, `tsx` and `npm run tool:seed` all work without it. |
| `fsevents` | `install: node-gyp rebuild` (per registry metadata) | The *published tarball* contains no `install` script at all and ships a prebuilt `fsevents.node`. Optional and darwin-only (it only powers `jest --watch` file watching). |
| `unrs-resolver` | `postinstall: napi-postinstall ... check` | Verification only: the native binding ships in `@unrs/resolver-binding-<platform>`. Used by `eslint-import-resolver-typescript`. |

Rules for agents:

1. **Never "fix" the warning with `npm install-scripts approve --all`.** That
   approves every transitive install script and runs third-party code at
   install time on every machine.
2. **Never run `npm install-scripts prune`.** npm considers the `fsevents`
   entry unused (the installed tree has no `install` script) and removes it -
   which brings the warning back on the next install.
3. **A new warning means a new dependency ships an install script.** Read the
   script, then record an explicit decision for it:
   `npm install-scripts deny <pkg>` (name-only, blocks every future version)
   or `npm install-scripts approve <pkg>` (pinned to the reviewed version).
   Deny unless the package genuinely cannot work without it.
4. **Approvals must be version-pinned** (`"pkg": "1.2.3"`). A bare `true` also
   allows every future version and is rejected by the guard.
5. **Run `npm run check:install-scripts`** (also enforced in CI). It fails when
   a dependency with an install script has no `allowScripts` entry, or when an
   approval is not pinned.
6. **`allowScripts` only exists in npm 11+.** npm 10 (the npm bundled with
   Node 22) ignores the field and runs the scripts anyway - harmless here,
   since all three are verified unnecessary - but the decision is only
   *enforced* from npm 11 on. CI runs **Node 24** (npm 11), so CI and the
   local toolchain agree on what runs at install time; `npm ci
   --ignore-scripts` stays as belt and braces.

### Sonar Quality Gate (part of the Definition of Done)

A task is only complete when **zero issues are open** on SonarCloud
(`issueStatuses=OPEN,CONFIRMED`). Enforced by a machine-checkable gate, not
prose:

```bash
scripts/sonar_gate.sh          # check (exit 0 = done; exit 1 = open issues, listed)
scripts/sonar_gate.sh --scan   # scan the working tree first (local scanner +
                               # waits for server processing, ~2-3 min), then check
```

Rules for AI agents (and humans):

1. **Run the gate as the last step of every task**, after the other
   Definition-of-Done checks. Use `--scan` when the code changed since the
   last scan (requires network and `SONARQUBE_TOKEN`).
2. **Passing means FIXING the flagged code.** The gate prints each open issue
   as file/line/severity/rule - iterate fix → `--scan` → gate until zero.
3. **Never mark an issue "Won't Fix" or "False Positive" as an agent.**
   Those transitions are human decisions only (see `docs/status.md` for the
   await-in-loop precedent, each with a rationale comment). Changing server-side
   issue state to make the count zero is gaming the gate - equivalent to
   disabling a lint rule - and is forbidden without explicit human instruction.
4. **A gate that cannot run is not a passed gate.** Exit code 2 (missing token
   or network) means the task is blocked on environment; report it as such
   instead of claiming completion.
5. **Prefer prevention over the gate**: `eslint.config.mjs` mirrors the Sonar
   classes that have lint equivalents - hard errors for floating promises,
   comparator-less sorts, and super-linear regexes in product code; warnings
   for cognitive complexity, await-in-loop, nested ternaries, stale TODO
   comments, and jest matcher specificity. Treat those errors as you would a
   compile error - the Sonar gate is the backstop, not the first line.
   Classes with no lint equivalent (e.g. nested template literals) are caught
   by scan only - fix them as soon as the gate reports them, same session.
6. Resolved issues (including human-marked won't-fix ones) stay visible in
   the Sonar UI by design - only OPEN/CONFIRMED count against this gate.
   Query details anytime with `scripts/fetch_sonar_results.sh --open-only`.

Supporting files: `scripts/sonar_gate.sh` (this gate),
`scripts/fetch_sonar_results.sh` / `scripts/fetch_sonar_duplications.sh`
(issue & duplication detail), `sonar-project.properties` (scanner config).
CI (`.github/workflows/build.yml`) enforces the same contract after each
scan. Note on plans: the SonarCloud Community plan allows CREATING custom
quality gates but not ASSIGNING them (org-default and project-level binding
are refused/no-op) - hence the contract lives in `sonar_gate.sh`, not in a
custom SonarCloud gate.
`sonar-results/` is gitignored; the local scanner script contains a token and
must never be committed.

### Bulk Edits & Codemods

Applying a rule across many files (the way the Sonar backlog was cleared) is
where AI agents most often introduce regressions - a wrong replacement can be
semantically invisible to tsc. Non-negotiable discipline:

1. **Occurrence-counted replacements**: a codemod declares, for each
   `from -> to` pair, how many occurrences it expects; it writes **nothing**
   unless every count matched exactly. Never sed-and-hope.
2. **Dry run first**: print every changed line and eyeball each one before
   writing (this caught a codemod silently duplicating a JSX opening tag and
   another dropping a trailing comma into a syntax error).
3. **Run the affected test suite immediately after** - before lint, before
   claiming green. The zipReader fixture caught a `slice(offset, length)` vs
   `slice(offset, offset + length)` transcription slip that tsc and eslint
   both passed; a "bulk edit, tests after, if I feel like it" workflow ships
   that bug.
4. **Never bulk-format or bulk-fix files with uncommitted work from other
   sessions** - check `git status` first and restrict auto-fixes to the files
   your task owns.
5. Behavior-preserving intent goes in the commit message; equivalence-affecting
   judgment calls (e.g. first-match `replace` kept instead of `replaceAll`)
   go in a code comment at the site.

### Secrets & Environment

- **NEVER commit**:
  - `service_account_key.json` (Google Cloud service account)
  - `.env` files with real credentials
  - WebDAV backup credentials or Strava client secrets
- **Use example values** in documentation and code examples
- Environment variables should be documented in `README.md` with example values

## Source of Truth & Architecture

### Required Reading Before Structural Changes

**MUST READ these documents before making architectural changes:**
1. **`docs/ontology.md`** - Formal domain, geophysical, spatial, kinematic, storage, and governance ontology (invariants, formulas, coordinate systems, and negative space)
2. **`docs/architecture.md`** - System architecture, import patterns, circular dependency rules
3. **`docs/status.md`** - Current project status, recent changes, known issues
4. **This file (`AGENTS.md`)** - Operational rules and constraints

**Domain-to-Ontology Lookup Table** — Before modifying code in any of these areas, read the corresponding section of `docs/ontology.md`:

| Task / Domain Area | `docs/ontology.md` Section & Invariant Prefix |
| --- | --- |
| Activity creation (import / recorded / manual), sport types, `NO_GPS_ACTIVITY_TYPES`, `mergeActivities`, swim canonicalization | **§1 Core Domain Entities & Activity Origin Taxonomy (`ONT-DOM-*`)** |
| Dates, `start_date_local` (mislabeled-`Z` trap), `local_date` vs. `start_timestamp_utc`, DST day math, ISO-8601 weeks | **§2 Temporal & Calendar Algebra (`ONT-TIME-*`)** |
| Altitude, WGS 84 ellipsoid vs. geoid vs. MSL, NMEA GGA backfill, barometer fusion (`0.85/0.15`), EMA, hysteresis (`1.5m`/`3.5m`), slope | **§3 Geophysical, Geodetic & Barometric Ontology (`ONT-GEO-*`)** |
| Coordinates (`[lat, lon]` vs. `LatLng` vs. `{x, y}`), Haversine, 3D flyover bearing/circular mean, RDP simplification, bounding boxes, Needleman-Wunsch track similarity, `geo-tz` | **§4 Spatial, Cartographic & Geopolitical Ontology (`ONT-SPATIAL-*`)** |
| GPS recording, 5 sport profile envelopes, pre/post auto-pause filter order, pause subtraction, BLE heart rate (`±10s`, `null` vs. `0`), metric-only splits, crash recovery | **§5 Kinematic, Biometric & Recording Session Ontology (`ONT-KIN-*`)** |
| `AsyncStorage` (`a_<id>`), `'OF'` v1 binary stream codec, 30-day fix logs, WebDAV `collection.json` (`schemaVersion: 2`), tombstones, 500-item chunked ZIP export | **§6 Storage, Binary Codec, WebDAV Sync & Export Contracts (`ONT-STORE-*`)** |
| Barrel vs. relative imports, 6 cycle exceptions, Portable Import Core boundary, split `ActivitiesContext`, root sheet mounting, lazy `Directory` init, `runWithCleanup`, `useTheme()` WCAG AA | **§7 Architecture, State Management, UI/Theme & React Compiler Rules (`ONT-ARCH-*`, `ONT-UI-*`)** |
| `GoalService` `expr-eval` sandbox, streak recency windows, retired/forbidden features (Negative Space), verification gates | **§8 Analytics, Goal DSL, Negative Space & Executable Gates (`ONT-GOV-*`)** |

### Key Architecture Principles

1. **Feature-Based Structure**: Code organized by features under `src/`:
   ```
   src/
   ├── features/
   │   ├── activities/      # Core state, local storage, stream caching, list/detail screens
   │   ├── backup/          # Cloud backup/restore (WebDAV transport)
   │   ├── heart-rate/      # BLE heart-rate (Polar H10): service, card, permissions, hooks
   │   ├── home/            # Home screen, launcher buttons
   │   ├── maps/            # Map visualization (MiniMapComponent)
   │   ├── profile/         # User profile: optional age + dated body-weight history, CSV import
   │   ├── recording/       # GPS recording: fix-log reader, replay, save flow, screen (wraps modules/gps-tracker)
   │   ├── stats/           # Charts, statistics screens, SettingsProvider
   │   └── strava-import/   # Archive-conversion core (CSV/GPX/ZIP/mapping), run by the desktop tool
   ├── shared/              # Cross-cutting: components, services, utils, types
   ├── theme/               # Colour system: palettes, resolver, provider, useTheme
   └── constants/           # index.ts (app config & storage keys)
   ```
2. **State Management & Data Flow**:
   - **Providers**: `ActivitiesProvider` (central activity state via `useActivities` hook; persists to AsyncStorage, caches streams to FileSystem) and `SettingsProvider` (user preferences in `stats`). There is **no auth provider** — the app is offline-only.
   - **Data Flow**: desktop `tool:seed` (Strava archive → WebDAV collection) → phone Restore → AsyncStorage (activities) + FileSystem (stream payloads) → Context → Drawer Navigator Screens. The Strava API/OAuth path and the in-app archive importer are both gone (see `docs/deprecate-strava-api-path.md`, `docs/desktop-import-plan.md` Phase 5).
3. **Barrel Exports**: Use barrel exports (`index.ts`) for public APIs across features, and relative imports within the same feature to prevent circular dependencies (see `docs/architecture.md`).
4. **Direct Imports for Known Cycles**: Certain components and services must be imported directly (listed under Import Patterns below).

### Fragile Areas (Handle with Care)

These areas are particularly sensitive - be extra careful when modifying:
- **`useActivities` hook** (`features/activities/hooks/useActivities.ts`) - Core state management
- **Stream caching** (`fetchAndStoreStreams.ts`) - Performance-critical, handles large datasets
- **Archive ingestion** (`scripts/strava-import-tool/` + `features/strava-import/` core) - The only ingestion path: desktop tool → WebDAV → Restore; idempotent and resumable by design
- **GPS recording** (`modules/gps-tracker/` + `features/recording/`) - The local Expo module, the fix log, the replay and the save flow. The service owns the session; the app owns permissions. Never copy `../GpsLib/gpslogger/` (GPLv2).
- **Heart-rate (Polar H10)** (`modules/heart-rate/` + `features/heart-rate/`) - BLE scanning/connection, notification parsing with bounds checks, session HR logging, replay alignment. Permissions live in the module manifest; iOS is a stub.
- **Calendar components** (`ActivityCalendarPeriod`) - Complex state and performance optimizations
- **MiniMap component** - Navigation lifecycle issues, platform-specific behavior

## Code Style & Patterns

### TypeScript

- **Strict mode enabled** (`TypeScript 6`, see `package.json` for exact version) - No `any` types allowed
- **Interfaces over types** - Prefer `interface` for object shapes
- **No enums** - Use maps/const objects instead
- **Functional components only** - No classes
- **Descriptive boolean names** - Use auxiliary verbs (`isLoading`, `hasError`, `canSync`)
- **No magic numbers** - Use constants from `@/theme` for theming

### React Native / Expo

- **Target Stack**: Expo SDK 57, React Native 0.86 (New Architecture), React 19.2 (always check `package.json` for exact versions; do not hardcode patch versions in docs)
- **React Compiler Enabled**: Configured in `app.json` (`experiments.reactCompiler`), `babel.config.cjs` (`babel-preset-expo` react-compiler), and enforced via `react-compiler/react-compiler` ESLint rule:
  - Keep components and hooks pure (no side effects or ref/prop/state mutations during render)
  - Avoid `try/finally` inside compiled components/hooks (React Compiler cannot lower `finally` clauses yet; use `try/catch` + explicit cleanup)
  - Avoid unnecessary manual `useMemo`/`useCallback` unless stabilizing an effect/context dependency or a profiled hotspot
- **Memoization is the compiler's job**: React Compiler automatically memoizes components, `useMemo` and `useCallback`. Do **not** add `React.memo`, `useMemo` or `useCallback` by default — they are redundant and only earn their place for precise control: stabilizing an effect/context dependency, passing a prop to non-compiled code, or a profiled hotspot. Absence of manual memoization is expected and is not a code smell. Note that the compiler does **not** virtualize lists: keep using `FlatList`/`FlashList` for lists that can exceed ~50 rows (large datasets are still a memory/perf risk). See `docs/memoization-audit.md` for the full decision guidelines (when to keep each hook, escape hatches, workflow) and the audit of remaining manual memoizations.
- **Worklets & Reanimated v4**: `react-native-worklets/plugin` must remain the **last** plugin in `babel.config.cjs` (replaces `react-native-reanimated/plugin` in SDK 55+)
- **No web-only packages**: the app targets Android and iOS only. `npm run check:mobile-only` fails if `react-dom`, `react-native-web`, `@teovilla/react-native-web-maps` or `@expo/metro-runtime` come back, and the `expo-location` override that package required is gone — do not reintroduce either without a written reason.
- **Conditional Rendering**: Always use ternary `? ... : null`, **never** `&&` in JSX (prevents React Native `"Text strings must be rendered within a <Text> component"` crashes when values evaluate to `0` or `""`)
- **Theming**: Read colours from `useTheme()` (`@/theme`) — never hardcode a hex value, and never build styles at module level (a module-level `StyleSheet.create` freezes the colours and cannot follow the active palette). Use `createStyles(theme)` + `useMemo` instead.
- **Accessibility & Contrast (WCAG 2.1 AA)**: Strictly follow WCAG 2.1 AA standards. Normal text must achieve at least 4.5:1 contrast against its background, and large text/graphical elements at least 3.0:1 across all registered palettes in both light and dark modes. When rendering text over chart bars or progress indicators of varying length, do not render dark text directly over solid saturated fills; use tinted fills (`fillOpacity: 0.25` with a solid stroke) or place text outside the bar so that contrast is preserved everywhere. Streak indicators or badges using reduced opacity fills must pair with `theme.text`, never `theme.onPrimary`.
- **Safe Areas**: Use `SafeAreaProvider` and `SafeAreaView` from `react-native-safe-area-context`
- **Navigation**: React Navigation v7 (Drawer, Stack, Bottom Tabs)

### Import Patterns

**✅ Correct:**
```typescript
// Within same feature - use relative imports
import { ResponseActivityType } from '../types/activities.types';

// From different feature - use barrel export
import { useActivitiesContext } from '@/features/activities';

// Known circular dependency - use direct import
import MiniMapComponent from '@/features/maps/components/MiniMapComponent';
```

**❌ Incorrect:**
```typescript
// Within same feature - DON'T use barrel export
import { ResponseActivityType } from '@/features/activities'; // ❌

// Asset imports - always relative
import logo from '@/assets/logo.png'; // ❌ Use relative path
```

**Known Circular Dependency Exceptions (ALWAYS import directly, never via barrel):**
- `import CustomDrawer from '@/shared/components/CustomDrawer'`
- `import MiniMapComponent from '@/features/maps/components/MiniMapComponent'`
- `import ButtonList from '@/features/home/components/ButtonList'`
- `import { RecordChooserSheet } from '@/features/activities/components/RecordChooserSheet'`
- `import { RecordingScreen } from '@/features/recording/screens/RecordingScreen'`
- `trackComparison` functions from `@/shared/services/trackComparison`

See `docs/architecture.md` for complete import guidelines.

### Import Hygiene (Duplicate & Scattered Imports)

- **Never import from the same module multiple times in a single file**.
  - ✅ **Do this**:
    ```typescript
    import { ActivityType, ChipMultiSelect, seconds_to_label, simpleLogger } from '@/shared';
    ```
  - ❌ **Not this** (duplicate source module):
    ```typescript
    import { simpleLogger } from '@/shared';
    import { ChipMultiSelect } from '@/shared';
    import { ActivityType, seconds_to_label } from '@/shared';
    ```
- **Keep all imports from the same module together** - they should not be scattered across multiple locations in the file.
  - ✅ **Do this** (grouped together):
    ```typescript
    import 'react-native-gesture-handler'; // side-effect import at top
    import { GestureHandlerRootView } from 'react-native-gesture-handler';
    ```
  - ❌ **Not this** (scattered):
    ```typescript
    import 'react-native-gesture-handler'; // line 1
    // ... many lines of other imports ...
    import { GestureHandlerRootView } from 'react-native-gesture-handler'; // line 20
    ```
- When you see repeated imports from the same path, **consolidate them into a single import statement** during any refactor or feature work touching that file.
- **Exception – side‑effect imports**:
  - Side-effect imports (e.g., `import 'react-native-gesture-handler';`) must remain at the top of the file as required by the library.
  - Named imports from the same module should be placed immediately after the side-effect import to keep them grouped together.
  - Do **not** merge the side‑effect import into the named import; the ordering and form of the side‑effect import must be preserved exactly as recommended by the library (e.g. React Navigation).

### File Structure

- **Directories**: lowercase with dashes (`components/auth-wizard`)
- **Files**: PascalCase for components (`HomeScreen.tsx`), camelCase for utilities (`utils.ts`)
- **Named exports** preferred for components
- **Barrel exports** (`index.ts`) for public APIs

## Testing Expectations

### Test Suite

- **Framework**: Jest with `jest-expo` preset
- **Test Location**: `__tests__/` directory
- **Run Tests**: `npm test` (watch mode) or `npm test -- --watchAll=false` (single run)

### Test Coverage

Currently limited test coverage. When adding new features:
- **Critical business logic** should have unit tests
- **Hooks** should be tested (see `__tests__/activities/useActivities.spec.ts` for example)
- **Services** should have tests for error handling and edge cases

### Manual Testing Checklist

After significant changes, verify these critical flows:
1. **Ingestion**: seed a Strava export with `npm run tool:seed` → Restore on the phone → activities and maps appear
2. **Home Screen**: Loads with cached activities, displays recent activity and map
3. **Activity Details**: View activity details, stream data, charts
4. **Stats Screens**: Recent Weeks, Recent Years, YTD stats display correctly
5. **Calendar**: Activity calendar displays, week navigation works
6. **Offline Mode**: App loads with cached data when offline
7. **Dark Mode**: All screens respect system theme

## Strava Data Import & External Services

### Strava archive ingestion (desktop tool -> WebDAV -> Restore)

- **Source**: the ZIP Strava emails from *Settings → My Account → "Download or delete your account"* (no API subscription, no OAuth)
- **Inputs**: `activities.csv` (localized headers, UTC dates) plus `activities/<id>.gpx` tracks
- **Path**: the desktop tool (`npm run tool:seed`, Phase 5 of `docs/desktop-import-plan.md`) converts the archive into the WebDAV backup collection; the phone fills itself with *Restore*. The phone no longer imports archives itself — do not reintroduce an in-app importer (a guard test fails if its names come back)
- **Rules**: seeding is **idempotent** (md5 skips) and **resumable** (`sync-state.json` written last); `.fit`/`.tcx` tracks are counted as unsupported and skipped
- **Dates**: CSV dates are UTC; `local_date`/`local_time` are derived from the zone of each track's **GPS start** (geo-tz lookup in the tool), falling back to the required `--tz` for records without a usable fix
- **Testing**: use the fixtures in `__tests__/stravaImport/` and `__tests__/desktopImport/` — never hit the live Strava API (it is gone)

### Google Cloud CLI

- Not used in this repository (it was only needed by the abandoned Google Drive backup, which is gone)
- The only Google dependency left is the Google Maps API key, inlined at build time from `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env` (see `.env.example`)

## Branching & PR Etiquette

### Workflow

- **Small, focused PRs** preferred over large monolithic changes
- **One feature/fix per PR** when possible
- **Descriptive commit messages** explaining what and why

### Version Management

- **Don't modify version numbers** unless explicitly asked
- The app version is `expo.version` in `app.json` (it becomes `versionName` on the phone). Keep `package.json` `version` in step with it manually — it is npm metadata only.
- `versionCode` (the Android build number) is stored in the gitignored `.version-code` file and resolved by `app.config.js` (falls back to the committed value in `app.json` on a fresh clone). `increment-version.cjs` (called from the `build:local*` scripts) only writes `.version-code` — `app.json` is never modified by a build, so it stays out of diffs.
- Other build numbers in native configs are generated by prebuild — do not hand-edit them

### Platform Compatibility

- **Always test on both iOS and Android** (or at least verify no platform-specific code breaks)
- **Platform-specific files**: Use `.android.tsx` / `.ios.tsx` extensions when needed. There is
  no web target: `npm run check:mobile-only` fails on `*.web.*` files, `Platform.OS === 'web'`,
  `web:` keys in `Platform.select`, web-only packages (`react-dom`, `react-native-web`,
  `@teovilla/react-native-web-maps`, `@expo/metro-runtime`) and a `web` script. The iOS map
  screen is the generic `.tsx` stub on purpose (Android has the `.android.tsx` implementation).

## Documentation Updates

### After Code Changes

**ALWAYS update `docs/status.md`** after making changes:
- Add entry to "Recent Updates" section
- Include what was changed and why
- Note any breaking changes or migration steps

### Architecture Changes

If you modify:
- Import patterns
- Feature structure
- State management approach
- New circular dependencies introduced

**Update `docs/architecture.md`** to reflect the changes.

### Ontology Changes & Schema Drift Protection

> [!IMPORTANT]
> **Schema Drift Protection Rule:** `docs/ontology.md` is **strictly READ-ONLY** during normal bugfixes, refactorings, and feature implementation tasks. Agents must **never** modify `docs/ontology.md` to make failing code, altered formulas, or unverified shortcuts pass.
> Modifying `docs/ontology.md` requires an **explicit user request** to modify or extend the ontology.

When explicitly tasked with an ontology update or introducing:
- Domain entities, activity origins, sport type categories, or canonicalization rules (`ONT-DOM-*`)
- Date/time/timezone handling or ISO-8601 week bucketing (`ONT-TIME-*`)
- Geophysical, barometric, geoid, hysteresis, or slope formulas/constants (`ONT-GEO-*`)
- Coordinate shapes, quantization scales, spatial algorithms, or track alignment (`ONT-SPATIAL-*`)
- Sport profile thresholds, pause algebra, BLE heart-rate alignment, or split rules (`ONT-KIN-*`)
- Storage keys, binary stream codec flags/layout, WebDAV schema/tombstones, or export chunking (`ONT-STORE-*`)
- Module/portability boundaries, cycle exceptions, or retired/forbidden concepts (`ONT-ARCH-*`, `ONT-UI-*`, `ONT-GOV-*`)

1. **Update `docs/ontology.md` first** following the `codebase-ontology` skill (`.agents/skills/codebase-ontology/SKILL.md`).
2. Run `npm run check:ontology` to verify that code constants, types, and documented invariants are in sync.
3. Verify graph alignment via `codebase-memory-mcp`.

## Common Pitfalls to Avoid

1. **Circular Dependencies**: Always check import chains - use direct imports when barrel exports create cycles
2. **Memory Issues**: Large datasets (1000+ activities) can cause memory issues - use chunking for exports/processing
3. **Navigation Lifecycle**: Map components need special handling for navigation focus/blur events
4. **Theme Colors**: Never hardcode colors - always read them from `useTheme()` (`@/theme`)
5. **Async State Updates**: Always check if component is mounted before setting state after async operations
6. **Timer Leaks**: Clean up `setTimeout`/`setInterval` in `useEffect` cleanup functions

## Quick Reference Commands

```bash
# Seed the WebDAV collection from a Strava export archive (desktop tool; --dry-run previews)
npm run tool:seed -- import --archive export.zip --root <url> --user <u> --profile <p> --tz <zone>

# Type checking
npx tsc --noEmit

# Linting (auto-fix)
npx expo lint --fix

# Check for duplicate/scattered imports
npm run check:imports

# Check no web target came back (platform files, branches, deps, app.json)
npm run check:mobile-only

# Sonar completion gate (0 open issues; --scan scans first)
scripts/sonar_gate.sh --scan

# Tests
npm test -- --watchAll=false

# Start dev server
npx expo start

# Android development
npm run android:dev

# Clean build (Android)
npx expo prebuild --clean --platform android

# Format code
npm run pretty
```

## Getting Help

- **Architecture questions**: See `docs/architecture.md`
- **Recent changes**: See `docs/status.md`
- **Code review prompts**: See `docs/prompts/` for specialized review templates
- **Build issues**: Check `README.md` for build instructions

---

**Remember**: When in doubt, read the architecture docs, check existing patterns, and maintain consistency with the codebase style.
