/**
 * Types for the "import a Strava export archive" feature.
 *
 * A Strava archive contains an `activities.csv` file plus one GPS file per
 * activity under `activities/`. The app needs the same two things it gets from
 * the Strava API today: activity summaries and the `latlng`/`altitude`/`time`
 * streams used by maps and charts.
 */

/** One entry of the ZIP central directory. */
export interface ZipEntryInfo {
  /** Path inside the archive, e.g. `activities/12345678.gpx`. */
  name: string;
  /** 0 = stored, 8 = deflate. */
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  /** Offset of the local file header inside the archive. */
  localHeaderOffset: number;
}

/**
 * Random-access byte reader.
 *
 * Abstracted so the ZIP reader can be unit tested with an in-memory source
 * instead of the native file system.
 */
export interface ByteSource {
  size: number;
  read: (offset: number, length: number) => Promise<Uint8Array>;
  close?: () => void;
}

export type ImportPhase = 'opening' | 'activities' | 'streams' | 'done';

export interface ImportProgress {
  phase: ImportPhase;
  /** Items processed in the current phase. */
  processed: number;
  /** Total items in the current phase (0 when unknown). */
  total: number;
  /** Id of the activity currently being read, for diagnostics. */
  currentActivityId?: string;
}

/**
 * Where an import run spent its time, in milliseconds.
 *
 * Measured rather than estimated: a phone run that looks pathologically slow
 * is nearly always waiting on a native call or standing still, not parsing, so
 * the report separates the JavaScript work (`parseTracks`) from the file work
 * (`readTracks`, `writeStreams`) and from the copy of the archive. `total` is
 * the wall clock of the whole call, so whatever is left over is stall time.
 */
export interface ImportTimings {
  /** Copying the picked archive into the app cache (0 when reused). */
  copyArchive: number;
  /** Reading the ZIP central directory. */
  readDirectory: number;
  /** Reading, decoding and parsing `activities.csv`. */
  parseCsv: number;
  /** Writing the activity records back (pass 1). */
  writeActivities: number;
  /** Reading track bytes out of the archive. */
  readTracks: number;
  /** Inflating and parsing GPX, and serialising the stream (JavaScript). */
  parseTracks: number;
  /** Writing stream files into the cache. */
  writeStreams: number;
  /** Writing track-derived fields back into the activity records. */
  writeTrackFields: number;
  /** Wall clock of the whole import call. */
  total: number;
}

/** What an import run did, shown to the user when it finishes. */
export interface ImportSummary {
  /** Activities written to local storage (inserted or updated). */
  activitiesImported: number;
  /** Activities whose CSV row had no GPS file (manual entries). */
  activitiesWithoutFile: number;
  /** Track files converted into streams and stored. */
  streamsImported: number;
  /** Activities that already had a stored stream and were left untouched. */
  streamsAlreadyPresent: number;
  /** Activities whose file exists but contains no track points. */
  streamsWithoutTrack: number;
  /** Files in a format this importer does not read yet (.fit, .tcx). */
  unsupportedFiles: number;
  /** Files that failed to parse or were corrupt. */
  failedFiles: number;
  /** Timezone label used to derive activity-local dates. */
  timezone: string;
  /** True when the user cancelled before the archive was fully processed. */
  cancelled: boolean;
  /** Where the run spent its time, for diagnosing a slow import. */
  timings: ImportTimings;
}

export interface ImportOptions {
  onProgress?: (progress: ImportProgress) => void;
  shouldCancel?: () => boolean;
}

/** Parsed row of `activities.csv`, before it becomes an app `Activity`. */
export interface ExportedActivityRow {
  id: string;
  /** UTC instant of the activity start, in ms. */
  startUtcMs: number;
  name: string;
  /** Canonical app activity type, e.g. `Ride`. */
  type: string;
  distance: number;
  movingTime: number;
  elapsedTime: number;
  elevationGain: number;
  elevHigh: number;
  elevLow: number;
  averageSpeed: number;
  /** Path of the GPS file inside the archive, empty for manual entries. */
  fileName: string;
}

export interface ParsedExport {
  rows: ExportedActivityRow[];
  /** Non-fatal problems worth surfacing in the logs. */
  warnings: string[];
}

export interface StreamConversionResult {
  stream: ActivityStreamLike;
  startLatLng: number[];
  endLatLng: number[];
}

/** Shape written to the streams cache; matches what the Strava API returns. */
export interface ActivityStreamLike {
  latlng: {
    data: [number, number][];
    series_type: string;
    original_size: number;
    resolution: string;
  };
  altitude: { data: number[]; series_type: string; original_size: number; resolution: string };
  time: { data: number[]; series_type: string; original_size: number; resolution: string };
}
