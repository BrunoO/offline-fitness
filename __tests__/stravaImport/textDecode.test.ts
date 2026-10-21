import { decodeUtf8 } from '@/features/strava-import/services/textDecode';

/**
 * The fallback decoder is the one path that touches every byte of a track file,
 * so its correctness (and its shape) is worth pinning: it used to fall back to
 * one-character-at-a-time concatenation after the first accented activity name.
 */

const utf8 = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'utf8'));

/** Runs the manual decoder by hiding the platform one for the duration. */
function withoutPlatformDecoder<T>(run: () => T): T {
  const globals = globalThis as { TextDecoder?: typeof TextDecoder };
  const saved = globals.TextDecoder;
  globals.TextDecoder = undefined;
  try {
    return run();
  } finally {
    globals.TextDecoder = saved;
  }
}

describe('decodeUtf8', () => {
  it('decodes ASCII unchanged', () => {
    const text = '<trkpt lat="44.9" lon="5.8"></trkpt>';
    expect(decodeUtf8(utf8(text))).toBe(text);
  });

  it('decodes multi-byte characters of every length', () => {
    const text = 'manhã · €12 — 🚴 · 日本語';
    expect(decodeUtf8(utf8(text))).toBe(text);
  });

  it('resumes the ASCII run after a multi-byte character', () => {
    // An accented name appears early, then the rest of the file is ASCII: the
    // fallback must not decode those megabytes one character at a time.
    const text = `Corrida no parque — manhã ${'<trkpt lat="44.9" lon="5.8"></trkpt>'.repeat(5000)}`;
    expect(decodeUtf8(utf8(text))).toBe(text);
    expect(withoutPlatformDecoder(() => decodeUtf8(utf8(text)))).toBe(text);
  });

  it('decodes a run that spans the internal 8 KB boundary', () => {
    const text = `${'a'.repeat(8191)}ã${'b'.repeat(8191)}ã${'c'.repeat(100)}`;
    expect(withoutPlatformDecoder(() => decodeUtf8(utf8(text)))).toBe(text);
  });

  it('replaces invalid bytes with the replacement character', () => {
    const bytes = new Uint8Array([0x61, 0xff, 0x62]);
    expect(withoutPlatformDecoder(() => decodeUtf8(bytes))).toBe('a\uFFFDb');
  });

  it('replaces a truncated sequence at the end of the input', () => {
    // 0xE2 0x82 is the start of a three-byte sequence ("€") with no third byte.
    const bytes = new Uint8Array([0x61, 0xe2, 0x82]);
    expect(withoutPlatformDecoder(() => decodeUtf8(bytes))).toBe('a\uFFFD');
  });

  it('matches the platform decoder on mixed content', () => {
    const text = `Açaí — 42° ${'padding '.repeat(3000)}fim ✓`;
    const bytes = utf8(text);
    const platform = new TextDecoder('utf-8').decode(bytes);
    expect(withoutPlatformDecoder(() => decodeUtf8(bytes))).toBe(platform);
  });
});
