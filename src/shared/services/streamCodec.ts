/**
 * Compact binary codec for cached activity streams (`streams/<id>.json`).
 *
 * The `.json` extension is preserved for compatibility with existing directory
 * listings, deletion helpers and WebDAV backup keys; the reader inspects the
 * first two bytes (`'O', 'F'`) to distinguish the binary format from legacy
 * JSON files written by older versions.
 *
 * Binary layout (little-endian):
 *   0..1   magic `'O', 'F'` (0x4f, 0x46)
 *   2      version (uint8 = 1)
 *   3      flags (uint8: bit0 = latlng, bit1 = altitude, bit2 = time,
 *          bit3 = heartrate)
 *   4..7   latlngCount (uint32)
 *   8..11  altitudeCount (uint32)
 *   12..15 timeCount (uint32)
 *   16..   latlng pairs: int32 lat*1e6, int32 lon*1e6 (8 B/point)
 *          altitude:     int32 alt*10 in decimetres (4 B/sample)
 *          time:         int32 seconds since start (4 B/sample)
 *          heartrate:    int32 bpm, 0 = no reading (4 B/sample), trailing and
 *                        count-less so version-1 readers ignore it
 *
 * Coordinates and altitude are already rounded to 1e-6 degrees and 0.1 m by
 * the GPX parser, so this integer representation is lossless on round-trip.
 */

const STREAM_MAGIC_0 = 0x4f; // 'O'
const STREAM_MAGIC_1 = 0x46; // 'F'
const STREAM_FORMAT_VERSION = 1;
const HEADER_BYTES = 16;

const FLAG_HAS_LATLNG = 0b001;
const FLAG_HAS_ALTITUDE = 0b010;
const FLAG_HAS_TIME = 0b100;
const FLAG_HAS_HEARTRATE = 0b1000;

const COORD_SCALE = 1e6;
const ALTITUDE_SCALE = 10;

/**
 * On-disk marker for "no heart-rate reading" at an aligned track point.
 *
 * The encoder writes it for a `null` value and the decoder maps it back to
 * `null`, so the persisted file has no in-band ambiguity: 0 bpm is not a
 * physiological reading, which is exactly why it is safe to reserve here. The
 * in-memory series never carries this marker - callers see `null`.
 */
const HEART_RATE_NO_DATA = 0;

export interface EncodableStreamSeries<T> {
  data: T;
  series_type: string;
  original_size: number;
  resolution: string;
}

export interface EncodableStreamSet {
  latlng?: EncodableStreamSeries<[number, number][]>;
  altitude?: EncodableStreamSeries<number[]>;
  time?: EncodableStreamSeries<number[]>;
  /**
   * Aligned with the other series; `null` means "no reading" at that point and
   * is encoded as [HEART_RATE_NO_DATA] rather than as a 0 bpm sample.
   */
  heartrate?: EncodableStreamSeries<(number | null)[]>;
}

export interface ReadableStreamFile {
  text: () => Promise<string>;
  bytes?: () => Promise<Uint8Array>;
}

function wrapSeries<T>(data: T, count: number): EncodableStreamSeries<T> {
  return {
    data,
    series_type: 'distance',
    original_size: count,
    resolution: 'high'
  };
}

/** Returns true when the buffer begins with the `'OF'` binary stream header. */
export function isBinaryStream(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 2 && bytes[0] === STREAM_MAGIC_0 && bytes[1] === STREAM_MAGIC_1;
}

function writeLatLngSeries(view: DataView, offset: number, latlng: [number, number][]): number {
  let cursor = offset;
  for (const pair of latlng) {
    view.setInt32(cursor, Math.round(pair[0] * COORD_SCALE), true);
    view.setInt32(cursor + 4, Math.round(pair[1] * COORD_SCALE), true);
    cursor += 8;
  }
  return cursor;
}

function writeAltitudeSeries(view: DataView, offset: number, altitude: number[]): number {
  let cursor = offset;
  for (const alt of altitude) {
    view.setInt32(cursor, Math.round(alt * ALTITUDE_SCALE), true);
    cursor += 4;
  }
  return cursor;
}

function writeTimeSeries(view: DataView, offset: number, time: number[]): number {
  let cursor = offset;
  for (const t of time) {
    view.setInt32(cursor, Math.round(t), true);
    cursor += 4;
  }
  return cursor;
}

function writeHeartrateSeries(
  view: DataView,
  offset: number,
  heartrate: (number | null)[]
): number {
  let cursor = offset;
  for (const bpm of heartrate) {
    view.setInt32(cursor, bpm === null ? HEART_RATE_NO_DATA : Math.round(bpm), true);
    cursor += 4;
  }
  return cursor;
}

function computeStreamFlags(counts: {
  latlngCount: number;
  altitudeCount: number;
  timeCount: number;
  heartrateCount: number;
}): number {
  let flags = 0;
  if (counts.latlngCount > 0) flags |= FLAG_HAS_LATLNG;
  if (counts.altitudeCount > 0) flags |= FLAG_HAS_ALTITUDE;
  if (counts.timeCount > 0) flags |= FLAG_HAS_TIME;
  if (counts.heartrateCount > 0) flags |= FLAG_HAS_HEARTRATE;
  return flags;
}

function assertHeartrateAlignment(heartrateCount: number, alignedCount: number): void {
  if (heartrateCount > 0 && alignedCount > 0 && heartrateCount !== alignedCount) {
    throw new Error(
      `Heart-rate series length (${heartrateCount}) does not match aligned track point count (${alignedCount})`
    );
  }
}

/** Encodes a stream set into the compact 16 B/point binary representation. */
export function encodeStreamSet(stream: EncodableStreamSet): Uint8Array {
  const latlng = stream.latlng?.data ?? [];
  const altitude = stream.altitude?.data ?? [];
  const time = stream.time?.data ?? [];
  const heartrate = stream.heartrate?.data ?? [];

  const latlngCount = latlng.length;
  const altitudeCount = altitude.length;
  const timeCount = time.length;
  const heartrateCount = heartrate.length;

  const alignedCount = alignedPointCount({
    hasTime: timeCount > 0,
    hasLatLng: latlngCount > 0,
    hasAltitude: altitudeCount > 0,
    timeCount,
    latlngCount,
    altitudeCount
  });

  assertHeartrateAlignment(heartrateCount, alignedCount);

  const flags = computeStreamFlags({
    latlngCount,
    altitudeCount,
    timeCount,
    heartrateCount
  });

  const totalBytes =
    HEADER_BYTES + latlngCount * 8 + altitudeCount * 4 + timeCount * 4 + heartrateCount * 4;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  view.setUint8(0, STREAM_MAGIC_0);
  view.setUint8(1, STREAM_MAGIC_1);
  view.setUint8(2, STREAM_FORMAT_VERSION);
  view.setUint8(3, flags);
  view.setUint32(4, latlngCount, true);
  view.setUint32(8, altitudeCount, true);
  view.setUint32(12, timeCount, true);

  let offset = HEADER_BYTES;
  offset = writeLatLngSeries(view, offset, latlng);
  offset = writeAltitudeSeries(view, offset, altitude);
  offset = writeTimeSeries(view, offset, time);
  writeHeartrateSeries(view, offset, heartrate);

  return new Uint8Array(buffer);
}

function decodeTrailingHeartrate(
  view: DataView,
  offset: number,
  totalBytes: number
): EncodableStreamSeries<(number | null)[]> | undefined {
  const remainingBytes = totalBytes - offset;
  if (remainingBytes < 4) {
    return undefined;
  }
  const heartrateCount = Math.floor(remainingBytes / 4);
  if (heartrateCount < 1) {
    return undefined;
  }
  return readHeartrateSeries(view, offset, heartrateCount);
}

/**
 * Number of samples a heart-rate series must have to stay aligned with the
 * track points. Time is the reference series when present (every point has a
 * timestamp), then latlng, then altitude — the same order the writers use.
 */
function alignedPointCount(args: {
  hasTime: boolean;
  hasLatLng: boolean;
  hasAltitude: boolean;
  timeCount: number;
  latlngCount: number;
  altitudeCount: number;
}): number {
  if (args.hasTime) return args.timeCount;
  if (args.hasLatLng) return args.latlngCount;
  if (args.hasAltitude) return args.altitudeCount;
  return 0;
}

/**
 * Reads `count` bpm samples, mapping the on-disk "no reading" marker back to
 * `null`. Shared by the flagged series and the legacy trailing-series path so
 * the two cannot drift apart on the marker semantics.
 */
function readHeartrateSeries(
  view: DataView,
  offset: number,
  count: number
): EncodableStreamSeries<(number | null)[]> {
  const heartrate = new Array<number | null>(count);
  let cursor = offset;
  for (let i = 0; i < count; i++) {
    const bpm = view.getInt32(cursor, true);
    heartrate[i] = bpm === HEART_RATE_NO_DATA ? null : bpm;
    cursor += 4;
  }
  return wrapSeries(heartrate, count);
}

function readLatLngSeries(
  view: DataView,
  offset: number,
  count: number
): EncodableStreamSeries<[number, number][]> {
  const latlng = new Array<[number, number]>(count);
  let cursor = offset;
  for (let i = 0; i < count; i++) {
    const lat = view.getInt32(cursor, true) / COORD_SCALE;
    const lon = view.getInt32(cursor + 4, true) / COORD_SCALE;
    latlng[i] = [lat, lon];
    cursor += 8;
  }
  return wrapSeries(latlng, count);
}

function readAltitudeSeries(
  view: DataView,
  offset: number,
  count: number
): EncodableStreamSeries<number[]> {
  const altitude = new Array<number>(count);
  let cursor = offset;
  for (let i = 0; i < count; i++) {
    altitude[i] = view.getInt32(cursor, true) / ALTITUDE_SCALE;
    cursor += 4;
  }
  return wrapSeries(altitude, count);
}

function readTimeSeries(
  view: DataView,
  offset: number,
  count: number
): EncodableStreamSeries<number[]> {
  const time = new Array<number>(count);
  let cursor = offset;
  for (let i = 0; i < count; i++) {
    time[i] = view.getInt32(cursor, true);
    cursor += 4;
  }
  return wrapSeries(time, count);
}

function decodeHeartrateSection(args: {
  view: DataView;
  offset: number;
  totalBytes: number;
  expectedBytes: number;
  hasHeartrate: boolean;
  alignedCount: number;
}): EncodableStreamSeries<(number | null)[]> | undefined {
  const { view, offset, totalBytes, expectedBytes, hasHeartrate, alignedCount } = args;
  if (hasHeartrate) {
    if (alignedCount === 0) {
      throw new Error('Truncated binary stream file');
    }
    return readHeartrateSeries(view, offset, alignedCount);
  }

  // Backward compatibility: one earlier build wrote a trailing heart-rate
  // series without setting the flag. Only trust it when the remaining bytes
  // are exactly one aligned series — otherwise this is a layout we do not
  // understand and silently guessing would corrupt the chart.
  const trailing = decodeTrailingHeartrate(view, offset, totalBytes);
  const isAlignedTrailing =
    alignedCount > 0 &&
    totalBytes === expectedBytes + alignedCount * 4 &&
    trailing?.data.length === alignedCount;
  return isAlignedTrailing ? trailing : undefined;
}

/** Decodes a binary stream buffer written by `encodeStreamSet`. */
export function decodeStreamBytes(bytes: Uint8Array): EncodableStreamSet {
  if (bytes.byteLength < HEADER_BYTES || !isBinaryStream(bytes)) {
    throw new Error('Invalid binary stream header');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(2);
  if (version !== STREAM_FORMAT_VERSION) {
    throw new Error(`Unsupported binary stream version: ${version}`);
  }

  const flags = view.getUint8(3);
  const hasLatLng = (flags & FLAG_HAS_LATLNG) !== 0;
  const hasAltitude = (flags & FLAG_HAS_ALTITUDE) !== 0;
  const hasTime = (flags & FLAG_HAS_TIME) !== 0;
  const hasHeartrate = (flags & FLAG_HAS_HEARTRATE) !== 0;

  const latlngCount = view.getUint32(4, true);
  const altitudeCount = view.getUint32(8, true);
  const timeCount = view.getUint32(12, true);

  const alignedCount = alignedPointCount({
    hasTime,
    hasLatLng,
    hasAltitude,
    timeCount,
    latlngCount,
    altitudeCount
  });

  const expectedBytes =
    HEADER_BYTES +
    (hasLatLng ? latlngCount * 8 : 0) +
    (hasAltitude ? altitudeCount * 4 : 0) +
    (hasTime ? timeCount * 4 : 0) +
    (hasHeartrate ? alignedCount * 4 : 0);

  if (bytes.byteLength < expectedBytes) {
    throw new Error('Truncated binary stream file');
  }

  let offset = HEADER_BYTES;
  const result: EncodableStreamSet = {};

  if (hasLatLng) {
    result.latlng = readLatLngSeries(view, offset, latlngCount);
    offset += latlngCount * 8;
  }

  if (hasAltitude) {
    result.altitude = readAltitudeSeries(view, offset, altitudeCount);
    offset += altitudeCount * 4;
  }

  if (hasTime) {
    result.time = readTimeSeries(view, offset, timeCount);
    offset += timeCount * 4;
  }

  const heartrate = decodeHeartrateSection({
    view,
    offset,
    totalBytes: bytes.byteLength,
    expectedBytes,
    hasHeartrate,
    alignedCount
  });
  if (heartrate) {
    result.heartrate = heartrate;
  }

  return result;
}

function decodeAsciiBytes(bytes: Uint8Array): string {
  const globalDecoder = (globalThis as { TextDecoder?: typeof TextDecoder }).TextDecoder;
  if (typeof globalDecoder === 'function') {
    return new globalDecoder('utf-8').decode(bytes);
  }
  const CHUNK = 8192;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    parts.push(String.fromCodePoint.apply(null, Array.from(slice) as unknown as number[]));
  }
  return parts.join('');
}

/**
 * Decodes a raw stream file buffer that may hold either the binary format
 * (`'OF'` magic) or a legacy UTF-8 JSON payload.
 */
export function parseStreamBytes<T extends EncodableStreamSet = EncodableStreamSet>(
  bytes: Uint8Array
): T {
  if (isBinaryStream(bytes)) {
    return decodeStreamBytes(bytes) as T;
  }
  return JSON.parse(decodeAsciiBytes(bytes)) as T;
}

/**
 * Reads a stream file from disk, transparently handling both the binary format
 * and legacy JSON stream files.
 */
export async function readStreamFile<T extends EncodableStreamSet = EncodableStreamSet>(
  file: ReadableStreamFile
): Promise<T> {
  if (typeof file.bytes === 'function') {
    const bytes = await file.bytes();
    return parseStreamBytes<T>(bytes);
  }
  return JSON.parse(await file.text()) as T;
}
