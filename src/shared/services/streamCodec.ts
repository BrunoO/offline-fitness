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
 *   3      flags (uint8: bit0 = latlng, bit1 = altitude, bit2 = time)
 *   4..7   latlngCount (uint32)
 *   8..11  altitudeCount (uint32)
 *   12..15 timeCount (uint32)
 *   16..   latlng pairs: int32 lat*1e6, int32 lon*1e6 (8 B/point)
 *          altitude:     int32 alt*10 in decimetres (4 B/sample)
 *          time:         int32 seconds since start (4 B/sample)
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

const COORD_SCALE = 1e6;
const ALTITUDE_SCALE = 10;

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

/** Encodes a stream set into the compact 16 B/point binary representation. */
export function encodeStreamSet(stream: EncodableStreamSet): Uint8Array {
  const latlng = stream.latlng?.data;
  const altitude = stream.altitude?.data;
  const time = stream.time?.data;

  const hasLatLng = Array.isArray(latlng);
  const hasAltitude = Array.isArray(altitude);
  const hasTime = Array.isArray(time);

  const latlngCount = hasLatLng ? latlng.length : 0;
  const altitudeCount = hasAltitude ? altitude.length : 0;
  const timeCount = hasTime ? time.length : 0;

  const flags =
    (hasLatLng ? FLAG_HAS_LATLNG : 0) |
    (hasAltitude ? FLAG_HAS_ALTITUDE : 0) |
    (hasTime ? FLAG_HAS_TIME : 0);

  const totalBytes = HEADER_BYTES + latlngCount * 8 + altitudeCount * 4 + timeCount * 4;
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

  if (hasLatLng) {
    for (let i = 0; i < latlngCount; i++) {
      const pair = latlng[i];
      view.setInt32(offset, Math.round(pair[0] * COORD_SCALE), true);
      view.setInt32(offset + 4, Math.round(pair[1] * COORD_SCALE), true);
      offset += 8;
    }
  }

  if (hasAltitude) {
    for (let i = 0; i < altitudeCount; i++) {
      view.setInt32(offset, Math.round(altitude[i] * ALTITUDE_SCALE), true);
      offset += 4;
    }
  }

  if (hasTime) {
    for (let i = 0; i < timeCount; i++) {
      view.setInt32(offset, Math.round(time[i]), true);
      offset += 4;
    }
  }

  return new Uint8Array(buffer);
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

  const latlngCount = view.getUint32(4, true);
  const altitudeCount = view.getUint32(8, true);
  const timeCount = view.getUint32(12, true);

  const expectedBytes =
    HEADER_BYTES +
    (hasLatLng ? latlngCount * 8 : 0) +
    (hasAltitude ? altitudeCount * 4 : 0) +
    (hasTime ? timeCount * 4 : 0);

  if (bytes.byteLength < expectedBytes) {
    throw new Error('Truncated binary stream file');
  }

  let offset = HEADER_BYTES;
  const result: EncodableStreamSet = {};

  if (hasLatLng) {
    const latlng = new Array<[number, number]>(latlngCount);
    for (let i = 0; i < latlngCount; i++) {
      const lat = view.getInt32(offset, true) / COORD_SCALE;
      const lon = view.getInt32(offset + 4, true) / COORD_SCALE;
      latlng[i] = [lat, lon];
      offset += 8;
    }
    result.latlng = wrapSeries(latlng, latlngCount);
  }

  if (hasAltitude) {
    const altitude = new Array<number>(altitudeCount);
    for (let i = 0; i < altitudeCount; i++) {
      altitude[i] = view.getInt32(offset, true) / ALTITUDE_SCALE;
      offset += 4;
    }
    result.altitude = wrapSeries(altitude, altitudeCount);
  }

  if (hasTime) {
    const time = new Array<number>(timeCount);
    for (let i = 0; i < timeCount; i++) {
      time[i] = view.getInt32(offset, true);
      offset += 4;
    }
    result.time = wrapSeries(time, timeCount);
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
