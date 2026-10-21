import { APP_CONFIG } from '@/constants';
// Direct import: the activities barrel also pulls in React Native screens and
// list components, which the import pipeline (and its tests) must not need.
import { compressStreamSet } from '@/features/activities/services/fetchAndStoreStreams';
import {
  Activity,
  calculateBoundingBox,
  compareActivitiesByUtcDesc,
  getAllActivitiesKeys,
  loadAllActivities,
  simpleLogger,
  storeActivity,
  storeMultiActivities
} from '@/shared';
import { Directory, File, Paths } from 'expo-file-system';
import {
  ActivityStreamLike,
  ExportedActivityRow,
  ImportOptions,
  ImportSummary,
  ZipEntryInfo
} from '../types/import.types';
import { deviceTimezoneLabel, repairDistanceUnit, rowToActivity } from './activityMapper';
import { mapActivityType, parseActivitiesCsv } from './csvParser';
import { parseGpx, toStreamSet } from './gpxParser';
import { decodeUtf8 } from './textDecode';
import {
  createFileByteSource,
  gunzipEntry,
  isGzip,
  isZip,
  readZipEntries,
  readZipEntry
} from './zipReader';

/**
 * Imports a Strava export archive ("Download your account" .zip).
 *
 * A full export is ~1 GB of track files, so the work is split in two passes:
 * the CSV is read first and activities are persisted in batches (the list is
 * usable immediately), then each track file is converted into the stream cache
 * one at a time. Re-running an import is safe: activities are upserted by id
 * and existing stream files are never overwritten.
 */

const streamsFolder = new Directory(Paths.document, APP_CONFIG.STREAMS_FOLDER);

const CACHE_ARCHIVE_NAME = 'strava-export-import.zip';
const ACTIVITY_BATCH_SIZE = 100;
const YIELD_EVERY = 25;

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
    cancelled: false
  };
}

/** Gives the UI thread a chance to breathe during long loops. */
function yieldToUi(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function writeNoStreamFlag(activityId: string): void {
  const flagFile = new File(streamsFolder, `${activityId}.nostreamflag`);
  if (!flagFile.exists) flagFile.write('');
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
function clearNoStreamFlag(activityId: string): void {
  const flagFile = new File(streamsFolder, `${activityId}.nostreamflag`);
  if (flagFile.exists) flagFile.delete();
}

/** True when the record still misses the track-derived fields. */
function lacksTrackFields(activity: Activity): boolean {
  if (!activity.bounding_box) return true;
  if (!activity.start_latlng || activity.start_latlng.length < 2) return true;
  if (!activity.end_latlng || activity.end_latlng.length < 2) return true;
  return false;
}

/**
 * Fills `start_latlng`, `end_latlng` and `bounding_box` from a stream file that
 * is already stored locally. Used when an activity record was written without
 * them (an older import, or a re-import that overwrote them) while its track
 * is still on disk.
 *
 * @returns true when the record was updated.
 */
async function backfillTrackFields(activity: Activity): Promise<boolean> {
  const file = new File(streamsFolder, `${activity.id}.json`);
  if (!file.exists) return false;
  try {
    const stored = JSON.parse(await file.text()) as ActivityStreamLike;
    const coordinates = stored?.latlng?.data ?? [];
    if (coordinates.length === 0) return false;
    activity.start_latlng = coordinates[0];
    activity.end_latlng = coordinates[coordinates.length - 1];
    const boundingBox = calculateBoundingBox(compressStreamSet(stored).coordinates);
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
  const { onProgress, shouldCancel } = options;
  const timezone = deviceTimezoneLabel();
  const summary = emptySummary(timezone);
  const warnings: string[] = [];

  if (!streamsFolder.exists) {
    streamsFolder.create({ intermediates: true });
  }

  const cached = new File(Paths.cache, CACHE_ARCHIVE_NAME);
  let byteSource: ReturnType<typeof createFileByteSource> | undefined;

  try {
    onProgress?.({ phase: 'opening', processed: 0, total: 0 });

    // The picker returns a content:// URI on Android; copying into the cache
    // gives a plain file we can seek at will, then delete afterwards.
    if (cached.exists) cached.delete();
    await pickedFile.copy(cached, { overwrite: true });

    byteSource = createFileByteSource(cached);
    const head = await byteSource.read(0, 4);
    if (!isZip(head)) {
      throw new Error('The selected file is not a ZIP archive');
    }

    const entries = await readZipEntries(byteSource);
    const csvEntry = entries.find(entry => baseNameOf(entry.name) === 'activities.csv');
    if (!csvEntry) {
      throw new Error('activities.csv was not found in the archive — is this a Strava export?');
    }

    const parsed = parseActivitiesCsv(decodeUtf8(await readZipEntry(byteSource, csvEntry)));
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
    for (let start = 0; start < activities.length; start += ACTIVITY_BATCH_SIZE) {
      if (shouldCancel?.()) {
        summary.cancelled = true;
        return summary;
      }
      const batch = activities.slice(start, start + ACTIVITY_BATCH_SIZE);
      await storeMultiActivities(batch);
      summary.activitiesImported += batch.length;
      onProgress?.({
        phase: 'activities',
        processed: Math.min(start + batch.length, activities.length),
        total: activities.length
      });
      await yieldToUi();
    }

    // Pass 2 — convert track files into streams, newest activity first.
    const ordered = [...activities].sort(compareActivitiesByUtcDesc);

    for (let index = 0; index < ordered.length; index++) {
      if (shouldCancel?.()) {
        summary.cancelled = true;
        break;
      }

      const activity = ordered[index];
      const row = rowsById.get(activity.id);
      onProgress?.({
        phase: 'streams',
        processed: index,
        total: ordered.length,
        currentActivityId: activity.id
      });

      const streamFile = new File(streamsFolder, `${activity.id}.json`);
      if (streamFile.exists) {
        summary.streamsAlreadyPresent++;
        // The track is already stored, so it is not parsed again — but the
        // record may have been written without the track-derived fields (an
        // older import, or a re-import that overwrote them). Restore them
        // from the stored stream when they are missing.
        if (lacksTrackFields(activity)) {
          await backfillTrackFields(activity);
        }
        continue;
      }

      const fileName = row?.fileName ?? '';
      if (!fileName) {
        // Manual entry: no track was ever recorded, so never retry it.
        summary.activitiesWithoutFile++;
        writeNoStreamFlag(activity.id);
        continue;
      }

      if (isUnsupportedTrack(fileName)) {
        summary.unsupportedFiles++;
        writeNoStreamFlag(activity.id);
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
        const raw = await readZipEntry(byteSource, entry);
        const gpx = parseGpx(decodeUtf8(isGzip(raw) ? gunzipEntry(raw) : raw));

        // The CSV type is localized; when it could not be mapped, the GPX
        // `<type>` (always English) is authoritative.
        if (!row?.type) {
          const fromGpx = mapActivityType(undefined, gpx.type);
          if (fromGpx) activity.type = fromGpx;
        }

        const converted = toStreamSet(gpx.points);
        if (!converted) {
          summary.streamsWithoutTrack++;
          writeNoStreamFlag(activity.id);
          continue;
        }

        streamFile.write(JSON.stringify(converted.stream));
        // The track is stored now, so any earlier "no stream" marker is stale.
        clearNoStreamFlag(activity.id);

        activity.start_latlng = converted.startLatLng;
        activity.end_latlng = converted.endLatLng;
        const boundingBox = calculateBoundingBox(compressStreamSet(converted.stream).coordinates);
        if (boundingBox) activity.bounding_box = boundingBox;
        await storeActivity(activity);

        summary.streamsImported++;
      } catch (error) {
        summary.failedFiles++;
        warnings.push(
          `Activity ${activity.id}: ${error instanceof Error ? error.message : String(error)}`
        );
        writeNoStreamFlag(activity.id);
      }

      if (index % YIELD_EVERY === 0) await yieldToUi();
    }

    onProgress?.({ phase: 'done', processed: ordered.length, total: ordered.length });

    simpleLogger.log('Strava export import finished', {
      activities: summary.activitiesImported,
      streams: summary.streamsImported,
      alreadyPresent: summary.streamsAlreadyPresent,
      withoutTrack: summary.streamsWithoutTrack,
      unsupported: summary.unsupportedFiles,
      failed: summary.failedFiles,
      cancelled: summary.cancelled,
      timezone: summary.timezone
    });
    if (warnings.length > 0) {
      simpleLogger.warn('Strava export import warnings', warnings.slice(0, 20));
    }

    return summary;
  } finally {
    byteSource?.close?.();
    try {
      if (cached.exists) cached.delete();
    } catch {
      // Best effort: the cache is reclaimable by the OS anyway.
    }
  }
}
