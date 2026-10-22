# Offline Fitness

Personal analytics for your own activity history — maps, statistics, streaks and a calendar,
**mostly offline**. No account, no tracking, and your activity data never leaves the device.

The app never talks to a server for your activity data. You import the ZIP archive that the
Strava web UI emails you ("Download or delete your account") — the conversion runs on a
computer, and the phone fills itself from your WebDAV backup. The result is the same local
records and track cache that a sync would have produced.

The one part that still needs a network is the map itself: map tiles are fetched from the map
provider (Google Maps today), which needs an API key. Everything else — statistics, calendar,
streaks, export, backup — runs entirely on the device.

## What it does

- **Strava archive ingestion** — a desktop tool reads `activities.csv` plus every GPX track
  straight out of the archive `.zip` and seeds your WebDAV backup; the phone fills itself
  with *Restore* (no Strava account connection, no API).
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
2. **Import the Strava archive** — *done*. A desktop tool converts `activities.csv` plus GPX
   tracks into the WebDAV backup collection and the phone restores from it; the run is
   idempotent and resumable. Still open: `.fit` and `.tcx` tracks are not parsed (those
   activities import without a map).
3. **Backup and sync over WebDAV** — *in progress*. Pushing and restoring activities and
   tracks against any RFC 4918 server exists in the app; the stream files are moving to a
   compact binary format to make the sync faster and roughly half the size.
4. **Record your own GPS tracks** — *in progress*. The Android recorder is in the app: a
   local Expo module owns the foreground service and the fix log, and the app replays the
   log in TypeScript to produce the same activity/stream shape as an imported one, so maps,
   charts and stats treat them identically. iOS is a compiled stub today (`canRecord: false`);
   a CoreLocation implementation is a contribution. Post-MVP: audio/haptic splits and the
   battery-exemption prompt.
5. **Activities without GPS** — *todo*. Enter activities by hand (indoor sessions,
   a treadmill run, yoga). Some groundwork exists already: ingestion tolerates
   activities without a track and excludes them from distance/elevation stats.
6. **Alternative map provider** — *todo*. Replace the Google Maps SDK — the one dependency
   that needs an API key and a network — with a provider that does not, completing the
   "no account, no tracking" promise and making the whole app usable fully offline.

## Getting the data in

There are two ways to populate the app:

- **Record a track on the phone** (Android today; iOS is a compiled stub). Drawer →
  **Record** → pick a profile (walking, hiking, cycling, swimming) → Start. The app keeps
  the screen on, captures the fix log, and on Stop replays it into an activity that shows
  up everywhere an imported one does (map, stats, calendar, export, WebDAV push). The
  "Add activity" drawer item opens a chooser between Record and Enter manually.
- **Import a Strava archive** (the original path), for everything recorded before this
  app existed or on another device:

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

4. On the phone: drawer → **Settings** → **Restore**. The download fills the app; the archive
   itself never touches the phone.

Notes:

- Both steps 3 and 4 are **idempotent and resumable**: the tool skips whatever the server
  already holds (byte-for-byte, via md5). A restore fills gaps for activity records without
  touching what the phone has — but it does re-download any stream file whose bytes differ
  from the index (stale or corrupt copies heal instead of persisting). Interrupt a run at any
  point; re-running resumes.
- Set up the WebDAV backup first: drawer → **Settings** → Backup (no server yet? see
  [Backup server (Nextcloud)](#backup-server-nextcloud)). `--root`, `--user` and `--profile`
  are exactly what that screen shows; a mismatch with the folder's owner is refused before
  anything uploads.
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

Drawer → **Settings** → **Backup**:

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
        ├── streams/          # <activityId> track payloads
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
- **Export cleans up after itself — almost.** Export writes `strava_export*.zip` chunks into
  the app's document storage and opens the share sheet per chunk, deleting each once its
  share returns; the recipient's copy is then yours to manage. Files left by an export that
  was killed *mid-run* survive until the next export, which sweeps them first — so a share
  you abandoned can leave gigabytes in app storage briefly.
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
- **Recorded tracks keep a 30-day fix log on the device.** A recording writes raw fixes
  (`fixes.jsonl`) next to its `meta.json` under the app's private files, retained for 30
  days for debugging (why did last week's ride come out short?). The log never leaves the
  device: it is not in the WebDAV backup, not in the GPX/CSV export, and not in the
  desktop seeder. Deleting an activity offers to delete its log; Settings has a
  **Delete all** control. Android-only recording today; iOS reports `canRecord: false`.

## Requirements

- Node 20+, npm
- Expo SDK 57 / React Native 0.86 / React 19.2 (see `package.json`)
- **Android** (the target platform) or **iOS** (partial: statistics, calendar and backup work;
  the map screen is a placeholder)

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

The WebDAV backup is configured in the app itself: drawer → **Settings** → server URL (the
full collection root, e.g. `https://host/remote.php/dav/files/<user>/`), username and
password. [Backup server (Nextcloud)](#backup-server-nextcloud) covers standing one up.

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
