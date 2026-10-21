// Default import with destructuring, not `import { inflateRaw }`: pako@1 is
// CommonJS without static named exports, so a named import fails under the
// desktop tool's Node-ESM runtime (Metro and babel interop never noticed).
import pako from 'pako';
import { ByteSource, ZipEntryInfo } from '../types/import.types';

const { inflateRaw, ungzip } = pako;

/**
 * Minimal random-access ZIP reader.
 *
 * Part of the portable import core: this file has no expo or react-native
 * imports, so the same reader runs on a desktop tool (see
 * `docs/desktop-import-plan.md`, Phase 0). The expo-backed byte source lives
 * in `expoByteSource.ts`.
 *
 * Why not `JSZip.loadAsync(await file.bytes())`: a Strava export is ~1 GB worth
 * of text that compresses to tens of MB, and inflating the whole archive in one
 * go exceeds what a low-end Android device can hold. This reader only ever
 * keeps the central directory (a few hundred KB) plus a single entry in memory,
 * so peak usage is bounded by the largest GPS file.
 *
 * Supported: stored (method 0) and deflate (method 8) entries, ZIP64 archives,
 * data-descriptor entries (sizes are read from the central directory).
 */

const EOCD_SIGNATURE = 0x06054b50;
const EOCD64_SIGNATURE = 0x06064b50;
const EOCD64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;

const EOCD_MIN_SIZE = 22;
const EOCD_MAX_SEARCH = 66_000; // 22 bytes + max 65535 comment
const ZIP64_EXTRA_FIELD_ID = 0x0001;

/** Hard ceiling per entry, to keep a corrupt archive from exhausting memory. */
const MAX_ENTRY_BYTES = 48 * 1024 * 1024;

/** Read chunk size; small enough to stay off the heap's critical path. */
const READ_CHUNK = 512 * 1024;

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function readU64(bytes: Uint8Array, offset: number): number {
  const low = readU32(bytes, offset);
  const high = readU32(bytes, offset + 4);
  return high * 0x1_0000_0000 + low;
}

function decodeName(bytes: Uint8Array): string {
  // Entry names are ASCII in Strava archives; decode defensively anyway.
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

/** In-memory byte source, used by tests (and available to any other runtime). */
export function createMemoryByteSource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    read: async (offset, length) => bytes.slice(offset, offset + length)
  };
}

interface EndOfCentralDirectory {
  entryCount: number;
  directorySize: number;
  directoryOffset: number;
}

async function findEndOfCentralDirectory(source: ByteSource): Promise<EndOfCentralDirectory> {
  if (source.size < EOCD_MIN_SIZE) {
    throw new Error('File is too small to be a ZIP archive');
  }

  const tailLength = Math.min(source.size, EOCD_MAX_SEARCH);
  const tailStart = source.size - tailLength;
  const tail = await source.read(tailStart, tailLength);

  let eocdOffsetInTail = -1;
  for (let i = tail.length - EOCD_MIN_SIZE; i >= 0; i--) {
    if (readU32(tail, i) === EOCD_SIGNATURE) {
      eocdOffsetInTail = i;
      break;
    }
  }
  if (eocdOffsetInTail < 0) {
    throw new Error('Not a ZIP archive (end of central directory not found)');
  }

  let entryCount = readU16(tail, eocdOffsetInTail + 10);
  let directorySize = readU32(tail, eocdOffsetInTail + 12);
  let directoryOffset = readU32(tail, eocdOffsetInTail + 16);

  const needsZip64 =
    entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff;

  if (!needsZip64) {
    return { entryCount, directorySize, directoryOffset };
  }

  const eocdAbsolute = tailStart + eocdOffsetInTail;
  const locatorOffset = eocdAbsolute - 20;
  if (locatorOffset < 0) {
    throw new Error('Corrupt ZIP64 archive (locator missing)');
  }
  const locator = await source.read(locatorOffset, 20);
  if (readU32(locator, 0) !== EOCD64_LOCATOR_SIGNATURE) {
    throw new Error('Corrupt ZIP64 archive (bad locator signature)');
  }

  const eocd64Offset = readU64(locator, 8);
  const eocd64 = await source.read(eocd64Offset, 56);
  if (readU32(eocd64, 0) !== EOCD64_SIGNATURE) {
    throw new Error('Corrupt ZIP64 archive (bad end of central directory signature)');
  }

  entryCount = readU64(eocd64, 32);
  directorySize = readU64(eocd64, 40);
  directoryOffset = readU64(eocd64, 48);

  return { entryCount, directorySize, directoryOffset };
}

/**
 * Reads the central directory and returns every entry in the archive.
 */
export async function readZipEntries(source: ByteSource): Promise<ZipEntryInfo[]> {
  const eocd = await findEndOfCentralDirectory(source);

  if (eocd.directoryOffset + eocd.directorySize > source.size) {
    throw new Error('Corrupt ZIP archive (central directory out of bounds)');
  }

  const directory = await source.read(eocd.directoryOffset, eocd.directorySize);
  const entries: ZipEntryInfo[] = [];
  let cursor = 0;

  while (cursor + 46 <= directory.length) {
    if (readU32(directory, cursor) !== CENTRAL_DIRECTORY_SIGNATURE) break;

    const method = readU16(directory, cursor + 10);
    let compressedSize = readU32(directory, cursor + 20);
    let uncompressedSize = readU32(directory, cursor + 24);
    const nameLength = readU16(directory, cursor + 28);
    const extraLength = readU16(directory, cursor + 30);
    const commentLength = readU16(directory, cursor + 32);
    let localHeaderOffset = readU32(directory, cursor + 42);

    const name = decodeName(directory.subarray(cursor + 46, cursor + 46 + nameLength));

    // ZIP64 extended information: fields appear in this fixed order, but only
    // for the ones that overflowed, so walk them in sequence.
    if (
      uncompressedSize === 0xffffffff ||
      compressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      let extraCursor = cursor + 46 + nameLength;
      const extraEnd = extraCursor + extraLength;
      while (extraCursor + 4 <= extraEnd) {
        const fieldId = readU16(directory, extraCursor);
        const fieldSize = readU16(directory, extraCursor + 2);
        const fieldStart = extraCursor + 4;
        if (fieldId === ZIP64_EXTRA_FIELD_ID) {
          let fieldCursor = fieldStart;
          if (uncompressedSize === 0xffffffff && fieldCursor + 8 <= fieldStart + fieldSize) {
            uncompressedSize = readU64(directory, fieldCursor);
            fieldCursor += 8;
          }
          if (compressedSize === 0xffffffff && fieldCursor + 8 <= fieldStart + fieldSize) {
            compressedSize = readU64(directory, fieldCursor);
            fieldCursor += 8;
          }
          if (localHeaderOffset === 0xffffffff && fieldCursor + 8 <= fieldStart + fieldSize) {
            localHeaderOffset = readU64(directory, fieldCursor);
          }
          break;
        }
        extraCursor = fieldStart + fieldSize;
      }
    }

    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  // Directory entries carry no data; callers only care about files.
  const files = entries.filter(entry => !entry.name.endsWith('/'));

  if (files.length === 0) {
    throw new Error('ZIP archive contains no entries');
  }

  return files;
}

/**
 * Reads and decompresses a single entry. Memory use is bounded by the entry's
 * uncompressed size.
 */
export async function readZipEntry(source: ByteSource, entry: ZipEntryInfo): Promise<Uint8Array> {
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
    throw new Error(
      `Entry ${entry.name} is too large to import (${Math.round(entry.uncompressedSize / 1024 / 1024)} MB)`
    );
  }

  const localHeader = await source.read(entry.localHeaderOffset, 30);
  if (localHeader.length < 30 || readU32(localHeader, 0) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error(`Corrupt ZIP entry (bad local header): ${entry.name}`);
  }
  const nameLength = readU16(localHeader, 26);
  const extraLength = readU16(localHeader, 28);
  const dataOffset = entry.localHeaderOffset + 30 + nameLength + extraLength;

  const compressed = new Uint8Array(entry.compressedSize);
  let filled = 0;
  while (filled < entry.compressedSize) {
    const chunkLength = Math.min(READ_CHUNK, entry.compressedSize - filled);
    const chunk = await source.read(dataOffset + filled, chunkLength);
    if (chunk.length === 0) break;
    compressed.set(chunk, filled);
    filled += chunk.length;
  }
  if (filled !== entry.compressedSize) {
    throw new Error(`Truncated ZIP entry: ${entry.name}`);
  }

  if (entry.method === 0) {
    return compressed;
  }
  if (entry.method === 8) {
    const inflated = inflateRaw(compressed);
    if (inflated.length !== entry.uncompressedSize) {
      // Some writers store 0/garbage sizes; only reject when clearly wrong.
      if (entry.uncompressedSize > 0) {
        throw new Error(`Inflated size mismatch for ${entry.name}`);
      }
    }
    return inflated;
  }

  throw new Error(`Unsupported ZIP compression method ${entry.method} for ${entry.name}`);
}

/** Decompresses gzip data (`activities/*.gpx.gz` entries). */
export function gunzipEntry(bytes: Uint8Array): Uint8Array {
  return ungzip(bytes);
}

/** True when the bytes start with the gzip magic number. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** True when the bytes start with the ZIP local file header signature. */
export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && readU32(bytes, 0) === LOCAL_HEADER_SIGNATURE;
}
