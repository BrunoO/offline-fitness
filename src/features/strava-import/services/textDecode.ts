/**
 * UTF-8 decoding for archive entries.
 *
 * Expo installs a `TextDecoder` global, but it is not guaranteed to be present
 * in every runtime (Hermes builds without the winter runtime), so this falls
 * back to a small decoder. Both paths handle multi-byte characters, which
 * matters because activity names and the CSV headers carry accents.
 */

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
    if (bytes[index] < 0x80) continue; // the run stopped at the 8 KB cap

    const byte = bytes[index];
    let codePoint = 0;
    let extraBytes = 0;

    if ((byte & 0xe0) === 0xc0) {
      codePoint = byte & 0x1f;
      extraBytes = 1;
    } else if ((byte & 0xf0) === 0xe0) {
      codePoint = byte & 0x0f;
      extraBytes = 2;
    } else if ((byte & 0xf8) === 0xf0) {
      codePoint = byte & 0x07;
      extraBytes = 3;
    } else {
      pieces.push('\uFFFD');
      index += 1;
      continue;
    }

    if (index + extraBytes >= length) {
      pieces.push('\uFFFD');
      break;
    }

    let valid = true;
    for (let offset = 1; offset <= extraBytes; offset++) {
      const continuation = bytes[index + offset];
      if ((continuation & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
      codePoint = (codePoint << 6) | (continuation & 0x3f);
    }

    if (!valid) {
      pieces.push('\uFFFD');
      index += 1;
      continue;
    }

    pieces.push(String.fromCodePoint(codePoint));
    index += extraBytes + 1;
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
