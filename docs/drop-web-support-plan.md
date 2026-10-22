# Plan: drop the web target, keep mobile only (Android full, iOS partial)

Status: **implemented** — see the "Web target removed" entry in `docs/status.md`.
Kept as the record of what was removed and why; the guard it introduces is
`npm run check:mobile-only`.

## Goal

Make **Android and iOS the only platforms** the repository builds, tests and
documents. Delete the react-native-web attempt — code, config, dependencies,
docs — instead of continuing to pay for its maintenance (the `web:` style keys,
the `.web.tsx` twins, the metro resolver, the `expo-location` override, and the
web-only degradation paths inside services that only ever run on a phone).

Non-goals:

- **Not** implementing maps on iOS. iOS already has no map implementation
  (`MapsScreen.tsx` and `MiniMapComponent.tsx` are placeholder stubs, resolved
  because there is no `.ios.tsx` sibling); that stays exactly as it is.
- **Not** removing the Node desktop tool (`scripts/strava-import-tool/`). It is
  a CLI, not a web app, and it shares the portable core (`webdavTransport`,
  `SimpleLogger`, `features/strava-import`).
- **Not** rewriting history in `docs/` (see "Out of scope").

## Why now

The web target has been pure upkeep for a while:

- It has **never been in the test matrix**. `jest-expo` resolves through
  `@react-native/jest-preset`, whose `haste.defaultPlatform` is `ios`
  (`node_modules/@react-native/jest-preset/jest-preset.js:17`), so the one
  "web" spec only *mocks* `Platform.OS = 'web'` to assert degraded behaviour.
  The web app was never actually exercised by a test.
- It **cannot do the app's main job on web**: no stream cache (no
  `expo-file-system`), no backup (`expo-secure-store` has no web backend), no
  export. The web build renders statistics only.
- It is the **sole reason for the `expo-location` override**, the exact thing
  that just broke `npx expo install --fix` with
  `EOVERRIDE: Override for expo-location@~57.0.22 conflicts with direct
  dependency` (see the commit `chore(deps): SDK 57 patch bumps…`). Removing
  `@teovilla/react-native-web-maps` removes the reason the override exists.
- It is the **sole reason** for two platform-abstraction files, a custom metro
  resolver, a section of `app.json`, a dev script, and ~13 web branches spread
  across screens and services.

## Current state audit

Everything below was verified by reading the tree on `main` at `01ecc91`.

### Platform-specific files

| Path | LOC | Fate |
|---|---|---|
| `src/features/maps/screens/MapsScreen.web.tsx` | 148 | **delete** (web-only Victory chart + raw-stream reader) |
| `src/features/maps/components/MiniMapComponent.web.tsx` | 98 | **delete** (web-only react-native-maps twin) |
| `src/features/maps/screens/MapsScreen.android.tsx` | 16.6K | keep (Android maps) |
| `src/features/maps/components/MiniMapComponent.android.tsx` | 7.5K | keep |
| `src/features/maps/screens/MapsScreen.tsx` | 484B | keep — iOS fallback stub |
| `src/features/maps/components/MiniMapComponent.tsx` | 591B | keep — iOS fallback stub |

There is no `.ios.*` file anywhere: iOS deliberately resolves the generic
`.tsx` stubs. Deleting the `.web.tsx` files therefore changes **nothing** on
iOS and nothing on Android.

### Web branches in native code

| Site | What it is | Action |
|---|---|---|
| `src/shared/services/exportData.ts:178` | `Platform.OS === 'web'` → throw "not available in the web version" (+ the now-unused `Platform` import at line 7) | delete guard, drop import |
| `src/shared/components/CustomDrawer.tsx:63-69` | "Not available on web" alert before export | delete branch (keep the `Platform` import — line 170 still uses `Platform.OS === 'android'`) |
| `Platform.select({ …, web: … })` style keys (11 keys across 10 files) in `sheetFrame.ts:41`, `ProgressOverlay.tsx:80`, `ActivityListItem.tsx:48`, `ActivityAnalysisView.tsx:64`, `DayActivitiesSheet.tsx:128`, `LastActivitySummary.tsx:319`, `RecentMonthsScreen.tsx:287`, `RecentWeeksScreen.tsx:301`, `RecentYearsScreen.tsx:237,260`, `StatsTab.tsx:52` | `boxShadow` | delete the `web:` keys |
| `src/shared/services/SimpleLogger.ts:1-10,120-124,133-135,144-146` | `ECHOES_TO_CONSOLE = typeof document !== 'undefined'` — the web marker — gating `console.log`/`warn`/`error` | **delete** the flag and all three branches (D4) |
| `src/features/activities/services/fetchAndStoreStreams.ts:19-27` | lazy `streamsFolder()` with `try/catch`, written for the web crash | **keep**, reword comment (D5) |
| `src/shared/services/exportData.ts:47-52` | same lazy-folder comment | **keep**, reword comment (D5) |
| `src/features/activities/services/fetchAndStoreStreams.ts:273` | "Used by the web maps screen" on `loadRawStreamForActivity` | **keep** the function, reword (D6) |

### Configuration and tooling

| Site | Content | Action |
|---|---|---|
| `metro.config.cjs` (whole file) | `resolveRequest` aliasing `react-native-maps` → `@teovilla/react-native-web-maps` on `platform === 'web'` | **delete the file** — nothing else in it; Expo's default metro config is enough |
| `app.json:41-43` | `"web": { "favicon": "./assets/favicon.png" }` | delete block; add `"platforms": ["ios", "android"]` |
| `assets/favicon.png` | favicon, web only | delete |
| `package.json:12` | `"web": "expo start --web"` script | delete |
| `babel.config.cjs:16-17` | commented-out "Optional web-only overrides" | delete comment |
| `.gitignore:11` | `web-build/` | delete the line |
| `sonar-project.properties` | exclusions list mentions `**/metro.config.cjs` | drop that entry (file is gone) |

### Dependencies

| Dependency | Line | Why it exists |
|---|---|---|
| `@expo/metro-runtime` | `package.json:35` | web Fast Refresh; **nothing in `src/` imports it**, not used by Expo Router (this app does not use it) |
| `@teovilla/react-native-web-maps` | `package.json:48` | web maps (`react-native-maps` twin) |
| `react-dom` | `package.json:70` | web renderer |
| `react-native-web` | `package.json:80` | web renderer |
| `overrides.expo-location` | `package.json:143` | **only** to stop `@teovilla/react-native-web-maps` pulling a nested `expo-location@15` (documented in `docs/status.md:488`) |

Keep: `react-native-maps` (Android maps), `expo-location` (**direct** dependency,
used by `src/features/maps/hooks/useLocationPermission.ts`), `expo-file-system`,
`expo-secure-store`, `expo-sharing`.

### Tests

| Path | Tests | Action |
|---|---|---|
| `__tests__/shared/webFileSystem.spec.ts` | 5 (suite is 413) | **delete** — it simulates web FS stubs and pins web-only degradation (`export refuses explicitly on web`, etc.) |
| `__tests__/fetchAndStoreStreams.spec.ts` | several | keep; `loadRawStreamForActivity` coverage stays (D6) |

No other test or mock references the web platform (`__mocks__/` holds only
AsyncStorage and Clipboard mocks).

### Docs

| Site | Content | Action |
|---|---|---|
| `README.md:247` | "Android or iOS device (the app also runs on web)" | rewrite: Android full, iOS partial (no maps) |
| `README.md` "Development" / "Fine print" | no other web claims | verify, no change expected |
| `AGENTS.md:330` | "**Web support**: App should work on web via Expo, but mobile is primary target" | replace with "mobile only; do not reintroduce web code (see the guard in D7)" |
| `AGENTS.md:331` | "Use `.android.tsx`, `.ios.tsx`, `.web.tsx` extensions when needed" | drop `.web.tsx` |
| `AGENTS.md:194` | the `expo-location` override note | delete — the override is gone; add a one-line "no web-only deps" rule instead |
| `docs/status.md` | dense web history (web boot crash, web maps, S1874 web fixes) | **leave history untouched**; add one new entry for this change |

## Decisions

D4, D5 and D6 are settled (agreed); the alternatives are recorded so the
reasoning survives, not as open questions.

**D1 — Delete the web files outright, do not keep them "just in case".**
They are 246 LOC of a UI nobody can use for this app's core features; git keeps
them. Alternative (keep in a branch/tag) is unnecessary — the last web-capable
commit is the parent of the removal commit.

**D2 — Add `"platforms": ["ios", "android"]` to `app.json`.** Makes the
supported surface explicit and makes `expo` refuse web-specific commands instead
of half-working.

**D3 — Do the dependency change in one commit with the metro resolver and the
override.** Three files are coupled: `package.json` (4 deps + override),
`package-lock.json`, and `metro.config.cjs`. Splitting them yields either a
missing module (`@teovilla` referenced by the resolver) or `EOVERRIDE` again.

**D4 (settled) — `SimpleLogger`: delete `ECHOES_TO_CONSOLE` and the console echo.**
Drop the flag (`SimpleLogger.ts:1-10`) and the three `if (ECHOES_TO_CONSOLE)`
branches in `log`/`warn`/`error` (lines 120-124, 133-135, 144-146); each method
keeps only its `internalLog(...)` call. Justification:

- Post-web the flag is `false` in **every** supported runtime — native has no
  `document`, and so does Node — so it selects nothing. Keeping it would be a
  permanently dead branch carrying a comment ("web build… devtools") that is no
  longer true.
- The console echo was web's only consumer. Confirmed nothing else depends on
  it: no test mentions `ECHOES_TO_CONSOLE` or asserts console output
  (`__tests__/` only inspects the in-memory log entries), and the desktop tool
  prints its own user-facing output with direct `console.log` calls in
  `scripts/strava-import-tool/cli.ts` — not through this class.
- Logging behaviour of the app becomes uniform: entries go to the in-memory
  buffer the LogScreen renders, on both platforms.

*Alternative (rejected):* keep the two-line flag for a possible future browser
host. Nothing is planned, and a dormant platform selector is exactly the kind of
leftover this change exists to remove.

**D5 (settled) — Keep the lazy file-system getters, reword their comments.**
They exist for web, but the `try/catch` also survives a missing/odd
`Paths.document`, and reverting them is churn in the two most fragile services
(stream cache, export). Only the *rationale comment* changes. *Alternative:*
revert to module-level `new Directory(...)` — smaller code, slightly higher
blast radius; not worth it in the same change.

**D6 (settled) — Keep `loadRawStreamForActivity`, reword its doc comment.** After
deleting `MapsScreen.web.tsx` its only product caller is gone; it stays
exported from `features/activities` and covered by
`__tests__/fetchAndStoreStreams.spec.ts`. It reads the unsimplified cache and is
the natural reader for the planned GPS recording work. *Alternative:* delete it
plus its tests in a follow-up if it is still unused after the recorder lands —
do **not** delete it here, or this change silently drops cache-format coverage.

**D7 — Add a cheap guard so web code cannot come back.** A
`scripts/check-mobile-only.cjs` modelled on the existing
`scripts/check-imports.cjs`, wired as `npm run check:mobile-only`, asserting:

1. no `*.web.{ts,tsx,js,jsx}` under `src/` or `__tests__/`;
2. no `Platform.OS === 'web'`, no `web:` key inside `Platform.select` in `src/`;
3. `package.json` has no `react-dom`, `react-native-web`,
   `@teovilla/react-native-web-maps`, `@expo/metro-runtime` entry and no `web`
   script;
4. `app.json` has no `web` key and lists exactly `["ios", "android"]`.

Run it in the Definition-of-Done list in `AGENTS.md` and in
`.github/workflows/build.yml` next to the import check. *Alternative:* a jest
spec — rejected, because a spec runs per-platform under the ios preset and this
is a repository-shape check, not app behaviour.

## Phases

Each phase is one commit and leaves the tree green. Run the Definition of Done
gates after every phase (`tsc`, lint, `check:imports`, tests, sonar gate at the
end of the task), not just at the end.

### Phase 0 — Baseline (no commit)

```bash
npm ls --all | wc -l                 # 3625 today
npx expo install --check             # "Dependencies are up to date"
npm test -- --watchAll=false         # 413 tests
```

Record the three numbers in the status entry. Also confirm the working tree is
clean of other sessions' in-flight work before starting (right now a concurrent
"live sync freshness" change is in progress — land that first; do not mix it
into these commits).

### Phase 1 — Remove the web entry points

1. `git rm src/features/maps/screens/MapsScreen.web.tsx src/features/maps/components/MiniMapComponent.web.tsx`
2. `git rm __tests__/shared/webFileSystem.spec.ts` (suite 413 → 408)
3. `app.json`: delete the `web` block, add `"platforms": ["ios", "android"]`
   next to `"slug"`.
4. `git rm assets/favicon.png`
5. `package.json`: delete the `"web": "expo start --web"` script.
6. `git rm metro.config.cjs`; remove `**/metro.config.cjs` from
   `sonar-project.properties` exclusions.
7. `babel.config.cjs`: delete the commented web-only override lines.
8. `.gitignore`: delete `web-build/`.

Checkpoint: `npx tsc --noEmit` (proves nothing imported the deleted screens),
`npm test` → 408/408.

### Phase 2 — Strip web branches from native code

1. `exportData.ts`: delete the `Platform.OS === 'web'` guard and the `Platform`
   import (verify no other use).
2. `CustomDrawer.tsx`: delete the web alert; keep `Platform` (line 170).
3. Delete the eleven `web:` keys from `Platform.select` (list above, 10 files). Mechanical,
   but this is a **bulk edit**: per `AGENTS.md`, count occurrences per file
   before writing (`web:` inside `Platform.select` — beware `web` appearing in
   `WebDAV` strings in the same files), dry-run the diff, then run the affected
   specs.
4. `SimpleLogger.ts`: delete `ECHOES_TO_CONSOLE` and the three console branches
   (D4) — `log`/`warn`/`error` keep only `internalLog(...)`.
5. Reword the web rationale comments named in D5 and D6, plus
   `ManualActivitySheet.tsx:55` ("plain text inputs behave identically on iOS,
   Android and web" → "on iOS and Android"). These are comment edits only; the
   lazy getters and `loadRawStreamForActivity` stay.

Checkpoint: `npx tsc --noEmit`, `npx expo lint`, `npm test`.

### Phase 3 — Dependencies

1. Remove from `package.json` `dependencies`: `@expo/metro-runtime`,
   `@teovilla/react-native-web-maps`, `react-dom`, `react-native-web`.
2. Remove `overrides.expo-location` (`package.json:143`) in the **same commit**
   (D3). Nothing else in the override map changes.
3. `rm -rf node_modules` is **not** required; run:

```bash
npm install
npx expo install --check
npm ls react-dom react-native-web @teovilla/react-native-web-maps @expo/metro-runtime
npm ls expo-location                    # exactly one 57.0.22, deduped
npm ls --all | wc -l                    # record the drop
```

If `expo-location` shows a nested copy or `npm install` reports `EOVERRIDE`,
something still references the web maps package — fix the reference first, then
`npm dedupe`.

Checkpoint: full suite + `npx expo prebuild --platform android`
(**no `--clean`**, per `AGENTS.md`) to prove the native projects still
generate. `android/` is gitignored prebuild output (`android/` in
`.gitignore:15`), so there is nothing to diff — the check is that prebuild
finishes without warnings about the removed config and that
`npx expo run:android --variant debug --no-bundler` still compiles if you want
the stronger signal.

### Phase 4 — Docs

1. `README.md:247`: "Android or iOS device" → state the real support matrix,
   e.g. "Android 8+ (full) or iOS (stats, calendar, backup; no map view yet)".
2. `AGENTS.md`: Platform Compatibility section — mobile only, drop `.web.tsx`
   from the file-extension rule; delete the `expo-location` override bullet
   (line 194).
3. `docs/status.md`: one "Recent Updates" entry — what was removed, the
   dependency/override win, suite 413 → 408, and that history entries
   mentioning web are kept as history.
4. Grep sweep as a check, expecting only legitimate hits:

```bash
grep -rni "web" --include='*.ts' --include='*.tsx' --include='*.json' --include='*.md' \
  src app.json README.md AGENTS.md | grep -vi webdav
```

Remaining hits should be only: `WebDAV`/`webdav`, the Nextcloud "web server"
prose in the README, "Strava web UI"/"website", and `docs/` history.

### Phase 5 — Guard (D7)

1. Add `scripts/check-mobile-only.cjs` (assertions 1–4 above).
2. `package.json`: `"check:mobile-only": "node scripts/check-mobile-only.cjs"`.
3. Call it from `.github/workflows/build.yml` beside the existing lint/import
   checks and add it to the Definition of Done in `AGENTS.md`.
4. Prove the guard: temporarily create `src/tmp.web.ts`, run it, see it fail,
   delete, see it pass.

### Phase 6 — Verification and release sanity

| Check | Command / action | Expected |
|---|---|---|
| Deps consistent | `npx expo install --check` | up to date |
| No web packages | `npm ls react-dom react-native-web @teovilla/react-native-web-maps` | empty |
| Types | `npx tsc --noEmit` | clean |
| Lint | `npx expo lint` | 0 errors (19 pre-existing warnings) |
| Imports | `npm run check:imports` | clean |
| Guard | `npm run check:mobile-only` | pass |
| Tests | `npm test -- --watchAll=false` | 408/408 |
| Native config | `npx expo prebuild --platform android` | no `android/` diff |
| Android smoke (`npx expo start --android`) | Home (mini map renders), Activities, Details + track, Stats, Calendar, Settings → Backup connect/test, Export share sheet | unchanged |
| iOS smoke (`npx expo start --ios`) | Home/"No maps (default)" stub as before, Stats, Calendar, Backup | unchanged |
| Sonar | `scripts/sonar_gate.sh --scan` (last) | 0 open issues |

### Commit sequence

```
chore(platform): drop the web target (screens, metro resolver, app config)
refactor: strip web-only branches from native code paths
chore(deps): remove react-dom/react-native-web/web-maps and the expo-location override
docs: state the mobile-only support matrix
test(guard): fail on new web-only code
```

## Risks and mitigations

| Risk | Why it bites | Mitigation |
|---|---|---|
| `EOVERRIDE` reappears | override and direct dependency disagree — the exact failure that motivated this plan | remove `@teovilla` + the override in one commit, then `npm install` + `expo install --check` |
| Nested `expo-location@15` sneaks back | anything still depending on the web maps package | `npm ls expo-location` must show one deduped 57.0.22 |
| Jest preset wants `react-dom`/`react-native-web` | some Expo presets reference the web renderer | verified: default preset is `@react-native/jest-preset` with `defaultPlatform: 'ios'`; if a jest run complains, add `react-dom` back as a devDependency only |
| Bulk `web:` deletions damage neighbouring code | 10 files, `Platform.select` blocks also contain `ios`/`android` keys | occurrence-counted replacements, dry-run diff, run the affected specs (`AGENTS.md` bulk-edit rule) |
| iOS regressions | iOS resolves the generic `.tsx` stubs; easy to forget when deleting `.web.tsx` | do not touch the stubs; smoke-test iOS |
| Deleting `webFileSystem.spec.ts` hides a real bug | it also pins "imports the service modules without touching the file system" | the lazy getters stay (D5) and `__tests__/fetchAndStoreStreams.spec.ts` still covers the cache paths |
| Concurrent session work | another session currently has staged src changes | land that work first; keep these commits scoped with explicit pathspecs (`git commit -- <paths>`) |

## Out of scope

- Implementing maps on iOS (the stub is the current product decision; a real
  iOS map is its own project).
- Editing historical documents that mention the web build
  (`docs/status.md` old entries, `docs/sdk55-upgrade-assessment.md`,
  `docs/deprecate-strava-api-path.md`, `docs/memoization-audit.md`,
  `docs/review/…`). They are a record of what happened; only new entries are
  added.
- The untracked `docs/recording-plan.md` / `recording-plan.html` in the working
  tree (another session's files).
- Revisiting `expo-file-system` legacy cleanup around
  `fetchAndStoreStreams.ts:410-421` (pre-existing, unrelated to web).

## Expected result

- 2 platform-abstraction files and 1 spec deleted (246 LOC, 5 tests).
- 4 direct dependencies removed, plus the `expo-location` override — the
  maintenance class that just cost us a broken `expo install --fix` disappears.
- 11 style entries + 2 behaviour guards + the `SimpleLogger` console echo (flag + 3
  branches) + 1 metro resolver + 1 app config block
  + 1 script + 2 doc rules gone.
- Native bundles, runtime behaviour and the test suite (minus web-only specs)
  unchanged; supported platforms stated explicitly in `app.json`, the README and
  `AGENTS.md`, and enforced by `npm run check:mobile-only`.
