# Offline Fitness

Personal analytics for your own activity history — maps, statistics, streaks and a calendar,
**mostly offline**. No account, no tracking, and your activity data never leaves the device.

The app never talks to a server for your activity data. You import the ZIP archive that the
Strava web UI emails you ("Download or delete your account"), and the app rebuilds the same
local records and track cache that a sync would have produced.

The one part that still needs a network is the map itself: map tiles are fetched from the map
provider (Google Maps today), which needs an API key. Everything else — statistics, calendar,
streaks, export, backup — runs entirely on the device.

## What it does

- **Archive import** — pick the `.zip` and it reads `activities.csv` plus every GPX track
  straight out of the archive.
- **Maps** — every track is drawn on a map, with a minimap on the home screen and a
  full-screen map view with date filtering. Tiles come from the map provider, so this is the
  only screen that needs a network connection.
- **Statistics** — weekly/monthly/yearly totals, distance, elevation, and per-activity-type
  breakdowns, with a configurable weekly goal and goal streaks. E-bike rides fold into rides
  and hikes into walks by default — see [Activity type merging](#activity-type-merging).
- **Calendar & streaks** — a month calendar with activity markers, day and week streaks.
- **Similar activities** — finds other activities with a matching route (bounding-box IoU).
- **Export** — all activities and tracks as GPX + CSV, in chunks.
- **Backup** — optional WebDAV backup/restore of the local store (Nextcloud, rclone, Apache
  mod_dav or any RFC 4918 server). The password is kept in the system keychain.

## Roadmap

The app is built in layers, each one unlocking the next. Where we are:

1. **Fitness statistics** — *done*. Weekly/monthly/yearly totals, per-type breakdowns,
   calendar, day/week/goal streaks, year-to-date comparison and similar-route detection all
   work on the local store.
2. **Import the Strava archive** — *in progress*. Importing `activities.csv` plus GPX
   tracks works end to end and is idempotent and resumable. Still open: `.fit` and `.tcx`
   tracks are not parsed (those activities import without a map), and large archives keep
   surfacing performance work on low-end devices.
3. **Backup and sync over WebDAV** — *in progress*. Pushing and restoring activities and
   tracks against any RFC 4918 server exists in the app; the stream files are moving to a
   compact binary format to make the sync faster and roughly half the size.
4. **Record your own GPS tracks** — *todo*. Capture a track during an activity in the app
   itself, so Offline Fitness can stand alone and you no longer depend on Strava to produce
   the data.
5. **Activities without GPS** — *todo*. Enter activities by hand (indoor sessions,
   a treadmill run, yoga). Some groundwork exists already: the importer tolerates
   activities without a track and excludes them from distance/elevation stats.
6. **Alternative map provider** — *todo*. Replace the Google Maps SDK — the one dependency
   that needs an API key and a network — with a provider that does not, completing the
   "no account, no tracking" promise and making the whole app usable fully offline.

## Getting the data in

1. Sign in to the Strava website → **Settings → My Account → Download or delete your account**
   and request the archive. Strava emails you a link to a `.zip`.
2. In the app: open the drawer → **Import Strava Export** (or the *Import* row on the home
   screen) → pick the `.zip`.
3. The import shows progress and a summary. It is **idempotent**: re-importing the same
   archive updates the activity records and leaves existing tracks untouched, so it is safe
   to run again after downloading a newer archive.

Notes:

- Archive timestamps are **UTC**; the app derives athlete-local dates using the **device
  timezone** (the archive carries no timezone column).
- `.fit` and `.tcx` tracks are not parsed yet — those activities are imported without a map.
- Activities that exist only on the device are never removed by an import.

## Activity type merging

Strava files an e-bike ride as `EBikeRide` and a hike as `Hike`, as types of their own,
apart from `Ride` and `Walk`. The **Stats** screens fold them into their sibling by default:

| Stored type | Counted under |
|---|---|
| `EBikeRide` | `Ride` |
| `Hike` | `Walk` |

So a ride logged on an e-bike shows up in the Ride columns and charts rather than as a
separate near-empty row — which is usually what you want when the question is "how much
did I bike this year".

This is a **display-time fold, nothing more**. It is controlled by the *Merge Similar
Activities* switch in the Stats screen settings (enabled by default):

- The stored records and everything that reads them — the activity list, calendar, exports,
  backups — keep the original `EBikeRide` / `Hike` types. Nothing is rewritten on disk.
- Turn the switch off and the Stats screens show one column and one chart per original type
  again.
- Only the Stats screens apply the fold. Import, deduplication by activity id, and the
  similar-route comparison work on the original types regardless.

For contributors: the mapping lives in `MERGED_ACTIVITY_TYPES` in
`src/features/activities/services/mergeActivities.ts`, and it has to be applied to the
activity **and** the type list together — the type list drives the table columns, so a list
that drops the source type without renaming it leaves the stats tables keying a column that
was never initialised.

## Fine print

Behaviours of the app (or the OS around it) that can surprise you:

- **Android can back the app up without the app doing anything.** The build allows the OS
  backup agent (`allowBackup="true"`), so Google One's "Back up to Google Drive" — and
  device-to-device migration — can copy the app's private storage, activities and tracks
  included, off the device. The app itself never uploads anything. If you want the local
  store to be *strictly* local, exclude the app in your phone's backup settings; building
  from source, `allowBackup="false"` is the harder guarantee.
- **Export leaves its zip chunks behind.** An export writes `strava_export*.zip` into the
  app's own document storage and opens the share sheet per chunk; the files stay there
  (and are part of the storage the point above backs up) until cleared or overwritten by a
  later export.
- **Map tiles reveal where you ride.** While a map is visible, the tile provider sees your
  IP address and roughly the region you are browsing. This is the only data the app ever
  sends anywhere unless *you* trigger it.
- **WebDAV sync is gap-fill on pull and delete-propagating on push.** A pull never
  overwrites or removes local data — it only adds what is missing ("local wins"). A push
  propagates deletions: an activity deleted locally is also removed from the server, via
  time-limited tombstones. A backup folder owned by another profile or app id is refused
  rather than silently mixed.
- **Plain HTTP to the WebDAV server is allowed, on purpose.** `usesCleartextTraffic` is
  enabled so self-hosted servers on a LAN without certificates work. Prefer HTTPS or a
  VPN where you can, and use a scoped app password.
- **`ACCESS_BACKGROUND_LOCATION` is declared but never requested.** It sits in the
  manifest for the roadmap's track recorder; today the app asks for foreground location
  only, and only for the map's blue dot. Users reading the permission list should know it
  is currently dead weight.
- **The screen stays awake during an archive import.** A long import deliberately holds the
  wake lock so Android does not suspend the work mid-archive.

## Requirements

- Node 20+, npm
- Expo SDK 57 / React Native 0.86 / React 19.2 (see `package.json`)
- Android or iOS device (the app also runs on web)

## Development

```bash
npm install
npx expo start            # dev server
npx expo start --android  # or --ios

npx tsc --noEmit          # type check
npx expo lint --fix       # lint
npm run check:imports     # duplicate/scattered import check
npm test -- --watchAll=false
```

Native projects are managed by Expo (no `ios/`/`android/` in the repo). After changing native
config, regenerate them:

```bash
npx expo prebuild --clean --platform android
```

## Configuration

Everything private lives in `.env` (gitignored). Copy the template and fill it in:

```bash
cp .env.example .env
```

| Variable | Purpose |
|---|---|
| `ANDROID_PACKAGE` | Android application id. Per developer and per store listing — two apps can only be installed side by side with different ids. Falls back to the placeholder `com.example.offlinefitness`. |
| `IOS_BUNDLE_ID` | iOS bundle identifier. Falls back to the same placeholder. |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps key for Android. Without it the Android map has no tiles. |

The application ids are kept out of the repository so the public source carries
nobody's handle; the committed values are neutral placeholders.

The Maps key is **inlined into the app bundle** at build time — that is unavoidable for
a key used from a mobile app, so protect it with Cloud console restrictions instead:

- *API restrictions*: only **Maps SDK for Android** and **Maps SDK for iOS**.
- *Application restrictions*: the Android package name from `.env` plus the SHA-1 of the
  signing certificate (`keytool -list -v -keystore android/app/debug.keystore -alias
  androiddebugkey -storepass android | grep SHA1`), and the iOS bundle id.

The key is needed for the map view only, and a key-free map provider is the expected
direction — everything else in the app works without any key at all.

The WebDAV backup is configured in the app itself: drawer → **Backup** → server URL (the
full collection root, e.g. `https://host/remote.php/dav/files/<user>/`), username and
password.

## Project layout

```
src/
├── features/
│   ├── activities/      # Core state, local storage, stream cache, list/detail screens
│   ├── backup/          # WebDAV backup/restore
│   ├── home/            # Home screen
│   ├── maps/            # Map visualization
│   ├── stats/           # Charts, statistics screens, settings
│   └── strava-import/   # Archive importer (ZIP → CSV → GPX → local records)
├── shared/              # Cross-cutting components, services, utils, types
└── constants/           # Theme colors, app config, storage keys
```

`docs/architecture.md` documents the architecture, `docs/status.md` is the changelog, and
`AGENTS.md` holds the conventions any contributor (human or AI) should follow.

## License

MIT — see [LICENSE](LICENSE).

The data you import belongs to you. This project is not affiliated with, endorsed by, or
connected to Strava; all product names and trademarks are the property of their respective
owners.
