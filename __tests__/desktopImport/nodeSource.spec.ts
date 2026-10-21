import { decodeUtf8 } from '@/features/strava-import/services/textDecode';
import { readZipEntries, readZipEntry } from '@/features/strava-import/services/zipReader';
import { readFileSync } from 'node:fs';
import {
  createNodeByteSource,
  NodeByteSource
} from '../../scripts/strava-import-tool/nodeSource';
import { GPX_123, writeArchiveFixture } from '../helpers/desktopImportFixtures';

/**
 * The Node `ByteSource` is the desktop counterpart of the phone's
 * `expoByteSource`: the ZIP reader is the app's own, so what the tool reads
 * through this seam must be exactly the bytes in the file.
 */

let archivePath: string;
let rawBytes: Buffer;
let source: NodeByteSource;

beforeAll(async () => {
  archivePath = await writeArchiveFixture();
  rawBytes = readFileSync(archivePath);
  source = createNodeByteSource(archivePath);
});

afterAll(() => {
  source.close();
  source.close(); // closing twice must be safe, not throw
});

describe('createNodeByteSource', () => {
  it('reports the file size', () => {
    expect(source.size).toBe(rawBytes.length);
  });

  it('reads ranges exactly', async () => {
    const head = await source.read(0, 4);
    expect(Array.from(head)).toEqual(Array.from(rawBytes.subarray(0, 4)));

    const middle = await source.read(1234, 567);
    expect(Array.from(middle)).toEqual(Array.from(rawBytes.subarray(1234, 1234 + 567)));
  });

  it('clamps reads past the end instead of failing', async () => {
    const tail = await source.read(rawBytes.length - 2, 1000);
    expect(tail.length).toBe(2);

    const beyond = await source.read(rawBytes.length, 10);
    expect(beyond.length).toBe(0);
  });

  it('feeds the app ZIP reader the whole fixture correctly', async () => {
    const entries = await readZipEntries(source);
    expect(entries.map(entry => entry.name)).toEqual(
      expect.arrayContaining(['activities.csv', 'activities/123.gpx'])
    );

    const gpxEntry = entries.find(entry => entry.name === 'activities/123.gpx');
    expect(gpxEntry).toBeDefined();
    const bytes = await readZipEntry(source, gpxEntry!);
    expect(decodeUtf8(bytes)).toBe(GPX_123);
  });

  it('serves concurrent range reads without corrupting offsets', async () => {
    // The real pattern: worker 8 and worker 3 interleave reads on one handle.
    // A shared-offset implementation would return the wrong bytes for at least
    // one of them; positional reads cannot.
    const ranges = [10, 100_000 % rawBytes.length, 50_000 % rawBytes.length, rawBytes.length - 50];
    const results = await Promise.all(ranges.map(offset => source.read(offset, 40)));
    results.forEach((result, index) => {
      expect(Array.from(result)).toEqual(
        Array.from(rawBytes.subarray(ranges[index], ranges[index] + result.length))
      );
    });
  });
});
