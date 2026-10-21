import { APP_CONFIG } from '@/constants';
import { WebDavTransportError } from '@/features/backup/services/webdavTransport';
import { normalizeEntryPath } from '@/features/strava-import/services/entryNames';
import { createMemoryByteSource, readZipEntries } from '@/features/strava-import/services/zipReader';
import JSZip from 'jszip';
import { readFileSync, writeFileSync } from 'node:fs';
import { seedCollection } from '../../scripts/strava-import-tool/seed';
import { DavClient } from '../../scripts/strava-import-tool/client';
import {
  CSV_HEADER,
  GPX_123,
  TEST_CONFIG,
  createFakeClient,
  markerJson,
  writeArchiveFixture,
  writeZipToTemp
} from '../helpers/desktopImportFixtures';

/**
 * Contract tests for the desktop seeder. These assert against `pullBackup` in
 * `src/features/backup/services/backupSync.ts` — the phone code the collection
 * must survive — not against the tool's own taste: marker first, state last,
 * md5 skips, tombstones honored, foreign folders refused.
 */

const originalTz = process.env.TZ;

afterEach(() => {
  // `applyTimezone` (called by seedCollection) pins the process zone; other
  // suites may run later in this worker.
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

/**
 * The machine's own zone: under `jest-expo` a runtime change of
 * `process.env.TZ` does not re-resolve V8's timezone (it works in a plain
 * node process — which is the tool's real habitat, where `applyTimezone`
 * verifies the pin and says so loudly otherwise). So the seed tests run the
 * seeder in the ambient zone and derive the expected local date with the same
 * `Intl` machinery `rowToActivity` uses, instead of assuming UTC.
 */
const machineZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const JAN14_UTC = Date.UTC(2024, 0, 14, 10, 0, 0);
const expectedLocalDate = new Intl.DateTimeFormat('en-CA', { timeZone: machineZone }).format(
  new Date(JAN14_UTC)
);

async function seed(fake = createFakeClient(), overrides: Record<string, unknown> = {}) {
  const archivePath = await writeArchiveFixture();
  return {
    fake,
    summary: await seedCollection({
      archivePath,
      timezone: machineZone,
      config: TEST_CONFIG,
      client: fake.client,
      ...overrides
    })
  };
}

describe('seedCollection on a fresh collection', () => {
  it('uploads every activity and stream the archive can provide', async () => {
    const { summary } = await seed();

    expect(summary.activitiesParsed).toBe(4);
    expect(summary.activitiesUploaded).toBe(4);
    expect(summary.uploadedActivityIds.sort()).toEqual(['123', '456', '789', '999']);
    expect(summary.streamsUploaded).toBe(2); // 123 and 999 have GPX
    expect(summary.uploadedStreamNames.sort()).toEqual(['123.json', '999.json']);
    expect(summary.activitiesWithoutTrack).toBe(1); // 456: manual entry
    expect(summary.unsupportedTracks).toBe(1); // 789: .fit
  });

  it('claims collection.json first and writes sync-state.json last', async () => {
    const { fake } = await seed();

    expect(fake.putOrder[0]).toBe('collection.json');
    expect(fake.putOrder[fake.putOrder.length - 1]).toBe('sync-state.json');
  });

  it('writes a marker with the current schema version and this profile', async () => {
    const { fake } = await seed();

    const marker = JSON.parse(fake.store.get('collection.json') as string);
    expect(marker).toEqual({
      appId: APP_CONFIG.BACKUP_APP_ID,
      profile: TEST_CONFIG.profile,
      schemaVersion: APP_CONFIG.BACKUP_SCHEMA_VERSION,
      createdAt: expect.any(String)
    });
  });

  it('writes binary stream payloads and complete activity records', async () => {
    const { fake } = await seed();

    const stream = fake.store.get('streams/123.json');
    expect(stream).toBeInstanceOf(Uint8Array);
    const bytes = stream as Uint8Array;
    expect(bytes[0]).toBe(0x4f); // 'OF' magic
    expect(bytes[1]).toBe(0x46);

    const activity = JSON.parse(fake.store.get('activities/123.json') as string);
    expect(activity.local_date).toBe(expectedLocalDate);
    expect(activity.start_latlng).toEqual([48.856614, 2.352222]);
    expect(activity.end_latlng).toEqual([48.858614, 2.354222]);
    // bounding_box was not in the rowToActivity literal: it must be appended
    // last, or the phone's re-serialisation would hash differently.
    const keys = Object.keys(activity);
    expect(keys[keys.length - 1]).toBe('bounding_box');
    expect(activity.bounding_box).toEqual([
      [48.856614, 2.352222],
      [48.858614, 2.354222]
    ]);
  });

  it('never uploads no-stream flags', async () => {
    const { fake } = await seed();

    const flagUploads = fake.putOrder.filter(name => name.endsWith('.nostreamflag'));
    expect(flagUploads).toEqual([]);
  });

  it('records the uploaded files in the sync state index', async () => {
    const { fake } = await seed();

    const state = JSON.parse(fake.store.get('sync-state.json') as string);
    expect(Object.keys(state.activityMd5).sort()).toEqual([
      '123.json',
      '456.json',
      '789.json',
      '999.json'
    ]);
    expect(Object.keys(state.streamMd5).sort()).toEqual(['123.json', '999.json']);
    expect(state.deletedAt).toEqual({});
    expect(state.syncedAt).toEqual(expect.any(String));
  });
});

describe('seedCollection against an existing collection', () => {
  it('is idempotent: a re-run uploads nothing but the state', async () => {
    const first = await seed();
    const stored: Record<string, string | Uint8Array> = {};
    first.fake.store.forEach((value, key) => (stored[key] = value));

    // checkpointEvery 1 proves the dirty flag: with nothing changed, even a
    // per-activity cadence must not add interim state writes.
    const { fake, summary } = await seed(createFakeClient(stored), { checkpointEvery: 1 });

    expect(summary.activitiesUploaded).toBe(0);
    expect(summary.streamsUploaded).toBe(0);
    expect(summary.activitiesSkipped).toBe(4);
    expect(summary.streamsSkipped).toBe(2);
    expect(fake.putOrder).toEqual(['sync-state.json']);
  });

  it('honors remote tombstones: no upload, stays out of the index, survives the rewrite', async () => {
    const deletedAt = { '999': new Date().toISOString() };
    const { fake, summary } = await seed(
      createFakeClient({
        'collection.json': markerJson(),
        'sync-state.json': JSON.stringify({
          syncedAt: '2024-01-01T00:00:00.000Z',
          activityMd5: { '999.json': 'stale-hash-from-before-the-rerun' },
          streamMd5: { '999.json': 'stale' },
          deletedAt
        })
      })
    );

    expect(summary.activitiesTombstoned).toBe(1);
    expect(fake.putOrder).not.toContain('activities/999.json');
    expect(fake.putOrder).not.toContain('streams/999.json');
    expect(fake.putOrder).toContain('activities/123.json'); // others still seed

    const state = JSON.parse(fake.store.get('sync-state.json') as string);
    expect(state.activityMd5['999.json']).toBeUndefined();
    expect(state.streamMd5['999.json']).toBeUndefined();
    expect(state.deletedAt).toEqual(deletedAt);
  });

  it('keeps index entries for files this archive does not contain', async () => {
    const { fake } = await seed(
      createFakeClient({
        'collection.json': markerJson(),
        'sync-state.json': JSON.stringify({
          activityMd5: { '5000.json': 'phone-push-hash' },
          streamMd5: {},
          deletedAt: {}
        })
      })
    );

    const state = JSON.parse(fake.store.get('sync-state.json') as string);
    expect(state.activityMd5['5000.json']).toBe('phone-push-hash');
  });

  it('re-claims an unreadable marker instead of refusing', async () => {
    const { fake, summary } = await seed(
      createFakeClient({ 'collection.json': '<html>login page</html>' })
    );

    expect(summary.failedTracks).toBe(0);
    const marker = JSON.parse(fake.store.get('collection.json') as string);
    expect(marker.appId).toBe(APP_CONFIG.BACKUP_APP_ID);
    expect(marker.schemaVersion).toBe(APP_CONFIG.BACKUP_SCHEMA_VERSION);
  });
});

describe('seedCollection refuses folders it does not own', () => {
  it('another profile', async () => {
    await expect(
      seed(createFakeClient({ 'collection.json': markerJson({ profile: 'someone-else' }) }))
    ).rejects.toThrow(/someone-else/);
  });

  it('another app', async () => {
    await expect(
      seed(createFakeClient({ 'collection.json': markerJson({ appId: 'some-other-app' }) }))
    ).rejects.toThrow(/some-other-app/);
  });

  it('an older layout version', async () => {
    await expect(
      seed(createFakeClient({ 'collection.json': markerJson({ schemaVersion: 1 }) }))
    ).rejects.toThrow(/layout version 1/);
  });

  it('a pre-versioning marker (no schemaVersion field) is read as layout 1 and refused', async () => {
    await expect(
      seed(
        createFakeClient({
          'collection.json': JSON.stringify({
            appId: 'offline-fitness',
            profile: 'bruno',
            createdAt: '2024-01-01T00:00:00.000Z'
          })
        })
      )
    ).rejects.toThrow(/layout version 1/);
  });
});

describe('seedCollection dry runs', () => {
  it('convert everything and touch nothing remotely', async () => {
    const fake = createFakeClient({ 'collection.json': '<html>should not be read</html>' });
    const { summary } = await seed(fake, { dryRun: true });

    expect(summary.activitiesParsed).toBe(4);
    expect(summary.streamsUploaded).toBe(2); // planned, nothing to skip against
    expect(fake.store.size).toBe(1); // only the fixture's marker
    expect(fake.putOrder).toEqual([]);
    expect(fake.folderCalls).toEqual([]);
  });
});

describe('seedCollection travel zones (Phase 4)', () => {
  // The fixture tracks start near Grenoble (48.86, 2.35); the fake lookup
  // claims that point belongs to the Azores, and everything else resolves to
  // "unknown" (falling back to --tz). A synthetic lookup keeps the test
  // independent of the geo-tz database the production CLI wires.
  const azoresAtGrenoble = (lat: number, lon: number): string | undefined =>
    lat > 48 && lat < 49 && lon > 2 && lon < 3 ? 'Atlantic/Azores' : undefined;

  it('derives local fields from the zone of the GPS start, not the fallback', async () => {
    const fake = createFakeClient();
    const archivePath = await writeArchiveFixture();
    const summary = await seedCollection({
      archivePath,
      timezone: machineZone,
      config: TEST_CONFIG,
      client: fake.client,
      lookupZone: azoresAtGrenoble
    });

    // Azores sits at UTC-1 in January: activity 123 (10:00 UTC) is 09:00
    // local — an hour earlier than the machine zone would file it — and the
    // record says which zone it was bucketed in.
    const activity = JSON.parse(fake.store.get('activities/123.json') as string);
    expect(activity.timezone).toBe('Atlantic/Azores');
    expect(activity.local_date).toBe('2024-01-14');
    expect(activity.local_time).toBe('09:00:00');
    expect(activity.utc_offset).toBe(-3600);

    // The manual (456) and .fit (789) rows have no fix: fallback zone. The
    // zone report makes the split auditable — this is the travel summary.
    expect(summary.zones['Atlantic/Azores']).toBe(2); // 123 and 999 share the track
    expect(summary.zones[machineZone]).toBe(2);
  });

  it('a far-enough zone can move an activity to a different calendar day', async () => {
    const fake = createFakeClient();
    const archivePath = await writeArchiveFixture();
    await seedCollection({
      archivePath,
      timezone: machineZone,
      config: TEST_CONFIG,
      client: fake.client,
      // UTC-12: 10:00 UTC on Jan 14 is 22:00 on Jan 13 — the day-crossing the
      // Colorado thought-experiment, made mechanical.
      lookupZone: () => 'Etc/GMT+12'
    });

    const activity = JSON.parse(fake.store.get('activities/123.json') as string);
    expect(activity.local_date).toBe('2024-01-13');
    expect(activity.local_time).toBe('22:00:00');
    expect(activity.start_day).toBe(13);
    expect(activity.utc_offset).toBe(-43200);
  });

  it('without a lookup, every record keeps the fallback zone (pre-Phase-4 bytes)', async () => {
    const withLookup = createFakeClient();
    const lookupSummary = await seedCollection({
      archivePath: await writeArchiveFixture(),
      timezone: machineZone,
      config: TEST_CONFIG,
      client: withLookup.client,
      lookupZone: azoresAtGrenoble
    });
    const plain = createFakeClient();
    const plainSummary = await seedCollection({
      archivePath: await writeArchiveFixture(),
      timezone: machineZone,
      config: TEST_CONFIG,
      client: plain.client
    });

    // The wiring itself: with the lookup, the GPS-clustered tracks change;
    // the GPS-less rows must stay byte-identical either way.
    expect(withLookup.store.get('activities/123.json')).not.toBe(
      plain.store.get('activities/123.json')
    );
    expect(withLookup.store.get('activities/456.json')).toBe(
      plain.store.get('activities/456.json')
    );
    // And without a lookup, the zone report collapses to the single fallback —
    // the exact pre-Phase-4 output, so existing collections stay byte-stable.
    expect(Object.keys(lookupSummary.zones).sort()).toEqual(
      [machineZone, 'Atlantic/Azores'].sort()
    );
    expect(Object.keys(plainSummary.zones)).toEqual([machineZone]);
  });
});

describe('seedCollection upload resilience', () => {
  it('retries a dropped PUT and still converges', async () => {    const base = createFakeClient();
    let attempts = 0;
    const flaky: DavClient = {
      ...base.client,
      putText: async (segments, body) => {
        if (segments.join('/') === 'activities/123.json') {
          attempts++;
          if (attempts < 3) throw new Error('fetch failed');
        }
        return base.client.putText(segments, body);
      }
    };
    const summary = await seedCollection({
      archivePath: await writeArchiveFixture(),
      timezone: machineZone,
      config: TEST_CONFIG,
      client: flaky
    });

    expect(attempts).toBe(3);
    expect(summary.failedTracks).toBe(0);
    expect(summary.activitiesUploaded).toBe(4);
    expect(summary.uploadedActivityIds).toContain('123');
  });

  it('aborts naming the file after exhausting retries', async () => {
    const base = createFakeClient();
    let attempts = 0;
    const dead: DavClient = {
      ...base.client,
      putText: async (segments, body) => {
        if (segments[0] === 'activities') {
          attempts++;
          throw new Error('fetch failed');
        }
        return base.client.putText(segments, body);
      }
    };
    await expect(
      seedCollection({
        archivePath: await writeArchiveFixture(),
        timezone: machineZone,
        config: TEST_CONFIG,
        client: dead
      })
    ).rejects.toThrow(/activity \d+: upload failed after 3 attempt\(s\): fetch failed/);
    // Every activity's record PUT retried to exhaustion (4 rows × 3).
    expect(attempts).toBe(12);
  });

  it('checkpoints let a re-run resume the completed prefix', async () => {
    const fake = createFakeClient();
    // Newest-first with concurrency 1: 999, 789, then 456 dies.
    const failing: DavClient = {
      ...fake.client,
      putText: async (segments, body) => {
        if (segments.join('/') === 'activities/456.json') throw new Error('fetch failed');
        return fake.client.putText(segments, body);
      }
    };
    const archivePath = await writeArchiveFixture();
    await expect(
      seedCollection({
        archivePath,
        timezone: machineZone,
        config: TEST_CONFIG,
        client: failing,
        concurrency: 1,
        checkpointEvery: 1
      })
    ).rejects.toThrow(/activity 456: upload failed after 3 attempt/);

    // The abort left a valid partial state: 999 + 789, no 456.
    const partial = JSON.parse(fake.store.get('sync-state.json') as string);
    expect(Object.keys(partial.activityMd5).sort()).toEqual(['789.json', '999.json']);

    // Heal and re-run: only the tail transfers.
    const summary = await seedCollection({
      archivePath,
      timezone: machineZone,
      config: TEST_CONFIG,
      client: fake.client,
      concurrency: 1
    });
    expect(summary.activitiesSkipped).toBe(2);
    expect(summary.activitiesUploaded).toBe(2);
    expect(summary.uploadedActivityIds.sort()).toEqual(['123', '456']);
    expect(summary.streamsSkipped).toBe(1); // 999's stream survived the abort
    expect(summary.streamsUploaded).toBe(1); // 123's
  });

  it('retries a transient 423 lock instead of aborting on it', async () => {
    // Nextcloud answers 423 when a second PUT hits a file the first still
    // holds — the normal shape of lock contention, not a refusal. rclone
    // treats it the same way: back off and retry.
    const base = createFakeClient();
    let attempts = 0;
    const locking: DavClient = {
      ...base.client,
      putText: async (segments, body) => {
        if (segments.join('/') === 'activities/123.json') {
          attempts++;
          if (attempts < 3) throw new WebDavTransportError('locked', 423);
        }
        return base.client.putText(segments, body);
      }
    };
    const summary = await seedCollection({
      archivePath: await writeArchiveFixture(),
      timezone: machineZone,
      config: TEST_CONFIG,
      client: locking
    });

    expect(attempts).toBe(3);
    expect(summary.failedTracks).toBe(0);
    expect(summary.uploadedActivityIds).toContain('123');
  });

  it('never overlaps two sync-state writes (server file lock)', async () => {
    // Regression test for the 423-at-750 failure: checkpoint PUTs fired by
    // different workers overlapped in time on sync-state.json. State writes
    // now go through one chain; with an artificial delay on the state path,
    // any overlap would show as concurrent executions.
    const base = createFakeClient();
    let inFlight = 0;
    let maxInFlight = 0;
    const slow: DavClient = {
      ...base.client,
      putText: async (segments, body) => {
        if (segments.join('/') === 'sync-state.json') {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise(resolve => setTimeout(resolve, 50));
          inFlight--;
        }
        return base.client.putText(segments, body);
      }
    };
    const summary = await seedCollection({
      archivePath: await writeArchiveFixture(),
      timezone: machineZone,
      config: TEST_CONFIG,
      client: slow,
      concurrency: 8,
      checkpointEvery: 1
    });

    expect(maxInFlight).toBe(1);
    expect(summary.activitiesUploaded).toBe(4);
    const state = JSON.parse(base.store.get('sync-state.json') as string);
    expect(Object.keys(state.activityMd5).sort()).toEqual([
      '123.json',
      '456.json',
      '789.json',
      '999.json'
    ]);
  });
});

describe('seedCollection swim canonicalisation', () => {
  it('uploads swims with moving_time = elapsed_time, even via the GPX type fallback', async () => {
    // 'Inconnu' does not map to a type; the GPX <type> makes it a Swim after
    // rowToActivity ran. The record on the server must already carry the
    // canonical moving time — otherwise the phone's push re-hashes it (its
    // read-time fix applies) and re-uploads those swims on every sync.
    const swimmingGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="Strava" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
 <trk><name>Drift</name><type>swimming</type><trkseg>
  <trkpt lat="45.5" lon="4.0"><ele>0</ele><time>2024-01-14T09:00:00Z</time></trkpt>
  <trkpt lat="45.6" lon="4.1"><ele>0</ele><time>2024-01-14T09:10:00Z</time></trkpt>
 </trkseg></trk>
</gpx>`;
    const zip = new JSZip();
    zip.file(
      'activities.csv',
      [
        CSV_HEADER,
        '777,"Jan 14, 2024, 10:00:00",Drift,Inconnu,activities/777.gpx,1000,1200,900,0.75,0,0,0,0'
      ].join('\n')
    );
    zip.file('activities/777.gpx', swimmingGpx);
    const archivePath = await writeZipToTemp(zip);

    const fake = createFakeClient();
    await seedCollection({
      archivePath,
      timezone: machineZone,
      config: TEST_CONFIG,
      client: fake.client
    });

    const activity = JSON.parse(fake.store.get('activities/777.json') as string);
    expect(activity.type).toBe('Swim');
    expect(activity.elapsed_time).toBe(1200);
    expect(activity.moving_time).toBe(1200); // not the CSV's 1000
  });
});

describe('seedCollection archive failures', () => {
  it('stops the run after 10 consecutive unreadable tracks instead of grinding', async () => {
    // Build a 12-track archive, then overwrite each track entry's LOCAL file
    // header signature — every track read then fails identically, which is
    // exactly the "the archive stopped being readable" shape the guard exists
    // for. Deterministic: the failure is structural, not random byte-flipping.
    const trackIds = Array.from({ length: 12 }, (_, index) => 1000 + index);
    const zip = new JSZip();
    zip.file(
      'activities.csv',
      [
        CSV_HEADER,
        ...trackIds.map(
          id => `${id},"Jan 14, 2024, 10:00:00",Loop ${id},Ride,activities/${id}.gpx,60,60,1000,16.67,5,0,10,20`
        )
      ].join('\n')
    );
    trackIds.forEach(id => zip.file(`activities/${id}.gpx`, GPX_123));
    const archivePath = await writeZipToTemp(zip);

    const archiveBytes = Buffer.from(readFileSync(archivePath));
    const entries = await readZipEntries(createMemoryByteSource(new Uint8Array(archiveBytes)));
    for (const entry of entries) {
      if (normalizeEntryPath(entry.name).startsWith('activities/')) {
        archiveBytes.writeUInt32LE(0xdeadbeef, entry.localHeaderOffset);
      }
    }
    writeFileSync(archivePath, archiveBytes);

    const fake = createFakeClient();
    await expect(
      seedCollection({
        archivePath,
        timezone: machineZone,
        config: TEST_CONFIG,
        client: fake.client
      })
    ).rejects.toThrow(/failed in a row/);
    // Aborting still throws — but the completed prefix is checkpointed as a
    // valid partial state (activity records upload fine even when their
    // tracks are unreadable), so a re-run resumes instead of redoing it.
    expect(fake.putOrder[fake.putOrder.length - 1]).toBe('sync-state.json');
    const partial = JSON.parse(fake.store.get('sync-state.json') as string);
    expect(Object.keys(partial.activityMd5).length).toBeGreaterThan(0);
    expect(Object.keys(partial.streamMd5)).toHaveLength(0);
  });

  it('a missing CSV is a hard error', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'not a strava export');
    const archivePath = await writeZipToTemp(zip, 'strava-tool-bad-');

    await expect(
      seedCollection({
        archivePath,
        timezone: machineZone,
        config: TEST_CONFIG,
        client: createFakeClient().client
      })
    ).rejects.toThrow(/activities\.csv was not found/);
  });

  it('an unknown timezone fails before any conversion', async () => {
    const archivePath = await writeArchiveFixture();
    await expect(
      seedCollection({
        archivePath,
        timezone: 'Mars/Olympus_Mons',
        config: TEST_CONFIG,
        client: createFakeClient().client
      })
    ).rejects.toThrow(/Unknown IANA timezone/);
  });
});
