import JSZip from 'jszip';
import pako from 'pako';
import {
  createMemoryByteSource,
  gunzipEntry,
  isGzip,
  isZip,
  readZipEntries,
  readZipEntry
} from '@/features/strava-import/services/zipReader';

/**
 * The ZIP reader is exercised through the `ByteSource` seam with an in-memory
 * source, so no native file system is involved. Archives are produced by JSZip
 * (already a dependency) to keep the fixtures honest about real structure.
 */

const buildZip = async (
  files: Record<string, string>,
  compression: 'DEFLATE' | 'STORE'
): Promise<Uint8Array> => {
  const zip = new JSZip();
  Object.entries(files).forEach(([name, content]) => zip.file(name, content));
  return zip.generateAsync({ type: 'uint8array', compression });
};

const GPX = `<gpx creator="StravaGPX" version="1.1"><trk><type>walking</type><trkseg><trkpt lat="44.9" lon="5.7"><ele>864</ele><time>2023-10-15T05:50:05Z</time></trkpt></trkseg></trk></gpx>`;

describe('readZipEntries', () => {
  it('lists every entry with its sizes and offset', async () => {
    const bytes = await buildZip(
      {
        'activities.csv': 'Activity ID,Activity Date\n1,Oct 14, 2026, 10:00:00\n',
        'activities/1.gpx': GPX,
        'media/photo.jpg': 'binary'
      },
      'DEFLATE'
    );

    const entries = await readZipEntries(createMemoryByteSource(bytes));

    expect(entries.map(entry => entry.name).sort()).toEqual([
      'activities.csv',
      'activities/1.gpx',
      'media/photo.jpg'
    ]);
    const gpxEntry = entries.find(entry => entry.name === 'activities/1.gpx')!;
    expect(gpxEntry.method).toBe(8);
    expect(gpxEntry.uncompressedSize).toBe(GPX.length);
    expect(gpxEntry.compressedSize).toBeGreaterThan(0);
  });

  it('reads stored (uncompressed) entries too', async () => {
    const bytes = await buildZip({ 'activities.csv': 'Activity ID\n1\n' }, 'STORE');
    const entries = await readZipEntries(createMemoryByteSource(bytes));

    expect(entries[0].method).toBe(0);
    const content = await readZipEntry(createMemoryByteSource(bytes), entries[0]);
    expect(new TextDecoder().decode(content)).toBe('Activity ID\n1\n');
  });

  it('rejects files that are not ZIP archives', async () => {
    const notAZip = new Uint8Array([0x67, 0x70, 0x78, 0x21, 0x00, 0x00]);
    await expect(readZipEntries(createMemoryByteSource(notAZip))).rejects.toThrow(/ZIP/);
  });

  it('reports archive signatures for the pre-flight check', async () => {
    const bytes = await buildZip({ 'activities.csv': 'Activity ID\n1\n' }, 'DEFLATE');
    expect(isZip(bytes)).toBe(true);
    expect(isZip(new Uint8Array([1, 2, 3, 4]))).toBe(false);
  });
});

describe('readZipEntry', () => {
  it('inflates deflated entries byte for byte', async () => {
    const csv = 'Activity ID,Activity Name\n1,Marche à midi\n';
    const bytes = await buildZip({ 'activities.csv': csv }, 'DEFLATE');
    const entries = await readZipEntries(createMemoryByteSource(bytes));

    const content = await readZipEntry(createMemoryByteSource(bytes), entries[0]);
    expect(new TextDecoder().decode(content)).toBe(csv);
  });

  it('reads only the requested entry from a multi-entry archive', async () => {
    const files: Record<string, string> = { 'activities.csv': 'header\n' };
    for (let i = 0; i < 50; i++) files[`activities/${i}.gpx`] = GPX + `<!--${i}-->`;

    const bytes = await buildZip(files, 'DEFLATE');
    const source = createMemoryByteSource(bytes);
    const entries = await readZipEntries(source);
    const target = entries.find(entry => entry.name === 'activities/42.gpx')!;

    const content = await readZipEntry(source, target);
    expect(new TextDecoder().decode(content)).toBe(GPX + '<!--42-->');
  });
});

describe('gzip helpers', () => {
  it('detects and expands gzip payloads', () => {
    // pako is used for both directions so the fixture matches what Strava
    // writes into `activities/*.gpx.gz`.
    const gzipped = pako.gzip(new TextEncoder().encode(GPX));

    expect(isGzip(gzipped)).toBe(true);
    expect(isGzip(new TextEncoder().encode(GPX))).toBe(false);
    expect(new TextDecoder().decode(gunzipEntry(gzipped))).toBe(GPX);
  });
});
