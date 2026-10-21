# Offline Fitness

Personal analytics for your own activity history — maps, statistics, streaks and a calendar,
**entirely offline**. No account, no tracking, and your activity data never leaves the device.

The app never talks to a server for your activity data. You import the ZIP archive that the
Strava web UI emails you ("Download or delete your account"), and the app rebuilds the same
local records and track cache that a sync would have produced.

The one part that still needs a network is the map itself: map tiles are fetched from the map
provider (Google Maps today), which needs an API key. Everything else — statistics, calendar,
streaks, export, backup — runs entirely on the device.

## What it does

- **Archive import** — pick the `.zip` and it reads `activities.csv` plus every GPX track
  straight out of the archive. The archive is ~1 GB uncompressed, so it is never loaded whole:
  the ZIP central directory is read first, then each entry is seeked to on demand.
- **Maps** — every track is drawn on a map, with a minimap on the home screen and a
  full-screen map view with date filtering. Tiles come from the map provider, so this is the
  only screen that needs a network connection.
- **Statistics** — weekly/monthly/yearly totals, distance, elevation, and per-activity-type
  breakdowns, with a configurable weekly goal and goal streaks.
- **Calendar & streaks** — a month calendar with activity markers, day and week streaks.
- **Similar activities** — finds other activities with a matching route (bounding-box IoU).
- **Export** — all activities and tracks as GPX + CSV, in chunks.
- **Backup** — optional WebDAV backup/restore of the local store (Nextcloud, rclone, Apache
  mod_dav or any RFC 4918 server). The password is kept in the system keychain.

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
