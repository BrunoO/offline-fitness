import { ActivityStreamLike, StreamConversionResult } from '../types/import.types';

/**
 * GPX parser for the track files inside a Strava export.
 *
 * The archive stores one `activities/<id>.gpx` per activity, and those files
 * carry exactly the three streams this app consumes: `latlng`, `altitude` and
 * `time` (1 point per second, same resolution as the API). Heart rate is only
 * present for the handful of uploads that had a sensor, and neither power nor
 * cadence is written, which matches what the app requests from the API
 * (`['altitude', 'latlng', 'time']`).
 *
 * A regex parser is used deliberately: GPX is flat, points are ordered, and a
 * DOM implementation would multiply memory use for multi-thousand-point files.
 */

export interface GpxPoint {
  lat: number;
  lon: number;
  ele: number | null;
  /** Absolute timestamp in ms. */
  timeMs: number;
}

export interface ParsedGpx {
  name?: string;
  /** English `<type>` value written by Strava, e.g. `walking`. */
  type?: string;
  points: GpxPoint[];
}

const TRACK_POINT_PATTERN = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
const LAT_PATTERN = /\blat\s*=\s*["']([^"']+)["']/;
const LON_PATTERN = /\blon\s*=\s*["']([^"']+)["']/;
// `[^<]+?\s*` (lazy + whitespace run) overlaps and backtracks quadratically
// on failing content (Sonar S8786); `\S` anchors the capture to real content
// and the greedy tail cannot re-match the closing tag, so scanning stays
// linear. Trailing whitespace now lands inside the capture; the readers below
// (Number/Date.parse-after-trim) are whitespace-tolerant.
const ELE_PATTERN = /<ele>\s*(\S[^<]*)<\/ele>/;
const TIME_PATTERN = /<time>\s*(\S[^<]*)<\/time>/;
const TRACK_NAME_PATTERN = /<trk>[\s\S]*?<name>([\s\S]*?)<\/name>/;
const TRACK_TYPE_PATTERN = /<trk>[\s\S]*?<type>([\s\S]*?)<\/type>/;

/** Unescapes the handful of XML entities that can appear in track names. */
function decodeXmlEntities(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

/** Raw values of one `<trkpt>` match, or null when the point is unusable. */
function readTrackPoint(
  attributes: string,
  body: string
): { lat: number; lon: number; ele: number | null; timeMs: number } | null {
  const latMatch = LAT_PATTERN.exec(attributes);
  const lonMatch = LON_PATTERN.exec(attributes);
  const timeMatch = TIME_PATTERN.exec(body);
  if (!latMatch || !lonMatch || !timeMatch) return null;

  const lat = Number(latMatch[1]);
  const lon = Number(lonMatch[1]);
  const timeMs = Date.parse(timeMatch[1].trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Number.isNaN(timeMs)) return null;

  const eleMatch = ELE_PATTERN.exec(body);
  const ele = eleMatch ? Number(eleMatch[1]) : null;

  return { lat, lon, ele: ele !== null && Number.isFinite(ele) ? ele : null, timeMs };
}

/**
 * Parses GPX text into points. Points without a usable `<time>` are dropped so
 * the three streams stay index-aligned; multi-segment tracks are concatenated
 * in document order.
 */
export function parseGpx(xml: string): ParsedGpx {
  const nameMatch = TRACK_NAME_PATTERN.exec(xml);
  const typeMatch = TRACK_TYPE_PATTERN.exec(xml);

  const points: GpxPoint[] = [];
  let previousTime = Number.NEGATIVE_INFINITY;

  TRACK_POINT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TRACK_POINT_PATTERN.exec(xml)) !== null) {
    const point = match[2] ? readTrackPoint(match[1], match[2]) : null;
    if (point === null) continue;

    // Keep timestamps monotonic: a few exports concatenate segments that
    // overlap, which would otherwise produce negative offsets in the stream.
    const monotonicTime = point.timeMs < previousTime ? previousTime : point.timeMs;
    previousTime = monotonicTime;

    points.push({ ...point, timeMs: monotonicTime });
  }

  return {
    name: nameMatch ? decodeXmlEntities(nameMatch[1]).trim() : undefined,
    type: typeMatch ? decodeXmlEntities(typeMatch[1]).trim() : undefined,
    points
  };
}

/** Coordinates are stored with ~0.1 m precision, as the Strava API does. */
function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function roundElevation(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Converts parsed GPX points into the same stream JSON shape the Strava API
 * returns, so every consumer (map, charts, bounding boxes, export) works
 * unchanged. `time` holds seconds since the first point, like the API.
 */
export function toStreamSet(points: GpxPoint[]): StreamConversionResult | undefined {
  if (points.length === 0) return undefined;

  const startMs = points[0].timeMs;
  const latlng: [number, number][] = [];
  const altitude: number[] = [];
  const time: number[] = [];

  for (const point of points) {
    latlng.push([roundCoordinate(point.lat), roundCoordinate(point.lon)]);
    altitude.push(point.ele === null ? 0 : roundElevation(point.ele));
    time.push(Math.round((point.timeMs - startMs) / 1000));
  }

  const stream: ActivityStreamLike = {
    latlng: {
      data: latlng,
      series_type: 'distance',
      original_size: latlng.length,
      resolution: 'high'
    },
    altitude: {
      data: altitude,
      series_type: 'distance',
      original_size: altitude.length,
      resolution: 'high'
    },
    time: {
      data: time,
      series_type: 'distance',
      original_size: time.length,
      resolution: 'high'
    }
  };

  return {
    stream,
    startLatLng: latlng[0],
    endLatLng: latlng.at(-1)!
  };
}

/**
 * Min/max of a raw `latlng` stream (the `[lat, lng]` pairs as `toStreamSet`
 * produces them).
 *
 * The bounding box used to come from `compressStreamSet(...).coordinates`, i.e.
 * the whole track was run through Ramer-Douglas-Peucker (and turned into an
 * array of `{latitude, longitude}` objects) purely to find four numbers. A
 * track's extremes are the same before and after simplification, so scanning
 * the pairs directly is both cheaper and more accurate. Lives here because
 * the desktop tool derives the same four numbers from the same points, and
 * the activity records must match byte for byte.
 */
export function trackBoundingBox(
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

/** Convenience wrapper: parse and convert in one call. */
export function gpxToStream(xml: string): StreamConversionResult | undefined {
  return toStreamSet(parseGpx(xml).points);
}
