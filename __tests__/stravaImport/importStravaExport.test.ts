import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import JSZip from 'jszip';
import { decodeStreamBytes, isBinaryStream } from '@/shared';
import { loadAllActivities } from '@/shared/services/storage';
import { importStravaExport } from '@/features/strava-import/services/importStravaExport';

/**
 * End-to-end test of the archive import against a virtual file system.
 *
 * The virtual FS supports random-access reads, so the real ZIP reader, GPX
 * parser, activity mapper and storage writers all run — only the platform
 * primitives are replaced.
 */

interface VirtualFileEntry {
  bytes: Uint8Array;
}

const mockVirtualFiles = new Map<string, VirtualFileEntry>();
const mockVirtualDirectories = new Set<string>();
/** Counts archive copies, so a test can prove a copy was skipped. */
const mockCopyCount = { count: 0 };
/** URIs whose `open()` throws, standing in for a provider that hands out a pipe. */
const mockUnseekable = new Set<string>();
/** The live-state object the importer mutates, shared with the mock. */
const mockLiveState: {
  state: import('@/features/strava-import/types/import.types').ImportLiveState | null;
} = { state: null };
/** Sub-step recorded at each stream/flag write, to prove the live granularity. */
const mockStepLog: string[] = [];
/** When >= 0, reads throw once the count runs out, standing in for a dead handle. */
const mockReadFailAfter = { remaining: -1 };

jest.mock('expo-file-system', () => {
  class VirtualDirectory {
    uri: string;
    name: string;

    constructor(pathOrDir: { uri: string } | string, name = '') {
      const base = typeof pathOrDir === 'string' ? pathOrDir : pathOrDir.uri;
      this.name = name;
      this.uri = name ? `${base}${name}` : base;
    }

    get exists() {
      return mockVirtualDirectories.has(this.uri.replace(/\/$/, ''));
    }

    create() {
      mockVirtualDirectories.add(this.uri.replace(/\/$/, ''));
    }

    list() {
      const prefix = this.uri;
      return [...mockVirtualFiles.keys()]
        .filter(uri => uri.startsWith(prefix))
        .map(uri => new VirtualFile(this, uri.substring(prefix.length)));
    }
  }

  class VirtualFile {
    uri: string;
    name: string;

    constructor(pathOrDir: { uri: string } | string, name = '') {
      const base = typeof pathOrDir === 'string' ? pathOrDir : pathOrDir.uri;
      this.name = name;
      this.uri = name ? `${base}${name}` : base;
    }

    get exists() {
      return mockVirtualFiles.has(this.uri);
    }

    get size() {
      return mockVirtualFiles.get(this.uri)?.bytes.length ?? 0;
    }

    async copy(destination: VirtualFile) {
      mockCopyCount.count += 1;
      const source = mockVirtualFiles.get(this.uri);
      if (!source) throw new Error(`File not found: ${this.uri}`);
      mockVirtualFiles.set(destination.uri, { bytes: source.bytes.slice() });
    }

    delete() {
      mockVirtualFiles.delete(this.uri);
    }

    write(content: string | Uint8Array) {
      mockStepLog.push(mockLiveState.state?.step ?? 'none');
      const bytes =
        content instanceof Uint8Array
          ? content.slice()
          : new TextEncoder().encode(String(content));
      mockVirtualFiles.set(this.uri, { bytes });
    }

    async text() {
      const entry = mockVirtualFiles.get(this.uri);
      if (!entry) throw new Error(`File not found: ${this.uri}`);
      return new TextDecoder().decode(entry.bytes);
    }

    async bytes() {
      const entry = mockVirtualFiles.get(this.uri);
      if (!entry) throw new Error(`File not found: ${this.uri}`);
      return entry.bytes.slice();
    }

    open() {
      if (mockUnseekable.has(this.uri)) {
        throw new Error('File descriptor is not seekable');
      }
      const entry = mockVirtualFiles.get(this.uri);
      if (!entry) throw new Error(`File not found: ${this.uri}`);
      const state = { offset: 0 };
      return {
        get offset() {
          return state.offset;
        },
        set offset(value: number) {
          state.offset = value;
        },
        readBytes(length: number) {
          if (mockReadFailAfter.remaining === 0) {
            throw new Error('java.io.IOException: Bad file descriptor');
          }
          if (mockReadFailAfter.remaining > 0) mockReadFailAfter.remaining -= 1;
          return entry.bytes.slice(state.offset, state.offset + length);
        },
        close() {}
      };
    }
  }

  return {
    File: VirtualFile,
    Directory: VirtualDirectory,
    Paths: { document: 'file:///documents/', cache: 'file:///cache/' },
    FileMode: { ReadOnly: 'r', ReadWrite: 'rw' },
    __mockCopyCount: mockCopyCount
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
 <trk>
  <name>Marche matinale</name>
  <type>walking</type>
  <trkseg>
   <trkpt lat="44.9054280" lon="5.7898060"><ele>864.0</ele><time>2023-10-15T05:50:05Z</time></trkpt>
   <trkpt lat="44.9054060" lon="5.7897890"><ele>864.1</ele><time>2023-10-15T05:50:06Z</time></trkpt>
   <trkpt lat="44.9054020" lon="5.7897810"><ele>864.2</ele><time>2023-10-15T05:50:07Z</time></trkpt>
  </trkseg>
 </trk>
</gpx>`;

const CSV = `Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Max Heart Rate,Relative Effort,Commute,Activity Private Note,Activity Gear,Filename,Athlete Weight,Bike Weight,Elapsed Time,Moving Time,Distance,Max Speed,Average Speed,Elevation Gain,Elevation Loss,Elevation Low,Elevation High
100,"Oct 15, 2023, 5:50:05 AM",Marche matinale,Walk,,3600,2.8,,,,,,activities/100.gpx,,,3600,3500,2825.4,2.93,1.202,9.4,9.4,203.7,210.4
200,"Oct 16, 2023, 7:00:00 AM",Yoga du matin,Yoga,,1800,0,,,,,,,1800,1800,,,,,,,
`;

/**
 * A CSV whose activities all point at the same track. Twelve of them, so a
 * run of read failures can reach the abort threshold.
 */
const MANY_ACTIVITIES_CSV = `${CSV.split('\n')[0]}
${Array.from({ length: 12 }, (_, index) => {
  const id = 3000 + index;
  return `${id},"Oct 15, 2023, 5:50:05 AM",Sortie ${index},Walk,,3600,2.8,,,,,,activities/100.gpx,,,3600,3500,2825.4,2.93,1.202,9.4,9.4,203.7,210.4`;
}).join('\n')}
`;

const ARCHIVE_PATH = 'file:///cache/strava-export-import.zip';
const PICKED_PATH = 'file:///picked/export_6466806.zip';

async function buildArchiveWith(csv: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('activities.csv', csv);
  zip.file('activities/100.gpx', GPX);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function buildArchive(): Promise<Uint8Array> {
  return buildArchiveWith(CSV);
}

const pickedFile = (): File => new File('file:///picked/', 'export_6466806.zip');

describe('importStravaExport', () => {
  let summary: Awaited<ReturnType<typeof importStravaExport>>;

  beforeAll(async () => {
    mockVirtualFiles.set(PICKED_PATH, { bytes: await buildArchive() });
    mockVirtualDirectories.add('file:///documents');
    mockVirtualFiles.set('file:///documents/streams/999.json', { bytes: new Uint8Array([1]) });
    summary = await importStravaExport(pickedFile());
  });

  it('stores both activities with their canonical fields', async () => {
    const keys = await AsyncStorage.getAllKeys();
    expect(keys).toEqual(expect.arrayContaining(['a_100', 'a_200']));

    const stored = new Map(await AsyncStorage.multiGet(['a_100', 'a_200']));
    const walk = JSON.parse(String(stored.get('a_100')));
    const yoga = JSON.parse(String(stored.get('a_200')));

    expect(walk).toMatchObject({
      id: '100',
      type: 'Walk',
      distance: 2825.4,
      moving_time: 3500,
      elapsed_time: 3600,
      start_timestamp_utc: Date.UTC(2023, 9, 15, 5, 50, 5),
      start_latlng: [44.905428, 5.789806]
    });
    expect(walk.start_date_local.endsWith('Z')).toBe(true);
    expect(walk.local_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(walk.bounding_box).toBeDefined();

    expect(yoga).toMatchObject({ id: '200', type: 'Yoga', start_latlng: [] });
  });

  it('writes a binary-encoded stream for the GPX activity', async () => {
    const streamFile = mockVirtualFiles.get('file:///documents/streams/100.json');
    expect(streamFile).toBeDefined();
    expect(isBinaryStream(streamFile!.bytes)).toBe(true);

    const stream = decodeStreamBytes(streamFile!.bytes);
    expect(stream.latlng?.data).toHaveLength(3);
    expect(stream.altitude?.data).toEqual([864, 864.1, 864.2]);
    expect(stream.time?.data).toEqual([0, 1, 2]);
    expect(stream.latlng?.original_size).toBe(3);
  });

  it('flags activities without a track so they are never retried', () => {
    expect(mockVirtualFiles.has('file:///documents/streams/200.nostreamflag')).toBe(true);
    expect(mockVirtualFiles.has('file:///documents/streams/100.nostreamflag')).toBe(false);
  });

  it('reports what it did', () => {
    expect(summary).toMatchObject({
      activitiesImported: 2,
      streamsImported: 1,
      streamsAlreadyPresent: 0,
      streamsWithoutTrack: 0,
      activitiesWithoutFile: 1,
      unsupportedFiles: 0,
      failedFiles: 0,
      cancelled: false
    });
    expect(summary.timezone.length).toBeGreaterThan(0);
  });

  it('copies the picked archive before reading it', async () => {
    mockVirtualFiles.set(PICKED_PATH, { bytes: await buildArchive() });
    const copiesBefore = mockCopyCount.count;

    const result = await importStravaExport(pickedFile());

    expect(result.failedFiles).toBe(0);
    expect(mockCopyCount.count).toBe(copiesBefore + 1);
    // The copy is a working file, not something to keep.
    expect(mockVirtualFiles.has(ARCHIVE_PATH)).toBe(false);
  });

  it('imports even when the picked file cannot be opened for random access', async () => {
    mockVirtualFiles.set(PICKED_PATH, { bytes: await buildArchive() });
    mockUnseekable.add(PICKED_PATH);

    try {
      // The importer must never read the content:// URI directly: its descriptor
      // does not survive a long run (Bad file descriptor), so everything is read
      // from the copy.
      const result = await importStravaExport(pickedFile());
      expect(result.failedFiles).toBe(0);
      expect(result.streamsImported + result.streamsAlreadyPresent).toBeGreaterThan(0);
    } finally {
      mockUnseekable.delete(PICKED_PATH);
    }
  });

  it('gives up when the archive stops being readable', async () => {
    mockVirtualFiles.set(PICKED_PATH, { bytes: await buildArchiveWith(MANY_ACTIVITIES_CSV) });
    const copiesBefore = mockCopyCount.count;

    let armed = false;
    const run = importStravaExport(pickedFile(), {
      onProgress: progress => {
        if (progress.phase === 'streams' && !armed) {
          armed = true;
          // From here every read behaves like a closed file descriptor.
          mockReadFailAfter.remaining = 0;
        }
      }
    });

    try {
      await expect(run).rejects.toThrow(/tracks failed in a row/);
    } finally {
      mockReadFailAfter.remaining = -1;
    }

    expect(mockCopyCount.count).toBe(copiesBefore + 1);
    // An aborted run still cleans up and does not leave a half-written cache.
    expect(mockVirtualFiles.has(ARCHIVE_PATH)).toBe(false);
  });

  it('drops the working copy even when the run is interrupted', async () => {
    mockVirtualFiles.set(PICKED_PATH, { bytes: await buildArchive() });
    mockUnseekable.add(PICKED_PATH);

    try {
      const interrupted = await importStravaExport(pickedFile(), { shouldCancel: () => true });
      expect(interrupted.cancelled).toBe(true);
      expect(mockVirtualFiles.has(ARCHIVE_PATH)).toBe(false);
    } finally {
      mockUnseekable.delete(PICKED_PATH);
    }
  });

  it('reports the step it is inside while it runs', async () => {
    mockVirtualFiles.set(PICKED_PATH, { bytes: await buildArchive() });
    // A fresh track, so this run really writes a stream file.
    mockVirtualFiles.delete('file:///documents/streams/100.json');
    mockStepLog.length = 0;

    const result = await importStravaExport(pickedFile(), {
      onLiveState: state => {
        mockLiveState.state = state;
      }
    });

    // The stream write happened while the live state named that step, so a slow
    // write would have been attributable instead of just "no progress".
    expect(mockStepLog).toContain('writing-stream');
    // The run finishes idle and the live view shares the summary's timings.
    expect(mockLiveState.state?.step).toBe('idle');
    expect(mockLiveState.state?.timings).toBe(result.timings);
  });

  it('lets timers run while it works, so a polling screen can keep up', async () => {
    mockVirtualFiles.set(PICKED_PATH, { bytes: await buildArchiveWith(MANY_ACTIVITIES_CSV) });
    const samples: string[] = [];
    // Stands in for the running screen: it can only see the live state when the
    // importer hands the JS thread back. The file calls it makes are
    // synchronous, so a loop that never yields starves this timer entirely.
    const poll = setInterval(() => {
      if (mockLiveState.state) samples.push(mockLiveState.state.step);
    }, 0);

    try {
      await importStravaExport(pickedFile(), {
        onLiveState: state => {
          mockLiveState.state = state;
        }
      });
    } finally {
      clearInterval(poll);
    }

    // Every track yields before its read and before its write, so the poller
    // catches the import inside both steps rather than only at the end.
    expect(samples).toContain('reading-track');
    expect(samples).toContain('writing-stream');
    expect(samples.length).toBeGreaterThan(10);
  });

  it('reports a timing breakdown', () => {
    const { timings } = summary;
    expect(Object.values(timings).every(value => Number.isFinite(value))).toBe(true);
    expect(timings.total).toBeGreaterThan(0);

    // The measured phases are sequential slices of the same run, so they can
    // never add up to more than the wall clock.
    const phases =
      timings.copyArchive +
      timings.readDirectory +
      timings.parseCsv +
      timings.writeActivities +
      timings.readTracks +
      timings.parseTracks +
      timings.writeStreams +
      timings.writeTrackFields;
    expect(phases).toBeLessThanOrEqual(timings.total);
  });

  it('is idempotent: a second import keeps existing streams', async () => {
    mockVirtualFiles.set(PICKED_PATH, { bytes: await buildArchive() });
    const second = await importStravaExport(pickedFile());

    expect(second.streamsImported).toBe(0);
    expect(second.streamsAlreadyPresent).toBe(1);
    expect(second.activitiesImported).toBe(2);
  });

  it('keeps the track fields of activities whose stream is already stored', async () => {
    mockVirtualFiles.set(PICKED_PATH, { bytes: await buildArchive() });
    await importStravaExport(pickedFile());

    const stored = new Map(await AsyncStorage.multiGet(['a_100']));
    const walk = JSON.parse(String(stored.get('a_100')));

    // A CSV row carries no track data, so a naive re-import would blank these.
    expect(walk.start_latlng).toEqual([44.905428, 5.789806]);
    expect(walk.end_latlng).toEqual([44.905402, 5.789781]);
    expect(walk.bounding_box).toBeDefined();
  });

  it('repairs a record that lost its track fields while the stream is on disk', async () => {
    const stored = new Map(await AsyncStorage.multiGet(['a_100']));
    const damaged = JSON.parse(String(stored.get('a_100')));
    damaged.start_latlng = [];
    damaged.end_latlng = [];
    delete damaged.bounding_box;
    await AsyncStorage.setItem('a_100', JSON.stringify(damaged));

    mockVirtualFiles.set(PICKED_PATH, { bytes: await buildArchive() });
    const repair = await importStravaExport(pickedFile());
    expect(repair.streamsAlreadyPresent).toBe(1);

    const repaired = new Map(await AsyncStorage.multiGet(['a_100']));
    const walk = JSON.parse(String(repaired.get('a_100')));
    expect(walk.start_latlng).toEqual([44.905428, 5.789806]);
    expect(walk.end_latlng).toEqual([44.905402, 5.789781]);
    expect(walk.bounding_box).toBeDefined();
  });

  it('clears a stale no-stream marker once the track is stored', async () => {
    mockVirtualFiles.set('file:///documents/streams/100.nostreamflag', { bytes: new Uint8Array() });
    mockVirtualFiles.delete('file:///documents/streams/100.json');

    mockVirtualFiles.set(PICKED_PATH, { bytes: await buildArchive() });
    const result = await importStravaExport(pickedFile());
    expect(result.streamsImported).toBe(1);

    expect(mockVirtualFiles.has('file:///documents/streams/100.json')).toBe(true);
    expect(mockVirtualFiles.has('file:///documents/streams/100.nostreamflag')).toBe(false);
  });

  it('can be cancelled between phases', async () => {
    mockVirtualFiles.set(PICKED_PATH, { bytes: await buildArchive() });
    const cancelled = await importStravaExport(pickedFile(), { shouldCancel: () => true });

    expect(cancelled.cancelled).toBe(true);
  });

  it('rejects a file that is not a ZIP archive', async () => {
    mockVirtualFiles.set('file:///picked/notes.zip', {
      bytes: new TextEncoder().encode('this is not a zip')
    });
    const notAZip = new File('file:///picked/', 'notes.zip');

    await expect(importStravaExport(notAZip)).rejects.toThrow(/not a ZIP archive/);
  });
});

describe('importStravaExport swim canonicalisation', () => {
  const SWIM_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
 <trk>
  <name>Crawl</name>
  <type>swimming</type>
  <trkseg>
   <trkpt lat="44.9054280" lon="5.7898060"><ele>0</ele><time>2023-10-15T05:50:05Z</time></trkpt>
   <trkpt lat="44.9054060" lon="5.7897890"><ele>0</ele><time>2023-10-15T05:50:35Z</time></trkpt>
  </trkseg>
 </trk>
</gpx>`;

  const SWIM_CSV = `Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Max Heart Rate,Relative Effort,Commute,Activity Private Note,Activity Gear,Filename,Athlete Weight,Bike Weight,Elapsed Time,Moving Time,Distance,Max Speed,Average Speed,Elevation Gain,Elevation Loss,Elevation Low,Elevation High
500,"Oct 15, 2023, 5:50:05 AM",Crawl,Swim,,3600,1500,,,,,,activities/500.gpx,,,3600,1400,1500,0,0,0,0,0,0
501,"Oct 15, 2023, 6:50:05 AM",Drift,Inconnu,,1200,900,,,,,,activities/501.gpx,,,1200,1000,900,0,0,0,0,0,0
`;

  beforeAll(async () => {
    const zip = new JSZip();
    zip.file('activities.csv', SWIM_CSV);
    zip.file('activities/500.gpx', SWIM_GPX);
    zip.file('activities/501.gpx', SWIM_GPX);
    mockVirtualFiles.set(PICKED_PATH, { bytes: await zip.generateAsync({ type: 'uint8array' }) });
    await importStravaExport(pickedFile());
  });

  it('writes swims with moving_time = elapsed_time at write time, on both type paths', async () => {
    const stored = new Map(await AsyncStorage.multiGet(['a_500', 'a_501']));
    const csvSwim = JSON.parse(String(stored.get('a_500')));
    const gpxSwim = JSON.parse(String(stored.get('a_501')));

    // CSV said moving 1400 / elapsed 3600: the canonical value is stored.
    expect(csvSwim.type).toBe('Swim');
    expect(csvSwim.moving_time).toBe(3600);

    // 'Inconnu' is unmapped; the GPX <type> made it a Swim after mapping —
    // the fallback must re-apply the canonicalisation too, or the backup
    // push would hash a different record than the one on the server.
    expect(gpxSwim.type).toBe('Swim');
    expect(gpxSwim.moving_time).toBe(1200);
  });

  it('the stored record equals what the backup push hashes (no read-time drift)', async () => {
    const [, raw] = (await AsyncStorage.multiGet(['a_500']))[0];
    // The push does exactly this: load through the storage layer (which still
    // applies the legacy read-time swim fix) and re-serialise. With the
    // canonical write the fix is a no-op, so the hash matches the file the
    // desktop tool uploaded — the property that stops the 200-swim churn.
    const [loaded] = await loadAllActivities(['a_500']);
    expect(JSON.stringify(loaded)).toBe(raw);
  });
});
