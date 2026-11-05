# Offline Fitness

Personal analytics for your own activity history — maps, statistics, streaks and a calendar,
**mostly offline**. No account, no tracking, and your activity data never leaves the device.

The app never talks to a server for your activity data. You can record workouts directly on
the phone, add sessions manually, or import the ZIP archive that the Strava web UI emails you
("Download or delete your account") — archive conversion runs on a computer, and the phone
fills itself from your self-hosted WebDAV backup. The result is the same local records and
track cache that a sync would have produced.

The one part that can use a network is the map itself: map tiles are fetched from Google Maps,
which needs an API key. If you omit the key, the app runs in **real offline mode**, showing a
clean placeholder on map views while every other screen, statistic, chart, and recording feature
works 100% offline.

## What it does

- **Strava archive ingestion** — a desktop CLI (`npm run tool:seed`) reads `activities.csv`
  plus every GPX track straight out of the archive `.zip` and seeds your WebDAV backup; the
  phone fills itself with *Restore* (no Strava account connection, no API tokens).
- **On-device GPS recording** — record runs, walks, hikes, rides, and swims on Android via a
  dedicated foreground service (`modules/gps-tracker`). Features barometric sensor fusion
  (NMEA geoid undulation + barometer EMA smoothing + deadband hysteresis), live elevation gain
  ($\text{D+}$), live terrain grade/slope %, sport-aware pace (`min/km`) or speed (`km/h`),
  metric audio/spoken split announcements (TTS), lock-screen notification controls (pause,
  resume, stop), and crash recovery. (iOS is a compiled stub).
- **BLE heart-rate monitoring** — connect a Polar H10 or any standard Bluetooth Low Energy
  heart-rate strap (GATT Service `0x180D`) on Android (`modules/heart-rate`) with live BPM,
  audio split callouts, and stream alignment.
- **Timer recording & manual entry** — time GPS-less indoor workouts (Yoga, gym, workout) with
  configurable vocal interval prompts, or log retroactive sessions manually (date, duration,
  distance, elevation, with remembered frequency and custom types).
- **Maps & 3D flyover** — every track is drawn on a map with a minimap on the home screen and
  a full-screen Maps tab with year and activity-type filtering. Activity details feature
  distance-spaced, zoom-adaptive direction chevrons, interactive elevation profile scrubbing,
  and an animated 3D flyover with camera pitch and circular heading smoothing.
- **Statistics & records** — weekly, monthly, and yearly totals for distance, moving time, and
  elevation gain; sport-aware pace and speed; configurable weekly goals and goal streaks
  (`GoalService` sandbox); and an all-time **Records** tab for personal bests. E-bike rides
  fold into rides, hikes into walks, and workouts into yoga by default — see
  [Activity type merging](#activity-type-merging).
- **Calendar & streaks** — a month calendar with activity markers, day and week streaks.
  Tapping any day shows that day's activities and allows logging a workout on that date.
- **Similar activities & route comparison** — candidate pre-filtering with sport-adapted
  bounding-box IoU thresholds, followed by a distance-resampled **corridor-overlap** route
  comparison (symmetric, speed-independent, and pause-resilient) with direction analysis
  highlighting reverse routes (`(⇄ reverse)`) and fitting trend lines for same-direction matches.
- **Athlete profile & weight history** — optional age and dated body-weight history with a
  trend chart (`ProfileScreen`), CSV file import/export, and WebDAV cloud sync (`profile.json`).
- **Backup & cloud sync** — optional WebDAV backup and restore against any RFC 4918 server
  (Nextcloud, rclone, Apache mod_dav). Uses schema v2 with compact `'OF'` v1 binary stream
  payloads, gap-fill on restore, and 30-day tombstone deletions on push. Passwords stay in
  the device keychain.
- **Chunked export** — export all activities and tracks as GPX + CSV in 500-item ZIP chunks,
  with automatic cleanup after sharing.
- **Accessible modern shell** — floating bottom tab bar (`Home`, `Activities`, center
  `RecordAction` hero button, `Stats`, `Maps`), push stack for activity analysis, a Profile Hub
  bottom sheet with a 14-day backup health dot, and WCAG 2.1 AA contrast compliance across 5
  palettes (Legacy, Twilight, Alpine, Terracotta, Crimson) in light and dark modes.

## Roadmap

The app is built in layers, each one unlocking the next. Where we are:

1. **Fitness statistics** — *done*. Weekly/monthly/yearly totals, per-type breakdowns,
   calendar, day/week/goal streaks, all-time personal records tab, year-to-date comparison,
   and corridor-overlap route matching all work on the local store.
2. **Import the Strava archive** — *done*. A desktop CLI tool converts `activities.csv` plus
   GPX tracks into the WebDAV backup collection and the phone restores from it; the run is
   idempotent and resumable. Still open: `.fit` and `.tcx` tracks are not parsed (those
   activities import without a map).
3. **Backup and sync over WebDAV** — *done*. Pushing and restoring activities, user profile,
   and tracks against any RFC 4918 server is fully implemented, using collection schema v2,
   compact `'OF'` v1 binary streams, gap-fill restore, and 30-day tombstone deletions.
4. **Record your own GPS tracks** — *done on Android*. A local Expo module owns the
   foreground service and fix log (`modules/gps-tracker`), paired with a BLE heart-rate module
   (`modules/heart-rate`). The app replays the fix log in TypeScript to produce canonical
   activity and stream shapes identical to imported ones. Features live elevation gain ($\text{D+}$),
   live slope grade, spoken metric split announcements, and crash recovery. iOS is a compiled
   stub today (`canRecord: false`).
5. **Activities without GPS** — *done*. Both manual entry (`ManualActivitySheet` with custom
   types, distance, and elevation) and timer-only recording (`TimerRecordingScreen` with vocal
   interval prompts) produce first-class activities that integrate into all time-based statistics,
   streaks, calendar views, and backups.
6. **Alternative map provider** — *planned / draft*. "Real offline mode" is already supported
   via an offline placeholder when the Google Maps API key is omitted. A migration plan to a
   runtime-token or vector-tile provider (MapLibre Native / MapTiler) is documented in
   `docs/map-provider-migration-plan.md`.

## Getting the data in

There are two primary ways to populate the app:

- **Record or create a workout on the phone**:
  Tap the elevated center **+** button in the floating bottom tab bar (or the **+** button in
  the top header) to open the **Add activity** chooser:
  - **Record (GPS)** (Android): Pick a profile (`running`, `cycling`, `walking`, `hiking`,
    `swimming`), optionally connect a BLE heart-rate strap, and tap Start. The app keeps the
    screen awake, records raw fixes via a foreground service, displays live metrics (elapsed,
    moving time, distance, pace/speed, live $\text{D+}$, live grade %), announces spoken splits,
    and provides notification shade controls. On Stop, the fix log is replayed into a canonical
    activity that appears everywhere an imported one does (map, stats, calendar, export, WebDAV).
  - **Record (Timer)**: Time a GPS-less session (Yoga, workout, gym) with an elapsed timer and
    configurable vocal interval announcements.
  - **Enter manually**: Retroactively log an activity with date, start time, sport type (with
    smart frequency ordering and custom types), duration, distance, and elevation.
- **Import a Strava archive** (the historical ingestion path), for everything recorded before
  this app existed or on another device:

1. Sign in to the Strava website → **Settings → My Account → Download or delete your account**
   and request the archive. Strava emails you a link to a `.zip`.
2. Preview the conversion on a computer — it parses, converts and reports, but makes no
   network requests and writes nothing:

```bash
npm run tool:seed -- import --archive export.zip \
  --root https://host/remote.php/dav/files/<user>/ \
  --user <user> --profile <label> --tz Europe/Paris --dry-run
```

3. Seed for real. The password comes from stdin or `STRAVA_IMPORT_PASSWORD` — the tool refuses
   it as a flag, because command lines leak through `ps`:

```bash
echo '<app-password>' | npm run tool:seed -- import --archive export.zip \
  --root https://host/remote.php/dav/files/<user>/ \
  --user <user> --profile <label> --tz Europe/Paris --password-stdin
```

4. On the phone: tap the Profile Hub button (avatar in the top header) → **Cloud Backup & Sync** →
   **Restore**. The download fills the app; the archive itself never touches the phone.

Notes:

- Both steps 3 and 4 are **idempotent and resumable**: the tool skips whatever the server
  already holds (byte-for-byte, via MD5). A restore fills gaps for activity records without
  touching what the phone has — but it does re-download any stream file whose bytes differ
  from the index (stale or corrupt copies heal instead of persisting). Interrupt a run at any
  point; re-running resumes.
- Set up the WebDAV backup first: tap the Profile Hub button → **Cloud Backup & Sync** (no
  server yet? see [Backup server (Nextcloud)](#backup-server-nextcloud)). `--root`, `--user`
  and `--profile` are exactly what that screen shows; a mismatch with the folder's owner is
  refused before anything uploads.
- The archive stores only **UTC** timestamps and no timezone. The tool derives each activity's
  zone from its GPS start — a holiday ride in Porto is bucketed Porto-local — and uses `--tz`
  (your home zone) only for records without a usable track: manual entries, swims and `.fit`.
  The final report lists every zone used.
- `.fit` and `.tcx` tracks are not converted yet — those activities arrive without a map.
- Activities that exist only on the device are never removed by seeding or restoring.
- If the tool reports a layout-version or ownership mismatch, it is refusing to mix folders:
  use the collection your phone's Backup screen names, or erase an old-format folder on the
  server and re-seed (old layouts are not migrated).

`npm run tool:seed -- status ...` reports what a collection currently holds, and
`docs/desktop-import-plan.md` describes the layout contract.

## Backup server (Nextcloud)

The backup asks one thing of a server: WebDAV that accepts `PROPFIND`, `MKCOL`, `PUT` and
`DELETE`. Nextcloud is the reference implementation — a plain file tree served at
`https://host/remote.php/dav/files/<user>/`, which is exactly the account root the app asks
for. rclone and Apache `mod_dav` work too; Nextcloud is what the instructions below assume.

**Use an app password, not your login password.** In Nextcloud: avatar → **Personal settings
→ Security → Devices & sessions → Create new app password**. Nextcloud shows the string once —
copy it then.

### Docker (fastest)

```bash
docker run -d --name nextcloud \
  --restart unless-stopped \
  -p 8080:80 \
  -v nextcloud:/var/www/html \
  nextcloud
```

Open `http://<host>:8080`, choose the admin login, then create the app password above. The
image defaults to SQLite, which is enough for a single-user backup target; for more users put
it behind the upstream MariaDB compose template (see the
[Nextcloud Docker documentation](https://github.com/nextcloud/docker)).

### Native install

On a Debian/Ubuntu box the snap is the shortest path to a working server:

```bash
sudo snap install nextcloud
sudo nextcloud.manual-install <admin-user> <admin-password>
sudo nextcloud.enable-https lets-encrypt   # needs a public domain pointed at the box
```

A distro package or the manual LAMP/LEMP install (web server + PHP + MariaDB, data directory
outside the web root) gives the same result; the
[admin manual](https://docs.nextcloud.com/server/latest/admin_manual/installation/) has the
per-distribution steps. Either way the endpoint ends up at
`https://host/remote.php/dav/files/<user>/`.

### Point the app at it

Tap the Profile Hub button (avatar in the top header) → **Cloud Backup & Sync**:

| Field | Value |
|---|---|
| Server URL | `http://<host>:8080/remote.php/dav/files/<user>/` — the account root, trailing slash included, **not** a subfolder |
| Username | your Nextcloud user |
| Password | the app password from above |
| Profile name | any label, e.g. your first name |

Everything below that root is created by the app, so don't make the folders by hand:

```
remote.php/dav/files/<user>/
└── offline-fitness/
    └── <profile>/
        ├── collection.json   # owner (app id + profile) and layout version
        ├── activities/       # <activityId>.json
        ├── streams/          # <activityId>.json (binary 'OF' v1 track payloads)
        ├── profile.json      # athlete profile (age + weight history)
        └── sync-state.json   # md5 index + deletion tombstones
```

Notes:

- **The profile label is the backup's identity.** Use the same label on every device you own —
  two phones with one profile share a single backup. Two people sharing one Nextcloud account
  pick different labels; the app refuses a collection that belongs to another profile or app
  id, and recreates `offline-fitness/<profile>/` if it was deleted on the server.
- **Desktop seeding takes the same three values**: `--root`, `--user` and `--profile` are
  exactly what that screen shows.
- **HTTPS is preferred, plain HTTP is deliberate.** The app allows cleartext traffic so a
  self-hosted box on a LAN without certificates works. A **self-signed** certificate is
  rejected by the phone's TLS stack — use Let's Encrypt, or HTTP on a trusted network.
- **The folder is ordinary storage.** It counts against the account quota like any other
  Nextcloud folder, and the track payloads are the bulk of it. You can browse or copy it from
  the Files app or the Nextcloud desktop client, but don't rename or restructure it — the app
  only knows the layout above.

## Activity type merging

Strava files an e-bike ride as `EBikeRide`, a hike as `Hike`, and starting August 2025 exported
Yoga sessions as `Workout`. The **Stats** screens fold them into their canonical sibling by default:

| Stored type | Counted under |
|---|---|
| `EBikeRide` | `Ride` |
| `Hike` | `Walk` |
| `Workout` | `Yoga` |

So a ride logged on an e-bike shows up in the Ride columns and charts rather than as a
separate near-empty row — which is usually what you want when the question is "how much
did I bike this year".

This is a **display-time fold, nothing more**. It is controlled by the *Merge Similar
Activities* switch in the Stats screen settings (enabled by default):

- The stored records and everything that reads them — the activity list, calendar, exports,
  backups — keep the original types. Nothing is rewritten on disk.
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
- **Export cleans up after itself — almost.** Export writes `offline_fitness_export*.zip`
  chunks (500 activities each) into the app's document storage and opens the share sheet per
  chunk, deleting each once its share returns; the recipient's copy is then yours to manage.
  Files left by an export that was killed *mid-run* survive until the next export, which sweeps
  them first.
- **Map tiles reveal where you ride.** While a map is visible, the tile provider sees your
  IP address and roughly the region you are browsing. This is the only network data the app
  ever transmits unless *you* trigger it. You can run without an API key for true offline mode.
- **WebDAV sync is gap-fill on pull and delete-propagating on push.** A pull never
  overwrites or removes local data — it only adds what is missing ("local wins"). A push
  propagates deletions: an activity deleted locally is also removed from the server, via
  time-limited tombstones. A backup folder owned by another profile or app id is refused
  rather than silently mixed. Stream files are stored using the compact `'OF'` v1 binary codec.
- **Plain HTTP to the WebDAV server is allowed, on purpose.** `usesCleartextTraffic` is
  enabled so self-hosted servers on a LAN without certificates work. Prefer HTTPS or a
  VPN where you can, and use a scoped app password.
- **Recorded tracks keep a 30-day fix log on the device.** A recording writes raw fixes
  (`fixes.jsonl`) next to `meta.json` and `heartrate.jsonl` under the app's private files,
  retained for 30 days for debugging and crash recovery. The log never leaves the device:
  it is not in the WebDAV backup, not in the GPX/CSV export, and not in the desktop seeder.
  Deleting an activity automatically discards its fix log, and unreferenced logs are swept
  on startup. Android-only recording today; iOS reports `canRecord: false`.
- **Strictly metric-only.** All calculations, speed/pace formatting, live elevation, and split
  announcements use metric units (`km`, `m`, `km/h`, `min/km`, `min/100m`).

## Requirements

- Node 20+, npm
- Expo SDK 57 / React Native 0.86 / React 19.2 (see `package.json`)
- **Android** (the primary platform: full GPS recording, BLE heart rate, maps, stats, backup)
  or **iOS** (partial: stats, calendar, manual/timer entry, backup, export; GPS recording and
  BLE HR are stubs, map is a placeholder)

The app is mobile only. There is no browser build: it needs the phone's file system (track
cache, export) and keychain (backup password), and `app.json` lists `ios` and `android` as the
platforms.

## Development

```bash
npm install
npx expo start            # dev server
npx expo start --android  # or --ios

npx tsc --noEmit          # type check
npx expo lint --fix       # lint
npm run check:imports     # duplicate/scattered import check
npm run check:mobile-only # verify mobile-only invariant
npm run check:install-scripts # verify dependency install script decisions
npm test -- --watchAll=false
scripts/sonar_gate.sh     # verify zero open Sonar issues
```

Native projects are managed by Expo (no `ios/`/`android/` checked into the repo). After changing native
config, regenerate them:

```bash
npx expo prebuild --clean --platform android
```

> [!NOTE]
> For Android builds, use **OpenJDK 21** (such as Android Studio's bundled JBR or `brew install openjdk@21`). Set `JAVA_HOME` accordingly before running native build scripts.

## Configuration

Everything private lives in `.env` (gitignored). Copy the template and fill it in:

```bash
cp .env.example .env
```

| Variable | Purpose |
|---|---|
| `ANDROID_PACKAGE` | Android application id. Per developer and per store listing — two apps can only be installed side by side with different ids. Falls back to the placeholder `com.example.offlinefitness`. |
| `IOS_BUNDLE_ID` | iOS bundle identifier. Falls back to the same placeholder. |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps key for Android. Leave it **empty** to run fully offline: the app still builds and runs, every screen works, and maps show a "Maps unavailable" placeholder instead of a blank MapView. Fill it in to view tiles on a map. |

The application ids are kept out of the repository so the public source carries
nobody's handle; the committed values are neutral placeholders.

## Real offline mode (no Google Maps key)

You do **not** need a Google Maps API key to use the app offline. Leave
`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` empty in `.env` and build normally — the build
succeeds and the app runs. All statistics, calendar, streaks, export, backup,
manual/timer entries, and on-device recording work entirely on the device. The only
difference is that map surfaces (home minimap, full-screen map, activity detail)
render a "Maps unavailable" placeholder instead of fetching tiles from Google Maps.

The Maps key is **inlined into the app bundle** at build time — that is unavoidable for
a key used from a mobile app, so protect it with Cloud console restrictions instead:

- *API restrictions*: only **Maps SDK for Android** and **Maps SDK for iOS**.
- *Application restrictions*: the Android package name from `.env` plus the SHA-1 of the
  signing certificate (`keytool -list -v -keystore android/app/debug.keystore -alias
  androiddebugkey -storepass android | grep SHA1`), and the iOS bundle id.

The WebDAV backup is configured in the app itself: tap the Profile Hub button (avatar in
the top header) → **Cloud Backup & Sync** → server URL (the full collection root, e.g.
`https://host/remote.php/dav/files/<user>/`), username and password.
[Backup server (Nextcloud)](#backup-server-nextcloud) covers standing one up.

## Project layout

```
src/
├── features/
│   ├── activities/      # Core state, local storage, stream cache, list & detail screens
│   ├── backup/          # WebDAV cloud backup & restore (schema v2, transport, sync)
│   ├── heart-rate/      # BLE heart-rate monitoring (Polar H10, GATT service, hooks)
│   ├── home/            # Home dashboard, summary widgets, calendar, streaks
│   ├── maps/            # Map views, direction arrows, zoom controls, 3D flyover
│   ├── profile/         # Athlete profile: age, body-weight history, Profile Hub sheet
│   ├── recording/       # GPS & timer recording: fix logs, replay, live stats, slope, TTS
│   ├── stats/           # Charts, statistics, personal records, GoalService sandbox
│   └── strava-import/   # Archive-conversion core (CSV/GPX/ZIP/mapping), run by desktop tool
├── navigation/          # Floating tab bar, main bottom tabs, root native stack
├── shared/              # Cross-cutting components, services, utils, types
├── theme/               # Dynamic palettes (WCAG AA), ThemeProvider, useTheme
└── constants/           # App config, storage keys, routes
modules/
├── gps-tracker/         # Local Expo module: Android foreground service, fix logging, TTS
└── heart-rate/          # Local Expo module: Android BLE GATT heart-rate service
```

`docs/architecture.md` documents the architecture, `docs/ontology.md` documents domain and
physical invariants, `docs/status.md` is the changelog, and `AGENTS.md` holds the conventions
any contributor (human or AI) should follow.

## License

MIT — see [LICENSE](LICENSE).

The data you import belongs to you. This project is not affiliated with, endorsed by, or
connected to Strava; all product names and trademarks are the property of their respective
owners.
