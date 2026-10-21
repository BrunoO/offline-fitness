import {
  EncodableStreamSet,
  decodeStreamBytes,
  encodeStreamSet,
  isBinaryStream,
  parseStreamBytes,
  readStreamFile
} from '@/shared';

const SAMPLE_STREAM: EncodableStreamSet = {
  latlng: {
    data: [
      [44.905428, 5.789806],
      [-33.86882, 151.209296],
      [45.832622, 6.865175]
    ],
    series_type: 'distance',
    original_size: 3,
    resolution: 'high'
  },
  altitude: {
    data: [-12.4, 864.1, 4808.7],
    series_type: 'distance',
    original_size: 3,
    resolution: 'high'
  },
  time: {
    data: [0, 1, 3600],
    series_type: 'distance',
    original_size: 3,
    resolution: 'high'
  }
};

describe('streamCodec', () => {
  it('round-trips a stream set with zero precision loss', () => {
    const encoded = encodeStreamSet(SAMPLE_STREAM);

    expect(isBinaryStream(encoded)).toBe(true);
    // 16-byte header + 3 points * 16 bytes/point = 64 bytes
    expect(encoded.byteLength).toBe(16 + 3 * 16);

    const decoded = decodeStreamBytes(encoded);
    expect(decoded).toEqual(SAMPLE_STREAM);
  });

  it('decodes a subarray with a non-zero byteOffset', () => {
    const encoded = encodeStreamSet(SAMPLE_STREAM);
    const padded = new Uint8Array(encoded.byteLength + 7);
    padded.set(encoded, 5);
    const view = padded.subarray(5, 5 + encoded.byteLength);

    expect(decodeStreamBytes(view)).toEqual(SAMPLE_STREAM);
  });

  it('handles partial stream sets when optional series are absent', () => {
    const partial: EncodableStreamSet = {
      latlng: {
        data: [[45.1, 6.2]],
        series_type: 'distance',
        original_size: 1,
        resolution: 'high'
      }
    };

    const encoded = encodeStreamSet(partial);
    expect(encoded.byteLength).toBe(16 + 8);
    expect(decodeStreamBytes(encoded)).toEqual(partial);
  });

  it('distinguishes binary streams from legacy JSON bytes', () => {
    const jsonBytes = new TextEncoder().encode(JSON.stringify(SAMPLE_STREAM));
    expect(isBinaryStream(jsonBytes)).toBe(false);
    expect(parseStreamBytes(jsonBytes)).toEqual(SAMPLE_STREAM);

    const binBytes = encodeStreamSet(SAMPLE_STREAM);
    expect(isBinaryStream(binBytes)).toBe(true);
    expect(parseStreamBytes(binBytes)).toEqual(SAMPLE_STREAM);
  });

  it('reads both binary and legacy JSON files via readStreamFile', async () => {
    const binBytes = encodeStreamSet(SAMPLE_STREAM);
    const fromBin = await readStreamFile({
      bytes: async () => binBytes,
      text: async () => {
        throw new Error('text() should not be called when bytes() is available');
      }
    });
    expect(fromBin).toEqual(SAMPLE_STREAM);

    const jsonText = JSON.stringify(SAMPLE_STREAM);
    const fromJsonBytes = await readStreamFile({
      bytes: async () => new TextEncoder().encode(jsonText),
      text: async () => jsonText
    });
    expect(fromJsonBytes).toEqual(SAMPLE_STREAM);

    const fromTextFallback = await readStreamFile({
      text: async () => jsonText
    });
    expect(fromTextFallback).toEqual(SAMPLE_STREAM);
  });

  it('rejects corrupt or unsupported binary headers', () => {
    expect(() => decodeStreamBytes(new Uint8Array([0x4f, 0x46, 1]))).toThrow(/Invalid binary/);

    const badVersion = encodeStreamSet(SAMPLE_STREAM);
    badVersion[2] = 99;
    expect(() => decodeStreamBytes(badVersion)).toThrow(/Unsupported binary stream version: 99/);

    const truncated = encodeStreamSet(SAMPLE_STREAM).subarray(0, 20);
    expect(() => decodeStreamBytes(truncated)).toThrow(/Truncated binary stream file/);
  });
});
