# Desktop Strava Import Tool — Implementation Plan

**Status:** Phases 0, 1 and 2 complete (portable core, desktop CLI, concurrent/batched phone sync). Phase 3 (verification) not started.

**Goal:** convert a Strava data-export ZIP into a WebDAV backup collection **on a computer**, so the
phone never runs the import. The phone only ever runs *Restore* to fill itself.

This removes from the phone the work that made a 2,000-track import crawl: the ~1 GB archive copy
required by the `content://` picker (see the `Bad file descriptor` entry in `docs/status.md`), the
2,026 zip inflations, and the GPX parsing. It does **not** by itself remove the per-file writes and
network round trips on the *restore* — those are Phase 2.

---

## 1. The contract (what the phone will accept)

Target: `<account root>/offline-fitness/<profile>/`

| File | Requirement |
| --- | --- |
| `collection.json` | `{appId: "offline-fitness", profile, schemaVersion: 2, createdAt}`. **The version is mandatory**: push and restore both call `assertCollectionOwnership` (`backupSync.ts`), which now refuses any marker whose `schemaVersion` differs from `APP_CONFIG.BACKUP_SCHEMA_VERSION`. Write it first, so a half-finished run can't be mistaken for a valid collection. |
| `activities/<id>.json` | UTF-8 JSON, key order exactly as `rowToActivity` (`activityMapper.ts`). |
| `streams/<id>.json` | The **binary `'OF'` v1 payload** (`streamCodec.ts` `encodeStreamSet`), 16 B/point. The `.json` extension is intentional — listings, deletion helpers and the WebDAV keys all depend on it. |
| `streams/<id>.nostreamflag` | **Do not write.** The app's push never uploads flags (`backupSync.ts:306`); writing them remotely creates files a later phone push drops from the index. |
| `sync-state.json` | `{syncedAt, activityMd5, streamMd5, deletedAt}`. Written **last**: the md5 key sets *are* the file list the phone restores from, so an early write would advertise files that do not exist yet. Merge `deletedAt` from the remote copy and skip tombstoned ids, or a re-run resurrects activities the user deleted. |

Two version axes, deliberately separate: the collection's `schemaVersion` (folder contract, now 2)
and the per-file `STREAM_FORMAT_VERSION` byte (payload contract, still 1).

### Byte-exactness — what it buys

The phone's push hashes the exact bytes it sends: `md5(string)` for activities
(`backupSync.ts:160`) and `md5Bytes(Uint8Array)` for streams (`backupSync.ts:164`). `pullBackup` checks **no**
hashes — it trusts the index as a file list and skips only on local existence. So:

- A **wrong** hash never corrupts anything. Worst case the phone's next push re-uploads the whole
  collection instead of skipping it.
- The upload's integrity rests entirely on **byte-exact writes**. If the tool's encoded bytes differ
  from the app's by even a rounding difference, the collection is subtly wrong and nobody notices.
  Hence Phase 3's `verify` command, and hence reusing the app's own code instead of porting it.

### Size and speed (measured on this export)

Binary payloads cut the collection roughly in half: ~191 MB → **~98 MB** of streams across a
2,135-track export (~92 KB → ~47 KB on a 3,000-point track). Restore cost is 1 GET per record
(~4,148 sequential requests) + 2,026 file writes + 2,122 AsyncStorage `setItem` calls (pull does not
batch; `backupSync.ts:461`).

---

## 2. Reuse map

| Module | Reusable as-is? | Blocker |
| --- | --- | --- |
| `shared/services/streamCodec.ts` | ✅ | **zero imports** — the purest module in the repo |
| `strava-import/services/csvParser.ts` | ✅ | `papaparse` only |
| `strava-import/services/gpxParser.ts` | ✅ | pure regex |
| `strava-import/services/textDecode.ts` | ✅ | pure |
| `strava-import/services/activityMapper.ts` | ✅ | (was: `week_of_year` via the `@/shared` barrel — repointed to `@/shared/utils/utils` in Phase 0) |
| `strava-import/services/zipReader.ts` | ✅ | (Phase 0 split: the expo-backed `createFileByteSource` moved to `services/expoByteSource.ts`; the reader talks only to the `ByteSource` seam) |
| `backup/services/webdavTransport.ts` | ✅ | Phase 1 removed the last edge: `SimpleLogger` no longer imports `react-native` (its web console-echo checks `document` — Hermes aliases `window` on native). `fetch`/`btoa`/`AbortController` exist in Node 18+, and PUT/GET are byte-aware (`Uint8Array` → `application/octet-stream`, `getDavFileBytes`). The tool wraps it in an injectable `DavClient`. |
| `backup/services/backupSync.ts` | ❌ | AsyncStorage + expo `File` + `expo-crypto`; the tool's orchestrator is `seed.ts`, mirroring `pushBackup`'s semantics against the same transport |

The core graph (`csvParser`, `gpxParser`, `textDecode`, `activityMapper`, `zipReader`,
`import.types`, `streamCodec` + the utils/types they reach) is guarded against re-coupling by
`__tests__/stravaImport/importCorePortability.spec.ts` — see `docs/architecture.md`, "Portable
import core".

Also note `rowToActivity` writes `timezone: "(Europe/Paris)"` (an IANA label) while the Strava API
wrote `"(GMT+01:00) Europe/Paris"`. **Display never parses that field** (`local_date` is the bucketing
source of truth), so it is cosmetic — but a mixed collection would show both shapes, and the tool
should write the same shape the app writes to stay byte-comparable.

Node runtime: `tsx` (a devDependency since Phase 1; reads the existing tsconfig `paths`). md5:
`crypto.createHash('md5').update(content).digest('hex')` — identical to expo-crypto's hex output for
both strings (UTF-8 bytes) and raw buffers. One CJS interop caveat: **pako@1 has no static named
exports**, so modules on the Node path must `import pako` and destructure (named imports throw under
Node ESM while Metro never notices).

---

## 3. Phases

### Phase 0 — extract the pure core ✅ done
What landed:
1. `zipReader.ts` split: the reader keeps only the `ByteSource` seam + `pako`; the expo-backed
   `createFileByteSource` moved to `services/expoByteSource.ts` (the one intentional place where
   `FileHandle` meets the reader).
2. `activityMapper.ts` repointed at `@/shared/utils/utils` (value) and `@/shared/types/types`
   (types); `utils.ts` no longer imports the `@/shared` barrel either — without that change the
   barrel came back in transitively and the split bought nothing.
3. `types.ts` navigation import made `import type` (the repo's first — deliberate; it keeps the
   type graph a runtime leaf for every bundler, not just the ones clever enough to elide it).
4. `webdavTransport` needed no change: the binary-format commit had already made `PUT`/`GET`
   byte-aware and `Content-Type`-correct.
5. Guard: `__tests__/stravaImport/importCorePortability.spec.ts` walks the core's *value* imports
   as text and refuses anything outside the core except `papaparse`/`pako`, any barrel, and any
   value-syntax `react-native`/`expo*`/`react`/`@react-navigation` import. Verified to fail when a
   `react-native` import is injected into the graph.
6. Everything stayed under `src/`; no test expectation changed; `jest-expo` still runs all of it.

### Phase 1 — the desktop CLI ✅ done
`scripts/strava-import-tool/` (`npm run tool:seed`), commands `import`, `status`, `help`:

```
npm run tool:seed -- import --archive export.zip --root <account-root-url> \
  --user <u> --profile <label> --tz <phone IANA zone> [--concurrency 8] [--dry-run] [--password-stdin]
```

What shipped as planned, plus the deltas that mattered:

- Password via `--password-stdin` or `STRAVA_IMPORT_PASSWORD` only — never a flag (argv leaks through `ps`). `--dry-run` needs no credentials and makes zero network calls.
- `--tz` is required for `import` and **verified at runtime**: the process zone is pinned, then `Intl` is asked whether the pin took (Node honours it; jest's vm context does not — the tool's tests seed with the ambient zone and compute expected dates with `Intl` instead). On mismatch the error tells the user to relaunch with `TZ=` in the environment.
- The `WebDAVConfig` is built from the flags (`buildConfig` mirrors `collectionUrlFor`/`validateProfile`, with a keep-in-step comment); the user reads root/username/profile off the phone's Backup screen.
- Uploads run through an injectable `DavClient` interface wrapping the app's own `webdavTransport` (~8-way parallel via a worker pool over the queue).
- Order: `ensureFolders` → claim/verify `collection.json` → activities + streams (md5-skip against the remote state) → `sync-state.json` **last** → re-runs are idempotent; `deletedAt` merged and honored; a corrupt archive aborts after 10 consecutive read failures.
- `status` prints owner, layout version, index counts and last sync from a live collection.
- Enablers that became part of the core: `SimpleLogger` lost its `react-native` import (the transport's last platform edge), pure ZIP-entry-name helpers moved to `entryNames.ts`, `trackBoundingBox` moved into `gpxParser.ts`, and `zipReader` switched to `import pako` + destructure for Node-ESM interop (pako@1 has no static named exports). The portability guard covers all of it plus the tool modules.


### Phase 2 — make the restore cheap on the phone ✅ done
The desktop tool alone is a real UX win (the phone stops parsing and stops copying a gigabyte) but the
restore still costs ~4,148 requests + 2,026 file writes. Shipped in `backupSync.ts`:
1. **Batched activity restore**: one `storeMultiActivities` per ≤100 instead of 2,122 `setItem` calls.
2. **Concurrent requests**: a `runWithConcurrency` pool (6 in flight) drives the pull loops — and,
   for symmetry, the push loops, which had the same sequential cost. Per-item error collection,
   "local wins" (checked before any GET), and the state-file-last ordering are unchanged.
3. **The bundle/pack idea was deliberately NOT taken.** It duplicates data server-side and is the
   larger change; the plan always said to justify it by measurement, and this change is what makes
   that measurement honest. If restore is still slow now, the remaining bottleneck is the phone's
   raw per-file write cost, and the pack becomes the next candidate.

### Phase 3 — integrity verification (~0.5 day)
`strava-import verify` re-hashes local inputs against remote `sync-state.json`, and — the important
direction — the **phone's restore should hash what it downloaded** and report mismatches instead of
silently writing corrupt files. Today a login-portal HTML page served with status 200 would be written
as a stream and only fail later at read time; the marker check already blocks that case for *foreign*
folders, but hash-on-restore closes it for truncated downloads too.

---

## 4. Sequencing (as executed)

The original note advised running **Phase 2 first** if the real pain was phone slowness. In practice
Phase 1 shipped first, because the desktop tool also removes the 1 GB archive copy and the parsing
from the device entirely — not just the request serialization Phase 2 fixes. Phase 2 then landed on
top, speeding up the restore path the tool depends on. What the sequencing note was really guarding
against — building the tool before knowing whether the phone side was the bottleneck — is now
resolved by measurement: with Phase 2 done, any remaining restore slowness is the phone's per-file
write cost, which points at the pack idea, not at more request tuning.
