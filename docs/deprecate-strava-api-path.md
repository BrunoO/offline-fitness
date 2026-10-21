# Deprecate & Remove the Strava API Path

**Status:** implemented — 2026-10-20
**Owner:** app maintainer
**Related:** `src/features/strava-import/` (offline archive importer, merged in `723efc6`), `docs/architecture.md`, `docs/status.md`

## Why

Strava's API access is now subscription-gated, so the OAuth + REST sync path in this app can no longer
work for users without a Strava subscription. The archive importer (`src/features/strava-import/`) already
covers the same data with **parity**: same `Activity` records, same `latlng`/`altitude`/`time` stream
shape, same maps/charts/stats. The API path is therefore dead weight — and it actively hurts the
offline-first experience, because today the app waits for a Strava token before loading anything from
local storage.

### Product consequence to accept up front

There is **no incremental sync** after this change. "New" activities appear only when the user requests a
fresh archive from Strava and imports it again. The importer is idempotent and resumable, so re-importing
a newer archive is safe: activities are upserted by id, and existing stream files are never overwritten.

## Goal

Make the Strava archive the **only** ingestion path, and delete the OAuth/API/background-sync code that
no longer has a purpose.

## Non-goals

- No FIT/TCX track parsing (decided: ignore for now; 4 activities in the reference export).
- No changes to the WebDAV backup feature (it is provider-neutral and independent of Strava).
- No change to the `Activity` data model, the date model, or stats/maps behaviour.
- `python-app/` is a separate Python tool and is out of scope.

## Steps

- [x] Step 1: Decouple app startup and `useActivities` from Strava OAuth & API fetching
- [x] Step 2: Update `HomeScreen`, `CustomDrawer`, and `MapsScreen.web` to remove API controls and surface archive import
- [x] Step 3: Remove Strava OAuth, API services, background sync task, and dead constants/storage keys
- [x] Step 4: Clean up unused Expo OAuth/background-task dependencies and config plugins
- [x] Step 5: Update unit tests and documentation

---

## Step 1 — Decouple app startup and `useActivities`

### `App.tsx`

- Remove the `AuthProvider` wrapper (and the `useAuthContext()` call that reads `refreshToken` /
  `retrieveToken`).
- Remove `setupBackgroundTasks()` from the startup effect and delete the `"Background Sync"` drawer screen
  (`BackgroundTasksScreen`).
- Replace the token-gated refresh effect with an unconditional local load: once the startup backfills
  (`calculateAndStoreMissingBoundingBoxes()`, `correctSwimElevationGain()`) complete, call
  `reloadActivitiesFromLocalStorage()`.
  - Today the load only happens when a Strava token exists, so an archive-only install shows an empty
    home screen until a connection exists. This is the core bug of the deprecation.

### `src/features/activities/hooks/useActivities.ts`

- Remove imports of `fetch_activities_from_strava`, `silentFetchAndStoreStreams` and `useStravaAuth`.
- Remove `get_access_token()` and the whole `refreshActivities()` network body.
- Remove API-only state and effects: `totalActivitiesFetched`, `lastFetchError`, `lastSyncTimestamp`,
  and the `EPOCH_LAST_FETCHED_KEY` write effect.
- Keep `reloadActivitiesFromLocalStorage()` as the single entry point that refreshes the UI
  (used by the importer and by pull-to-refresh).

### `src/features/activities/ActivitiesContext.tsx`

- Reduce `ActivitiesSyncContextType` to the local-only surface: `fetchingData` and
  `reloadActivitiesFromLocalStorage`.
- Drop `lastFetchError`, `lastSyncTimestamp`, `refreshActivities` from the context value and its
  dependency list.

## Step 2 — UI: remove API controls, surface the importer

### `src/features/home/screens/HomeScreen.tsx`

- Remove `useAuthContext()` (`userInfo`, `accessToken`), the header-right `"Please connect"` label, and
  the `"Strava Connection Status"` card (including the last-error + retry block).
- In the `"Activity Data"` card:
  - Remove the `"New Activities"` row (API fetch counter + sync button).
  - Keep `"Stored Locally"` (with the list button).
  - Turn `"Streams"` into a read-only counter (`downloaded / activities with GPS`); remove the
    cloud-download button that called `fetchAndStoreData`.
  - Add an **"Import Strava Export"** row that opens `StravaImportModal` directly from Home (the Drawer
    entry stays as well), and refreshes the stream status after a successful import.
- Remove `handleFetchStreams()` and the `"Fetching Streams"` `ProgressOverlay`.
- Point the `RefreshControl` (pull-to-refresh) at `reloadActivitiesFromLocalStorage()` +
  `countStreamsStatus()` instead of `refreshActivities()`.

### `src/shared/components/CustomDrawer.tsx`

- Remove `useAuthContext()`, `ButtonStravaConnect` and the `"Disconnect from Strava"` item.
- Keep `"Import Strava Export"`, `"Export Data"`, `"Clear Local Activities"`, `<BackupSection />`.

### `src/features/maps/screens/MapsScreen.web.tsx`

- Remove `useStravaAuth()` and `fetchStravaActivityStream()`.
- Load the track from the local stream cache (`getActivityStreams(activity.id)`), so web uses the same
  data as native instead of calling the API.

## Step 3 — Remove OAuth, API services, background sync, dead constants

### Delete `src/features/auth/`

- `src/features/auth/AuthContext.tsx`
- `src/features/auth/services/AuthService.ts`
- `src/features/auth/components/ButtonStravaConnect.tsx`
- `src/features/auth/index.ts`

### Trim `src/features/activities/`

- Delete `services/activities.api.ts` (`fetch_activities_from_strava`, `prepare_data`).
- Delete `types/activities.types.ts` (`StravaActivity`).
- Delete `services/fetchActivityStream.api.ts` (`fetchStravaActivityStream`).
- Delete `screens/UpdateDataScreen.tsx` (already unrouted — dead code today).
- In `services/fetchAndStoreStreams.ts` remove `fetchAndStoreData`, `silentFetchAndStoreStreams` and the
  `processingActivities` flag. **Keep** the local helpers: `compressStreamSet`, `simplifyTrack`,
  `loadMostRecentStream`, `storeBoundingBoxIfMissing`, `getActivityStreams`, `loadStreamForActivity`,
  `deleteStreamFiles`, `getNoStreamFlagIds`, `countStreamsStatus`,
  `calculateAndStoreMissingBoundingBoxes`, `correctSwimElevationGain`.
  - `compressStreamSet` is imported directly by the importer, so it must stay exported from this file.
- In `types/stravaActivityStream.model.ts` remove `ActivityStreamRequest` and `ActivityStreamResponse`;
  keep `StreamSet` and the coordinate types.
- Update the barrel `src/features/activities/index.ts` exports to match.

### Trim `src/shared/`

- Delete `src/shared/services/handleBackgroundTasks.tsx` (`setupBackgroundTasks`,
  `BackgroundTasksScreen`).
- Delete `src/shared/services/apiHeaders.ts` (`STRAVA_API_HEADERS`, `JSON_CONTENT_HEADERS`,
  `JSON_CONTENT_CHARSET_HEADERS`, `createAuthHeaders`, `createAuthJsonHeaders`).
- Remove `'Background Sync': undefined` from `RootDrawerParamList` in `src/shared/types/types.ts`.

### Clean up constants and storage keys

- `src/constants/index.ts`: remove the `API_ENDPOINTS` block (all `STRAVA_*`).
- `src/constants/index.ts` / `src/shared/services/storage.ts`: remove the Strava-only storage keys —
  `EPOCH_LAST_FETCHED`, `LAST_SYNC_TIMESTAMP`, `ACCESS_TOKEN`, `REFRESH_TOKEN`, `TOKEN_RESULT`,
  `TOKEN_EXPIRATION`, `USERINFO` — together with their exported aliases in `storage.ts` and the
  `TokenResult` interface.
- `src/shared/services/storage.ts`: the `removeAllActivities` path currently clears
  `EPOCH_LAST_FETCHED_KEY`; drop that line with the key.

## Step 4 — Dependencies & app config

- `package.json`: remove `expo-auth-session` (used only by `AuthService.ts`) and `expo-background-task`
  (which pulls `expo-task-manager` transitively). The WebDAV backup is foreground-triggered, so no
  background task is needed.
  - Keep `expo-secure-store` — used by `src/features/backup/services/webdavAuth.ts`.
  - `expo-web-browser` has no `src/` usage left once the OAuth flow is gone (it is only listed as an
    `app.json` plugin), so remove it from `package.json` and from the plugin list as well.
- `app.json`:
  - Remove the `"expo-background-task"` and `"expo-web-browser"` plugins.
  - Remove `ios.infoPlist.UIBackgroundModes` (`["processing"]`) if no background task remains.
  - Keep `INTERNET` (WebDAV backup) and the location permissions (maps).

## Step 5 — Tests & documentation

### Tests

- `__tests__/activities/useActivities.spec.ts`: replace the API-refresh expectations with
  `reloadActivitiesFromLocalStorage` behaviour (loads stored activities, sets the stored count, keeps the
  WebDAV tombstone assertion on delete).
- Delete `__tests__/features/activities/hooks/useActivities.race.test.ts` (API race test).
- Delete `__tests__/prepareData.spec.ts` (`prepare_data` is gone).
- `__tests__/fetchAndStoreStreams.spec.ts`: drop the `fetchAndStoreData` suite, keep the local
  stream-storage tests.
- `__tests__/helpers/testActivities.ts`: keep the factory; it documents the `Activity` shape.

### Documentation

- `docs/architecture.md`: remove `features/auth`, the OAuth flow, the `StravaAPI` node and the background
  sync task from the diagram; document the archive importer as the only ingestion path.
- `docs/status.md`: add a "Strava API path removed" entry listing what was deleted and the new
  "re-import to get new activities" behaviour.
- `AGENTS.md`: drop `features/auth` from the tree, the `AuthProvider` mention, the
  `scheduleFetchActivities` import exception, and the "Strava API Usage" section (rate limits, 401/429
  handling) — or replace it with the archive-import rules.

## Verification gate

Run before committing each step:

```bash
npx expo lint --fix
npx tsc --noEmit
npm run check:imports
npm test -- --watchAll=false
```

Manual check on device (no Strava connection at all):

1. Fresh install with an empty local store → Home renders without a "connect" prompt.
2. Import the real archive → activities appear, maps/charts/stats populate, no network calls.
3. Re-import the same archive → no duplicates, summary reports "already present".
4. Pull-to-refresh → local activities reload, no error.
5. Backup (WebDAV) push/pull still works and is unaffected by the removal.

## Risks & notes

- **Cold-start behaviour changes**: today the app waits for a token before loading local data. After this
  change local data always loads — that is the intended fix, but it changes the Home screen's first paint.
- **No incremental updates**: users must re-download the archive from Strava to get new activities. The
  importer is idempotent, so this is a workflow change, not a data risk.
- **`local_date` accuracy** stays tied to the device timezone at import time (the archive has no timezone
  column). Unchanged by this work, but it becomes the only date source — worth stating in the UI copy.
- **Uncommitted WebDAV work** (`src/features/backup/`, `storage.ts` tombstones, `package.json` dependency
  changes) is still in the working tree. This plan should be executed on a branch that contains that work,
  or after it is committed, to avoid overlapping edits in `src/shared/services/storage.ts` and
  `src/constants/index.ts`.
- **Rollback**: every step is a separate commit; reverting the series restores the API path (Strava
  subscriptions may still be unavailable, so the archive importer remains the primary path).
