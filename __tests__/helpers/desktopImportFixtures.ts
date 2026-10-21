import { DavClient } from '../../scripts/strava-import-tool/client';
import JSZip from 'jszip';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Shared fixtures for the desktop import tool tests: a small but structurally
 * real Strava export (CSV + GPX + a .fit row + a manual row), an in-memory
 * `DavClient`, and the config the specs use.
 */

export const GPX_123 = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Strava" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Morning Loop</name><type>cycling</type><trkseg>
    <trkpt lat="48.856614" lon="2.352222"><ele>35.2</ele><time>2024-01-14T09:00:00Z</time></trkpt>
    <trkpt lat="48.857614" lon="2.353222"><ele>36.4</ele><time>2024-01-14T09:00:30Z</time></trkpt>
    <trkpt lat="48.858614" lon="2.354222"><ele>37.0</ele><time>2024-01-14T09:01:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`;

export const CSV_HEADER =
  'Activity Id,Activity Date,Activity Name,Activity Type,Filename,Moving Time,Elapsed Time,Distance,Average Speed,Elevation Gain,Elevation Loss,Elevation Low,Elevation High';

export const ACTIVITIES_CSV = [
  CSV_HEADER,
  '123,"Jan 14, 2024, 10:00:00 AM",Morning Loop,Ride,activities/123.gpx,60,60,1000,16.67,5,0,10,20',
  '456,"Jan 15, 2024, 08:00:00",Manual Walk,Walk,,120,120,500,4.17,0,0,0,0',
  '789,"Jan 16, 2024, 09:00:00",Fit Ride,Ride,activities/789.fit,60,60,1000,16.67,5,0,10,20',
  '999,"Jan 17, 2024, 09:00:00",Deleted Ride,Ride,activities/999.gpx,60,60,1000,16.67,5,0,10,20'
].join('\n');

/** Pack a JSZip and write it to a temp file; returns the path. */
export async function writeZipToTemp(zip: JSZip, prefix = 'strava-tool-'): Promise<string> {
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const archivePath = join(dir, 'export.zip');
  writeFileSync(archivePath, bytes);
  return archivePath;
}

/** Build a Strava-shaped export ZIP in a temp dir; returns its path. */
export async function writeArchiveFixture(): Promise<string> {
  const zip = new JSZip();
  zip.file('activities.csv', ACTIVITIES_CSV);
  zip.file('activities/123.gpx', GPX_123);
  zip.file('activities/999.gpx', GPX_123);
  zip.file('activities/789.fit', Buffer.from([0x00, 0x00, 0x03, 0x72])); // unparseable on purpose
  return writeZipToTemp(zip);
}

export interface FakeClient {
  client: DavClient;
  store: Map<string, string | Uint8Array>;
  putOrder: string[];
  folderCalls: string[][];
}

/** In-memory `DavClient`: `store` doubles as "what the server has". */
export function createFakeClient(initial: Record<string, string | Uint8Array> = {}): FakeClient {
  const store = new Map<string, string | Uint8Array>(Object.entries(initial));
  const putOrder: string[] = [];
  const folderCalls: string[][] = [];
  const key = (segments: string[]) => segments.join('/');

  const client: DavClient = {
    config: TEST_CONFIG,
    async ensureFolders() {
      folderCalls.push(['collection']);
    },
    async getText(segments) {
      const value = store.get(key(segments));
      if (value === undefined) return null;
      if (typeof value !== 'string') throw new Error(`${key(segments)} is binary`);
      return value;
    },
    async putText(segments, body) {
      store.set(key(segments), body);
      putOrder.push(key(segments));
    },
    async putBytes(segments, body) {
      store.set(key(segments), body);
      putOrder.push(key(segments));
    }
  };

  return { client, store, putOrder, folderCalls };
}

export const TEST_CONFIG = {
  baseUrl: 'https://srv.example/dav/offline-fitness/bruno',
  rootUrl: 'https://srv.example/dav/',
  profile: 'bruno',
  username: 'bruno',
  password: 'secret'
};

export function markerJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    appId: 'offline-fitness',
    profile: 'bruno',
    schemaVersion: 2,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  });
}
