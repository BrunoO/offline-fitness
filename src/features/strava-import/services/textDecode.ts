/**
 * UTF-8 decoding for archive entries.
 *
 * Expo installs a `TextDecoder` global, but it is not guaranteed to be present
 * in every runtime (Hermes builds without the winter runtime), so this falls
 * back to a small decoder. Both paths handle multi-byte characters, which
 * matters because activity names and the CSV headers carry accents.
 */

/**
 * Continuation bytes for a UTF-8 lead byte, or -1 when the byte is not a valid
 * lead (stray continuation or out-of-range).
 */
function continuationCount(leadByte: number): number {
  if ((leadByte & 0xe0) === 0xc0) return 1;
  if ((leadByte & 0xf0) === 0xe0) return 2;
  if ((leadByte & 0xf8) === 0xf0) return 3;
  return -1;
}

/**
 * Decodes the multi-byte sequence starting at `index`, or -1 when the
 * continuation bytes are malformed (caller advances one byte and emits U+FFFD).
 */
function decodeSequence(bytes: Uint8Array, index: number, extraBytes: number): number {
  let codePoint = bytes[index] & (0xff >> (extraBytes + 2));
  for (let offset = 1; offset <= extraBytes; offset++) {
    const continuation = bytes[index + offset];
    if ((continuation & 0xc0) !== 0x80) return -1;
    codePoint = (codePoint << 6) | (continuation & 0x3f);
  }
  return codePoint;
}

/**
 * Decodes the multi-byte sequence starting at `index` and appends its result
 * (or U+FFFD when malformed) to `pieces`. Returns the next index to scan.
 */
function pushDecodedSequence(
  bytes: Uint8Array,
  index: number,
  length: number,
  pieces: string[]
): number {
  const extraBytes = continuationCount(bytes[index]);
  if (extraBytes < 0) {
    pieces.push('\uFFFD');
    return index + 1;
  }
  if (index + extraBytes >= length) {
    pieces.push('\uFFFD');
    return length;
  }
  const codePoint = decodeSequence(bytes, index, extraBytes);
  if (codePoint < 0) {
    pieces.push('\uFFFD');
    return index + 1;
  }
  pieces.push(String.fromCodePoint(codePoint));
  return index + extraBytes + 1;
}

/**
 * Fallback decoder, used only when the platform has no `TextDecoder`.
 *
 * Two things matter for speed here, because a track file is ~250 KB–2 MB:
 * ASCII is decoded in runs of up to 8 KB (one `fromCharCode` per run, not per
 * byte), the run scan **resumes after a multi-byte sequence** instead of
 * falling into the per-byte path for the rest of the file, and the pieces are
 * joined once at the end so no long chain of string concatenations is built.
 * The previous version dropped to one character per concatenation after the
 * first accented activity name and was measured at 4× the cost on a file with a
 * single accent, growing worse with size.
 */
function decodeUtf8Manually(bytes: Uint8Array): string {
  const pieces: string[] = [];
  const length = bytes.length;
  const ASCII_RUN = 8192;
  let index = 0;

  while (index < length) {
    const runStart = index;
    const runEnd = Math.min(index + ASCII_RUN, length);
    while (index < runEnd && bytes[index] < 0x80) index++;
    if (index > runStart) {
      pieces.push(
        String.fromCharCode.apply(
          null,
          Array.from(bytes.subarray(runStart, index)) as unknown as number[]
        )
      );
    }
    if (index >= length) break;
    // A remaining ASCII byte means the run stopped at the 8 KB cap.
    if (bytes[index] < 0x80) continue;

    index = pushDecodedSequence(bytes, index, length, pieces);
  }

  return pieces.join('');
}

/** Decodes UTF-8 bytes to a string, preferring the platform decoder. */
export function decodeUtf8(bytes: Uint8Array): string {
  const globalDecoder = (globalThis as { TextDecoder?: typeof TextDecoder }).TextDecoder;
  if (typeof globalDecoder === 'function') {
    try {
      return new globalDecoder('utf-8').decode(bytes);
    } catch {
      // Fall through to the manual decoder.
    }
  }
  return decodeUtf8Manually(bytes);
}
