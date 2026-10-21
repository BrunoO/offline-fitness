import { APP_CONFIG } from '@/constants';
import { WebDavConfig } from '@/features/backup/services/webdavTransport';
import {
  applySwimMovingTime,
  repairDistanceUnit,
  rowToActivity
} from '@/features/strava-import/services/activityMapper';
import { mapActivityType, parseActivitiesCsv } from '@/features/strava-import/services/csvParser';
import {
  baseNameOf,
  isUnsupportedTrack,
  normalizeEntryPath
} from '@/features/strava-import/services/entryNames';
import { parseGpx, toStreamSet, trackBoundingBox } from '@/features/strava-import/services/gpxParser';
import { decodeUtf8 } from '@/features/strava-import/services/textDecode';
import {
  gunzipEntry,
  isGzip,
  isZip,
  readZipEntries,
  readZipEntry
} from '@/features/strava-import/services/zipReader';
import { ExportedActivityRow, StreamConversionResult, ZipEntryInfo } from '@/features/strava-import/types/import.types';
import { encodeStreamSet } from '@/shared/services/streamCodec';
import { DavClient } from './client';
import { createNodeByteSource, NodeByteSource } from './nodeSource';
import { RemoteSyncState, md5Hex, recordName } from './state';
import { applyTimezone } from './timezone';
import { ZoneLookup } from './zoneLookup';

/**
 * Turns a Strava data-export ZIP into a WebDAV backup collection — the same
 * files the phone's importer plus push would produce, without ever touching a
 * phone.
 *
 * The conversion path is the *app's own code* (`csvParser`, `gpxParser`,
 * `activityMapper`, `zipReader`, `streamCodec` — the portable core of
 * `docs/desktop-import-plan.md`, Phase 0), and that is not a convenience: the
 * phone's push skips a file when the md5 of *its bytes* matches
 * `sync-state.json`. Any independent reimplementation that produced different
 * bytes — key order, rounding, a codec tweak — would be silently accepted here
 * and then re-uploaded (98 MB) by the phone, or worse, differ from what the
 * phone's own importer would have written. Reusing the code makes byte-identity
 * structural instead of tested-into-existence.
 *
 * Contract with the phone (`docs/architecture.md`, "WebDAV backup layout"):
 * - `collection.json` is claimed first, with the app id, the profile and
 *   `schemaVersion` 2. Both apps refuse a folder whose version differs, so a
 *   tool-written collection and an app-written one cannot half-mix layouts.
 * - `sync-state.json` is written **last**: its md5 key sets are the file list
 *   `pullBackup` downloads, so an interrupted run leaves a consistent — just
 *   smaller — collection, and re-running resumes instead of duplicating.
 * - Remote `deletedAt` tombstones are honored: a tombstoned activity is not
 *   uploaded, stays out of the maps, and its tombstone survives the state
 *   rewrite — otherwise a re-import would resurrect what the athlete deleted.
 * - No `.nostreamflag` files: the app's push never uploads flags
 *   (`backupSync.ts` streams loop filters `.json`), so the tool must not either.
 * - Since Phase 4, each record's local fields are derived in the zone of its
 *   track's GPS start (`lookupZone`), falling back to `--tz` when there is no
 *   usable fix — see `docs/desktop-import-plan.md`, Phase 4. With `lookupZone`
 *   absent the output is byte-identical to the pre-Phase-4 tool.
 */

const DEFAULT_CONCURRENCY = 8;
const MAX_CONCURRENCY = 32;

/** Read failures in a row before the run gives up — mirrors the phone importer. */
const MAX_CONSECUTIVE_READ_FAILURES = 10;

/** The marker's shape on the server; mirrors `CollectionMarker` in `backupSync.ts`. */
export interface CollectionMarker {
  appId: string;
  profile: string;
  schemaVersion: number;
  createdAt: string;
}

export interface SeedOptions {
  /** Path of the Strava export ZIP. */
  archivePath: string;
  /**
   * Fallback IANA zone: used for records with no usable GPS start (manual
   * entries, swims, `.fit` tracks, unreadable archives) and as the zone this
   * process pins while mapping. Travel activities with a GPS fix get their
   * zone from `lookupZone` instead.
   */
  timezone: string;
  config: WebDavConfig;
  /** Injectable transport (`createLiveDavClient` for real servers, fakes in tests). */
  client: DavClient;
  /**
   * GPS start -> IANA zone (`createGeoZoneLookup` for production; fakes in
   * tests). Absent means every record keeps the `timezone` fallback — the
   * pre-Phase-4 behavior, byte-identical.
   */
  lookupZone?: ZoneLookup;
  /** Parallel PUTs. Conversion is CPU-bound, upload network-bound; 8 is a good LAN default. */
  concurrency?: number;
  /** Convert and report with zero network access and zero remote writes. */
  dryRun?: boolean;
  onProgress?: (progress: { done: number; total: number; currentActivityId: string }) => void;
}

export interface SeedTimings {
  /** Opening the archive, listing it, parsing the CSV and mapping the rows. */
  archive: number;
  /** Everything after: folder setup, remote reads, uploads, the state write. */
  transfer: number;
  /** Wall clock of the whole run. */
  total: number;
}

export interface SeedSummary {
  activitiesParsed: number;
  /** Records PUT in this run. In a dry run: records a real run would upload (no remote state to skip against). */
  activitiesUploaded: number;
  /** Records whose md5 already matched the remote state. */
  activitiesSkipped: number;
  /** Activities skipped because the remote state tombstones them. */
  activitiesTombstoned: number;
  /** CSV rows with no track file (manual entries). */
  activitiesWithoutTrack: number;
  /** Tracks that parsed to zero points. */
  streamsWithoutTrack: number;
  /** Tracks in formats this importer does not read (.fit/.tcx). */
  unsupportedTracks: number;
  /** Track files missing from the archive or that failed to convert. */
  failedTracks: number;
  streamsUploaded: number;
  streamsSkipped: number;
  /** Bytes PUT (skips are not counted — those bytes were already on the server). */
  bytesUploaded: number;
  /**
   * Records grouped by the zone their local fields were derived in. This is
   * the travel audit surface: everything under `timezone` is home-bucketed
   * as before; any other zone names activities whose wall clock and calendar
   * day now follow where they actually happened.
   */
  zones: Record<string, number>;
  /** Non-fatal problems, in the same vocabulary as the phone's import summary. */
  warnings: string[];
  timings: SeedTimings;
}

/**
 * Parse a marker body; `null` when it is missing or unreadable — the same
 * "unknown owner" rule the app's `loadCollectionMarker` applies, including
 * reading a version-less marker as layout 1.
 */
function parseMarker(text: string | null): CollectionMarker | null {
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as Partial<CollectionMarker>;
    if (!parsed || typeof parsed.appId !== 'string' || typeof parsed.profile !== 'string') {
      return null;
    }
    return {
      appId: parsed.appId,
      profile: parsed.profile,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
      schemaVersion: typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 1
    };
  } catch {
    return null;
  }
}

/** Read and validate the marker, claiming a fresh collection when none exists. */
async function claimOrVerifyMarker(
  client: DavClient,
  config: WebDavConfig,
  warnings: string[]
): Promise<void> {
  const raw = await client.getText([APP_CONFIG.BACKUP_COLLECTION_FILE]);
  const marker = parseMarker(raw);
  if (raw !== null && marker === null) {
    // A body that is not a marker (a login page, a proxy, garbage) is "unknown
    // owner" — the app treats it that way and claims the folder; mirroring
    // that keeps tool and phone agreeing on the same folder instead of
    // diverging on who owns it.
    warnings.push('collection.json is not a readable marker; claiming the folder fresh.');
  }

  if (!marker) {
    const fresh: CollectionMarker = {
      appId: APP_CONFIG.BACKUP_APP_ID,
      profile: config.profile,
      schemaVersion: APP_CONFIG.BACKUP_SCHEMA_VERSION,
      createdAt: new Date().toISOString()
    };
    await client.putText([APP_CONFIG.BACKUP_COLLECTION_FILE], JSON.stringify(fresh));
    return;
  }

  if (marker.appId !== APP_CONFIG.BACKUP_APP_ID) {
    throw new Error(
      `This backup folder belongs to a different app (${marker.appId}). ` +
        'Point the tool at the folder the app itself uses, or pick a new profile.'
    );
  }
  if (marker.profile !== config.profile) {
    throw new Error(
      `This backup folder belongs to profile "${marker.profile}", not "${config.profile}". ` +
        "Use the profile shown on the phone's Backup screen."
    );
  }
  if (marker.schemaVersion !== APP_CONFIG.BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `This backup folder uses layout version ${marker.schemaVersion}, but this tool writes version ` +
        `${APP_CONFIG.BACKUP_SCHEMA_VERSION}. Delete the folder on the server (or pick a new profile ` +
        'name) and run again: the previous layout is not supported.'
    );
  }
}

/** Parse the remote state; a corrupt file is fatal, exactly as on the phone. */
async function loadRemoteState(client: DavClient): Promise<RemoteSyncState> {
  const text = await client.getText([APP_CONFIG.BACKUP_SYNC_STATE_FILE]);
  if (text === null) return {};
  return JSON.parse(text) as RemoteSyncState;
}

export async function seedCollection(options: SeedOptions): Promise<SeedSummary> {
  const startedAt = Date.now();
  const { archivePath, timezone, config, client, dryRun = false } = options;
  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, MAX_CONCURRENCY)
  );
  const warnings: string[] = [];

  applyTimezone(timezone);

  const summary: SeedSummary = {
    activitiesParsed: 0,
    activitiesUploaded: 0,
    activitiesSkipped: 0,
    activitiesTombstoned: 0,
    activitiesWithoutTrack: 0,
    streamsWithoutTrack: 0,
    unsupportedTracks: 0,
    failedTracks: 0,
    streamsUploaded: 0,
    streamsSkipped: 0,
    bytesUploaded: 0,
    zones: {},
    warnings,
    timings: { archive: 0, transfer: 0, total: 0 }
  };

  const source: NodeByteSource = createNodeByteSource(archivePath);
  try {
    // ---- archive → rows → activity records (the app's own mapping) ----
    if (!isZip(await source.read(0, 4))) {
      throw new Error(`${archivePath} is not a ZIP archive`);
    }
    const entries = await readZipEntries(source);
    const csvEntry = entries.find(entry => baseNameOf(entry.name) === 'activities.csv');
    if (!csvEntry) {
      throw new Error('activities.csv was not found in the archive — is this a Strava export?');
    }
    const parsed = parseActivitiesCsv(decodeUtf8(await readZipEntry(source, csvEntry)));
    warnings.push(...parsed.warnings);
    parsed.rows.forEach(row => repairDistanceUnit(row, warnings));

    // Track files indexed by archive path and by name, like the phone importer,
    // so a different export layout still resolves.
    const tracksByPath = new Map<string, ZipEntryInfo>();
    const tracksByName = new Map<string, ZipEntryInfo>();
    entries.forEach(entry => {
      const name = normalizeEntryPath(entry.name);
      if (!name.startsWith('activities/')) return;
      if (baseNameOf(entry.name) === 'activities.csv') return;
      tracksByPath.set(name, entry);
      tracksByName.set(baseNameOf(entry.name), entry);
    });

    const queue = [...parsed.rows]
      // Newest first, like pass 2 of the phone import: an interrupted run fills
      // the history the app shows first, and the re-run resumes from the remote
      // state instead of redoing anything.
      .sort((a, b) => b.startUtcMs - a.startUtcMs);
    summary.activitiesParsed = queue.length;
    summary.timings.archive = Date.now() - startedAt;

    // ---- remote: claim the folder, load the index to skip against ----
    const activityMd5: Record<string, string> = {};
    const streamMd5: Record<string, string> = {};
    let deletedAt: Record<string, string> = {};
    const tombstoned = new Set<string>();
    if (!dryRun) {
      await client.ensureFolders();
      await claimOrVerifyMarker(client, config, warnings);
      const remoteState = await loadRemoteState(client);
      Object.assign(activityMd5, remoteState.activityMd5 ?? {});
      Object.assign(streamMd5, remoteState.streamMd5 ?? {});
      deletedAt = { ...(remoteState.deletedAt ?? {}) };
      for (const id of Object.keys(deletedAt)) {
        tombstoned.add(id);
        // Mirror `pushBackup`: a tombstoned id must not appear in the maps, or
        // a stale entry would keep it on the file list a restore follows.
        delete activityMd5[recordName(id)];
        delete streamMd5[recordName(id)];
      }
    }

    let done = 0;
    let consecutiveReadFailures = 0;
    let fatalError: Error | undefined;
    const total = queue.length;

    const processRow = async (row: ExportedActivityRow): Promise<void> => {
      const id = row.id;
      if (tombstoned.has(id)) {
        summary.activitiesTombstoned++;
        return;
      }

      // The track is read BEFORE the record is built: the record's local
      // fields (date, time, week, utc_offset) are derived in a zone, and the
      // zone comes from the track's first GPS fix when there is one. What the
      // track yields is captured here and applied to the record below — in
      // the same mutation order the phone importer uses, so home-zone records
      // stay byte-identical to what Phase 1–3 uploaded.
      let converted: StreamConversionResult | undefined;
      let firstFix: { lat: number; lon: number } | undefined;
      let gpxType: string | undefined;
      let streamBytes: Uint8Array | undefined;

      if (row.fileName.length === 0) {
        summary.activitiesWithoutTrack++;
      } else if (isUnsupportedTrack(row.fileName)) {
        summary.unsupportedTracks++;
      } else {
        const entry =
          tracksByPath.get(normalizeEntryPath(row.fileName)) ??
          tracksByName.get(baseNameOf(row.fileName));
        if (!entry) {
          summary.failedTracks++;
          warnings.push(
            `Activity ${id}: ${row.fileName} is listed in the CSV but missing from the archive`
          );
        } else {
          try {
            const raw = await readZipEntry(source, entry);
            consecutiveReadFailures = 0;
            const gpx = parseGpx(decodeUtf8(isGzip(raw) ? gunzipEntry(raw) : raw));
            if (gpx.points.length > 0) {
              firstFix = gpx.points[0];
            }
            gpxType = gpx.type;
            converted = toStreamSet(gpx.points);
            if (!converted) {
              summary.streamsWithoutTrack++;
            } else {
              streamBytes = encodeStreamSet(converted.stream);
            }
          } catch (error) {
            summary.failedTracks++;
            const message = error instanceof Error ? error.message : String(error);
            warnings.push(`Activity ${id}: ${message}`);
            consecutiveReadFailures++;
            if (consecutiveReadFailures >= MAX_CONSECUTIVE_READ_FAILURES) {
              throw new Error(
                `Stopped after ${consecutiveReadFailures} tracks failed in a row — the archive could ` +
                  `not be read. Last error: ${message}`
              );
            }
          }
        }
      }

      // Zone: the GPS start's own when the track has a fix and a lookup is
      // wired (a Porto holiday rides on Lisbon time), else `--tz` — the same
      // fallback the pre-Phase-4 tool used for everything.
      let zone = timezone;
      if (firstFix && options.lookupZone) {
        const found = options.lookupZone(firstFix.lat, firstFix.lon);
        if (found) {
          zone = found;
        }
      }
      summary.zones[zone] = (summary.zones[zone] ?? 0) + 1;

      const activity = rowToActivity(row, zone);

      // The CSV type is localized; when it could not be mapped, the GPX
      // `<type>` (always English) is authoritative — same rule and same
      // effect as the phone importer. Applied after construction because the
      // fallback can flip the record to a Swim, whose canonical moving time
      // must then be re-applied (`rowToActivity` only saw the CSV type).
      if (!row.type) {
        const fromGpx = mapActivityType(undefined, gpxType);
        if (fromGpx) {
          activity.type = fromGpx;
        }
        applySwimMovingTime(activity);
      }

      if (converted) {
        // Assignment order matters for md5: `rowToActivity` keeps the
        // start/end placeholders in their literal positions, and
        // `bounding_box` — not in the literal — is appended last, exactly
        // as the phone's pass-2 record serialises.
        activity.start_latlng = converted.startLatLng;
        activity.end_latlng = converted.endLatLng;
        const boundingBox = trackBoundingBox(converted.stream.latlng?.data ?? []);
        if (boundingBox) activity.bounding_box = boundingBox;
      }

      if (streamBytes) {
        const name = recordName(id);
        const hash = md5Hex(streamBytes);
        if (!dryRun && streamMd5[name] === hash) {
          summary.streamsSkipped++;
        } else {
          summary.streamsUploaded++;
          summary.bytesUploaded += streamBytes.byteLength;
          if (!dryRun) {
            await client.putBytes([APP_CONFIG.BACKUP_STREAMS_FOLDER, name], streamBytes);
            streamMd5[name] = hash;
          }
        }
      }

      const content = JSON.stringify(activity);
      const name = recordName(id);
      const hash = md5Hex(content);
      if (!dryRun && activityMd5[name] === hash) {
        summary.activitiesSkipped++;
      } else {
        summary.activitiesUploaded++;
        summary.bytesUploaded += Buffer.byteLength(content);
        if (!dryRun) {
          await client.putText([APP_CONFIG.BACKUP_ACTIVITIES_FOLDER, name], content);
          activityMd5[name] = hash;
        }
      }
    };

    // Worker pool over the shared queue. `consecutiveReadFailures` is shared
    // across workers (the app was single-threaded): with a dead archive every
    // worker fails in turn and the run aborts at most a few activities late —
    // the abort exists to stop grinding, not to count precisely.
    const worker = async (): Promise<void> => {
      for (;;) {
        if (fatalError) return;
        const row = queue.shift();
        if (!row) return;
        try {
          await processRow(row);
        } catch (error) {
          fatalError = error instanceof Error ? error : new Error(String(error));
          return;
        }
        done++;
        options.onProgress?.({ done, total, currentActivityId: row.id });
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
    if (fatalError) throw fatalError;

    // ---- state last: its key sets are the file list the phone restores from ----
    if (!dryRun) {
      const syncState: RemoteSyncState = {
        syncedAt: new Date().toISOString(),
        activityMd5,
        streamMd5,
        deletedAt
      };
      await client.putText([APP_CONFIG.BACKUP_SYNC_STATE_FILE], JSON.stringify(syncState));
    }

    summary.timings.transfer = Date.now() - startedAt - summary.timings.archive;
    summary.timings.total = Date.now() - startedAt;
    return summary;
  } finally {
    source.close();
  }
}

/** What lives in the remote collection — the `status` command's read model. */
export interface CollectionStatus {
  marker: CollectionMarker | null;
  state: RemoteSyncState;
}

export async function inspectCollection(client: DavClient): Promise<CollectionStatus> {
  const markerText = await client.getText([APP_CONFIG.BACKUP_COLLECTION_FILE]);
  const marker = parseMarker(markerText);
  const stateText = await client.getText([APP_CONFIG.BACKUP_SYNC_STATE_FILE]);
  let state: RemoteSyncState = {};
  if (stateText !== null) {
    try {
      state = JSON.parse(stateText) as RemoteSyncState;
    } catch {
      // `status` is a diagnostic; a corrupt index is reported by the caller
      // reading the (empty) counts, and the same file makes `import` fail
      // loudly when it actually needs it.
      state = {};
    }
  }
  return { marker, state };
}
