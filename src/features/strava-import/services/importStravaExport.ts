import { APP_CONFIG } from '@/constants';
import {
  Activity,
  compareActivitiesByUtcDesc,
  encodeStreamSet,
  getAllActivitiesKeys,
  loadAllActivities,
  readStreamFile,
  simpleLogger,
  storeActivity,
  storeMultiActivities
} from '@/shared';
import { Directory, File, Paths } from 'expo-file-system';
import {
  ActivityStreamLike,
  ByteSource,
  ExportedActivityRow,
  ImportLiveState,
  ImportOptions,
  ImportStep,
  ImportSummary,
  ImportTimings,
  ZipEntryInfo
} from '../types/import.types';
import { deviceTimezoneLabel, repairDistanceUnit, rowToActivity } from './activityMapper';
import { mapActivityType, parseActivitiesCsv } from './csvParser';
import { createFileByteSource } from './expoByteSource';
import { parseGpx, toStreamSet } from './gpxParser';
import { decodeUtf8 } from './textDecode';
import { gunzipEntry, isGzip, isZip, readZipEntries, readZipEntry } from './zipReader';

/**
 * Imports a Strava export archive ("Download your account" .zip).
 *
 * A full export is ~1 GB of track files, so the work is split in two passes:
 * the CSV is read first and activities are persisted in batches (the list is
 * usable immediately), then each track file is converted into the stream cache
 * one at a time. Re-running an import is safe: activities are upserted by id
 * and existing stream files are never overwritten.
 *
 * The per-run cost on a phone is dominated by native calls, not by parsing
 * (~13 ms of JavaScript per track), so the loop is shaped to make as few of
 * them as possible: one directory listing instead of two file stats per
 * activity, one batched AsyncStorage write per batch instead of one per track,
 * and a single copy of the archive that everything is read from (see
 * `openArchive` for why that copy cannot be skipped).
 *
 * Every phase is timed into `summary.timings` so a slow run can be diagnosed
 * from the phone itself.
 */

const streamsFolder = new Directory(Paths.document, APP_CONFIG.STREAMS_FOLDER);

const CACHE_ARCHIVE_NAME = 'strava-export-import.zip';
const ACTIVITY_BATCH_SIZE = 100;

/** A track slower than this is logged with its id, so a bad file names itself. */
const SLOW_TRACK_MS = 3000;

/**
 * How many track reads may fail in a row before the run gives up.
 *
 * Consecutive failures mean the archive itself stopped being readable (a dead
 * file handle, or the file was moved), not that several tracks are broken. Left
 * alone the loop would grind through every remaining track, flag each one as
 * failed and report "finished" with a couple of thousand warnings.
 */
const MAX_CONSECUTIVE_READ_FAILURES = 10;

/** Track formats present in exports that this importer does not parse yet. */
const UNSUPPORTED_TRACK_EXTENSIONS = ['.fit', '.fit.gz', '.tcx', '.tcx.gz'];

/** Lets the UI start the picker without knowing the details. */
export async function pickStravaExportFile(): Promise<File | null> {
  const result = await File.pickFileAsync({
    mimeTypes: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream']
  });
  if (result.canceled || !result.result) return null;
  return result.result;
}

export function baseNameOf(entryName: string): string {
  const normalized = entryName.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return (index >= 0 ? normalized.slice(index + 1) : normalized).toLowerCase();
}

export function normalizeEntryPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

export function isUnsupportedTrack(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return UNSUPPORTED_TRACK_EXTENSIONS.some(extension => lower.endsWith(extension));
}

function zeroTimings(): ImportTimings {
  return {
    copyArchive: 0,
    readDirectory: 0,
    parseCsv: 0,
    writeActivities: 0,
    readTracks: 0,
    parseTracks: 0,
    writeStreams: 0,
    writeTrackFields: 0,
    total: 0
  };
}

function emptySummary(timezone: string): ImportSummary {
  return {
    activitiesImported: 0,
    activitiesWithoutFile: 0,
    streamsImported: 0,
    streamsAlreadyPresent: 0,
    streamsWithoutTrack: 0,
    unsupportedFiles: 0,
    failedFiles: 0,
    timezone,
    cancelled: false,
    timings: zeroTimings()
  };
}

/**
 * Hands the JS thread back to the event loop.
 *
 * A microtask hop (awaiting something that is already resolved) is not enough:
 * microtasks starve timers, so `setInterval` and React's scheduler never run,
 * and the running screen would freeze for the whole pass. `setTimeout` is a
 * macrotask, which is what makes the live poll — and the progress bar — move.
 */
function yieldToUi(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Records the sub-step the import is inside, for the live view.
 *
 * One field assignment per step: the UI polls this object on a timer, so
 * describing the work never costs a render.
 */
function mark(
  live: ImportLiveState | undefined,
  step: ImportStep,
  patch?: Partial<ImportLiveState>
): void {
  if (!live) return;
  live.step = step;
  live.stepStartedAt = Date.now();
  if (patch) Object.assign(live, patch);
}

/**
 * Records the sub-step the import is inside, and lets the UI paint it before
 * the next blocking call.
 *
 * The running screen polls the live object on a timer, and a timer cannot run
 * while the JS thread is inside a synchronous native call. `File.write` and
 * `FileHandle.readBytes` are synchronous (they return `void` and `Uint8Array`,
 * not promises), so a big track's write holds the thread for as long as the
 * disk takes. Recording the step without releasing the thread means the screen
 * only catches up *after* the call returns, which is the opposite of what it
 * is for: yield right after marking, so "writing stream…" is on screen while
 * the stream is being written.
 */
async function markStep(
  live: ImportLiveState | undefined,
  step: ImportStep,
  patch?: Partial<ImportLiveState>
): Promise<void> {
  mark(live, step, patch);
  await yieldToUi();
}

/**
 * Copies the picked archive into the app cache and opens the copy.
 *
 * The copy is not an optimisation, it is required: the picker hands over a
 * `content://` URI, and expo's `FileSystemFileHandle.forContentURI` builds its
 * channel from a `ParcelFileDescriptor` it never retains. Once that descriptor
 * is collected the channel still points at its file descriptor, and every
 * subsequent read fails with `java.io.IOException: Bad file descriptor`
 * (`FileChannelImpl.position0` via `setOffset`). Reading in place therefore
 * works for the first tracks and then fails for all the rest, which is exactly
 * what a long import must not do. A plain file we own has no such lifetime.
 */
async function openArchive(
  pickedFile: File,
  timings: ImportTimings,
  live: ImportLiveState | undefined
): Promise<{ source: ByteSource; copy: File }> {
  // A previous version cached the archive between runs; reclaim it first.
  deleteArchiveCopy();

  mark(live, 'copying');
  const copy = new File(Paths.cache, CACHE_ARCHIVE_NAME);
  const startedAt = Date.now();
  await pickedFile.copy(copy, { overwrite: true });
  timings.copyArchive += Date.now() - startedAt;
  return { source: createFileByteSource(copy), copy };
}

/** Drops the fallback copy; it is never worth keeping next to the original. */
function deleteArchiveCopy(): void {
  try {
    const cached = new File(Paths.cache, CACHE_ARCHIVE_NAME);
    if (cached.exists) cached.delete();
    // Stamp written by the version that cached the copy between runs.
    const stamp = new File(Paths.cache, `${CACHE_ARCHIVE_NAME}.key`);
    if (stamp.exists) stamp.delete();
  } catch {
    // Best effort: the cache is reclaimable by the OS anyway.
  }
}

/**
 * One listing of the streams cache, instead of two file-system stats per
 * activity. On a full export that is ~4,000 native calls replaced by one; the
 * two sets are kept up to date as the import writes.
 */
function snapshotStreamCache(): { streams: Set<string>; flagged: Set<string> } {
  const streams = new Set<string>();
  const flagged = new Set<string>();
  if (!streamsFolder.exists) return { streams, flagged };

  for (const entry of streamsFolder.list()) {
    if (entry.name.endsWith('.json')) {
      streams.add(entry.name);
    } else if (entry.name.endsWith('.nostreamflag')) {
      flagged.add(entry.name.slice(0, -'.nostreamflag'.length));
    }
  }
  return { streams, flagged };
}

function writeNoStreamFlag(activityId: string, flagged: Set<string>): void {
  if (flagged.has(activityId)) return;
  const flagFile = new File(streamsFolder, `${activityId}.nostreamflag`);
  flagFile.write('');
  flagged.add(activityId);
}

/**
 * Reads the activities that are already stored locally, keyed by id.
 * Used before pass 1 so a re-import can keep the track-derived fields of
 * activities whose track is already on disk.
 */
async function loadExistingActivities(): Promise<Map<string, Activity>> {
  try {
    const keys = await getAllActivitiesKeys();
    const stored = await loadAllActivities(keys);
    const byId = new Map<string, Activity>();
    stored.forEach(activity => byId.set(String(activity.id), activity));
    return byId;
  } catch (error) {
    simpleLogger.error('Could not read the existing activities before importing:', error);
    return new Map();
  }
}

/**
 * Drops the "no stream" marker once a track is actually stored — a stale flag
 * would keep the activity hidden by the "hide no-stream" filter and counted as
 * missing by the stream status.
 */
function clearNoStreamFlag(activityId: string, flagged: Set<string>): void {
  if (!flagged.has(activityId)) return;
  const flagFile = new File(streamsFolder, `${activityId}.nostreamflag`);
  if (flagFile.exists) flagFile.delete();
  flagged.delete(activityId);
}

/** True when the record still misses the track-derived fields. */
function lacksTrackFields(activity: Activity): boolean {
  if (!activity.bounding_box) return true;
  if (!activity.start_latlng || activity.start_latlng.length < 2) return true;
  if (!activity.end_latlng || activity.end_latlng.length < 2) return true;
  return false;
}

/**
 * Min/max of a raw `latlng` stream.
 *
 * The bounding box used to come from `compressStreamSet(...).coordinates`, i.e.
 * the whole track was run through Ramer-Douglas-Peucker (and turned into an
 * array of `{latitude, longitude}` objects) purely to find four numbers. A
 * track's extremes are the same before and after simplification, so scanning
 * the pairs directly is both cheaper and more accurate.
 */
function trackBoundingBox(
  latlng: [number, number][]
): [[number, number], [number, number]] | undefined {
  if (latlng.length === 0) return undefined;
  let minLat = latlng[0][0];
  let maxLat = minLat;
  let minLng = latlng[0][1];
  let maxLng = minLng;
  for (let index = 1; index < latlng.length; index++) {
    const [lat, lng] = latlng[index];
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng]
  ];
}

/**
 * Fills `start_latlng`, `end_latlng` and `bounding_box` from a stream file that
 * is already stored locally. Used when an activity record was written without
 * them (an older import, or a re-import that overwrote them) while its track
 * is still on disk.
 *
 * @returns true when the record was updated.
 */
async function backfillTrackFields(activity: Activity, file: File): Promise<boolean> {
  if (!file.exists) return false;
  try {
    const stored = await readStreamFile<ActivityStreamLike>(file);
    const coordinates = stored?.latlng?.data ?? [];
    if (coordinates.length === 0) return false;
    activity.start_latlng = coordinates[0];
    activity.end_latlng = coordinates[coordinates.length - 1];
    const boundingBox = trackBoundingBox(coordinates);
    if (boundingBox) activity.bounding_box = boundingBox;
    await storeActivity(activity);
    return true;
  } catch (error) {
    simpleLogger.error(`Could not backfill track fields for activity ${activity.id}:`, error);
    return false;
  }
}

/**
 * Imports the archive. Resolves with a summary; throws only when the archive
 * itself is unusable (not a ZIP, no activities.csv).
 */
export async function importStravaExport(
  pickedFile: File,
  options: ImportOptions = {}
): Promise<ImportSummary> {
  const { onProgress, shouldCancel, onLiveState } = options;
  const timezone = deviceTimezoneLabel();
  const summary = emptySummary(timezone);
  const timings = summary.timings;
  const warnings: string[] = [];
  /** Tracks that took seconds, reported together at the end. */
  const slowTracks: string[] = [];
  const startedAt = Date.now();

  // Handed to the UI, which polls it: the importer only ever assigns fields.
  const live: ImportLiveState = {
    step: 'idle',
    stepStartedAt: startedAt,
    phase: 'idle',
    index: 0,
    total: 0,
    timings
  };
  onLiveState?.(live);

  if (!streamsFolder.exists) {
    streamsFolder.create({ intermediates: true });
  }

  let byteSource: ByteSource | undefined;
  let copy: File | null = null;

  try {
    onProgress?.({ phase: 'opening', processed: 0, total: 0 });

    const opened = await openArchive(pickedFile, timings, live);
    byteSource = opened.source;
    copy = opened.copy;
    if (!isZip(await byteSource.read(0, 4))) {
      throw new Error('The selected file is not a ZIP archive');
    }

    await markStep(live, 'reading-directory');
    const directoryStartedAt = Date.now();
    const entries = await readZipEntries(byteSource);
    timings.readDirectory += Date.now() - directoryStartedAt;

    const csvEntry = entries.find(entry => baseNameOf(entry.name) === 'activities.csv');
    if (!csvEntry) {
      throw new Error('activities.csv was not found in the archive — is this a Strava export?');
    }

    mark(live, 'parsing-csv');
    const csvStartedAt = Date.now();
    const parsed = parseActivitiesCsv(decodeUtf8(await readZipEntry(byteSource, csvEntry)));
    timings.parseCsv += Date.now() - csvStartedAt;
    warnings.push(...parsed.warnings);
    parsed.rows.forEach(row => repairDistanceUnit(row, warnings));

    // Track files are indexed by both their archive path (what the CSV points
    // at) and their file name, so a different archive layout still resolves.
    const tracksByPath = new Map<string, ZipEntryInfo>();
    const tracksByName = new Map<string, ZipEntryInfo>();
    entries.forEach(entry => {
      const name = normalizeEntryPath(entry.name);
      if (!name.startsWith('activities/')) return;
      if (baseNameOf(entry.name) === 'activities.csv') return;
      tracksByPath.set(name, entry);
      tracksByName.set(baseNameOf(entry.name), entry);
    });

    const activities = parsed.rows.map(row => rowToActivity(row, timezone));
    const rowsById = new Map<string, ExportedActivityRow>();
    parsed.rows.forEach(row => rowsById.set(row.id, row));

    // Pass 1 rewrites every activity from the CSV, and a CSV row carries no
    // track data. Carry over the track-derived fields the local record already
    // has (start/end coordinates, bounding box) so a re-import does not wipe
    // the map markers of activities whose track is already stored.
    const existingById = await loadExistingActivities();
    activities.forEach(activity => {
      const existing = existingById.get(activity.id);
      if (!existing) return;
      if (existing.start_latlng && existing.start_latlng.length >= 2) {
        activity.start_latlng = existing.start_latlng;
      }
      if (existing.end_latlng && existing.end_latlng.length >= 2) {
        activity.end_latlng = existing.end_latlng;
      }
      if (existing.bounding_box) {
        activity.bounding_box = existing.bounding_box;
      }
    });

    // Pass 1 — persist every activity so the app is usable straight away.
    const activitiesStartedAt = Date.now();
    for (let start = 0; start < activities.length; start += ACTIVITY_BATCH_SIZE) {
      if (shouldCancel?.()) {
        summary.cancelled = true;
        timings.writeActivities += Date.now() - activitiesStartedAt;
        mark(live, 'idle');
        return summary;
      }
      const batch = activities.slice(start, start + ACTIVITY_BATCH_SIZE);
      await markStep(live, 'saving-activities', {
        phase: 'activities',
        index: start,
        total: activities.length
      });
      await storeMultiActivities(batch);
      summary.activitiesImported += batch.length;
      onProgress?.({
        phase: 'activities',
        processed: Math.min(start + batch.length, activities.length),
        total: activities.length
      });
      await yieldToUi();
    }
    timings.writeActivities += Date.now() - activitiesStartedAt;

    // Pass 2 — convert track files into streams, newest activity first.
    const ordered = [...activities].sort(compareActivitiesByUtcDesc);
    const { streams: storedStreams, flagged } = snapshotStreamCache();
    /** Consecutive track-read failures; reset by any successful read. */
    let consecutiveReadFailures = 0;

    // Track-derived fields are written back in batches: one AsyncStorage call
    // per track is a native round trip (pass 1 already showed batching is the
    // cheaper shape), and a 100-record batch is a few hundred KB at most.
    const pendingActivityWrites: Activity[] = [];
    const flushActivityWrites = async (): Promise<void> => {
      if (pendingActivityWrites.length === 0) return;
      const batch = pendingActivityWrites.splice(0, pendingActivityWrites.length);
      const startedFlushAt = Date.now();
      await storeMultiActivities(batch);
      timings.writeTrackFields += Date.now() - startedFlushAt;
    };

    for (let index = 0; index < ordered.length; index++) {
      if (shouldCancel?.()) {
        summary.cancelled = true;
        break;
      }

      const activity = ordered[index];
      const row = rowsById.get(activity.id);
      const trackStartedAt = Date.now();
      // Per-track split, reported when a track is slow: the whole-track number
      // alone cannot tell a slow disk from slow parsing, and those need
      // opposite fixes.
      let readMs = 0;
      let parseMs = 0;
      let writeMs = 0;
      let flushMs = 0;
      onProgress?.({
        phase: 'streams',
        processed: index,
        total: ordered.length,
        currentActivityId: activity.id
      });
      mark(live, 'checking-track', {
        phase: 'streams',
        index,
        total: ordered.length,
        activityId: activity.id,
        entryBytes: undefined
      });

      const streamName = `${activity.id}.json`;
      if (storedStreams.has(streamName)) {
        summary.streamsAlreadyPresent++;
        // The track is already stored, so it is not parsed again — but the
        // record may have been written without the track-derived fields (an
        // older import, or a re-import that overwrote them). Restore them
        // from the stored stream when they are missing.
        if (lacksTrackFields(activity)) {
          await markStep(live, 'backfilling');
          await backfillTrackFields(activity, new File(streamsFolder, streamName));
        }
        continue;
      }

      const fileName = row?.fileName ?? '';
      if (!fileName) {
        // Manual entry: no track was ever recorded, so never retry it.
        summary.activitiesWithoutFile++;
        writeNoStreamFlag(activity.id, flagged);
        continue;
      }

      if (isUnsupportedTrack(fileName)) {
        summary.unsupportedFiles++;
        writeNoStreamFlag(activity.id, flagged);
        continue;
      }

      const entry =
        tracksByPath.get(normalizeEntryPath(fileName)) ?? tracksByName.get(baseNameOf(fileName));
      if (!entry) {
        summary.failedFiles++;
        warnings.push(
          `Activity ${activity.id}: ${fileName} is listed in the CSV but missing from the archive`
        );
        continue;
      }

      try {
        await markStep(live, 'reading-track', { entryBytes: entry.uncompressedSize });
        const readStartedAt = Date.now();
        const raw = await readZipEntry(byteSource, entry);
        readMs = Date.now() - readStartedAt;
        timings.readTracks += readMs;
        consecutiveReadFailures = 0;

        mark(live, 'parsing-track');
        const parseStartedAt = Date.now();
        const gpx = parseGpx(decodeUtf8(isGzip(raw) ? gunzipEntry(raw) : raw));

        // The CSV type is localized; when it could not be mapped, the GPX
        // `<type>` (always English) is authoritative.
        if (!row?.type) {
          const fromGpx = mapActivityType(undefined, gpx.type);
          if (fromGpx) activity.type = fromGpx;
        }

        const converted = toStreamSet(gpx.points);
        if (!converted) {
          parseMs = Date.now() - parseStartedAt;
          timings.parseTracks += parseMs;
          summary.streamsWithoutTrack++;
          writeNoStreamFlag(activity.id, flagged);
          continue;
        }

        const payload = encodeStreamSet(converted.stream);
        parseMs = Date.now() - parseStartedAt;
        timings.parseTracks += parseMs;

        await markStep(live, 'writing-stream');
        const streamStartedAt = Date.now();
        new File(streamsFolder, streamName).write(payload);
        writeMs = Date.now() - streamStartedAt;
        timings.writeStreams += writeMs;

        // The track is stored now, so any earlier "no stream" marker is stale.
        clearNoStreamFlag(activity.id, flagged);
        storedStreams.add(streamName);

        activity.start_latlng = converted.startLatLng;
        activity.end_latlng = converted.endLatLng;
        const boundingBox = trackBoundingBox(converted.stream.latlng?.data ?? []);
        if (boundingBox) activity.bounding_box = boundingBox;
        pendingActivityWrites.push(activity);
        if (pendingActivityWrites.length >= ACTIVITY_BATCH_SIZE) {
          await markStep(live, 'saving-activity');
          const flushStartedAt = Date.now();
          await flushActivityWrites();
          flushMs += Date.now() - flushStartedAt;
        }

        summary.streamsImported++;
      } catch (error) {
        summary.failedFiles++;
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Activity ${activity.id}: ${message}`);
        writeNoStreamFlag(activity.id, flagged);

        // One bad track is a warning; a run of them means the archive is gone.
        consecutiveReadFailures++;
        if (consecutiveReadFailures >= MAX_CONSECUTIVE_READ_FAILURES) {
          throw new Error(
            `Stopped after ${consecutiveReadFailures} tracks failed in a row — the archive could not be read. Last error: ${message}`
          );
        }
      }

      // A track that takes seconds is the thing worth knowing about, and its id
      // and size make it findable in the archive afterwards. The split says
      // which call was slow: `read`/`write` are the disk, `parse` is JS, and a
      // large `flush` is AsyncStorage landing on the batch this track completed.
      const trackMs = Date.now() - trackStartedAt;
      if (trackMs >= SLOW_TRACK_MS) {
        const split = `read ${readMs} / parse ${parseMs} / write ${writeMs}${
          flushMs > 0 ? ` / flush ${flushMs}` : ''
        }`;
        const report = `track ${activity.id}: ${trackMs} ms for ${Math.round(
          entry.uncompressedSize / 1024
        )} KB (${split})`;
        slowTracks.push(report);
        simpleLogger.warn(`Slow ${report}`);
        if (!live?.slowest || trackMs > live.slowest.ms) {
          live.slowest = { activityId: activity.id, ms: trackMs };
        }
      }

      // Each track already yields twice — before its read and before its write —
      // so the screen shows which call it is inside. A third yield here would
      // only cost time on tracks that were skipped.
    }

    await markStep(live, 'saving-activity');
    await flushActivityWrites();
    onProgress?.({ phase: 'done', processed: ordered.length, total: ordered.length });
    mark(live, 'idle');

    timings.total = Date.now() - startedAt;

    simpleLogger.log('Strava export import finished', {
      activities: summary.activitiesImported,
      streams: summary.streamsImported,
      alreadyPresent: summary.streamsAlreadyPresent,
      withoutTrack: summary.streamsWithoutTrack,
      unsupported: summary.unsupportedFiles,
      failed: summary.failedFiles,
      cancelled: summary.cancelled,
      timezone: summary.timezone,
      timings
    });
    if (slowTracks.length > 0) {
      simpleLogger.warn(`Slow tracks (${slowTracks.length})`, slowTracks.slice(0, 20));
    }
    if (warnings.length > 0) {
      simpleLogger.warn('Strava export import warnings', warnings.slice(0, 20));
    }

    return summary;
  } finally {
    timings.total = Date.now() - startedAt;
    byteSource?.close?.();
    // Only the fallback path creates a copy, and it is never worth keeping.
    if (copy) deleteArchiveCopy();
  }
}
