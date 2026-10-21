/**
 * UTF-8 decoding for archive entries.
 *
 * Expo installs a `TextDecoder` global, but it is not guaranteed to be present
 * in every runtime (Hermes builds without the winter runtime), so this falls
 * back to a small decoder. Both paths handle multi-byte characters, which
 * matters because activity names and the CSV headers carry accents.
 */

function decodeUtf8Manually(bytes: Uint8Array): string {
  let result = '';
  let index = 0;
  const length = bytes.length;

  // ASCII fast path in chunks: the bulk of a GPX file is plain ASCII.
  const CHUNK = 8192;
  while (index < length && bytes[index] < 0x80) {
    const end = Math.min(index + CHUNK, length);
    let asciiEnd = index;
    while (asciiEnd < end && bytes[asciiEnd] < 0x80) asciiEnd++;
    result += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(index, asciiEnd)) as unknown as number[]
    );
    index = asciiEnd;
    if (asciiEnd < end) break;
  }

  while (index < length) {
    const byte = bytes[index];

    if (byte < 0x80) {
      result += String.fromCharCode(byte);
      index += 1;
      continue;
    }

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
      result += '\uFFFD';
      index += 1;
      continue;
    }

    if (index + extraBytes >= length) {
      result += '\uFFFD';
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
      result += '\uFFFD';
      index += 1;
      continue;
    }

    result += String.fromCodePoint(codePoint);
    index += extraBytes + 1;
  }

  return result;
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
