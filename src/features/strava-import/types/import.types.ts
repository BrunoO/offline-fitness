/**
 * Types for the archive-conversion core (`src/features/strava-import/`).
 *
 * A Strava archive contains an `activities.csv` file plus one GPS file per
 * activity under `activities/`. The app needs the same two things it used to
 * get from the Strava API: activity summaries and the `latlng`/`altitude`/
 * `time` streams used by maps and charts. Since Phase 5 the conversion itself
 * runs on the desktop tool, not the phone — these types describe the
 * conversion steps, no longer a user-facing import flow.
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
 * Abstracted so the ZIP reader runs identically on the desktop tool (an
 * `fs`-backed source) and in unit tests (an in-memory source).
 */
export interface ByteSource {
  size: number;
  read: (offset: number, length: number) => Promise<Uint8Array>;
  close?: () => void;
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
  averageHeartRate?: number;
  maxHeartRate?: number;
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
  heartrate?: {
    data: (number | null)[];
    series_type: string;
    original_size: number;
    resolution: string;
  };
}
