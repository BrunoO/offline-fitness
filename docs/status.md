# Offline Fitness Status

## Project Overview

A React Native/Expo app for personal Strava activity analytics, fully offline: activities and tracks
are imported from a Strava data-export archive (no API subscription, no OAuth).

## Features

### Data Import

- [x] Import activities and tracks from a Strava data-export archive (no API/OAuth)
- [x] Idempotent, resumable import (upsert by id, existing streams never overwritten)
- [x] UTC archive dates converted with the device timezone

### Activity Management

- [x] Local storage of activities
- [x] Activity deletion with stream cleanup
- [x] Automatic activity type detection
- [x] Activity count display
- [x] Sort activities by date (most recent first)

### Navigation

- [x] Drawer navigation
- [x] Home screen with activity overview
- [x] Activities list view
- [x] Maps view with activity visualization
- [x] Stats view with activity analysis
- [x] Logs view for debugging

### Data Visualization

- [x] Mini map preview on home screen
- [x] Activity streams visualization
- [x] Activity route display on maps
- [x] Statistical analysis in Stats view

### UI/UX

- [x] Strava-themed color scheme
- [x] Loading states and progress indicators
- [x] Responsive layout
- [x] Safe area handling
- [x] Gesture support for maps and lists

## Technical Details

### State Management

- Global activities state in App.tsx
- Local storage for persistence
- Stream caching for performance

### Data Flow

- Strava API → Local Storage → App State → UI
- Automatic updates on new activity fetch
- Background stream loading

### Performance Optimizations

- Stream data compression
- Lazy loading of map data
- Efficient list rendering
- Cache management for streams

## Known Issues

- Stream fetching may hit rate limits with large activity sets
- Some activities may not have associated streams
- Map loading can be slow with many activities
- `expr-eval` has two open CVEs (prototype pollution, unrestricted function evaluation) — no upstream fix available; the library is used only for user-defined goal expressions evaluated on trusted local data, so impact is low

## Future Improvements

- [ ] Activity filtering by type
- [ ] Advanced statistics and trends
- [ ] Batch operations for activities
- [ ] Offline support improvements
- [ ] Enhanced map interactions
- [ ] Activity search functionality

### App.tsx Refactoring

- [ ] Create dedicated Activity Service
  - Move activity fetching logic (`fetch_activities`, `prepare_data`)
  - Handle activity state management
  - Implement activity transformations
- [ ] Implement proper State Management
  - Move from useState to Context or Redux
  - Create separate stores for activities, auth, and UI state
  - Implement proper state persistence strategy
- [ ] Create Activity Types Module
  - Move `ResponseActivityType` and other types to dedicated file
  - Implement proper type validation and transformation
- [ ] Implement Data Layer
  - Create Repository pattern for activities
  - Separate storage logic from App.tsx
  - Implement proper caching strategy
- [ ] Improve Error Handling
  - Create centralized error handling
  - Implement proper error reporting
  - Add retry mechanisms for failed operations
- [ ] Enhance Authentication Flow
  - Move auth logic to dedicated service
  - Implement proper token management
  - Add session handling
- [ ] Create UI Components Library
  - Extract reusable components
  - Implement consistent styling
  - Create component documentation

## Dependencies

- React Native
- Expo
- React Navigation
- Expo Location
- React Native Maps
- Victory Charts
- Strava API v3

## Build Information

- Using Expo managed workflow
- Targeting iOS and Android platforms
- Current version tracked in app display

## Recent Updates

- **WCAG 2.1 AA contrast compliance & palette-tinted splash screen** — fixed low-contrast text overlaps across the app, added a project-wide WCAG 2.1 AA accessibility requirement in `AGENTS.md`, and modernized the splash screen:
  - **Palette-tinted splash screen** (`app.json`, `App.tsx`): replaced legacy hardcoded `#FFFFE0` yellow with Twilight's soft tint (`#F3EEFF`, dark mode `#241E3A`) in `app.json`. Added an in-app splash transition in `App.tsx` that renders the user's active palette tint (`theme.primarySoft`) and smoothly fades out over 350ms once startup backfills complete.
  - **Tinted bar charts** (`RecentMonthsScreen`, `RecentWeeksScreen`, `RecentYearsScreen`): horizontal and vertical bar charts now use tinted fills (`fillOpacity: 0.25`) with a solid series stroke (`strokeWidth: 1.5`), and explicit `theme.text` labels. This brings label contrast from ~2.16:1 up to >11.8:1 on the bar and 17.7:1 on the card surface, ensuring text is clearly legible across all palettes in both light and dark modes regardless of bar length.
  - **Calendar streak text contrast** (`ActivityCalendarPeriod`): active streak days without an achieved weekly goal (`theme.primary + '60'`) now use `theme.text` instead of `theme.onPrimary`, raising text contrast from ~1.95:1 to >10.5:1.
  - **Table max value highlight** (`RecentYearsScreen`): `maxValueText` on `theme.primarySoft` now uses `theme.textStrong` with bold weight, fixing a 3.24:1 contrast failure caused by `theme.info`.
  - **Accessibility test suite & guidelines**: added contrast assertions in `__tests__/theme/theme.spec.ts` for soft backgrounds and documented WCAG 2.1 AA compliance rules in `AGENTS.md` Definition of Done and Theming sections.

- **Manual entry: type list is personal now (frequency + memory + custom types)** — the fixed built-in row is gone. Chips start with the last-used type (remembered on every save), then the user's own archive by frequency, then their declared customs, then the built-in defaults as fallback. A dashed **+ New** chip opens an inline name field (24 chars max, case-insensitive dedup, capped at 20, persisted in AsyncStorage). Pure `buildManualTypeList` + `manualEntryPrefs` service, 8 new tests. Suite 413/413; tsc/lint/check:imports clean.

- **Manual entry: digits-only start time, presets dropped** — the Now/07:00/12:00/18:00 chips are gone; one numeric field takes 4 digits ("1830" → "18:30", colon auto-inserted, `selectTextOnFocus` so typing replaces the default). Validation and the `buildManualActivity` contract are unchanged.

- **Sonar cleanup from the manual-entry work: 0 open issues, duplication 1.8% → 1.0%** — the first SonarCloud scan of the new code raised 6 issues, all fixed in code (no won't-fix transitions): two nested ternaries → `dayCountLabel` / `formatDurationLabel` helpers, nested template literal folded into the same helper, Details header button hoisted to module-level `AddActivityHeaderButton` + `useCallback` factory, validation throws → `TypeError`, `Math.random` ids → monotonic per-session counter. The SheetFooter extraction also pulled the Day sheet off the duplication list; a second pass extracted the shared modal frame (`createSheetFrameStyles`, values parameterized so no pixel changed) shared by `ManualActivitySheet` and `SettingsModal`. Remaining duplication (7 blocks) is pre-existing theme data (`palettes.ts`, `resolve.ts`), untouched. `scripts/sonar_gate.sh --scan` passes (0 open); the SonarCloud quality gate itself still shows ERROR only on `new_coverage` (61.6% vs the 80% "clean as you code" bar — the new sheets have no UI tests). Suite 405/405; tsc/lint/check:imports clean.

- **Web boot crash fixed: file-system handles are now lazy (full maps-on-web still needs an IndexedDB backend)** — `expo-file-system` has no web implementation (stub warns "not supported on web", constructors throw `validatePath is not a function`), and `exportData.ts` + `fetchAndStoreStreams.ts` built `new Directory(Paths.document, …)` at module level — so opening the app on web died at import time inside the shared/activities barrels. Both folders are now constructed by cached lazy getters: stream readers/deletions degrade to "no cache" (`loadStreamForActivity` → null, counts → 0 downloaded, `deleteStreamFiles` → no-op), and the no-stream derivation keeps working (no cache to list + no GPS fix = stream-less, as designed). `exportData` throws an explicit "not available in the web version" on web, and the drawer's Export item pre-empts it with an alert. Web limits that remain: no stream cache (so no maps/charts from tracks), no backup (SecureStore has no web impl), no export. The real fix for maps-on-web is a storage seam — native keeps expo-file-system, web gets an IndexedDB backend for the ~47 KB binary payloads (localStorage's ~5 MB quota can't hold a full collection) — scoped as follow-up work, not done here. Tests: `__tests__/shared/webFileSystem.spec.ts` (5: imports clean under throwing FS stubs, readers/counts degrade, delete no-ops, export resolves-or-refuses). Suite 405/405; tsc/lint/check:imports clean.

- **Added trailing `// NOSONAR` annotations to sequential `await` loops (S9382)** — in-place trailing `// NOSONAR` annotations with brief architectural rationales were added to all 15 intentional `await`-in-a-loop occurrences across `fetchAndStoreStreams.ts`, `backupSync.ts`, `webdavTransport.ts`, `exportData.ts`, `MapsScreen.web.tsx`, and `zipReader.ts`. These sequential loops are necessary to prevent OOM on mobile devices during stream/zip processing, respect native modal share sheet sequencing, maintain parent-before-child directory order in WebDAV, and preserve worker concurrency limits. The trailing comments ensure SonarCloud suppresses them completely on subsequent scans rather than keeping them as Accepted issues in the Sonar UI. Prettier, TypeScript (`tsc --noEmit`), and all 400 unit tests pass clean.

- **Manual activity entry (V1): Yoga-type activities can now be added on the phone** — archives only carry what Strava recorded, so GPS-less sessions were import-only. Three entry points share one `ManualActivitySheet` modal (mounted at `AppContent` level via `ManualEntryProvider`, like `SettingsModal`): a **+** in the Details header, an **Add activity** drawer item, and a **+** in the Home calendar header plus tapping any calendar day. The calendar tap opens a new `DayActivitiesSheet` listing that day's activities (empty or not — multi-activity days no longer silently pick the most recent) with an "+ Add activity on this day" button prefilled with the date. The form is one screen, fully prefilled (Yoga / today / now / 60 min), so the common case is type + Save; date/time use preset chips + plain inputs (no native picker: identical on iOS/Android/web and unit-testable). Records are built by `buildManualActivity` (device zone is the source of truth, swim canonicalisation at write time, `manual-<utc>-<rand>` ids) and stored through a new `addActivity()` in `useActivities`/context (sorted insert, count bump; the next push uploads it as unknown md5). GPS tracking later docks without rework: the drawer slot stays free for a real `Record` screen, and `RECORD-CHOOSER` comments mark where the Details/drawer entries become a Track/Manual chooser. Tests: `__tests__/activities/manualActivity.spec.ts` (11: builder fields/validation/uniqueness + hook store-and-sort). Suite 400/400; tsc/lint/check:imports clean.

- **Purged `example_activity.json` (personal data) from repo and history** — the file was committed by mistake in the root commit and pushed to `origin/main`. Removed with `git filter-repo --path example_activity.json --invert-paths` (all 53 commits rewritten), added to `.gitignore`, and fixed the dangling `(see example_activity.json)` comment in `activityDates.ts`. Follow-up required on GitHub: force-push, then ask GitHub support to purge cached views, and check forks/clones.

- **Final review of the import/backup arc: one latent ping-pong killed, one pin corrected** — a deliberately adversarial re-read of the session's ~15 commits before building found two things the test suite couldn't (both were green):
  - **Fallback-Swim elevation gain would have ping-ponged.** `rowToActivity` zeroes the gain only when the CSV type is already `Swim`; a record flipped by the GPX fallback kept its CSV gain while `applySwimMovingTime` fixed only the moving time — and the phone's startup backfill zeroes *any* Swim gain, so the next push would re-upload and the next seed would restore the non-zero value, forever. Same class as the 200-swim churn, one field over, dormant only because no archive on hand has that shape. The helper now canonicalises both fields (in-place, key order untouched), the seed fixture carries a non-zero gain end to end, and the stale "same effect as the phone importer" comment in `seed.ts` went with the deleted importer.
  - **`geo-tz` was caret-pinned (`^8.1.10`)** while the plan declares its version a data migration (boundary changes re-bucket travel records). Now exact-pinned; the lockfile already holds 8.1.10 so nothing reinstalls.
  - Also swept: a comment in `nodeSource.ts` pointing at the deleted `expoByteSource.ts`, and a README line claiming restore "never overwrites" (untrue since hash-verified refresh — it now says what actually happens). Verified clean otherwise: no secrets or personal data in any commit, `testdata/` never entered history, the status suite-count chain reconciles commit by commit (368→369→378→394→378→380→383→385→388), CLI flags and Settings paths in the docs match the code, and the full suite passes with the fixes (389/389).

- **Sync/restore status lines break down activities vs streams** — "3,887 unchanged" totals the two populations into one uninformative number. Push now reports `X activities + Y streams uploaded, A activities + B streams unchanged (, D deleted)`; restore reports per-kind restored/downloaded/already-present plus refreshed — each with the same up-to-3-ids suffix, and the error-path alerts split the same way. The LogScreen entries already carried everything (counts, all six id lists trimmed to 25, full errors array) — verified, no change needed there.

- **Disconnect is a real button now, with a confirmation** — in Settings → Backup it rendered as muted plain text (no button chrome, unlike Sync/Restore beside it), so it read as a label rather than something tappable. It now shares their bordered button style and disabled-during-sync handling. It also confirms before acting, like every other destructive action in the app: the dialog states that only the stored credentials leave the phone and the server backup is untouched.

- **Routine WebDAV control-flow statuses no longer log as errors** — a phone log showed `ERROR: WebDAV request failed {MKCOL …/streams/, 405, "already exists"}`. Benign: 405 is Nextcloud confirming the folder is already there, and `ensureDavFolder` treats 405/301 as success. The defect was severity, not behavior: the transport logged red *before* the caller classified the status, so every sync emitted several ERROR entries (app id, profile, activities, streams folders) that bury genuine failures in the LogScreen. `davRequest` now takes expected statuses that still throw for the caller to branch on but skip the error log; `ensureDavFolder` passes `[405, 301]`, `deleteDavFile` passes `[404]`. Deliberately unchanged: GET 404s stay loud (a 404 on a file the index lists is usually real inconsistency; the fresh-account ones happen once per folder lifetime) and 5xx/auth still log with method+url+body. Tests: routine 405/404 assert silence, a 500 asserts the error log with context. Full suite green; tsc/lint/check:imports clean.

- **Fixed the tool's self-inflicted 423s: serialized state writes + 423 retried** — an 8-way seed died at 750/2135 with `423 Locked` while serial runs sailed through. No duplicate ids in the archive (2,135 unique, verified), no shared track files — the overlap was mine: checkpoint PUTs fired by different workers overlapped *in time* on `sync-state.json` (worker A starts the ~300 KB state PUT at done=700; seven others blow through 100 mostly-skipped rows in milliseconds and fire done=800 while A's is still in flight), and Nextcloud's file lock rejects the second writer. I had reasoned "one worker per done-value means no coordination needed" — true for *triggering*, false for *non-overlap*.
  - State writes now go through one promise chain (order between them doesn't matter — maps only grow — only that they never run together), skipped entirely when nothing changed (dirty flag: all-skip runs do zero interim writes, locked by test), and 423 joins the retryable set (408/429/5xx/drops) since a lock is usually transient contention, rclone treats it the same way. Persistent 423s still abort naming the file.
  - Tests: state writes never overlap under an artificial delay (max in-flight 1), 423-retry converges, dirty-skip pinned on the idempotency re-run. Suite 385/385; tsc/lint/check:imports clean.
  - Server-side note for the runbook: a 423 can also be a *stale* lock from an earlier killed run or a concurrent phone push — keep the phone idle during seeds, and re-try before assuming the worst; with checkpoints + retries a re-run is cheap either way.

- **Tool uploads now survive a flaky server: retries, checkpoints, named errors** — a real seed died at 2035/2135 with `fetch failed` against a Nextcloud box that answered `curl` fine seconds later: the 8-way PUT burst saturated the small server mid-run, and one dropped connection aborted the whole run *and* discarded its progress (state only wrote at the end, so every retry re-did ~2,000 files). Three changes in `seed.ts`: each PUT retries transient failures (dropped connections, 5xx/429 — never 4xx) up to 3 attempts with backoff, aborting with `activity <id>` / `stream <name>` in the message instead of a bare "fetch failed"; `sync-state.json` checkpoints every 100 activities (safe at any cadence — the maps only reference already-PUT files) plus a best-effort checkpoint on abort, so a re-run resumes the completed prefix; the worker keeps the first fatal error rather than the last racer. Standing advice for small self-hosted boxes stays `--concurrency 1/2` (proven on the same server that choked at 8).
  - Tests: retry-then-converge, abort-names-the-file (4 rows × 3 attempts = 12), and an incremental-resume test that kills a run mid-prefix and asserts the re-run transfers only the tail. The old abort test's "no state write" assertion became its opposite (abort checkpoints the prefix — verified as a valid partial state). Suite 383/383; tsc/lint/check:imports clean. (One unrelated slow UI spec flaked on timeout under parallel load twice; green solo and on re-run.)

- **Sync summaries now name files, not just counts — and the drawer wipe is awaited and verified** — the stream ping-pong took a full investigation to attribute because "1 uploaded" never said *which one*. Both gaps closed in one pass:
  - `SyncSummary` gains `uploadedActivityIds`/`uploadedStreamNames`/`deletedRemoteIds`; `RestoreSummary` gains `restoredActivityIds`/`restoredStreamNames` plus `refreshedStreamNames` (downloads that overwrote an existing file — a recurring name there across syncs *is* the divergence signal). The drawer status lines name up to 3 ids inline (`1 uploaded (streams/9.json)`); the full lists travel in the returned summary, trimmed to 25 in the LogScreen so a full-collection sync stays readable on low-end devices. The tool's report prints an `IDs:` line the same way.
  - The wipe-then-restore ordering hazard is fixed at the source: "Clear Local Activities" awaited nothing — `removeAllActivities()` ran fire-and-forget while the UI blanked instantly, so a quick Restore could interleave with the deletion, keep a stale survivor via local-wins, and re-upload it over the server's copy on the next push. The handler now awaits the batch, verifies zero activity keys remain before blanking the display, refuses double-tap while clearing, and reports failure honestly (display untouched) instead of pretending success. The confirm copy also says what the wipe is for (refill via Restore) and that cached tracks are kept.
  - Tests: id-list assertions on the fresh-seed, pull, refresh and tombstone cases. Suite 380/380; tsc/lint/check:imports clean; live `--dry-run` shows the new `IDs:` line.

- **Restore now heals stale streams instead of preserving them (ping-pong fix)** — observed live after the Phase-6 rollout: a push uploaded 1 stream, a re-seed uploaded the same stream again, and the next push re-uploaded the phone's copy — an infinite two-writer loop on one file. Mechanism, verified in code: the drawer wipe deletes activity records but keeps the 98 MB stream cache; restore skipped any stream file that merely *existed*; push uploads any local file whose bytes differ from the index. So a stale cache copy could never be refreshed — and each push reinstated it over the server's good copy. Full-suite reproduction against the real archive proved neither startup backfill can fire on canonical data, leaving the skip-on-exists rule as the only suspect, and the Nextcloud mtime confirmed the loop on a single id.
  - **Fix**: pull now hashes an existing local stream against the index and re-downloads on mismatch (re-downloads count as restored). Safe by construction: nothing on the phone ever edits stream bytes — backfills only touch activity records — so a mismatch is staleness or corruption, never a local edit worth preserving. A failed local read only records an error and keeps the file; tombstones still win over the refresh (a deliberately deleted activity is never resurrected, its orphaned file still cleaned up). **Activities keep local-wins**: backfilled `bounding_box` on legacy records is legitimate local state an overwrite would destroy.
  - This is Phase 3's hash-on-restore, delivered for streams where it is provably safe; the `verify` command and any activity-side checking stay parked.
  - Tests: `backupPull.spec.ts` gains a node-backed `expo-crypto` mock (a constant mock would make every file "match" — the one thing these tests must distinguish), +2 cases (mismatch refreshes, tombstone still wins over a differing copy), the pre-existing skip test now carries a genuinely matching hash, and the spec's mock `File` gained the `delete()` the orphan-cleanup path always needed. Suite 380/380; tsc/lint/check:imports clean.
  - For the live install: the next phone **Restore** (no wipe needed) heals the 1 stale stream; the push after it should report 0/0, and the tool seed after that should skip everything.

- **Phase 5: the phone no longer imports archives — ingestion is desktop tool → WebDAV → Restore** — with `tool:seed` proven end to end, the in-app importer became the app's slowest, most fragile path (a 1 GB archive copied into the cache, 2,000 GPX parses and stream writes on device storage) for a job the computer does in seconds. Removed: `StravaImportModal`, `importStravaExport.ts` (orchestrator, picker, live-state, keep-awake wiring), the drawer item and home *Import* row, `importStravaExport.test.ts`, and the `expo-keep-awake` dependency. ~1,500 lines of app code deleted; the archive never touches a phone again.
  - **Deletion is locked, not just done**: the portability guard gained a scan that fails the day any of the removed names (`StravaImportModal`, `importStravaExport`, `expoByteSource`, `expo-keep-awake`, `pickFileAsync`) reappears under `src/`. The pure core (parsers, ZIP reader, mapper, `streamCodec`) stays under `src/` exactly as the plan called for — the tool imports it, the byte-identity guarantee is structural, and `strava-import`'s barrel now documents a library instead of a feature with screens.
  - **The plan's flag assumption was wrong, and the plan got corrected**: `getNoStreamFlagIds`/`countStreamsStatus` were not dead code — the Details "hide no-stream" filter and Home's Streams row consume them, and tool-seeded collections never have flag files, so deleting the mechanism would have silently broken both. Instead the set is now *derived*: `getNoStreamIds(activities)` = records with no GPS fix and no cached stream file — the exact set the importer flagged (it wrote flags iff `start_latlng` stayed empty), computed live instead of remembered on disk. Legacy installs with flag files converge to the same answer (the derivation ignores the files); the new spec asserts both the derivation and that flag files on disk change nothing.
  - The `@/shared` barrel keeps `decodeUtf8`-era core intact; `docs/prompts` and the swim/legacy read-time fix in `loadAllActivities` are untouched. `schemaVersion` stays 2 — record *content* changed (per-GPS zones, Phase 4), the folder layout did not.
  - Docs rewritten in the same commit: AGENTS.md (feature tree, data flow, fragile areas, ingestion section, checklist item 1, quick reference), README (intro, What-it-does, roadmap item 2 marked *done*, "Getting the data in" now the tool flow, keep-awake fine print replaced by why ingestion moved), architecture (mermaid: archive → tool → WebDAV instead of a phone edge, section 6 rewritten as the conversion core + seeder), and `docs/desktop-import-plan.md` Phase 5 marked done.
  - Verification: full suite 378/378 (the deleted importer suite replaced by the derivation spec's +3 tests), tsc/lint/check:imports clean, and a live `--dry-run` smoke over the real 2,135-row archive reproduces the Phase-4 baseline exactly (same 1,752 streams, same zone report `Europe/Paris ×2102, Europe/Lisbon ×10, …`), proving the tool never depended on the deleted half.

- **Desktop tool, Phase 4: travel activities are bucketed in the zone they happened in** — the archive carries no timezone (verified against the real export: 103 columns, `Heure de début` empty on all 2,136 rows), and the old behavior — every record bucketed in whatever zone the writing machine is in — means a Porto holiday rides on Paris time. `rowToActivity` no longer reads the device's `Date`-local methods: local fields are derived via a new `utcToLocalParts(utcMs, zone)` (`Intl.formatToParts`, formatter-cached), so the zone is an input, not an ambient dependency. The phone importer passes `deviceTimezoneLabel()` and its bytes are unchanged; the desktop tool now passes the zone of each track's **first GPS fix** — `geo-tz` (pinned devDependency, ~71 MB of boundary data that must never enter the app: the portability guard gained a `DESKTOP_PACKAGES` rule allowing it only under `scripts/`), with `--tz` as the fallback for GPS-less rows (manuals, swims, `.fit`). `summary.zones` + a `Zones:` report line make the travel split auditable.
  - Measured on the real archive (dry-run, 6.8 s): `Europe/Paris ×2102, Europe/Lisbon ×10, Europe/Berlin ×10, Europe/London ×8, Europe/Zurich ×3, Europe/Athens ×1, Europe/Rome ×1` — 33 records will re-upload on the next seed (the rest keep their exact bytes and skip). None of them change calendar day today; the display times and future long-haul trips are what this fixes.
  - **Determinism is now a versioned property**: a record's md5 depends on the geo-tz database, so upgrading it is a data migration, and the seed's `lookupZone` is injectable (fakes in tests, real DB only in `cli.ts`). With `lookupZone` absent the output is byte-identical to pre-Phase-4 — guarded by a diff test.
  - Tests: `activityMapper.spec.ts` +5 (Paris summer/winter/DST-switch goldens — the winter golden caught my own wrong assumption about early-October CEST, which is exactly what goldens are for —, cross-zone day bucketing, unknown-zone guidance); `seed.spec.ts` +3 (zone from GPS start, `Etc/GMT+12` day-crossing, lookup-absent byte stability). Suite 394/394; tsc/lint/check:imports clean. Real-archive `--dry-run` smoke via tsx. Phases 5 (retire the phone importer) and 6 (rollout runbook) are next in the plan.

- **The Home header now says when the backup last ran** — the `headerRight` slot read "Offline archive", which described the data source rather than anything the user could act on. It now shows `Synced 2 h ago` / `Synced 9 days ago` / `No backup yet`, read from the already-persisted `backup_last_sync`, so nothing new is stored.
  - New `relative_time_label(iso, nowMs?)` in `src/shared/utils/utils.ts` beside `seconds_to_label`: minutes → hours → days up to a month, then the date itself; `null` for a missing or unreadable stamp; a clock-skewed future value reads "just now". `nowMs` is injectable so the tests are deterministic — 4 cases in `__tests__/utils-misc.spec.ts`.
  - Refreshed on screen focus and on pull-to-refresh. Deliberately not live: the Settings sheet is a `Modal`, and dismissing it fires no focus event, so a just-finished sync shows up on the next navigation.
  - **The old label was also un-themed**: a bare `<Text>` in RN's default black, which would have been invisible on a dark palette. It now reads `theme.textMuted` and lifts to `theme.textStrong` past `STALE_BACKUP_MS` (14 days). `theme.warning` is deliberately unused — `theme.spec.ts` guarantees 4.5:1 for text, textMuted, primary and success, but not for the semantic warning colour (`#FFA000`).

- **The drawer is for navigation again: app-global settings moved to a Settings item** — the WebDAV backup form and the palette picker both lived *inside* the drawer body, which is a panel that never unmounts (react-navigation-drawer only translates it off-screen).
  - **New drawer item "Settings"** (`src/shared/components/CustomDrawer.tsx`) closes the drawer and opens the new **`SettingsModal`** (`src/shared/components/SettingsModal.tsx`), mounted at `AppContent` level — a `Modal` sibling of the navigator, not a child of the drawer panel. It is a plain `Modal` (like the Stats settings and the import sheet), and it returns `<></>` while closed: `Modal` renders `null` when hidden on Android but keeps its children mounted on iOS until the dismiss event lands, so the guard is what stops the backup inputs and their secure-store read from lingering.
  - **What moved in**: the whole `BackupSection` (connection form, Connect/Disconnect, Sync now, Restore, last-sync) and, from `StatsTab`, the **Appearance** section with `PalettePicker`. The palette applied straight away inside a modal whose other controls are staged behind Save/Cancel — so *Cancel* silently did not revert it. In a settings screen with no global Save button that contradiction disappears.
  - **What stayed**: navigation items, Export Data, Import Strava Export, Clear Local Activities, Close drawer, Close App. Those two long-running actions are the next candidates for the same treatment, and `StravaImportModal` is still rendered by both the drawer and `HomeScreen`.
  - **Why this also matters for the stuck drawer**: unreproducible since, but the only two things in *our* code that could perturb the drawer's React tree while it was open were the four live `TextInput`s (the keyboard resized the open panel — `ime:[0,0,0,953]` is in the log of the stuck session) and `BackupSection`'s per-file `setStatus` during a sync, i.e. thousands of renders inside the panel at the moment it broke. Both are now outside it. This is not a proven fix for the `@react-navigation/drawer` desync (state `closed`, panel visually open, so `CLOSE_DRAWER` is a no-op and the back handler is never registered); it removes the trigger we control.
  - README's two "drawer → **Backup**" instructions and the theme doc's "surfaced in the Stats settings modal" line updated. No test covers these hosts; `palettePicker.spec.tsx` tests the component itself. 378/378 pass; tsc/lint/check:imports clean.

- **Activity start time surfaced in the Home card and the activity list** — two display spots showed only the date:
  - **`LastActivitySummary` (Home "Recent Activity" card)**: new 🕐 row under 📅 in the right column rendering `local_time` as `HH:MM` (seconds dropped for compactness); hidden when the field is empty.
  - **`activityToString` (`shared/utils/utils.ts`)**: now `… on 15/7/2023 at 16:14 for 1h 0m 0s` — the time clause is skipped when `local_time` is missing. All three consumers gain it (activity list via `ActivityListItem`, web maps list, Android map-marker "Start of …" description).
  - The list item's trailing speed suffix was reworded `' at … km/h'` → `' at avg … km/h'` so the string doesn't read "at 16:14 … at 12.3 km/h".
  - Tests: `__tests__/utils-misc.spec.ts` activityToString now covers with- and without-`local_time`. Suite 379/379; tsc/lint/check:imports clean.

- **Swim `moving_time` is now canonical at write time, ending the backup-push churn** — observed in the field: after seeding a collection with the desktop tool, the phone's first push reported "200 uploaded, 3,687 skipped" on a freshly restored app. Cause: `loadAllActivities` (storage.ts) fixes swim records at read time (`moving_time := elapsed_time`, Strava computes no moving time for swims), and `pushBackup` hashes *what it loads* — so every swim's md5 differed from the CSV-faithful file the tool (or the phone's own importer) had written. The 200 matched the archive's swim count exactly; everything else skipping proved the byte-identity design working. The dangerous part was the steady state: the tool would write the CSV value, the push would overwrite it with the fixed value, the next tool run would re-upload… forever.
  - **Fix at the source**: `rowToActivity` now applies the rule when building the record, and both importers re-apply it via the new `applySwimMovingTime` after the GPX `<type>` fallback (the path where a record becomes `Swim` after mapping). The stored bytes now equal the pushed bytes on every path — phone import, desktop tool, restore + re-push — and the read-time fix in `loadAllActivities` remains exactly where it should be: a legacy shim for records written by older builds, a no-op for everything else.
  - `moving_time` keeps its position in the record literal either way, so key order — and therefore every writer's md5 — is stable.
  - Convergence for existing installs: the phone's *stored* swim copies stay CSV-faithful until the next import or seed (local-wins never rewrites them), but their push already hashes the fixed version which matches the current server state — quiet either way. Re-running the fixed tool uploads canonical files that hash equal to what the phone pushes, so nobody re-uploads again.
  - Tests: new `__tests__/stravaImport/activityMapper.spec.ts` (6: canonical write, non-swims untouched, key-order stability, helper no-op/idempotence), `importStravaExport.test.ts` +2 (both type paths; and the real regression guard — re-serialising what `loadAllActivities` returns equals the stored bytes, which is exactly the push's hash input), `desktopImport/seed.spec.ts` +1 (GPX-fallback swim uploaded canonical). Suite 378/378; tsc/lint/check:imports clean.

- **Backup sync, Phase 2: concurrent requests and batched restore writes** — the sync loops awaited one WebDAV request per file, so a seeded collection of ~4,150 files meant ~4,150 sequential round trips on the phone: on a LAN each one is a few milliseconds of work behind a few milliseconds of latency, and the latency is the whole cost. `backupSync.ts` gained a small `runWithConcurrency` pool (6 in flight, shared by push and pull) — the importer's batches and the desktop tool's worker pool already used this shape; the backup path had been left behind.
  - **Restore activity writes are now batched**: pull used one `Storage.storeActivity` (`setItem`) per record — the same per-item native round-trip cost that pass 1 of the archive importer was rewritten to avoid. Downloads now feed a shared buffer flushed through `storeMultiActivities` in batches of 100 (mid-run flushes when the buffer fills, a remainder flush after the pool drains). Batches can end up smaller than 100 when concurrent flushes splice the buffer — harmless, `multiSet` order doesn't matter, and a test pins the invariant instead: sizes sum to the total, no batch exceeds 100.
  - **Semantics deliberately unchanged**: per-file errors are still collected without aborting (the pool requires workers that catch their own failures, so a rejection can never orphan the remaining slots), "local wins" is still checked before any GET is issued, `sync-state.json` is still written last, progress still reports per-file counts (`done` is now completion order rather than file order — under network jitter the sequential loop wasn't telling you anything else either).
  - The bundle/pack idea from the plan's Phase-2 tail is **not** taken: it should only be justified by measurement, and this change is what makes the measurement honest. If restore is still slow after this, the bottleneck is the phone's raw per-file write cost — not the requests.
  - Tests: `__tests__/backupPull.spec.ts` +1 (batch sizes), 5 existing assertions repointed from `storeActivity` to `storeMultiActivities`; `backupTombstones` local-wins assertion likewise. Suite 369/369; tsc/lint/check:imports clean.

- **Desktop import tool, Phase 1: `strava-import` seeds a WebDAV collection from a computer** — `npm run tool:seed` (a `tsx` CLI under `scripts/strava-import-tool/`) converts a Strava export ZIP into exactly the files the phone's importer + push would produce, uploading them straight into `<root>/offline-fitness/<profile>/` so the phone only ever runs *Restore*. No more 1 GB archive copy on the device, no 2,000 GPX parses on a phone CPU.
  - **Byte-identity is structural, not tested**: the tool imports the app's own conversion graph (`csvParser`, `gpxParser`, `activityMapper`, `zipReader`, `streamCodec`) and its own `webdavTransport`, so the phone's md5 dedup sees the tool's files as its own and skips them on the next push. Assignment order is even load-bearing: `bounding_box` must be set after the record literal (appended last) or the record's hash would differ from the phone's pass-2 serialisation — guarded by a key-order test.
  - **Contract with `pullBackup`, asserted against an in-memory DavClient**: `collection.json` (with `schemaVersion` 2) is claimed before any file goes up; `sync-state.json` is written **last**, so an interrupted run leaves a consistent smaller collection; re-runs are idempotent (only the state is PUT again); remote `deletedAt` tombstones are honored and preserved (a re-import cannot resurrect deleted activities); foreign-profile/foreign-app/wrong-version folders are refused; no `.nostreamflag` is ever uploaded, matching the phone's push. A dead archive aborts after 10 consecutive unreadable track reads (tested with structurally corrupted local headers).
  - **`--tz` is mandatory for imports** and verified at runtime (set `process.env.TZ`, then confirm `Intl` agrees, because local dates silently re-bucket calendar/streak/week stats if the computer lives in another zone). The password comes from stdin or `STRAVA_IMPORT_PASSWORD` — deliberately never a flag (argv leaks through `ps`).
  - **Enablers this made necessary**: `SimpleLogger` lost its `react-native` import (its web console-echo now checks `document` — Hermes aliases `window` on native, so `document` is the correct marker), which was `webdavTransport`'s last platform edge; `baseNameOf`/`normalizeEntryPath`/`isUnsupportedTrack` moved to a new pure `entryNames.ts` and `trackBoundingBox` joined `gpxParser`, because they were only reachable through `importStravaExport.ts` (AsyncStorage/expo-bound) which the tool must not import; `zipReader` switched to `import pako` + destructure (pako@1 is CJS without static named exports — a named import fails Node's ESM loader, though Metro never noticed). The portability guard now covers the transport, the logger, `@/constants` and every tool module.
  - Tests: new `__tests__/desktopImport/` (seed contract 18, nodeSource seam 5, args validation 16), portability guard 46 (+22 from the widened file set); plus a real plain-node smoke (`--dry-run` against a fixture archive, pinning `--tz UTC`) to prove the tool's runtime, which jest's vm context cannot (it ignores `process.env.TZ` changes — the tests seed with the ambient zone and compute expected local dates via `Intl` instead). Suite 368/368; tsc/lint/check:imports clean. Phase 2 (batched/concurrent phone restore) and Phase 3 (hash-on-restore verification) are next in `docs/desktop-import-plan.md`.

- **`Workout` now folds into `Yoga` via the merge-activities service** — the new app surfaced two activity types (`Workout`, `Yoga`) where the old one showed only `Yoga`. Cause: Strava has returned `Workout` for Yoga activities since 2025-08-20; the old app normalized that at ingest in the Strava API path (`activities.api.ts` → `normalizeActivityType`), but deleting the API path (old-repo commit `52df02c`) took its only call site with it, and the archive importer never wired the normalization in — `csvParser.mapActivityType` deliberately canonicalizes localized CSV/GPX names to `Workout` and `Yoga` as *distinct* types, so both persisted verbatim and appeared in the discovered-type chip lists.
  - **Fix location: `mergeActivities.ts`** — added `Workout: 'Yoga'` to `MERGED_ACTIVITY_TYPES` alongside `EBikeRide→Ride` and `Hike→Walk`. Chosen over re-normalizing at import because the merge runs at read time under the existing "Merge Similar Activities" toggle (default on): already-imported `Workout` records are folded without any storage migration, and users who disable the toggle keep both types visible. Since the fold happens before `isNoGpsActivity` filtering, merged sessions stay excluded from map/distance/elevation views exactly as `Yoga` was.
  - **Dead code removed**: `ACTIVITY_TYPE_NORMALIZATIONS` / `normalizeActivityType` in `shared/utils/activityCategories.ts` (orphaned since the API-path deletion, byte-identical in the old repo) are gone — `MERGED_ACTIVITY_TYPES` is now the single source of truth for type folding.
  - Tests: `__tests__/activities/mergeActivities.spec.ts` +1 ("folds Workout into Yoga": a `['Workout','Yoga']` chip list collapses to `['Yoga']` and both activities relabel). Suite 368/368 (pre-existing flake in `desktopImport/seed.spec.ts` on the user's uncommitted WIP, unrelated); tsc/lint/check:imports clean.

- **Desktop import tool, Phase 0: the archive-conversion code is now a guarded portable core** — `docs/desktop-import-plan.md` carves the Strava-ZIP conversion into a graph a desktop tool can run outside React Native. The plan's own Phase-0 review found the two blockers my earlier reuse-map missed, so the extraction is broader than "split one file":
  - **`zipReader.ts` split**: the reader now imports only `pako` and types and talks to storage through the `ByteSource` seam; the expo-backed `createFileByteSource` (single `FileHandle`, seek + `readBytes`) moved to `services/expoByteSource.ts`. `importStravaExport.ts` repointed at the seam; behaviour unchanged (`createMemoryByteSource` stays for tests).
  - **The barrel was the transitive leak**: `activityMapper.ts` imported `week_of_year` from `@/shared`, which re-exports `ChipMultiSelect`/`LogScreen` — and `shared/utils/utils.ts` *also* imported the barrel for its types. Both repointed at `@/shared/utils/utils` / `@/shared/types/types` (the pattern `activityDates.ts` already used).
  - **`types.ts` navigation import made `import type`** — the repo's first, deliberately: every bundler erases it instead of "happens to notice the bindings are types-only", which keeps the type graph a runtime leaf for any consumer.
  - **`webdavTransport` needed no change** — the binary-format commit had already made PUT/GET byte-aware and Content-Type-correct; only its `simpleLogger` import still ties it to RN, and that stays a tool-side (Phase 1) shim decision.
  - **Guard, not convention**: `__tests__/stravaImport/importCorePortability.spec.ts` (24 cases) walks the core's value imports as text and refuses anything outside the closed core list except `papaparse`/`pako`, any barrel (`@/shared`, `@/constants`, `@/theme`, `@/features`), and any *value-syntax* `react-native`/`expo*`/`react`/`@react-navigation` import (`import type` is exempt). Verified to fail when a `react-native` import is injected into a core file.
  - Docs: `architecture.md` gains a "Portable import core" bullet (the barrel-avoidance rule and why these are direct imports); the plan marks Phase 0 done. Suite 306/306; tsc/lint/check:imports clean. No behaviour change anywhere — pure extraction.

- **Backup collections now carry a layout version (`schemaVersion: 2`)** — the stream format moved from JSON to the binary `'OF'` payload (`streamCodec.ts`), and a collection gave no signal of which layout its files are in: a v2 build would happily restore a v1 collection, and would do the same for the next incompatible change. `collection.json` gains a `schemaVersion` field (`APP_CONFIG.BACKUP_SCHEMA_VERSION`), checked on **both** push and restore:
  - **Written when the collection is claimed** (`pushBackup`'s fresh-marker path), so the folder records its layout on the first sync.
  - **Refused on mismatch** (`assertCollectionOwnership`), with an actionable message ("delete the folder on the server, or pick a new profile name, and sync again") — pushing v2 payloads into a v1 folder would leave the remote index listing both encodings, and restoring from it would write stream files the app then fails to read.
  - **A marker predating versioning is read as layout 1**, so collections written by the current app before this change are reported as a version mismatch rather than silently skipped as "unknown owner". An *absent* marker stays tolerated: on push a fresh folder is claimed, and on pull an empty folder has nothing to restore anyway — refusing there would turn the drawer's Restore on a brand-new account into an error instead of a no-op.
  - **Two distinct version axes, documented**: the collection's `schemaVersion` (folder contract) vs the per-file codec version byte inside a stream file (`STREAM_FORMAT_VERSION`, still 1 — first binary encoding). Bump the former for incompatible layout changes; the latter for payload changes.
  - This is also the **contract a desktop import tool must satisfy**: a collection written outside the app has to carry `schemaVersion: 2` in `collection.json` or the phone refuses to sync with it (see `docs/desktop-import-plan.md`).
  - Tests: `__tests__/backupCollection.spec.ts` +4 (older layout refused on push and on restore; newer layout refused; an unversioned marker reported as layout 1) and 3 extended (claim records the version, "marker matches" and the profile-mismatch cases now carry one). Suite 282/282; tsc/lint/check:imports clean.

- **Dropped the unused `ACCESS_BACKGROUND_LOCATION` declaration** — the README privacy audit
  flagged it: the permission sat in `app.json`'s Android list while nothing ever asked for
  it. `useLocationPermission` requests foreground location only, and only when the map
  should show the blue dot. A "no tracking" app declaring background location is dead
  weight in the permission list and a store-review red flag. `expo-location` does not add
  the declaration itself, so the manifest entry came solely from `app.json` — the one line
  to re-add when the track recorder (roadmap item 4) actually asks for the permission.
  Takes effect at the next `expo prebuild` / `build:local`. The README Fine print note that
  called the declaration out is removed with the fix.

- **Exported zip chunks are now deleted once shared** — a side-find of auditing the README's
  privacy claims. `exportData` wrote `strava_export*.zip` into the app document directory,
  opened the share sheet per chunk, and never touched the files again: a full export left
  close to a gigabyte in app storage — storage Android's backup agent can then copy around —
  and a run killed mid-share left its chunks forever. Each chunk is now deleted when its
  share returns, and every export first sweeps `strava_export*.zip` left by an interrupted
  predecessor; a failed delete is logged and never fails the export. The return type went
  from `Promise<string | null>` to `Promise<void>`: the returned uri pointed at a deleted
  file by the time any caller could use it, and both callers ignored it anyway.
  - Tests: `__tests__/shared/exportData.spec.ts` (both chunks shared then gone, stale chunks
    swept, progress reaches 1). The `Directory` mock in `jest.setup.js` accepts the
    single-argument root form. The README Fine print now describes the remaining window
    (chunks from a run killed mid-share live until the next export).

- **Merged activity types left the yearly tables without a column** — found while chasing the
  *Last years* crash, but a separate and older bug. `mergeActivities` renamed `EBikeRide` →
  `Ride` and `Hike` → `Walk` on the **activities** while only **dropping** `EBikeRide`/`Hike`
  from the type list. An archive with e-bike rides and no plain rides therefore had
  activities of type `Ride` and no `Ride` column, so `yearlyData` computed
  `yearMap.get('Ride')! + distance` = `undefined + x` = NaN and appended a column the headers
  never described — `NaN` in the Total/w-Ave. cells and shifted columns below it.
  - `mergeActivities` now maps the type list through the same table as the activities
    (`MERGED_ACTIVITY_TYPES`), keeping each renamed type's position and collapsing a list that
    holds both a folded type and its target.
  - `yearlyData` no longer trusts its inputs: an uninitialised type starts at 0 and a
    non-finite field (a half-written AsyncStorage record whose `distance` is missing after an
    interrupted import) contributes 0. Silent zero beats a NaN cell, because those numbers are
    fed straight into victory-native paths and react-native-svg's native parser **crashes** on
    NaN.
  - Tests: `__tests__/activities/mergeActivities.spec.ts` (5 cases) and
    `__tests__/yearly-data.spec.ts` (4 cases). Both suites fail against the pre-fix code.

- **"Last years" crashed the app: the palette theme starved the legend of its font size** —
  opening the Stats → *Last years* tab killed the app on Android with a native
  `IllegalArgumentException: Invalid number formating character 'N' (… s=M NaN, NaN …)` from
  `com.horcrux.svg.PathParser`. It is a **native** crash, so jest could not see the crash
  itself; the only reproduction was `adb` + `logcat`.
  - **Root cause, in the theming refactor.** A Victory theme is not only colours: the legend
    symbol size is derived from the label font size (`victory-legend` computes
    `size = fontSize / 2.5`). `createChartTheme` **replaced** `VictoryTheme.material`'s
    `legend.style.labels` with `{ fill }` instead of merging onto it, so `fontSize`
    disappeared, the symbol geometry became `undefined / 2.5 = NaN`, and the legend circle
    path `M NaN, NaN / m NaN, 0 / a NaN, NaN …` reached the native SVG parser. Rebuilding
    the pre-fix theme in a test produces the **byte-identical** path from the crash log.
    Only *Last years* hit it because it is the only screen whose `VictoryLegend` has data
    items (`RecentWeeksScreen`'s legend is a title-only `data={[]}`).
  - **Fix: `src/theme/chartTheme.ts` now merges the palette onto Material** instead of
    swapping style objects, so every non-colour property (`fontSize`, ticks' `size`,
    `strokeLinecap`, `textAnchor`, the legend symbol `type`) survives. This also repairs
    collateral damage from the same bug: axis labels had lost `textAnchor: middle` and
    `padding`, and axis ticks had lost their `size`.
  - Material ships no `dependentAxis` block, so the theme now seeds one from `axis` before
    applying the palette; the dependent axis keeps the same typography as the independent one.
  - Tests: `__tests__/theme/theme.spec.ts` pins the surviving Material geometry, runs
    Victory's own legend layout and asserts finite symbol geometry for every palette and
    scheme, and proves the assertion fails on a theme that replaces the labels.
    `__tests__/stats/recentYears.spec.tsx` renders `RecentYearsScreen` and asserts no
    rendered SVG path contains `NaN` or `Infinity`.
  - **Not the cause:** the yearly data pipeline (`yearlyData` / `formatYearlyTable`) is
    byte-identical before and after the theming commit, and the crash path is a legend
    symbol, not a bar.

- **Compact binary stream cache (`streamCodec.ts`), `write(Uint8Array)`, and GPX self-closing `<trkpt/>` fix** —
  - **Self-closing `<trkpt/>` fix in `gpxParser.ts`**: `<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>` did not match a self-closing `<trkpt lat="…" lon="…"/>`, so the lazy body match ran past it and attached the *next* point's `<ele>` and `<time>` to the self-closing point while dropping the middle point silently. `TRACK_POINT_PATTERN` now accepts `(?:\/>|>([\s\S]*?)<\/trkpt>)` and drops body-less points cleanly. Covered in `__tests__/stravaImport/gpxParser.test.ts`.
  - **16 B/point binary stream format (`src/shared/services/streamCodec.ts`)**: stream files under `streams/<id>.json` now store a 16-byte `'OF'` v1 header plus planar little-endian `int32` arrays (`lat × 1e6`, `lon × 1e6`, `altitude × 10` decimetres, `time` seconds). Round-trip error is **0** against the rounded GPX values, file size drops from ~92 KB to ~47 KB on a 3,000-point track (~191 MB → ~98 MB across a 2,135-track export), and `File.write(Uint8Array)` writes the direct buffer without the JSI UTF-16 → UTF-8 → Kotlin `String` → `toByteArray()` copies.
  - **Backwards-compatible reader (`readStreamFile`)**: inspects the `'OF'` magic bytes and falls back to `JSON.parse` when reading legacy JSON stream files, so existing installs and backups keep working without a migration step. Used across `fetchAndStoreStreams.ts`, `importStravaExport.ts` (`backfillTrackFields`), and `exportData.ts`.
  - **Byte-aware WebDAV stream sync**: `webdavTransport.ts` (`putDavFile` with `Uint8Array`, `getDavFileBytes`) and `backupSync.ts` (`md5Bytes` via `expo-crypto` `digest`) now push and restore raw stream bytes so binary and legacy JSON stream files round-trip identically.
  - Tests: new `__tests__/shared/streamCodec.spec.ts` (6 cases), plus binary cases in `gpxParser.test.ts`, `importStravaExport.test.ts`, `fetchAndStoreStreams.spec.ts`, and `webdavTransport.spec.ts`.

- **The import screen was starving itself: it only refreshed every 25 tracks** — the live step, the elapsed-in-step counter and the progress bar all come from JS timers, and two of expo's file calls are **synchronous**: `File.write(content)` returns `void` and `FileHandle.readBytes(length)` returns the bytes, with no promise. Pass 2 is therefore a tight synchronous loop whose `await`s resolve through microtasks — and **microtasks starve the macrotask queue**, so `setInterval` (the screen's poll) and React's scheduler get no turn. They ran only where the importer yielded with `setTimeout(0)`, which was every `YIELD_EVERY = 25` tracks. The symptom was exactly that: the counter sitting on **25/2135** (a multiple of 25) for minutes, while tracks were taking 3–25 s each.
  - **Yields now happen where the UI needs them, not on a fixed cadence.** `markStep()` records the sub-step *and then* releases the thread, so "writing stream…" is painted **before** the synchronous write starts. Used on every step that precedes blocking work: reading the directory, reading a track, writing the stream, and the two activity-batch writes. `YIELD_EVERY` is gone; the per-track comment explains why a third yield would only cost time on skipped tracks.
  - **This also repairs the diagnostics from the previous change.** The live step display was starved for exactly the track we care about — it could only ever show which call had finished, never which one was stuck. With the step painted before the call, a frozen screen now names the call it is frozen inside, which is the whole point of the live view.
  - `yieldToUi()`'s comment now says what the real constraint is: a microtask hop is not enough, the yield has to be a `setTimeout` (macrotask), because that is what timers and React's scheduler wait on.
  - Test: `lets timers run while it works, so a polling screen can keep up` — a poller installed before the import must catch it *inside* `reading-track` and *inside* `writing-stream`, and get more than ten turns. Verified to fail (no steps observed) when the two yields are removed. Suite 250/250; tsc/lint/check:imports clean.
  - **Still open**: the per-track read/parse/write/flush split from the previous change is still the answer to *which* call is slow. It is now visible live, not only in the end-of-run report.

- **Import: a slow track now says which call was slow, and two real costs are gone** — the run reported 13 tracks over 3 s, up to 20 s for 787 KB. Parsing was the obvious suspect and is not the answer; the numbers now prove it per track.
  - **Measured before changing anything.** A realistic Strava GPX (indented, with a `TrackPointExtension` block on every point) costs **6 ms to parse, 2 ms to convert and stringify, 2 ms to simplify** at 838 KB, and 13/5/2 ms at 2.2 MB. Even at 5–10× Hermes speed that is well under a second, so the 3–20 s is not JavaScript.
  - **The shape of the numbers is the other clue**: ms/KB *rises* with file size (10.5 ms/KB at 310 KB, 25.9 at 787 KB), so the cost grows faster than the bytes. Read, parse, convert and simplify are all linear, which leaves the native call — so the warning now splits the track: `track 18491589485: 20402 ms for 787 KB (read 12 / parse 130 / write 20210)`, with `/ flush …` added when AsyncStorage landed on the batch that track completed. The next run names the slow call instead of leaving it to inference.
  - **The bounding box no longer simplifies the whole track.** It came from `calculateBoundingBox(compressStreamSet(stream).coordinates)`, i.e. Ramer-Douglas-Peucker plus an array of `{latitude, longitude}` objects over every point, to find four numbers — on the import path *and* on the backfill path. `trackBoundingBox` scans the raw `[lat, lng]` pairs instead: O(n), no allocation, and the same box (extremes survive simplification).
  - **The UTF-8 fallback is linear again.** After the first multi-byte character — any accented activity name is enough — the old decoder abandoned its ASCII fast path and appended the rest of the file one character at a time. Measured: 104 ms vs 25 ms at 838 KB, and 411 ms vs 63 ms at 2.2 MB, i.e. the only superlinear step in the pipeline, getting worse as files grow. It now decodes ASCII in 8 KB runs, **resumes** the run after a multi-byte sequence, and joins the pieces once at the end.
  - Tests: new `__tests__/stravaImport/textDecode.test.ts` (7 cases: ASCII, every multi-byte length, resumption after an accent, a run straddling the 8 KB boundary, invalid and truncated bytes, agreement with the platform decoder). Suite 249/249; tsc/lint/check:imports clean.
  - **Still open**: the remaining per-track cost is native, and only on the big tracks. Free storage on the device remains the leading explanation, and the split in the next run settles it — if `write` dominates, the fix is to stop writing a file per track (keep the archive as the stream store), not to tune the parser further.

- **Palette picker — the user can now switch the theme at runtime** — The palette is no longer fixed at build time. `PalettePicker` (`src/theme/PalettePicker.tsx`) lists every registered palette, applies the choice immediately and lets the theme provider persist it, so the choice survives a restart.
  - **Where it lives**: the Stats settings modal, under a new **Appearance** section. The picker is a component of the theme module and is exported from `@/theme`, so any screen can host it — the drawer is the obvious second home if it should be easier to reach.
  - **Each row previews the palette it stands for**: the swatch is the brand accent, the four dots are the first entries of that palette's chart series, and the selected row is outlined in its own accent over its own soft tint — all in the colour scheme currently in use, so the list reads correctly in dark mode too.
  - **The choice is applied live**: pressing a row re-resolves the theme, so the whole app — screens, charts, drawer and tab bar — changes colour immediately, and the selection is written to `paletteId` in AsyncStorage.
  - **A palette needs no code to become available**: define it in `palettes.ts`, add its id to `PALETTE_ORDER`, and it appears in the picker. The theme test already checks every registered palette against the accessibility floor, so a new palette cannot ship unreadable.
  - **Tests**: `__tests__/theme/theme.spec.tsx` (4 cases) — one row per registered palette, the active one marked selected, pressing a row applies *and* persists the choice (asserted end to end through the provider, not just the callback), and every palette's accent is rendered as its swatch. Theme suites 21/21; full suite 249/249; tsc/lint/check:imports clean.

- **Dead permissions removed from `app.json`, version synced to 1.2.0** — cleanup from the config review:
  - Dropped `NOTIFICATIONS` (no `expo-notifications` dependency), `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` (no-ops since Android 10/13; the app uses scoped storage). Kept `INTERNET` and all three location permissions — the latter deliberately, for the upcoming GPS-track capture.
  - `expo.version` was `1.1.0` while `package.json` said `1.2.0` — the phone showed the stale `versionName`. Synced to `1.2.0`; `app.json` `expo.version` is the single source of truth for the app version, `package.json` `version` is npm metadata kept in step manually.
  - `AGENTS.md` "Version Management" corrected: it claimed the version lives in `package.json` and is managed by `increment-version.cjs`, and that build numbers in `app.json` must not be touched — in fact `increment-version.cjs` only manages `versionCode` (in `app.json` + the gitignored `.version-code`), and `expo.version` is the app version.
  - Verified with `npx expo config --type public`: reduced permission list resolves, `.env` package id still injected. The reduced permissions take effect at the next `expo prebuild`.

- **`android:dev:uninstall` now targets the real application id** — the script used `${ANDROID_PACKAGE:-com.example.offlinefitness}`, which reads the **shell** environment, while `ANDROID_PACKAGE` lives in `.env` (loaded by the Expo CLI, not by ad-hoc shell commands). The fallback therefore always won and the script cleared/uninstalled the placeholder id instead of the actual app. New `scripts/android-package.cjs` parses `ANDROID_PACKAGE` from `.env` (comments skipped, surrounding quotes stripped) and falls back to the placeholder committed in `app.json`; the npm script calls it via `$(node scripts/android-package.cjs)`.

- **Strava import: reading the archive in place broke real archives (`Bad file descriptor`) — the copy is back, and a dead archive now stops the run** — the phone run failed on track after track with `java.io.IOException: Bad file descriptor` raised from `FileChannelImpl.position0`, i.e. `setOffset` on a `FileChannel` whose descriptor had already been released.
  - **Cause, in expo's own code**: `FileSystemFileHandle.forContentURI` (`node_modules/expo-file-system/android/.../FileSystemFileHandle.kt:74-85`) builds its channel from `contentResolver.openFileDescriptor(uri)` and **never retains the `ParcelFileDescriptor`**. It is a local that becomes unreachable, so it is finalized and its descriptor closed while the channel still points at it. A `content://` archive therefore reads fine for the first tracks and fails for every one after — exactly the shape of the log (thousands of consecutive failures on tracks that had been readable a minute earlier), and why pass 2 could sit at 50/2,135 while appearing frozen.
  - **The copy is mandatory, not an optimisation.** `openArchive()` now always copies the picked file into the cache and reads only the copy (a plain file we own, opened through `forJavaFile`), deleting it at the end of the run. The doc comment states the reason so it is not "optimised" back to in-place reading.
  - **A dead archive stops the run instead of failing silently.** After `MAX_CONSECUTIVE_READ_FAILURES = 10` consecutive read failures the import throws *"Stopped after 10 tracks failed in a row — the archive could not be read. Last error: …"*, so the modal shows one actionable error instead of finishing with a couple of thousand warnings and no streams.
  - **Cost, and where it shows**: `Copying the archive…` is a step in the running screen and `timings.copyArchive` reports it, so the ~1 GB sequential copy is visible rather than hidden.
  - Tests: 16 in `importStravaExport.test.ts`, two of them encoding this lesson — the import copies before reading (asserted by a picked file that cannot be opened for random access at all, which still imports cleanly because the picker URI is never read) and it aborts with a clear error when reads start failing mid-run (a mock that starts throwing `Bad file descriptor` once pass 2 begins). Suite 238/238; tsc/lint/check:imports clean.
  - **Not done**: the copy is per run (~1 GB of writes on a device that already holds the original). Keeping one copy as the *stream store* — archive stays put, tracks read on demand through the existing zip reader — would delete pass 2's ~2,026 per-track writes entirely; it is the next step if writes remain the bottleneck.

- **Strava import: no archive copy, and a screen that says what it is waiting on** — *superseded by the entry above: in-place reading fails on real archives with `Bad file descriptor`, and the copy is back.* The batching/listing changes did not fix the phone run, so this pass attacks the two things the evidence actually points at.
  - **Both stalls sit on writes, not parsing.** Pass 1 does nothing but an `AsyncStorage.multiSet` per 100 activities, and it stalled there too. Parsing was measured at 13 ms per track. So the run is waiting on storage, and the previous version made that worse: it kept a copy of the archive in the app cache between runs, i.e. a second copy of a large export written to the same storage the stream cache and AsyncStorage use.
  - **The archive is read where it is.** Android's picker returns a `content://` URI, and `FileSystemFileHandle.forContentURI` reads it through the provider's descriptor with real random access (`FileChannel.position`), so the cache copy was never needed. `openArchive()` now reads in place and only copies when a provider hands out a pipe instead of a seekable descriptor; any copy is deleted at the end of the run, and the *old* version's `strava-export-import.zip`/`.key` are reclaimed at the start of the next one. `ImportTimings.copyArchive` is 0 in the normal path.
  - **The running screen names the call it is inside.** `ImportLiveState` is a plain object the importer mutates at every step (`reading-track`, `parsing-track`, `writing-stream`, `saving-activity`, `saving-activities`, …) and the modal polls it twice a second: it shows the step, the track id and size, **how long the current step has been running**, the running timing totals, and the slowest track so far. A progress bar only moves when a whole track finishes, which is why one slow call was indistinguishable from a frozen app.
  - **Slow tracks name themselves** in the log (`track <id>: 41930 ms for 118 KB`), so a single bad file is findable in the archive afterwards.
  - Tests: 15 in `importStravaExport.test.ts` — in-place reading leaves no copy, an unseekable picked file falls back to a copy that is still deleted, interruption leaves nothing behind, and the live state reaches `writing-stream` during a stream write and ends idle sharing the summary's timings. Suite 237/237; tsc/lint/check:imports clean.

- **Reskin: the app now ships in Twilight** — The default palette moved from `legacy` to `twilight` (`#6D28D9` light, `#A78BFA` dark). The change is one line in `src/theme/palettes.ts` (`DEFAULT_PALETTE_ID`), which is the point of the theme layer: the brand accent is now a value, not a code change.
  - **What the user sees**: every accent in the app is now violet instead of Strava-orange — section titles, the calendar arrows and week badge, the streak and selected-day greens stay green (they are semantic, not brand), the chart series follow the new ramp, and the drawer and bottom tab bar take their tints from the same palette.
  - **Why it is now safe to do**: the old primary `#F4511E` sat **28/255** max-channel away from Strava's `#FC4C02` — the same colour. Twilight is 215/255 away, so the app no longer reads as a Strava client.
  - **Contrast improves across the board**: the brand accent goes from 3.48:1 to 7.10:1 on a card, the label on a filled button from 3.48:1 to 7.10:1, and the success green from 2.10:1 to 5.48:1. The chart series that were effectively invisible on a white card (`#FFF59D` at 1.12:1, `#DCE775` at 1.33:1) are replaced by a ramp whose every entry clears 3:1.
  - **The old palette is kept**, registered as `legacy`, so the previous look stays available and the palette picker has something to offer. It is the only palette exempt from the accessibility floor, because it reproduces the look the app shipped with.
  - **The default palette is now guarded by a test**: `__tests__/theme/theme.spec.ts` asserts that whichever palette the app starts on meets the accessibility floor, so the default can never be set to one of the exempt palettes by accident.
  - **Build-time assets are unchanged.** The splash-screen and Android adaptive-icon backgrounds stay the warm cream `#FFFFE0` and white `#FFFFFF`, and the artwork stays a gold bike on dark navy. The artwork is an opaque RGB file with a **white margin baked in** (`splash.png` and `adaptive-icon.png` are byte-identical), so the `backgroundColor` shows as a field *around* that white margin rather than behind the bike: a violet field would read as a white card on a coloured sheet, and on the adaptive icon as a violet ring around a white square. The artwork was drawn against the warm cream and white, so it keeps them. The in-app palette is unaffected — that is pure runtime.
  - **Not done**: `app.json` still pins `userInterfaceStyle` to `"light"` on purpose, so the OS dark setting does not reach the app even though the dark ramp is complete and every colour comes from the theme; the palette picker UI is still to come (pure JS, no rebuild needed); the map track colours stay `red`/`blue` on purpose, so a route stays readable on any basemap.

- **Location permission now actually requested at runtime (kept for upcoming GPS-track capture)** — the review showed the Android location permissions were declared in `app.json` but never requested at runtime, so the map's "my location" blue dot could never appear (Android 6+ requires a runtime grant on top of the manifest declaration):
  - New hook `src/features/maps/hooks/useLocationPermission.ts`: checks the foreground permission (`Location.getForegroundPermissionsAsync`) and requests it once on mount if needed; returns `true` only once granted. Foreground only — the background request (`ACCESS_BACKGROUND_LOCATION`, declared in `app.json` for the future GPS recording feature) is deliberately **not** made here; Android requires a separate explicit flow for it when that feature lands.
  - `MapsScreen.android.tsx`: `showsUserLocation` and `showsMyLocationButton` are now driven by the hook instead of hardcoded `true`, so the map never asks Google's my-location layer for something the OS has not granted.
  - `app.json` location permissions (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`) are kept unchanged. `expo-location` is no longer an unused dependency.
  - Tests: new `__tests__/maps/useLocationPermission.spec.ts` (4 cases: already granted → no prompt, request granted, request denied, permission check throws). Suite 219/219; tsc/lint/check:imports clean.

- **A theme layer, so the palette is a runtime value instead of a code change** — The app had **79 unique hex literals across 8 hue families and 3 unrelated gray scales** (Material `blueGrey`, Tailwind `gray`, and ad-hoc `#F8F9FA`/`#F5F5F5`/`#E0E0E0`/`#333`/`#666`/`#999`), and the brand primary `#F4511E` (Material Deep Orange 600) is only **28/255** max-channel away from Strava's `#FC4C02` — the same colour. The colours are now resolved through a new `src/theme/` module:
  - **`src/theme/`** — `types.ts` (`PaletteDefinition`, `ResolvedTheme`), `palettes.ts` (the registry: `legacy`, `twilight`, `alpine`, `terracotta`, `crimson`), `resolve.ts` (palette + scheme → tokens), `ThemeProvider.tsx` (holds the palette, persists it, resolves the scheme from `useColorScheme()`), `useTheme.ts`, `chartTheme.ts` (`createVictoryTheme`) and `navigationTheme.ts` (`createNavigationTheme`).
  - **A palette holds only the chromatic choices** — brand accent, success tone, chart series, quarter tints. The neutral ramp, surfaces, lines and text ramp are **shared by every palette**, so switching palette changes the accent and nothing else: no reflow, no change in the reading experience. That is what makes a user-selectable palette possible later.
  - **All 19 colour-consuming files migrated** (Home, Calendar, activity list/details/summary, activity analysis, the three stats screens, YTD, the import modal, the log screen, the drawer, the maps screens, the backup section). `src/constants/colors.ts` is **deleted**; `src/constants/index.ts` keeps only the app config and storage keys. There are now **zero** hex literals outside the theme module.
  - **Module-level `StyleSheet.create` had to go** — it freezes colours at import time and cannot follow a palette, so every screen now builds its styles with a `createStyles(theme)` function memoised on the theme. The pattern was already used in `StatsTab.tsx` for `isDark`; it now carries the palette too.
  - **Charts follow the palette**: all five charts hardcoded `VictoryTheme.material`, which kept Material's own greys and blue accents regardless of the app. `createChartTheme(theme)` derives the axis, grid, tick-label and legend colours from the same tokens.
  - **React Navigation follows the palette**: the drawer and the bottom tab bar take their tints from the navigation theme, so the Stats tab label no longer stays blue while the rest of the app follows the brand. The drawer's hardcoded `red`/`black` icon colours now come from the navigation theme too.
  - **The selected palette is persisted** (`paletteId` in AsyncStorage), but nothing changes it at runtime yet — the app still starts on the `legacy` palette, so **the app looks the same as before**. A picker is a later step.
  - **Two known visual oddities are fixed on the way**: the Stats tab showed a **blue** active label with a **green** active icon (two accents in one tab, over orange charts) — both now follow the theme; and the YTD quarter bands were four unrelated hues (blue, violet, green, amber) — they are now four tints of one hue.
  - **Tests**: `__tests__/theme/theme.spec.ts` (7 cases) checks that every registered palette resolves a complete theme in both schemes, that unknown palette ids fall back to the default, and that every palette meets the accessibility floor — 4.5:1 for text, labels and the label on a filled primary button, 3:1 for chart fills. The `legacy` palette is deliberately exempt and pinned to the historical values, since it reproduces the look the app shipped with. Suite 235/235; tsc/lint/check:imports clean.
  - **Not done yet**: the default palette is still `legacy` (the next step switches it to **Twilight**, `#6D28D9`, which was chosen as the preferred direction); the `legacy` palette's known contrast weaknesses (success green `#8BC34A` at 2.10:1, chart series `#FFF59D` at 1.12:1 and `#DCE775` at 1.33:1 on a white card) are still to be corrected; `app.json` still pins `userInterfaceStyle` to `"light"`, so the OS dark setting does not reach the app; and the palette picker UI is not built.


- **Strava import made measurable, and the stalls removed** — the phone import of a full export (~1 GB, 2,122 activities, 2,026 tracks) appeared to take up to a minute per track. The JavaScript turned out not to be the problem: parsing a 5,400-point track measures **13 ms** end to end (`parseGpx` 8 ms, `toStreamSet` 3 ms, RDP 1 ms, `JSON.stringify` 1 ms), so the run was waiting on native calls and on the app being throttled, not computing.
  - **Screen stays awake during the import** (`expo-keep-awake`, `activateKeepAwakeAsync('strava-import')` for the duration of a run, released in `finally`). Android throttles and eventually freezes a backgrounded app's JS thread, which is why a screen timeout turned a few minutes of work into what looked like a minute per track. `expo-keep-awake` is a dependency of `expo` (`~57.0.2`), so the native module was already in the installed build — a Metro reload is enough, no new EAS build.
  - **One directory listing instead of ~4,000 file stats**: pass 2 used to ask the file system about `<id>.json` and `<id>.nostreamflag` for every activity. `snapshotStreamCache()` reads the streams folder once into two sets, which the loop updates as it writes.
  - **Batched activity writes**: the track-derived fields (`start_latlng`, `end_latlng`, `bounding_box`) were written back with one `AsyncStorage.setItem` per track — 2,026 native round trips. They are now collected and written with `storeMultiActivities` in batches of 100, the shape pass 1 already used, flushed at the end of the loop and on cancel.
  - **Throttled progress**: `onProgress` fired once per track, i.e. 2,026 React renders competing with the import for the JS thread. The modal now passes a sink that drops updates inside a 250 ms window, always letting phase changes and the final value through.
  - **The archive copy is resumable**: the ~1 GB copy into the app cache used to be deleted at the end of every attempt, so an import stopped at track 1,500 paid for the whole copy again. The copy is now keyed by the picked file's name and size, kept when a run is interrupted or fails, and deleted when a run completes — a retry resumes without copying, a finished import leaves no gigabyte behind.
  - **Per-phase timings in the summary**: `ImportSummary.timings` records `copyArchive`, `readDirectory`, `parseCsv`, `writeActivities`, `readTracks`, `parseTracks`, `writeStreams`, `writeTrackFields` and the wall-clock `total`, and the finished screen prints them in one line. Whatever the phases do not account for is stall time, so the next slow run says which one it is instead of being guessed at.
  - Tests: 3 new in `__tests__/stravaImport/importStravaExport.test.ts` — the copy is reused after an interruption (counted via a `copy` counter in the virtual FS, so it is a real assertion and not a timing), a different archive still gets copied, and the timing phases never exceed the wall clock. Suite 215/215; tsc/lint/check:imports clean.

- **Local release builds slimmed down: single-ABI APK and a clean script that actually cleans** — `package.json` build scripts:
  - `build:local` / `build:local:clean` (and their `w:` Windows twins) now pass `-PreactNativeArchitectures=arm64-v8a` to Gradle, so a release build compiles native code for one ABI instead of four (`armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64` from `android/gradle.properties`). Faster builds and a smaller APK; the phone is arm64. To build for an emulator/another device again, drop the flag or pass a different list.
  - `build:local:clean` (and `w:build:local:clean`) now run `./gradlew clean assembleRelease` — previously neither `expo prebuild --clean` nor `gradlew clean` was invoked, so the name was misleading. Deliberately **not** using `expo prebuild --clean`: it regenerates `android/` including `debug.keystore`, which signs the release APK — a new keystore would make `adb install -r` fail (signature mismatch) and force an uninstall, wiping the app's local-only data. The "clean" is Gradle-level only.
  - `minifyEnabled` / `shrinkResources` stay **off** for release (faster builds, bigger APK) — accepted for personal, non-store use; enabling minification needs ProGuard testing first.

- **WebDAV backup organised by app and athlete** — the backup no longer writes into the account root. The user now types the **account root** (e.g. `…/remote.php/dav/files/<user>/`) and the app composes the collection below it: `<root>/offline-fitness/<profile>/{collection.json, activities/, streams/, sync-state.json}`.
  - **Why two levels**: the app id keeps this app's data apart from the previous app's backup (same file names `<id>.json` — they would have overwritten each other), and the profile label keeps two athletes sharing one server account apart. The profile identifies the **athlete, not the device**: the same person on two phones uses the same label, so they share one backup and a restore onto a new phone finds the old phone's data. The label is **required** and restricted to letters, digits, dots, dashes and underscores (`validateProfile()`).
  - **`collection.json` marker**: written on the first sync, verified on every later push *and* restore. A folder owned by another app id or another profile is refused instead of mixed. This closes the last hole: `sync-state.json` is a single index listing every activity id, so two athletes sharing one index would restore each other's activities. A collection with no marker (written before the marker existed) is still restored from, and an unreadable marker is ignored rather than blocking a restore.
  - **Implementation**: `collectionUrlFor()` composes the path; `ensureDavFolder()` creates the levels one at a time (a server rejects a nested MKCOL whose parent is missing — verified against Nextcloud: 409 for `offline-fitness/nested/deep/`, 201 for each level in turn); `WebDavConfig` now carries `rootUrl` and `profile`; the drawer form asks for the profile and shows the resolved collection path so a typo is visible at a glance.
  - **Verified on the local Nextcloud container**: PROPFIND on the account root (207), MKCOL of `offline-fitness/` (201) and `offline-fitness/bruno/` (201), PROPFIND on the collection (207), PUT + GET of `collection.json`, repeated MKCOL → 405 (already exists, treated as success). New tests: `__tests__/webdavCollection.spec.ts` (12: label validation, path composition, nested folder creation) and `__tests__/backupCollection.spec.ts` (7: marker claim, profile/app mismatch refused, legacy collection, unreadable marker). Suite 212/212; tsc/lint/check:imports clean.

- **App identity split so the old and new apps can coexist on one phone** — The app was published to a new public repository as a single squashed commit (`offline-fitness`, MIT) and had to keep the same identity as the previous build for a while, so every identity field was moved to its own value:
  - **Android package** and **iOS bundle id** now come from the environment (`ANDROID_PACKAGE` / `IOS_BUNDLE_ID` in `.env`) instead of being committed, with the neutral placeholders `com.example.offlinefitness` as the fallback for a fresh clone. The previous build keeps its own ids in its own (private) repository. Two apps can only be installed side by side with different application ids — with the same one, the new build replaces the old one.
  - **URL scheme** and **Expo slug** were changed to neutral values (`offlinefitness` / `offline-fitness`) so neither the old project name nor a third-party trademark stays in the public source.
  - **EAS**: the slug has to match the linked project's slug, so the app was moved to a separate EAS project. The previous project stays with the old app.
  - **Icon and splash unchanged** — the artwork is a neutral bike-and-chart, no third-party marks, so the old icon is kept as requested.
  - **Data stays separate**: each app has its own sandbox, so the new app starts with no activities and cannot touch the old app's local data. Two consequences to keep in mind: the new app needs its own archive import, and the two apps must not back up to the same WebDAV collection (same file names, `<id>.json`) — point the new app at a sub-collection such as `…/dav/files/<user>/offline-fitness/`.
  - **Google Maps key**: the key is inlined into the bundle at build time, so it is restricted in the Cloud console — API scope limited to the Maps SDKs, and application restrictions listing the package name from `.env` plus its signing certificate SHA-1. A key restricted to a different package fails with an authorization error.
  - `package.json`: the `android:dev:uninstall` script now reads the package from the environment; the lockfile follows the rename.

- **Archive import: re-importing no longer wipes track data** — Two bugs found while reviewing what a re-import does to an existing local dataset (`importStravaExport.ts`):
  - **Track-derived fields were lost on re-import.** Pass 1 rewrites every activity from `activities.csv`, and a CSV row carries no track data — so `start_latlng`, `end_latlng` and `bounding_box` were reset (the mapped record has empty coordinate arrays). Pass 2 then skipped those activities (their stream file already existed), so nothing restored them: the Android map markers disappeared, the GPX export lost the start/end point, and "similar activities" (`findSimilarActivities` needs `bounding_box`) came up empty. The bounding box was silently repaired at the next app start by `calculateAndStoreMissingBoundingBoxes()`, but `start_latlng`/`end_latlng` were not restored by anything. Fixed on two levels: the importer now reads the existing local activities before pass 1 and carries the track-derived fields over into the rewritten records, and when an activity still lacks them (an older import, or a record damaged before this fix) the fields are backfilled from the already-stored stream file — which makes the repair self-healing.
  - **Stale `.nostreamflag` markers were never removed.** A track that failed to parse (or was unsupported) on an earlier import kept its "no stream" marker even after a later import stored the track, so the activity stayed hidden by the Details screen's "hide no-stream" switch and was still counted as missing by the stream status. The marker is now deleted when the track is written.
  - **Tests**: 3 new cases in `__tests__/stravaImport/importStravaExport.test.ts` (fields survive a re-import, a damaged record is repaired from the stored stream, a stale marker is cleared). Verified they fail without the fix. Suite 193/193; tsc/lint/check:imports clean.

- **Strava API path removed — the archive import is now the only ingestion path** — Strava's API is subscription-gated, so the OAuth/REST sync path was removed end to end (plan: `docs/deprecate-strava-api-path.md`):
  - **Deleted**: `src/features/auth/` (`AuthContext`, `AuthService` with the OAuth flow and token refresh, `ButtonStravaConnect`), `src/features/activities/services/activities.api.ts` (`fetch_activities_from_strava`, `prepare_data`), `src/features/activities/services/fetchActivityStream.api.ts` (`fetchStravaActivityStream`), `src/features/activities/types/activities.types.ts` (`StravaActivity`), `src/features/activities/screens/UpdateDataScreen.tsx` (already unrouted), `src/shared/services/handleBackgroundTasks.tsx` (background sync task + its screen), `src/shared/services/apiHeaders.ts`. `fetchAndStoreStreams.ts` keeps only the local helpers (`compressStreamSet` is imported directly by the importer, so it stays exported).
  - **Startup**: `App.tsx` no longer wraps the tree in `AuthProvider` and no longer registers a background task; it now loads activities from local storage unconditionally once the startup backfills finish. Before, the load was gated on a Strava token, so an archive-only install started empty. The `"Background Sync"` drawer screen is gone.
  - **UI**: the drawer lost "Disconnect from Strava" and the connect button; `HomeScreen` lost the "Please connect" header, the "Strava Connection Status" card, the "New Activities" API counter and the stream-download button — "Streams" is now a read-only counter, and a new "Import" row opens `StravaImportModal` from the home screen. Pull-to-refresh reloads from local storage. `MapsScreen.web` reads the local stream cache (`loadRawStreamForActivity`) instead of the API.
  - **Constants/storage**: `API_ENDPOINTS` and the Strava token/sync storage keys (`EPOCH_LAST_FETCHED`, `LAST_SYNC_TIMESTAMP`, `ACCESS_TOKEN`, `REFRESH_TOKEN`, `TOKEN_RESULT`, `TOKEN_EXPIRATION`, `USERINFO`) are gone, along with their `storage.ts` aliases and the `TokenResult` type.
  - **Dependencies**: `expo-auth-session`, `expo-background-task` and `expo-web-browser` removed from `package.json`/lockfile and from the `app.json` plugin list; `ios.infoPlist.UIBackgroundModes` removed. `expo-secure-store` stays (WebDAV credentials).
  - **Behaviour change**: there is no incremental sync — new activities appear only after importing a fresh archive. The import is idempotent (upsert by id, existing stream files are never overwritten), so re-importing a newer archive is safe.
  - **Tests**: `useActivities.spec.ts` now covers the local load (including UTC-order sorting) and keeps the WebDAV tombstone assertion; `fetchAndStoreStreams.spec.ts` keeps the local-stream suites and gains `loadRawStreamForActivity`; the API-only suites (`useActivities.race.test.ts`, `prepareData.spec.ts`) were deleted. Suite 190/190; tsc/lint/check:imports clean.

- **Made ESLint honest (`eslint.config.mjs`)** — Extended `eslint-config-expo/flat.js` (activating `eslint-plugin-expo`, `eslint-plugin-import`, `eslint-plugin-react`, and `eslint-plugin-react-hooks` v7.1.1 with React Compiler rules) alongside `eslint-plugin-react-compiler` and `eslint-plugin-prettier/recommended`. Enforced the rules promised in `AGENTS.md`: `@typescript-eslint/no-explicit-any: 'error'` (previously `'off'`), `no-restricted-syntax` banning `TSEnumDeclaration`, `react/jsx-no-leaked-render: ['error', { validStrategies: ['ternary'] }]` banning `&&` conditional rendering in JSX, `@typescript-eslint/no-unused-vars: 'error'`, and `eqeqeq: ['error', 'smart']`. Fixed all existing violations across `src/` and `__tests__/`: converted `LogLevel` in `SimpleLogger.ts` from an `enum` to a `as const` map + companion type, replaced all `any` types in `ButtonList.tsx`, `MiniMapComponent.android.tsx`, `YTDStatsComponent.tsx`, and 6 test suites, fixed use-before-declaration in `handleBackgroundTasks.tsx`, named the list item renderer in `RecentWeeksScreen.tsx`, and converted all JSX `&&` renders to `? ... : null` ternaries.

- **Consolidated AI agent instructions into `AGENTS.md`** — Removed obsolete and duplicate instruction files (`CLAUDE.md`, `GEMINI.md`, `.cursor/rules/react-native-expo.mdc`, and `.claude/`), folded the feature directory map, state provider summary, inline circular-dependency direct-import exceptions, React Native ternary rendering rule, React Compiler (`try/finally` avoidance), Reanimated v4 worklets plugin ordering, and `expo-location` override rule into `AGENTS.md`, removed hardcoded patch version numbers so docs don't drift, and updated `scripts/call_jules.sh` and `docs/prompts/` references to point to `AGENTS.md`.

- **WebDAV backup slice B: deletion tombstones** — deleting an activity now records a tombstone (`id → deletedAt`, `src/shared/services/storage.ts`) that the next sync push applies to the server: the remote activity JSON, stream JSON and `.nostreamflag` are deleted (404 = already gone, not an error), the id is dropped from the dedup md5 maps, and the tombstone is written to `sync-state.json`'s new `deletedAt` map so a restore elsewhere knows the files were deleted deliberately. Semantics (single device, "local wins"): a tombstone whose activity exists again locally is dropped and the file re-uploaded (a re-fetch undoes the delete); expired tombstones (>30 days) are pruned; failed remote deletions stay in the local log for retry. Restore honors `deletedAt` (a tombstoned activity is never downloaded, orphaned stream files are cleaned up) but never removes an existing local copy. `removeAllActivities` (drawer wipe) deliberately records no tombstones — wiping the device must not erase the backup. Fixed a Slice A bug found while writing this: the restore skip-check compared bare activity ids against `a_`-prefixed storage keys, so it never matched and every restore would have re-downloaded and overwritten local activities (violating local-wins). New tests `__tests__/backupTombstones.spec.ts` (6: remote delete + state write, resurrection, failed-delete retry, retention prune, restore skip + local-wins, orphan stream cleanup) and DELETE cases in `__tests__/webdavTransport.spec.ts` (3); backup suite now 27 tests, full suite 195/195.

- **Strava archive import (replaces the API path)** — New `src/features/strava-import` module: pick the ZIP from Strava's "Download or delete your account" flow (no API subscription, no OAuth) and rebuild the app's local data from it. Verified against a real 2,135-activity export (1.0 GB uncompressed / ~60 MB zipped):
  - **What is imported**: `activities.csv` (id, name, type, distance, moving/elapsed time, elevation gain/high/low, average speed, GPS filename) plus each `activities/<id>.gpx` converted to the three streams the app actually consumes (`latlng`, `altitude`, `time`) in the same JSON shape the API returns, so maps, charts, bounding boxes, `calculateSpeedKmh`, export and track comparison are unchanged.
  - **Parity**: the app never fetched HR/power/cadence/temp streams (it requests `['altitude','latlng','time']` only), so their absence from the export costs nothing. Confirmed on the real export: 2,135 rows → 2,038 with a file, 1,745 with a usable track (293 files are metadata-only, 97 rows are manual entries), 4 `.fit`-only activities have no track, GPX polyline length vs CSV distance is +1.4 % median (GPS jitter; CSV distance is authoritative and is what gets stored).
  - **Gotchas encoded in the parser**: header names and activity types follow the account language (`Marche`, `Vélo électrique`, `Randonnée`…) while GPX `<type>` is always English (used as fallback); `Distance`/`Elapsed Time` appear twice — the first are locale-formatted summary values (`4,23` km), the later metres/seconds columns win; `activities.csv` dates are **UTC** (verified byte-for-byte against GPX `Z` timestamps), so `local_date`/`local_time` are derived with the **device timezone** (the archive has no timezone column).
  - **Memory**: the archive is never loaded whole — `services/zipReader.ts` reads the central directory, then seeks per entry with `FileHandle` + `pako` (supports stored/deflate, ZIP64, `*.gpx.gz`). Highest-cost file is one GPX at a time; streams are then ~207 MB on disk, the same as an API sync of the same activities.
  - **Behavior**: two passes — activities stored in batches of 100 first (list usable immediately), then tracks; upsert by id, existing stream files never overwritten, `nostreamflag` for GPS-less/manual/unsupported ones → re-import is idempotent and resumable after a cancel. Drawer item "Import Strava Export" opens `StravaImportModal` (pick → progress → summary, cancel safe), then `reloadActivitiesFromLocalStorage()` (new in `useActivities`, exposed on the sync context) refreshes the UI without a network call.
  - **Tests**: `__tests__/stravaImport/` — 36 tests: CSV quirks (fr/en/unknown-language positional fallback, duplicate columns, UTC dates, type mapping), GPX (segments, missing ele/time, gzip), ZIP reader (JSZip + Info-ZIP archives, stored/deflate, ZIP64, non-zip rejection), and a full `importStravaExport` run against a virtual file system (stream JSON shape, `nostreamflag`, summary counts, cache cleanup, idempotency, cancel). Suite 186/186; tsc/lint/check:imports clean.
  - **Known limits**: `.fit`/`.tcx` tracks are skipped (4 activities in the sample) — **decided to ignore for now** (their metadata still imports, they show `unsupported` in the summary). Decoded for reference: 3 are walking tracks uploaded years ago by a third-party phone app (FIT dev fields report an OPPO CPH1931 on Android 10), GPS present but no HR/altitude field; the 4th (`.fit.gz`, 2026 indoor workout) has no GPS at all. Only a track-less map is lost, and one of the three (`4789804060`) is the raw pre-crop upload (7.35 km in the file vs the 3.20 km Strava stores), so a FIT parser would need to accept that mismatch. Other limits: local dates are only as correct as the device timezone at import time. The Strava API code (auth, `fetch_activities_from_strava`, stream sync) was removed afterwards — see the "Strava API path removed" entry above.

- **WebDAV backup slice A: restore (pull)** — `pullBackupNow()` in `backupSync.ts` downloads activities/streams advertised in the remote `sync-state.json` that are missing locally; **conflict policy is local wins** (existing local files are never overwritten, pull only fills gaps; per-file errors collected without aborting). The remote state file's md5 index doubles as the file list — no PROPFIND XML parsing needed. Downloaded activity JSON is validated (parse + `id` present) before storing, so a proxy/login page can't corrupt local storage. Drawer UI: "Restore" button with confirmation dialog, progress in the status line, then activities are reloaded into app state (`useActivitiesDataContext` → `setGlobalActivities` sorted + `setTotalActivitiesStored`) so restored items appear without a restart. New tests `__tests__/backupPull.spec.ts` (8: skip/restore, local-wins overwrite protection, stream file handling, per-file error resilience, missing state = no-op, 401 hint, invalid JSON rejection). Backup suite 18/18. Note: `expo-file-system` is jest-mocked with an in-memory file map; `Paths.document` is a string parent and `APP_CONFIG.STREAMS_FOLDER` has a trailing slash — the mock's path-key builder must walk the parent chain and normalize the doubled separator. Still to come: deletion tombstones, auto-sync. (The `src/features/strava-import/` WIP noted here is now complete — see the entry above.)

- **WebDAV backup verified end-to-end on device; cleartext fix via expo-build-properties** — First real sync succeeded: app → WebDAV → Nextcloud Docker container, 2,122 activities + 2,026 streams uploaded, remote `sync-state.json` md5 index written and matching. Two blockers found and fixed during on-device testing: (1) Android `CLEARTEXT communication ... denied` — the bare `android.usesCleartextTraffic: true` key in app.json is **silently ignored** by SDK 57 prebuild (manifest never got the attribute); the supported path is the `expo-build-properties` config plugin (`["expo-build-properties", { "android": { "usesCleartextTraffic": true } }]`), now installed (~57.0.22) and verified written into `AndroidManifest.xml` (`android:usesCleartextTraffic="true"`). **Before any release**: (a) `usesCleartextTraffic` stays true only while the backup target is plain-HTTP LAN Docker — flip back to false once the server speaks HTTPS (Caddy/Tailscale on the future Ubuntu box); (b) a LAN DHCP change invalidates the hardcoded server URL and Nextcloud's `trusted_domains` (fix by adding the new host to `trusted_domains`); (c) the backup form must be filled in by the user — no pre-filled test credentials. Next up for the feature: auto-sync.

- **Google Drive backup → WebDAV backup (full swap)** — The Google Drive slice-1 backup was replaced by a provider-neutral WebDAV implementation (`src/features/backup`, all previously Google-named files rewritten in place):
  - New `services/webdavTransport.ts`: minimal RFC 4918 over fetch — `testDavConnection` (Depth-0 PROPFIND, 207 = success), `ensureDavFolder` (MKCOL, 405 = already exists), `putDavFile` (PUT overwrite), `getDavFile` (GET); `davUrl` joins/encodes path segments and tolerates trailing slashes; `WebDavTransportError` carries the HTTP status. Deliberately no Nextcloud-specific code — works against Nextcloud, rclone serve webdav, Apache mod_dav, or a NAS. The configured URL is the full collection root (Nextcloud: `/remote.php/dav/files/<user>/`).
  - New `services/webdavAuth.ts` (`useWebDavBackup`): "connect" = validate credentials with a PROPFIND, then persist — no OAuth, tokens, or refresh flow. Server URL + username in AsyncStorage, **password in `expo-secure-store`** (keychain/keystore). Disconnect clears all three. Replaces `googleAuth.ts` (deleted).
  - `services/backupSync.ts`: same orchestration (ensure folders → per-file push with md5 skip → write sync state → record last sync), but the dedup index now lives **in the remote `sync-state.json`** (`activityMd5`/`streamMd5` name→md5 maps) because WebDAV listings carry no content checksums (Drive gave `md5Checksum`). Missing/unreadable state file = push everything. 401/403 surfaces as a "check URL/username/password" error instead of the old Google reconnect prompt.
  - `components/BackupSection.tsx`: unconfigured → form (server URL, username, password) with Connect (tests credentials first); configured → server/user summary, Sync now, Disconnect. Same sync progress/status wiring as before.
  - Cleanup: deleted `googleAuth.ts` + `driveTransport.ts`; removed `expo-google-credential-auth` dep and its `app.json` plugin entry and `app.config.js` injection; removed `GOOGLE_*`/`DRIVE_*` API endpoints, `GOOGLE_DRIVE_APPDATA_SCOPE`, `google_connected`/`google_last_sync` storage keys (replaced by `webdav_connected`/`webdav_base_url`/`webdav_username`/`backup_last_sync`); dropped `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`/`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` from `.env`/docs. Kept `expo-crypto` (md5). No migration needed: the Drive feature never shipped in a release build.
  - Tests: `driveTransport.spec.ts` (7 tests) replaced by `webdavTransport.spec.ts` (9 tests: URL joining/encoding, PROPFIND auth+Depth, MKCOL create/405/403, PUT, GET, 401, 207 acceptance). Suite: 142/142 pass; tsc/lint/check:imports clean.
  - Local test server for development: Nextcloud in Docker on the Mac (`nextcloud:stable`, a named volume for the webroot, `--restart unless-stopped`), admin user + appdata verified via PROPFIND/PUT/DELETE. **Requires a fresh `npx expo prebuild` + reinstall** (config plugin removed from the native project). Follow-up work unchanged: auto-sync.

- **Google Drive backup, slice 1: transport + connect + manual push** — New `features/backup` module (barrel `index.ts`): `services/driveTransport.ts` (pure REST against the appdata folder — `listDriveFiles` with pagination, `findDriveFile`, `create/update/upsertDriveFile` via multipart upload, `ensureDriveFolder`, `downloadDriveFile`; `DriveTransportError` carries the HTTP status), `services/googleAuth.ts` (`useGoogleDriveAuth` on **`expo-google-credential-auth`** (MIT, Credential Manager + GIS AuthorizationClient on Android) — replaces `@react-native-google-signin/google-signin`, whose free tier wraps the deprecated legacy GSI SDK and whose config doctor is paywalled; browser OAuth was already ruled out (Google blocks custom-scheme redirects on Android, auth.expo.io deprecated); `drive.appdata` scope only via `requestAuthorization`; connection flag persisted locally; a 401 surfaces as a reconnect prompt), `services/backupSync.ts` (`pushBackupNow`: ensures `activities/`+`streams/` folders, skips files whose remote md5 matches local md5 via `expo-crypto`, writes `sync-state.json`, stores last-sync locally; push-only — pull/restore and deletion tombstones are follow-up work), `components/BackupSection.tsx` (drawer section: not-configured notice, Connect, manual Sync now with progress, Disconnect, last-sync label; no auto-sync). Drawer renders `BackupSection` (same feature-barrel pattern as auth/activities). New constants: Drive endpoints, `BACKUP_*` config, `GOOGLE_LAST_SYNC` key. Added `expo-crypto@~57.0.3` (md5) and `expo-google-credential-auth@^0.2.0` with its config plugin in `app.json` (`iosClientId` injected from `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` via `app.config.js`; both flow into the next local prebuild, no EAS build needed). Cloud setup done (project, Drive API, consent screen + test user, iOS/Android/Web clients); `.env` needs `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Then `android:dev:prebuild` + reinstall to compile the native module. Note: on-device SHA-1 verified equal to the debug keystore (`5E:8F:…:F6:25`), package id and client-id format verified, client id recognized by Google (`redirect_uri_mismatch` on probe = exists) — remaining DEVELOPER_ERROR cause is almost certainly the Cloud Console side (client type / cross-project split). Tests: `__tests__/driveTransport.spec.ts` (7 tests, mocked fetch). 139/139 pass.
- **Date-model review follow-ups (lean: no compat)** — (1) No migration/normalization code by design: upgraders must wipe via drawer `removeAllActivities` and re-download; stale cache is unsupported, not healed. (2) `start_date` dropped from goal fields: only affects saved custom goals explicitly referencing it (default goal uses `elapsed_time`/`type` only; `sum()` always scored the string field as 0 anyway). (3) Maps date-range filter is now day-granular inclusive on both ends (previously inconsistent midnight-vs-timestamp compare) — intended.
- **Strava timezone fix (Option B: canonical date model)** — Confirmed the bug: Strava `start_date_local` is athlete-local wall time mislabeled with `Z`, so every `new Date(start_date_local).get*()` depended on the *device* timezone (midnight-crossing activities bucketed on the wrong day; US date-only display off by one; travel activities misordered). New model on `Activity`: `local_date`/`local_time` (athlete-local, for all bucketing/calendar/streaks/YTD/display), `start_timestamp_utc` (true instant, for all sorting/filtering/recency), `timezone` passthrough; removed the overloaded `start_date`. New lean `shared/utils/activityDates.ts` helpers with no legacy fallbacks (wipe via drawer `removeAllActivities`, then re-download). Fixed consumers: day/week streaks (DST-safe integer day math), YTD day-of-year (leap-aware, no `Date`), trendline x, all sorts, Home 3-month filter + calendar date, calendar streaks/day-press, Maps date-range filter (string compare), `getISOWeekNumber` (parts-based), `getDateOfISOWeek` (pure-UTC Monday; week label now via `formatUtcDateString`), goal field list. `prepare_data` exported for tests.
- **Date regression tests + TZ gate** — Added `__tests__/helpers/testActivities.ts` (realistic Strava-triple factory), `activityDates.spec.ts`, `prepareData.spec.ts` (midnight-crossing, travel ordering, swim zeroing), `dates-timezone.spec.ts` (same-local-day UTC split, streak/YTD/sort stability). Prior coverage was insufficient: no TZ control, fixtures used identical UTC values for all date fields, `prepare_data`/display/sort paths untested. Full suite (133 tests) now passes under `TZ=America/New_York`, `Pacific/Auckland`, `Pacific/Kiritimati` and default; the TZ runs also exposed and fixed 3 pre-existing `getDateOfISOWeek` failures. Note: runtime `process.env.TZ` switches don't take effect inside jest — zone loops must run as separate processes. `__tests__/helpers/` excluded from jest test paths.

- **SDK 57 patch alignment + TS6 tsconfig fix** — `npx expo install --check` failed with `EOVERRIDE: Override for expo-location@~57.0.17 conflicts with direct dependency` because `package.json` direct deps had been bumped while the npm `overrides` pin still held `expo-location@~57.0.13`. Fix: bumped the override to `~57.0.17` and aligned remaining stragglers (`eslint-config-expo@~57.0.2`, `expo-dev-client@~57.0.19`, `jest-expo@~57.0.5`). `expo install --check` now reports clean. Also fixed `npx tsc --noEmit` failing on TS 6 (`baseUrl is deprecated / will stop functioning in TS 7`): removed `baseUrl` and made all `paths` values `./`-relative so the config is TS 7-ready. Verified: `tsc` clean, `expo lint --fix` clean, `check:imports` clean, 116/116 tests pass. **Rule: on every Expo SDK bump, update the `expo-location` override in lockstep with the direct dep, or `EOVERRIDE` will fail the install.**

- **Kept the `expo-location` npm override (verified still needed)** — Tested removal: without it npm installs a nested `expo-location@15.1.1` under `@teovilla/react-native-web-maps@0.9.5` (upstream dead at 0.9.5, still hard-pins `~15.1.1` with peer `*`). `expo-modules-autolinking resolve` for android+ios currently ignores the nested copy (single top-level `57.0.17` resolved), so native builds would survive today — but Metro/node resolution on web would silently downgrade web-maps' `useUserLocation` hook (`showsUserLocation` in web MiniMap) from expo-location 57 to 15 JS, and the stale native module stays in the tree waiting for a future tooling change to re-autolink it. Override stays; `npm ls expo-location` must show a single deduped `57.0.17`.

- **SDK 57 follow-ups** — React Compiler now uses infer (components/hooks only) instead of `compilationMode: 'all'`. Incremental local builds pass `--no-clean` because SDK 57 `expo prebuild` wipes native dirs by default. Removed unused Camera/Microphone usage strings, the `react-native-permissions` plugin, and the package (web MiniMap only had a no-op location check). Dropped the direct `@expo/config-plugins` dependency; npm now hoists it from `expo`, so expo-doctor is 21/21.

- **React Compiler try/finally** — Release Android bundle failed with `Handle TryStatement with a finalizer ('finally') clause` in `CustomDrawer`. React Compiler cannot lower `try/finally` yet; `panicThreshold: 'all_errors'` turned that into a Metro hard fail. Rewrote all `try/finally` in app code to try/catch + cleanup (or `runWithCleanup`), and set `panicThreshold: 'none'` so unimplemented compiler TODOs skip the function instead of aborting the store bundle.

- **Upgraded to Expo SDK 57** (`expo@~57.0.16`, React Native 0.86.2, React 19.2.3, TypeScript ~6.0.3). Skipped SDK 56 per Expo guidance (Hermes V1 memory regression with Reanimated/Worklets, fixed in `expo@57.0.9+`). Replaced `react-native-edge-to-edge` with `expo-navigation-bar` (`enforceContrast: false`). Bumped `react-native-maps` from `1.26.14` to Expo's bundled `1.27.2` and removed `expo.install.exclude` (the old Android `loadingEnabled={true}` NPE was fixed in 1.26.7–1.26.13; we still leave `loadingEnabled={false}`). Added `@expo/config-plugins` so third-party plugins (`react-native-permissions`, datetimepicker) resolve; expo-doctor warns about the direct install but documents this as the workaround. Added `@react-native/jest-preset@0.86.2` for jest-expo 57. New development/release builds are required; do not reuse an SDK 55 `expo-dev-client`.

- **Weekly goal streak diagnostics logging** — `computeWeeklyGoalStreaks` now emits a structured `Weekly goal streak diagnostics` log entry listing streak breaks (`recentBreaks` with `gapWeek`, `reason: no_activities | goal_not_met`, raw `elapsedTimeSeconds`, and `yogaElapsedSeconds` for failed weeks), plus `weekKeyMismatches` when cached `start_week` fields disagree with ISO timestamp bucketing. Helps explain why a week can look successful in UI but break the streak.

- **Fixed weekly goal UI vs streak discrepancy** — Recent Weeks, calendar goal coloring, and streak calculation bucket activities using the `start_date_local` **calendar date prefix** (YYYY-MM-DD) via `parseActivityLocalDate()`. Using `Date.getDate()` on full timestamps could shift Sunday evening activities to the next ISO week when the device timezone differs from the athlete's. `prepare_data` now uses the same parser for stored date fields.

- **Security: pinned `@tootallnate/once` to ≥3.0.1** (GHSA-vpq2-c234-7xj6) via npm `overrides`. The vulnerable package was a transitive dependency of `jest-expo → jest-environment-jsdom → jsdom → http-proxy-agent`. `npm audit fix --force` would have downgraded `jest-expo` (breaking change), so an override was used instead. The `expr-eval` CVEs remain open with no upstream fix.

- **Fixed: similar activities never shown for newly fetched activities** — `silentFetchAndStoreStreams` was fire-and-forget before `loadFromLocal()` ran, so new activities entered `globalActivities` without `bounding_box`. `findSimilarActivities` returns `[]` when `bounding_box` is absent. Fix: `loadFromLocal()` is now also called inside `silentFetchAndStoreStreams.then()` so `globalActivities` is refreshed once streams (and bounding boxes) are written to storage.

- **Fixed: stale closure in `deleteActivity`** — `mostRecentActivity` was separate `useState`, so the `.then()` callback in `deleteActivity` captured stale snapshots of both `mostRecentActivity` and `globalActivities`. A concurrent refresh + delete could set `mostRecentActivity` to the wrong activity. Fix: `mostRecentActivity` is now derived via `useMemo(() => globalActivities[0], [globalActivities])` — correct by construction after every `setGlobalActivities` call, no separate state needed.

- **Fixed: startup race between backfill functions and `refreshActivities`** — `calculateAndStoreMissingBoundingBoxes` and `correctSwimElevationGain` were fire-and-forget, so `loadFromLocal()` inside `refreshActivities` could read AsyncStorage before the backfills finished writing, missing bounding-box and swim-elevation corrections on first run. Fix: both backfills are now awaited in `Promise.all` before a `backfillComplete` flag is set; `refreshActivities` is gated on that flag. The `retrieveToken` (auth-only) path is unaffected.

- **expo-location for SDK 55**: Added direct dependency `expo-location@~55.1.4` (Expo bundled version) and npm `overrides` so `@teovilla/react-native-web-maps` no longer resolves its bundled `expo-location@~15.1.1` (incompatible with Gradle 9 Android builds).
- **Upgraded to Expo SDK 55** (React Native 0.83.2, React 19.2): bumped all `expo-*` packages, renamed Babel plugin `react-native-reanimated/plugin` → `react-native-worklets/plugin`, removed deprecated `jsEngine`/`newArchEnabled`/`edgeToEdgeEnabled` fields from `app.json`. Zero new TypeScript errors introduced. `victory-native` 36.x retained as-is (pure JS, compatible with New Arch via `react-native-svg` Fabric support).
- Bumped Expo SDK patch (`expo` ~54.0.33, `jest-expo` ~54.0.17) and lockfile; Android `versionCode` 581 in `app.json`.
- Pull-to-refresh on Home, Activities list (Details), and stats screens (recent weeks/months/years) using `refreshActivities` / `fetchingData` from activities context.
- Added root `CLAUDE.md` mirroring agent guidance (commands, architecture summary, import rules).

- Added `README.md` detailing features, setup, environment configuration for Strava OAuth, run/build/test commands, and repository layout.
- Implemented offline startup fallback: if token refresh/network fails, app loads cached activities and shows stats from local storage.
- Updated ESLint configuration to enforce best practices for TypeScript, Prettier integration, and React Hooks rules.
- Migrated ESLint configuration to the new flat config format (`eslint.config.js`).
- Fixed `typescript-eslint` import error in `eslint.config.js`.
- Fixed ESLint flat config error related to `pluginReact.configs.recommended` in `eslint.config.js`.
- Fixed `TypeError: tseslint.configs.recommended is not iterable` in `eslint.config.js`.
- Fixed `TypeError: tseslint.config is not a function` in `eslint.config.js`.
- Fixed "extends" key not supported in flat config in `eslint.config.js` (using `eslint-flat-compat`).
- Added debug logs to `fetchAndStoreStreams.ts` for 404 error handling.
- Fixed 404 error handling in `fetchAndStoreStreams.ts` by correcting `FileSystem.writeAsStringAsync` path.
- Added stricter TypeScript checks to `eslint.config.js`.
- Fixed infinite loop when fetching activities by wrapping token functions in `useCallback` and updating `useEffect` dependencies.
- Completed refactoring: Moved `ButtonStravaConnect` component out of `HomeScreen.tsx` and integrated it into `CustomDrawer.tsx`.
- Fixed an issue in `VictoryScatter` where the selected activity point was not displayed in red.
- Fixed an issue where moving_time for swimming activities was incorrect. It is now replaced by elapsed_time when loading activities.
- Added a new section in the DetailsScreen to display all the fields of an activity.
- Wrapped the HomeScreen in a ScrollView to ensure all content is visible on smaller screens.
- Placed the Strava logo and version text on the same row to save space.
- The most recent activity is now reset when the corresponding activity is deleted.
- The total number of stored activities is now updated when an activity is deleted.
- [x] The `EPOCH_LAST_FETCHED_KEY` is now recomputed whenever `globalActivities` changes.
- Added search input in DetailsScreen to filter activities by name.
- Improved MiniMap reliability on Android: added `onMapLoaded`, `onLayout`, and a guarded `useEffect` to ensure `fitToCoordinates` runs even when `onMapReady` does not fire under the new architecture.
- Cleaned up MiniMap debug logs after verifying the fix.
- Added pinch/drag zoom to SpeedTrendChart using VictoryZoomContainer.
- Fixed MapsScreen fitToElements excessive zoom issue by adding fallback to fitToCoordinates when no activities are selected.
- Improved MapsScreen refitting behavior to be less aggressive - only refits on date filter changes and first activity selection, with manual refit button.
- Moved EXPORT DATA button from UpdateDataScreen to HomeScreen for better UI organization and coherence.
- Fixed export data memory issue by using blob-based ZIP generation instead of large base64 strings to prevent "string length exceeds limit" errors.
- Added export success notification with file location info and "Share Again" button to help users locate their exported files.
- Implemented memory optimization for large datasets: limited export to 1000 activities max, smaller chunk processing, and better progress tracking to prevent RangeError with 1600+ streams.
- Added "Show Location" button to export success notification that displays file location and step-by-step instructions for finding the exported file in the device's file manager.
- Simplified export approach: files are saved to app documents directory with standard share dialog for user access and distribution.
- Implemented chunked export for large datasets: activities are split into multiple ZIP files of 500 activities each to prevent memory issues while allowing full data export.
- Fixed sharing issue: now shares each generated file sequentially so users can save all exported files, not just the first one.
- Updated export logging: all export-related logs now use simpleLogger instead of console for better log management.
- Added data correction on startup: `correctSwimElevationGain` sets `total_elevation_gain` to 0 for stored Swim activities to ensure consistent stats.
- Fixed intermittent map track display issue on HomeScreen: implemented proper request cancellation with AbortController, immediate stream state clearing on activity changes, loading indicators during transitions, and comprehensive error handling to prevent race conditions when users quickly switch between activities.
- Fixed HomeScreen loading indicator stuck state: ensured `isLoadingStream` is always cleared, even when the stream fetch is aborted or the effect unmounts mid-flight; added early return path to clear loading on abort, preventing "Loading map..." from persisting when a track is available.
- Fixed MiniMap component navigation lifecycle issue: implemented useFocusEffect to handle screen focus events, added map key-based re-rendering to force map refresh when returning from navigation, added fallback mechanisms for map initialization, and improved state persistence across navigation transitions to prevent blank maps and missing GPS tracks.
 - Prevented potential timer leak in MapsScreen: wrapped the 100ms refit `setTimeout` in a ref with proper cleanup on unmount and before re-scheduling, avoiding stray timers after navigation or rapid taps.
 - Moved `jest-expo` to devDependencies
 - Cleaned up memoization after audit: removed unused `useMemo` import from `MapsScreen.android.tsx`, removed unused `useCallback` import from `MiniMapComponent.web.tsx` and `AuthService.ts`, and simplified `MiniMapComponent.web` effect to avoid unnecessary re-renders by dropping a function dependency.
 - Moved `jest-expo` to devDependencies

- Added Streaks on Home: shows current and best streaks for consecutive active days and ISO weeks, computed from stored activities and displayed in a new Streaks section.

## Todo 24/8/2025

- fix linting issues in master
- test export data
- fix export data screen
- test stats of last activity
- fix HomeScreen/last activity & stream

## Done 24/8/2025

- [x] chore: formatted `src/fetchAndStoreStreams.ts`
- [x] Fixed activity sorting issue: `globalActivities` now properly sorted by `start_date_local` in descending order (most recent first) in `useActivities.ts`, ensuring the stepper component displays correct numbering (1 of 1721 for most recent activity).
- [x] Fixed linting issues: removed unused variables `mostRecentActivity` from `HomeScreen.tsx` and `MAX_ACTIVITIES_PER_BATCH` from `fetchAndStoreStreams.ts`.
- [x] Fixed LogScreen layout: removed fixed width constraints and centering that caused logs to display in a narrow column, now logs use full screen width for better readability.
- [x] Redesigned LogScreen with modern UI: adapted the design from logs.tsx to create a more graphical and user-friendly log display with proper theming, better layout, color-coded log levels, and improved functionality (Copy All, Export, Clear, Refresh buttons).
- [x] Added individual log copy functionality: each log entry now has a copy button (copy icon) that allows users to copy individual log entries to clipboard with proper formatting.
- [x] Commented out track simplification log: removed the verbose "Simplified track from X to Y points (Z% reduction)" log message from fetchAndStoreStreams.ts to reduce log noise.
- [x] Redesigned HomeScreen layout: implemented improved usability with better information hierarchy, moved "My Strava Stats" title to bottom as footer, organized content into clear sections (Connection Status, Activity Data, Recent Activity, Activity Map), added visual grouping with cards and consistent styling, and improved overall user experience.
- [x] Enhanced LastActivitySummary with activity-specific icons: replaced generic 🏃‍♂️ icon with activity-specific icons based on activity type (running, cycling, swimming, hiking, yoga, etc.), providing more relevant visual representation for different sports and activities.
- [x] Added error handling to HomeScreen connection status: implemented error state tracking in useActivities hook to capture and display fetch errors, added visual error indicators with retry functionality, and improved user feedback when activity fetching fails.
- [x] Modernized SettingsModal design: completely redesigned the settings modal with modern UI/UX including improved visual hierarchy, better spacing, dark mode support, enhanced form elements with proper styling, modern button design, and improved code editor integration with validation feedback.
- [x] Fixed SettingsModal layout issues: added ScrollView to handle content overflow, optimized modal height and spacing, reduced code editor height, and fixed slider blinking issue by optimizing useEffect dependencies to prevent unnecessary re-renders.
- [x] Added full year comparison toggle to YTDStatsComponent: implemented toggle switch to show either YTD comparison (current behavior) or full previous year data, updated chart legend and summary table to reflect the selected mode, and modified ytd-stats calculation to support both comparison modes.
- [x] Enhanced YTDStatsComponent with quarter background visualization: added alternating quarter backgrounds using VictoryArea with 4-point rectangles, implemented toggle-aware quarter display that respects YTD vs full year mode, and fixed quarter background gaps by using proper VictoryArea data points for seamless rectangular areas.
- [x] YTD stats respect "Use Elapsed Time" setting: threaded `useElapsedTime` through `YTDStatsComponent` into `calculateYTDStats` and `processYearData`, summing either `elapsed_time` or `moving_time` consistently; updated Summary label to display "Time (Elapsed)" or "Time (Moving)" accordingly. This fixes incoherent amounts between YTD Summary and other stats.
- [x] YTD stats honor "Merge Similar Activities": YTD now preprocesses activities with the same merge mapping used in `useProcessedActivities` (EBikeRide→Ride, Hike→Walk) and filters types from the processed list, ensuring YTD chart/summary totals match RecentYears tables when merging is enabled.
  - Consolidated merge logic into `features/activities/services/mergeActivities.ts` and refactored both `useProcessedActivities` and `YTDStatsComponent` to use the shared helper, avoiding code duplication.
- [x] Added Activities metric to YTD chart: introduced cumulative activities series in YTD data and a new "Activities" metric in a compact segmented control; integer tick labels; respects merge and time settings (time setting does not affect counts).
- [x] Weekly stats honor "Use Elapsed Time": threaded the setting into `weeklyData` and `RecentWeeksScreen` so weekly totals and bars use elapsed or moving time consistently with other stats screens.
- [x] Implemented barrel exports across the codebase: created comprehensive barrel exports for features (activities, auth, home, maps, stats), shared components and services, and constants. Updated all imports to use these barrel exports instead of deep paths, reducing import path lengths and improving code maintainability. Asset imports remain unchanged as requested.
- [x] Fixed circular dependency issues from barrel exports: removed CustomDrawer from shared barrel export, fixed auth module imports (AuthContext now imports directly from AuthService), fixed activities module imports (internal imports now use relative paths), fixed stats module imports (screens now import from sibling files), and fixed shared services imports (now use relative imports within the module). This resolves all "Require cycle" warnings and the "useStravaAuth is not a function" error.
- [x] Fixed "useActivitiesContext is not a function" error: resolved circular dependencies between features by using direct component imports instead of barrel exports. Updated MapsScreen to import ButtonList directly, ActivityAnalysisView and HomeScreen to import MiniMapComponent directly, and MapsScreen.web.tsx to use relative import for MiniMapComponent. This breaks the circular dependency chain between home->maps->activities->home.
- [x] Fixed remaining circular dependencies: removed `trackComparison` and `handleBackgroundTasks` services from shared barrel export as they import from `@/features/activities`, creating cycles. These services should be imported directly when needed. This eliminates all "Require cycle" warnings in the build.
- [x] Documented import best practices in architecture.md: added comprehensive guidelines including circular dependency prevention rules, barrel export usage, known exceptions list, code examples of correct/incorrect patterns, and a quick decision guide for choosing the right import pattern. Also added key architectural principles at the top of the document.
- [x] Investigated similarity display issue in ActivityAnalysisView: confirmed that the similarity calculation code is intact and unchanged. The only modifications were to import statements to avoid circular dependencies. Fixed imports for trackComparison service in both ActivityAnalysisView and trackComparison.ts. The similarity feature should now work correctly with values displayed when activities have similar GPS tracks.
- [x] Investigated dark theme issue in LogScreen.tsx: compared with master branch and found no differences in the component. All theme colors are properly applied using `useColorScheme()` hook and `logColors[colorScheme]`. Added missing title "Logs" to the header and removed duplicate default export. The dark theme implementation is correct - any issues may require app refresh or rebuild to properly detect system theme changes.
- [x] Added today indicator to calendar components: implemented visual today indicator with orange dot and background highlighting in both ActivityCalendar and ActivityCalendarPeriod components. The today indicator shows a dot below the date number and applies a subtle background color to make the current date easily identifiable on the calendar.
- [x] Fixed today indicator visibility in ActivityCalendarPeriod: enhanced the today indicator to be more prominent when today has activities by ensuring the today marker is always visible alongside activity period markings, with improved background color and text styling for better visibility.
- [x] Enhanced today indicator visibility with high opacity: increased today background opacity to 80% (from 40%) and simplified the approach to ensure the today indicator is clearly visible even when today has activity period markings, making it much more prominent and easier to identify.
- [x] Fixed ActivityCalendarPeriod today indicator with simple bold text: implemented a simple and reliable today indicator in ActivityCalendarPeriod using bold text styling. Today's date now displays with bold font weight and slightly larger font size, making it easily identifiable while preserving existing activity period markings. This approach is much more reliable than complex custom styling.
- [x] Cleaned up ActivityCalendarPeriod code: removed redundant today styling properties (todayTextColor, todayBackgroundColor) and conflicting theme properties (todayBackgroundColor) that could interfere with the custom bold text styling. The code is now cleaner and more focused on the simple bold text approach.
- [x] Fixed ActivityCalendarPeriod today indicator using combined period and dot marking: implemented the correct approach using the newer react-native-calendars feature that allows combining period and dot markings. Today's date now shows with both period marking (if it has activities) and an orange dot indicator using `marked: true` and `dotColor: MyColors.deepOrange600`, following the official documentation example.
- [x] Configured calendar to start week on Monday: added `firstDay={1}` prop to ActivityCalendarPeriod component to make Monday the first day of the week instead of Sunday, providing a more standard European calendar layout.
- [x] Enabled extra days display in calendar: changed `hideExtraDays` from `true` to `false` to show previous and next month's days in the calendar grid, providing a more complete calendar view without blank spaces.
- [x] Implemented gradient effect for activity intensity: replaced different colors for activity intensity with a gradient effect using the same base color (MyColors.deepOrange600) with different opacity levels: 30% for low intensity, 60% for medium intensity, and 90% for high intensity, creating a more elegant visual representation of activity levels.
- [x] Fixed streak continuity logic for gradient approach: updated the streak detection logic to continue streaks regardless of activity intensity differences, using a consistent medium opacity (60%) for all streak periods. This ensures consecutive activity days are properly connected in the calendar, even when they have different intensity levels.
- [x] Added weekly goal-based color coding to calendar: implemented weekly goal evaluation in ActivityCalendarPeriod to change streak colors based on whether the weekly goal is achieved. Streaks now display in green (MyColors.lightGreen500) when the weekly goal is achieved, and orange (baseColor + '60') when not achieved, matching the color scheme used in RecentWeeksStats.tsx.
- [x] Fixed weekly goal week calculation to start on Monday: corrected the week calculation logic to properly handle Monday-starting weeks for weekly goal evaluation. The calendar now correctly calculates Monday-Sunday weeks instead of Sunday-Saturday weeks, ensuring accurate goal achievement assessment.
- [x] Repositioned Streaks section in HomeScreen: moved the Streaks section to appear immediately after the Calendar section in the HomeScreen layout, providing better visual flow and making streak information more prominent and accessible to users.
- [x] Added ISO week number display and navigation to calendar: implemented a space-efficient week number display integrated into the calendar's month header. The week number appears as a compact "WX" badge next to the month/year display, saving vertical space while maintaining easy access to weekly statistics. Clicking the week number navigates to the RecentWeeksScreen in the Stats tab.
- [x] Optimized ActivityCalendarPeriod performance: fixed performance issues with ISO week number refresh by memoizing expensive calculations, pre-calculating week activities map to avoid repeated filtering, memoizing callback functions, and fixing useMemo dependencies. The calendar now responds much faster when selecting dates and updating the week number display.
- [x] Cleaned up unused code for leaner codebase: removed unused ActivityCalendar.tsx component (replaced by ActivityCalendarPeriod), removed commented out code blocks in utils.ts (range function and modulo function), removed commented out imports across multiple files, removed unused useRenderingTrace utility and its export, and cleaned up various commented out code sections. This significantly reduces codebase size and improves maintainability.
- [x] Applied consistent code formatting: ran Prettier across the entire codebase to ensure consistent formatting standards, fixed all formatting issues in 21 files, and verified that all files now follow the project's Prettier configuration (single quotes, 2-space tabs, 100 character line width, semicolons, no trailing commas). The codebase now has uniform formatting throughout.
- [x] Verified TypeScript type safety: ran comprehensive TypeScript compilation checks with strict mode enabled, confirmed no type errors exist in the codebase, and validated that all type definitions are correct and consistent. The project maintains excellent type safety with strict TypeScript configuration.
- [x] Improved logging system for better debugging and monitoring: removed low-value console.log statements and commented out debug logs, replaced them with structured simpleLogger calls that include context, timestamps, and performance metrics. Added valuable logging for user actions (activity selection, data export), authentication flows, API operations with timing, and error handling with proper context. The logging system now provides meaningful insights for debugging and monitoring application behavior.
- [x] Build and Lint Verification: Fixed all TypeScript and linting errors. Refactored code to address Rules of Hooks violations, unused imports, and exhaustive dependency warnings. Corrected ESLint configuration to properly handle ES modules.

## v1 - Comprehensive Review - 2026-01-06

A comprehensive code review was performed, covering technical debt, architecture, security, and other areas. The full results of the review can be found in the [Comprehensive Code Review Summary](./review/2026-01-06-v1/COMPREHENSIVE_REVIEW_SUMMARY_2026-01-06.md).

## Type Safety Hardening - 2026-01-06

- Strengthened type safety in core services:
  - `GoalService`: replaced `any` with `WeekData`, introduced whitelisted activity fields, and constrained expr-eval usage behind a typed facade while preserving the original boolean-returning behaviour expected by weekly goal evaluation.
  - `storage`: added a `StorageSchema` map, strongly-typed helpers (`storeValue`, `retrieveValue`, etc.), and concrete activity types for activity storage helpers.
  - `AuthService`: added explicit `AthleteInfo` and refined `StravaAuthHook` return types, including a typed `authPromptAsync`.
- Improved types in shared utilities and UI:
  - `utils.dropColumn`: converted to a generic `dropColumn<T>` working on `T[][]`.
  - `StatsTab` and `CustomDrawer`: tightened icon types to `keyof typeof Ionicons.glyphMap` for safer icon usage.
  - `SimpleLogger`: switched from `any` to `unknown`, normalised log values, and preserved console behaviour on web while keeping a typed in-memory log.
- Verified the changes with `npx expo lint --fix`; there are currently no new linter errors in the updated files.

## Home Screen Enhancements - 2026-01-06

- Added a **This Week** summary card on Home:
  - Reuses `weeklyData` to compute totals for the current ISO week.
  - Displays total time, distance, and elevation for the week in a compact card near the top of the screen.
- Added a **Recent Achievements** section on Home:
  - Highlights the longest activity (distance) and biggest climb (total elevation gain), including activity names when available, limited to activities from the last 3 months.
  - Computes the fastest recent week (km/h) based on distance and time, using the same weekly stats foundation as the Stats tab, also restricted to the same 3‑month window.
  - Truncates long achievement lines in the card to a single line with ellipsis to keep the layout compact and readable even with verbose activity names.
  - Displays the start date of the 3-month period in the section subtitle (e.g., "since Oct 6, 2025").

## Dead Code Cleanup - 2026-01-06

- Removed unused functions:
  - `getDaysOfMonth` from `utils.ts` - never imported or used anywhere
  - `retrieveEpochLastFetched` from `storage.ts` - never called (the `EPOCH_LAST_FETCHED_KEY` constant is still used)
- Removed commented-out code:
  - `retrieveActivity` function in `storage.ts` - entire function was commented out
  - Old implementation comments in `RecentMonthsScreen.tsx`
- All changes verified with TypeScript compilation and ESLint - no breaking changes introduced.

## Activities Determinism - 2026-01-06

- Made `mostRecentActivity` selection deterministic in `useActivities`:
  - After fetching from Strava, activities are explicitly sorted by `start_date_local` in descending order before picking the most recent activity.
  - This ensures `mostRecentActivity` always matches the first element of the sorted activities list, even if the API response order changes.
  - When deleting the current most recent activity, the pointer now moves to the next most recent activity if available, or is cleared when no activities remain.

## Streams Robustness - 2026-01-06

- Hardened `ActivityAnalysisView` stream loading:
  - `getActivityStreams` results are now checked for emptiness before accessing the first element, and `loadedStream` is explicitly cleared when no streams are found.
  - Added error handling and an `isMounted` guard around the async load to avoid setting state after unmount and to log failures via `simpleLogger`.

## Tooling & Repo Hygiene - 2026-01-06

- Updated `.gitignore` to exclude the editor workspace file from version control, keeping local IDE configuration out of the repository.

## Docs Maintenance - 2026-01-06

- Moved Google Cloud CLI setup instructions out of `AGENTS.md` into a dedicated `docs/google-cloud-cli-setup.md` document to keep agent guidelines focused and centralize cloud tooling setup in docs.
- Enhanced `AGENTS.md` with comprehensive guidelines for AI agents: added project overview and definition of done, operational constraints (build limits, code quality checks), architecture pointers and fragile areas, code style patterns, testing expectations, Strava API guardrails, branching/PR etiquette, common pitfalls, and quick reference commands. This provides essential context for AI agents to work effectively on the project.

## Import Cleanup - 2026-01-XX

- Cleaned up duplicate imports across the codebase:
  - **RecentMonthsScreen.tsx**: Consolidated 3 separate imports from `@/shared` (simpleLogger, ChipMultiSelect, ActivityType/seconds_to_label) into a single combined import statement.
  - **CustomDrawer.tsx**: Consolidated 2 separate imports from `@/features/auth` (ButtonStravaConnect, useAuthContext) into a single combined import statement.
  - **App.tsx**: Consolidated 2 separate imports from `@/shared` (RootDrawerParamList, LogScreen/simpleLogger) into a single combined import statement.
- Fixed scattered imports (imports from the same module spread across multiple locations):
  - **App.tsx**: Consolidated scattered imports from `react-native-gesture-handler` (side-effect import on line 1, named import on line 14) and `@/features/activities` (imports on lines 4-7 and line 20) by grouping them together. Side-effect imports remain at the top as required, with named imports immediately following.
- All duplicate and scattered imports have been resolved. The codebase now follows best practices with consolidated imports from the same module grouped together, improving code readability and maintainability.
- Updated `AGENTS.md` with comprehensive import hygiene guidelines to prevent future occurrences of duplicate and scattered imports.
- Created `scripts/check-imports.cjs` tool to automatically detect duplicate and scattered imports. Added `npm run check:imports` script for easy access. This tool should be run before committing significant changes to catch import hygiene issues early.

## Sonar Scripts Adaptation - 2026-10-21

- Copied `fetch_sonar_results.sh` and `fetch_sonar_duplications.sh` from the USN_WINDOWS project into `scripts/` and adapted them for this repository:
  - Default project key changed from `BrunoO_USN_WINDOWS` to `BrunoO_offline-fitness` and default organization from `BrunoO` to `brunoo` (the actual SonarCloud org key; the `organization=` API parameter is case-sensitive).
  - `fetch_sonar_results.sh` now anchors its output directory to the project root (`PROJECT_ROOT/sonar-results`) instead of the current working directory, matching `fetch_sonar_duplications.sh`.
  - Removed the stale reference to `get_sonarqube_measures.sh` (not copied) and updated the `--path-contains` example to `src/features` for this codebase layout.
  - Added `sonar-results/` to `.gitignore` so script outputs are not committed.
- Verified with `bash -n`, `--help`, and a cwd-independent smoke run. Scripts require `SONARQUBE_TOKEN` (or `--token`), plus `curl` and `jq`.

## ESLint Correctness Gate - 2026-10-21

- Closed the enforcement gap that let the Sonar bug classes recur: enabled type-aware linting (`parserOptions.projectService` on the TS block) and added rules mirroring the Sonar findings:
  - `@typescript-eslint/no-floating-promises: error` (Sonar S9383, 12 MAJOR bugs) — currently surfaces 14 open errors across 10 files, including 2 new ones in `scripts/strava-import-tool/seed.ts`; these are the same sites as the Sonar bug list and the ongoing refactor touches several of them.
  - `@typescript-eslint/require-array-sort-compare: ['error', { ignoreStringArrays: true }]` (Sonar S2871 sort bugs) — zero violations repo-wide: the remaining `.sort()` calls (`streaks.ts` etc.) sort ISO-format strings where lexical order is correct, which `ignoreStringArrays` deliberately allows; verified the rule does fire for number/object arrays.
  - `complexity: warn @ 15` and `no-await-in-loop: warn` as visibility gates (9 + 21 warnings today, non-blocking).
- Notes: `@typescript-eslint/no-await-in-loop` doesn't exist in the installed typescript-eslint 8.x line, so the core ESLint rule is used. Do not re-register the `@typescript-eslint` plugin key in `eslint.config.mjs` — `eslint-config-expo` already provides one (8.67) and flat config errors on redefinition; the type-aware rules resolve through it.

## Sonar Scan Fix - 2026-10-21

- Removed `sonar.testExecutionReportPaths=coverage/test-reporter.xml` from `sonar-project.properties`: nothing in the toolchain generates Sonar's generic test-execution XML, and a declared path that fails to parse aborts the whole local scan (`Scanner engine failed with code 1`). Added a comment so the reference isn't reintroduced blindly. If test metrics are wanted later, wire up `jest-sonar-reporter` and declare the path again.
- Coverage in Sonar still works via `sonar.javascript.lcov.reportPaths=coverage/lcov.info` (a missing or empty lcov is tolerated by the scanner; run `npx jest --coverage` before scanning to feed it).

## Sonar Quick Fixes - 2026-10-21

- `fetchAndStoreStreams.loadMostRecentStream`: gave the `reduce()` an explicit initial value (`jsonFiles[0]`) to clear Sonar S6959 (MAJOR) — the empty-folder guard already prevented the crash, but the initial value makes the fold provably safe and rule-clean.
- `App.tsx`: suppressed Sonar S3863 / ESLint `import/no-duplicates` on the `react-native-gesture-handler` side-effect + named import pair with `NOSONAR` comments and scoped `eslint-disable-next-line`s — merging these imports is forbidden by AGENTS.md (side-effect import must stay first and separate), so the tools are aligned with the documented pattern instead of nagging against it.

## Floating Promises Cleared - 2026-10-21

- Fixed all 14 `@typescript-eslint/no-floating-promises` errors so the new lint gate starts green (also clears the 13 Sonar S9383 MAJOR bugs):
  - `void` marker where the callee provably never rejects (own try/catch, best-effort by design): `App.tsx` splash calls, `ThemeProvider.loadPalette`, `ActivityAnalysisView.loadStream/handleExport`, `HomeScreen.fetchData/updateStreamStatus`, `useLocationPermission.ensurePermissionAsync`, `seed.ts` interim `writeState(false)` (already swallows its own failures).
  - `.catch(log)` where a rejection would have been silently lost: `App.tsx` activity reload, `DetailsScreen` stream-file delete + no-stream ids load, `MapsScreen.web` stream load, `StatsTabSettingsContext.loadSettings` (also exits the loading state on failure so the UI cannot hang).

## Sort Comparator Policy - 2026-10-21

- Resolved the Sonar S2871 CRITICAL sort backlog: added explicit `(a, b) => a.localeCompare(b)` comparators to all 10 flagged `.sort()` calls (`streaks.ts` x3, `ActivityCalendarPeriod`, `HomeScreen` x2, Recent Months/Weeks/Years screens, `YTDStatsComponent`).
- Chose `localeCompare` deliberately: a plain `<`/`>` comparator would satisfy ESLint but NOT Sonar, whose string-array variant of S2871 specifically requires locale-aware comparison. For the values actually sorted here (ASCII ISO date/week keys and PascalCase Strava type ids) localeCompare yields the same order as the previous default sort, so behavior is unchanged — verified by the existing streaks/stats test suites (389 pass).
- The comparator also removes the silent trap: if these arrays ever hold non-string values, TypeScript rejects the call instead of alphabetising numbers unnoticed.
- Remaining bare `.sort()` calls are test-only (sorting expected-value string literals) and stay.

## Cognitive-Complexity Backlog Cleared - 2026-10-21

- Refactored all 10 Sonar S3776 CRITICAL functions by extracting cohesive helpers; control flow, allocation profile and hot loops are unchanged so there is no perf penalty:
  - `zipReader.readZipEntries`: central-directory record fields moved to a `CentralEntryFields` object + `applyZip64Extra` helper (only runs for ZIP64-overflow entries).
  - `gpxParser.parseGpx`: per-`<trkpt>` extraction moved to pure `readTrackPoint`; regex exec count unchanged.
  - `textDecode.decodeUtf8Manually`: `continuationCount` + `decodeSequence` helpers; the 8 KB ASCII fast path stays fully inline and untouched.
  - `csvParser.parseActivitiesCsv`: split into `resolveHeader` / `makeCell` / `readExportedRow` / `collectRows`; identical warnings (incl. the first-five-bad-dates cap) and skip semantics.
  - `exportData`: chunk building, GPX attach, file naming and the share loop moved to `buildChunkFile` / `addStreamToZip` / `chunkFileName` / `shareExportFiles`; the export never still rejects and progress math is unchanged.
  - `fetchAndStoreStreams.calculateAndStoreMissingBoundingBoxes`: per-activity work in `backfillBoundingBox` (service function, not a compiled component, so `finally` is safe); `processingActivities` add/delete pairing preserved on every path.
  - `backupSync`: shared `describeError`, plus `ensureOwnedCollection`, `propagateLocalTombstones`, `mergeRemoteTombstones` (push) and `cleanOrphanedStreamFiles`, `localStreamMatchesIndex`, `fetchStreamContent` (pull); tombstone/stream decisions and error strings identical.
  - `StatsTab` modal: `ValidationBadge` and `SettingToggle` extracted as module-level theme-aware components (createStyles + useMemo, no hardcoded colours), removing six inline ternaries from the modal body.
- 389 tests, tsc, check:imports and eslint all green after the refactor.

## Post-Scan Regressions Cleared - 2026-10-21

- Second scan showed 190 open (vs ~187 projected): the complexity refactor itself introduced 4 small issues; all fixed:
  - `textDecode.decodeUtf8Manually` still at cognitive 16: lead-byte dispatch extracted to `pushDecodedSequence`; ASCII fast path untouched.
  - `cleanOrphanedStreamFiles` was `async` with no `await` (S7503): made synchronous, call site updated.
  - `ValidationBadge`/`SettingToggle` props not `Readonly` (S6759 x2): marked.
  - `deleteStreamFiles` `Promise.all` over sync `File.delete()` results (S4123 CRITICAL): now a plain sync loop; the misleading `runWithCleanup`/`Promise.all` scaffolding around it removed (function made non-async, `DetailsScreen` call wrapped in try/catch, same rethrow semantics, cleanup guard preserved).
- Also fixed the last open BUG: `stats.ts` `allActivities.map(...)` used for side effects -> `forEach` (S2201).

## Readonly Props Batch - 2026-10-21

- Closed the largest MINOR cluster: all 30 Sonar S6759 "mark component props as read-only" issues wrapped in `Readonly<>` across 20 files (ActivityAnalysisView's 8 subcomponents + main view, ActivityListItem, LastActivitySummary, DetailsScreen, ActivityCalendarPeriod, ButtonList, HomeScreen, MiniMapComponent x3, MapsScreen x2, ProgressOverlay, RecentMonths/Years screens, StatsTab, ChipMultiSelect, SettingsModal, PalettePicker, ThemeProvider).
- Applied via a dry-run-reviewed codemod driven by the issue list itself (shape-specific wraps: inline literal, named Props type, `props:` parameter, `Partial<>`); type-only change, no runtime impact — tsc and 389 tests green.
- Suggested follow-up: consider ESLint `react/prefer-read-only-props` to keep this closed.

## Jest Assertion Specificity - 2026-10-21

- Closed all 14 Sonar S5906 MINORs: `expect(x.length).toBe(n)` -> `expect(x).toHaveLength(n)` and `expect(x).toBe(undefined)` -> `expect(x).toBeUndefined()` across nodeSource/theme/useActivities/fetchAndStoreStreams/storage/ytd-stats specs. Specific matchers give readable failure diffs; all assertions still pass, confirming behaviour parity.

## Regex Backtracking Batch - 2026-10-21

- Closed all 7 Sonar S8786 MAJORs (super-linear regexes) plus one unscanned twin in the desktop tool; each fix is also a small perf win, not just a lint quiet:
  - `/\/+$/` trailing-slash trims (webdavAuth, webdavTransport x3, tool args.ts x1): replaced by `trimTrailingSlashes()` - a linear `charCodeAt` scan exported from `webdavTransport`; quadratic only on hostile input, but server URLs are user-typed.
  - `/[.:;]+$/` in `csvParser.normalizeHeader` (runs per header cell per import): explicit `slice` loop. A `trimEnd('.:;')` shortcut was tried first and rejected - trimEnd takes no arguments, the spec'd "codePoints" proposal never shipped; the caught-by-test behaviour difference ("vitesse max.") is why the fixture suite matters.
  - `gpxParser` `<ele>`/`<time>` patterns `\s*([^<]+?)\s*`: whitespace run + lazy capture overlapped, so failing matches backtracked quadratically per track point. Now `/<ele>\s*(\S[^<]*)<\/ele>/` - the `\S` anchor removes the overlap and the greedy tail cannot rematch the closing tag, so matching is linear. Trailing whitespace lands inside the capture: `Number()` tolerates it; `Date.parse` gets an explicit `.trim()`.

## Modern-API Batch (Sweep 4) - 2026-10-21

- Closed ~60 MINOR modern-API clusters across 17 files via an occurrence-count-asserted codemod (`from`/`to` pairs; aborted unless every count matched), then fixed three dropped trailing punctuation spots by hand:
  - `.replace(/X/g, y)` -> `String#replaceAll` where the pattern is literal-safe (XML entities, `\u00a0`, `\.`, `,`, `\\/`); `.replace(',', '.')` intentionally kept (first-match semantics).
  - `str.match(RE)` -> `RE.exec(str)` for the 9 non-global date/coordinate patterns.
  - `[arr.length - 1]` -> `.at(-1)` in cold paths (streaks, stats, ytd, gps-simplify tail, csvParser, zip prop parse); stats.ts:74 uses an index variable (assignment position cannot use `.at`); `gps-simplify` gets an undefined guard instead of `!`.
  - `isNaN`/`parseInt`/`parseFloat` -> `Number.*` (all call sites pass already-number typed values; equivalence verified by tests).
  - `String.fromCharCode` -> `fromCodePoint` in byte-chunk decoders (identical for 0-255), `charCodeAt` -> `codePointAt` in BOM/slash scans.
  - `&&`-chains -> optional chaining (compressStreamSet, trackComparison guards); ternary defaults -> `??` (utils.getCurrentWeekNumber, fetchStreamContent); `aliases.includes` -> Set `.has`.
  - Intentionally NOT "fixed": `webdavTransport` text->bytes `charCodeAt & 0xff` (deliberate UTF-16-unit truncation; `codePointAt` would change astral chars) -> NOSONAR comment; `streamCodec` `1 << 0` bit flag (S7767 false positive) -> `0b001` binary literals; `zipReader` `0x1_0000_0000` -> `2 ** 32`.

## Readability & Deprecated-API Batch (Sweep 5) - 2026-10-21

- **S4165 redundant assignments (4)**: `streaks.ts` - three hand-rolled run-length loops replaced by one shared `longestAndFinalRun(items, contiguous)` helper (index-based runs; same results, verified by streaks specs); `MapsScreen.android` - the map-type switch became a `NEXT_MAP_TYPE` lookup const (repo's "maps over enums" style).
- **S1874 deprecated APIs (7)**: `MapsScreen.web` `SafeAreaView` -> `react-native-safe-area-context` (the package AGENTS.md mandates; on web the old core component was a no-op anyway, so no layout change); both `DateTimePicker`s -> `onValueChange` + `onDismiss`, preserving the old close-the-overlay-on-cancel behaviour that the generic `onChange` provided.
- **S6479 index keys (4)**: Polyline list keyed by `activity.id`; YTD quarter bands by `quarter.start`; table rows by their first cell and highlighted cells by the existing `positionKey`.
- **S3358 nested ternaries (5)**: `webdavTransport` content-type chain -> `contentTypeForBody()`; HomeScreen achievement strings -> module-level `achievementLabel()` helper; the map loading/empty ternary chain and the heatmap/polyline chain flattened to sibling conditions (same branches, same order).
- **S1479 47-case switch (1)**: `LastActivitySummary` emoji switch -> extracted `ACTIVITY_ICONS` lookup map (also moves the function out of the component body; 55 keys + fallback transcribed programmatically to keep the ZWJ emoji exact).
- **S5976 parameterized tests (3)**: GoalService evaluate trio, streaks 35/52/60-week trio, utils-months match trio -> `it.each`.
- **S6478 (3)** - NOT "fixed": `App.tsx` drawerContent and the two `headerRight` callbacks are React Navigation's documented render-prop pattern with legitimate closure needs; annotated NOSONAR with rationale (same policy as the gesture-handler import).

## Await-In-Loop Policy Decision - 2026-10-22

- Sonar's 15 remaining S9382 (await-in-loop) issues were marked **Won't Fix** via the API, each with a rationale comment. Reviewed individually: every flagged loop is sequential by design — bounded-memory stream/ZIP reads on low-end devices (the explicit fragile-area strategy), WebDAV MKCOL parent-before-child ordering, PROPFIND pagination that depends on the previous response, one-at-a-time human share-sheet flow, short-circuit scans, and loops already wrapped in `runWithConcurrency`. Parallelizing would trade a lint badge for memory spikes, server races and per-item error-handling regressions.
- The local ESLint `no-await-in-loop` **warning** stays as the tripwire for accidental new occurrences; the Sonar board is now honest (no rule-level blanket suppression).
- Result: 40 → 25 open issues without a rescan (transition is immediate).

## Final Sweep (Batch 6) - 2026-10-22

- Closed the last 24 open Sonar issues, emptying the board (25 -> ~1; S6551 handled via code, see below):
  - **S4144 x3**: `storage.ts` storeIntValue/storeValue/storeStringValue unified behind a private `storeJson`; `SimpleLogger` constructor collapsed into field initializers + `clearLogs` (no duplicated body).
  - **S7503 x3**: `zipReader` memory source returns `Promise.resolve(...)` instead of a no-await `async`; `BackupSection.handleDisconnect` made synchronous (its async work is inside the Alert callback); `getNoStreamIds` split into a synchronous core wrapped as a Promise so all existing callers (and `countStreamsStatus`'s await) stay untouched.
  - **S4138 x2**: index loops -> `for...of` (md5 hex, ZIP name decode).
  - **S4624 x2**: nested templates flattened (`basicAuth`, `idSuffix`).
  - **S4782 x3**: `overlayStream?: X | undefined` -> `overlayStream?: X` in all three MiniMap platform prop types.
  - **S6481**: `StatsTabSettingsContext` provider value memoized with `useMemo` (was a fresh object every render).
  - **S4043**: `RecentYearsScreen` sorts a copy (`[...dataTime].sort`) instead of mutating inside a call argument.
  - **S6754 x2**: `setShowHeatamp` typo renamed to `setShowHeatmap`; `ThemeProvider` state pair renamed to `paletteIdState/setPaletteIdState` (value/setter symmetry kept, public API unchanged).
  - **S7723 x2**: `Array(n)` -> `new Array(n)` in the DP table init.
  - **S7754**: `.find(...)` -> `.some(...)` in DetailsScreen reset guard.
  - **S7766**: monotonic-time ternary -> `Math.max`.
  - **S7781**: leftover `/\./g` replace -> `replaceAll('.')`.
  - **S9381**: `deleteActivity` rewritten as a linear `await` flow (no nested promise chains); semantics preserved, the tombstone await is failure-contained and cannot fail the local delete.
  - **S6551**: `normaliseLogValue` now branches on function first, so the `String()` fallback only sees symbol/bigint - never `[object Object]`.
  - **S1135**: stale `//todo replace from types.ts` resolved by documenting why the web MapsScreen keeps its own `ActivityWithStream` (raw `StreamSet` vs the shared converted type).
- Caught by tests: the `getNoStreamIds` Promise.resolve transcription initially dropped `offset + length` in the memory byte source slice; 5 zipReader/seed tests failed immediately and the fix restored them - another win for the fixture suite.

## Sonar Completion Gate - 2026-10-22

- Added `scripts/sonar_gate.sh`: machine-checkable Definition-of-Done gate that fails (exit 1) while any SonarCloud issue is OPEN/CONFIRMED, prints offenders with file/line/severity/rule, supports `--scan` (local scanner + server-processing poll), exits 2 when it cannot run (missing token/network - never silently "passes").
- AGENTS.md: gate added to the Definition of Done and the pre-commit checklist, plus a new "Sonar Quality Gate" section with agent rules: fix the code to pass (never transition issues to won't-fix/false-positive - human decision only), a non-runnable gate is a blocked task not a done one, and ESLint correctness rules remain the first line of defense.
- Verified live: `scripts/sonar_gate.sh` -> "PASSED: 0 open issues", exit 0.

## Late-Discovery Reduction (Lint Mirrors + Codemod Discipline) - 2026-10-22

- ESLint now mirrors the Sonar classes that have lint equivalents, so they surface at write time instead of scan time:
  - `regexp/no-super-linear-backtracking`: **error** in product code (S8786 - the archive-URL/parser hang vector), off in tests (portability helper parses repo source, not user input); new devDep `eslint-plugin-regexp`.
  - `no-nested-ternary` + `no-warning-comments` (todo/fixme): warn (S3358/S1135 mirrors).
  - New `__tests__` block with `eslint-plugin-jest`: `prefer-to-have-length`, `prefer-comparison-matcher`, `expect-expect` (warn) + `no-standalone-expect` (error) - mirrors S5906.
  - All mirror rules report **0 findings** on the committed tree today: they exist to prevent, not to backlog.
- AGENTS.md: "Sonar Quality Gate" rule 5 updated to describe the full mirror set; new **"Bulk Edits & Codemods"** section - occurrence-counted replacements, dry-run review, affected-test-suite-immediately, never auto-fix files with foreign WIP, judgment-call comments at the site. These are the exact failure modes this session hit (zipReader slice, duplicated JSX tag, dropped commas).
- Not touched (user's parallel work in `8b0f71e`+WIP): App.tsx prettier drift, manualActivity.spec formatting, one floating promise in useActivities.spec - pre-existing lint errors unrelated to this change; flagged, deliberately not auto-fixed per the new rule 4.

## SonarCloud CI - 2026-10-22

- Added `.github/workflows/build.yml` (from SonarCloud's onboarding template, adjusted): ubuntu-latest (no Xcode needed; macOS minutes burn 10x), install -> tsc -> check:imports -> jest --coverage -> sonarqube-scan-action, with `sonar.qualitygate.wait=true` so the job fails when the "Sonar way" gate (new issues = 0) does. Lint step is `continue-on-error` until the parallel feature work's lint debt lands; flip it to blocking afterwards. Coverage + tsc + imports are blocking now.
- PRs now get inline Sonar comments on new-code issues (the shift-left for classes with no lint equivalent: S3776 cognitive complexity, S5976 test parameterization, nested templates).
- `sonar-project.properties`: stale `projectKey=offline-fitness` corrected to `BrunoO_offline-fitness` + added `sonar.organization=brunoo` (a bare scanner run would previously scan into / create a wrong project; the CLI overrides in scripts masked this).
- Needs (done): `SONAR_TOKEN` repository secret. Optional follow-up: pin `actions/setup-node` to a SHA like the other steps for supply-chain parity.


## CI Annotation Triage - 2026-10-22

- Verified the failed CI run had exactly ONE true failure: the quality gate (new_coverage 60.7% < 80%). All other red/warning annotations were non-blocking noise from three different layers: prettier [failure]-level annotations from the advisory lint step, ESLint warnings on files outside Sonar's scope (scripts/, new specs), the Node-20 pin notice on wizard-pinned actions, and 5 harmless "could not resolve lcov path" warnings (jest records coverage for tool scripts that Sonar excludes).
- build.yml: lint step now covers only the DoD scope (src/ + App.tsx/index.js) so out-of-scope files can't paint the UI red.
- sonar-project.properties: removed sonar.sources/tests/test.exclusions/inclusions/language after the scanner proved it ignores them (new scope UX analyzes everything; only exclusions apply); added *.test.ts to exclusions for parity. Comment added so nobody reintroduces the dead keys.
- App.tsx: applied the prettier fixes the lint step flagged (formatting only; drawerContent suppression structure verified intact).
- Gate decision (custom new-issues=0 gate vs. covering the new-code tests) remains open with the user - until then CI fails on coverage, by design, not noise.

## Custom Gate Findings + CI Contract Enforcement - 2026-10-22

- SonarCloud **Community plan**: custom quality gates can be CREATED and CONFIGURED via API ("Offline Fitness way" exists with new_violations GT 0 + hotspots-reviewed LT 100), but not ASSIGNED: set_as_default returns "Organization not allowed to modify Quality gates", select_project is gone, and a settings/set probe was accepted (204) but no-op.
- Therefore the A contract (zero new issues, not new coverage) is enforced in CI directly: build.yml's scan no longer waits on the built-in Sonar way gate; a "Quality gate (0 open issues)" step polls the compute queue (api/ce/task) to completion, then runs `scripts/sonar_gate.sh` (exit 1 on any OPEN/CONFIRMED issue). Same contract the DoD documents, plan-independent.
- If the gate is ever assigned via UI (or plan upgrade), removing the inline step's overlap is trivial; until then the Sonar way gate's ERROR on new_coverage is expected dashboard noise, not a build blocker.
