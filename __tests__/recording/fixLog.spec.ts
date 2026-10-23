/* eslint-disable @typescript-eslint/no-require-imports */
import { GpsTracker } from '../../src/features/recording/services/gpsTracker';
import type { FixLogEntry, RecordingMeta } from '../../src/features/recording/services/gpsTracker';
import { readFixLog, sweepExpiredSessions } from '@/features/recording/services/fixLog';

const LOG_URI = 'file:///tmp/fixes.jsonl';
const SESSION_ID = 's-test-1';

function makeMeta(overrides: Partial<RecordingMeta> = {}): RecordingMeta {
  return {
    sessionId: SESSION_ID,
    profile: 'walking',
    startedAtUtcMs: 1_000_000,
    deviceUtcOffsetSeconds: 7200,
    capture: {
      intervalMs: 1000,
      minDistanceM: 2.5,
      accuracyCeilingM: 15,
      useBarometer: true
    },
    pauses: [],
    fixCount: 0,
    logUri: LOG_URI,
    libraryVersion: '0.1.0',
    ...overrides
  };
}

function encodeLog(entries: Partial<FixLogEntry>[]): string {
  return entries
    .map(entry =>
      JSON.stringify({
        t: entry.t ?? 1_000_000,
        lat: entry.lat ?? 45.0,
        lon: entry.lon ?? 6.0,
        ele: entry.ele ?? null,
        geoid: entry.geoid ?? null,
        pressure: entry.pressure ?? null,
        hAcc: entry.hAcc ?? 5,
        vAcc: entry.vAcc ?? null,
        speed: entry.speed ?? null,
        bearing: entry.bearing ?? null,
        source: entry.source ?? 'fused',
        accepted: entry.accepted ?? true,
        reason: entry.reason ?? null
      })
    )
    .join('\n');
}

jest.mock('../../src/features/recording/services/gpsTracker', () => ({
  GpsTracker: {
    listSessions: jest.fn(),
    discardSession: jest.fn()
  }
}));

describe('fixLog reader', () => {
  beforeEach(() => {
    const { __clearMockFiles } = require('expo-file-system') as { __clearMockFiles: () => void };
    __clearMockFiles();
  });

  it('reads every record with the default chunk size', async () => {
    const { __setMockFiles } = require('expo-file-system') as {
      __setMockFiles: (files: Record<string, unknown>) => void;
    };
    const entries = [{ t: 1 }, { t: 2 }, { t: 3 }];
    __setMockFiles({ [LOG_URI]: encodeLog(entries) });

    const result = await readFixLog(LOG_URI, makeMeta(), 1024);
    expect(result.fixes).toHaveLength(3);
    expect(result.fixes.map(fix => fix.t)).toEqual([1, 2, 3]);
    expect(result.skipped).toBe(0);
  });

  it('reads records when a record straddles a chunk boundary', async () => {
    const { __setMockFiles } = require('expo-file-system') as {
      __setMockFiles: (files: Record<string, unknown>) => void;
    };
    const entries = [{ t: 1 }, { t: 2 }, { t: 3 }, { t: 4 }];
    const encoded = encodeLog(entries);
    __setMockFiles({ [LOG_URI]: encoded });

    // A deliberately tiny chunk size, so at least one record straddles a
    // boundary. The reader must still yield every record intact.
    const result = await readFixLog(LOG_URI, makeMeta(), 7);
    expect(result.fixes).toHaveLength(4);
    expect(result.fixes.map(fix => fix.t)).toEqual([1, 2, 3, 4]);
    expect(result.skipped).toBe(0);
  });

  it('tolerates a truncated final line', async () => {
    const { __setMockFiles } = require('expo-file-system') as {
      __setMockFiles: (files: Record<string, unknown>) => void;
    };
    const encoded = encodeLog([{ t: 1 }, { t: 2 }]) + '\n{"t":3,"lat":45.0,"lon":6.0';
    __setMockFiles({ [LOG_URI]: encoded });

    const result = await readFixLog(LOG_URI, makeMeta(), 1024);
    expect(result.fixes).toHaveLength(2);
    expect(result.skipped).toBe(1);
  });

  it('skips malformed lines mid-file', async () => {
    const { __setMockFiles } = require('expo-file-system') as {
      __setMockFiles: (files: Record<string, unknown>) => void;
    };
    const encoded = `${JSON.stringify({ t: 1, lat: 45, lon: 6, ele: null, geoid: null, pressure: null, hAcc: 5, vAcc: null, speed: null, bearing: null, source: 'fused', accepted: true })}\nnot json\n${JSON.stringify({ t: 2, lat: 45, lon: 6, ele: null, geoid: null, pressure: null, hAcc: 5, vAcc: null, speed: null, bearing: null, source: 'fused', accepted: true })}`;
    __setMockFiles({ [LOG_URI]: encoded });

    const result = await readFixLog(LOG_URI, makeMeta(), 1024);
    expect(result.fixes).toHaveLength(2);
    expect(result.skipped).toBe(1);
  });

  it('repairs a missing endedAtUtcMs from the last fix', async () => {
    const { __setMockFiles } = require('expo-file-system') as {
      __setMockFiles: (files: Record<string, unknown>) => void;
    };
    const entries = [{ t: 10 }, { t: 20 }, { t: 30 }];
    __setMockFiles({ [LOG_URI]: encodeLog(entries) });

    const meta = makeMeta({ endedAtUtcMs: undefined });
    const result = await readFixLog(LOG_URI, meta, 1024);
    expect(result.recovered).toBe(true);
    expect(meta.endedAtUtcMs).toBe(30);
  });

  it('does not mark a session recovered when endedAtUtcMs is present', async () => {
    const { __setMockFiles } = require('expo-file-system') as {
      __setMockFiles: (files: Record<string, unknown>) => void;
    };
    const entries = [{ t: 10 }, { t: 20 }];
    __setMockFiles({ [LOG_URI]: encodeLog(entries) });

    const meta = makeMeta({ endedAtUtcMs: 999 });
    const result = await readFixLog(LOG_URI, meta, 1024);
    expect(result.recovered).toBe(false);
    expect(meta.endedAtUtcMs).toBe(999);
  });

  it('handles an empty log', async () => {
    const { __setMockFiles } = require('expo-file-system') as {
      __setMockFiles: (files: Record<string, unknown>) => void;
    };
    __setMockFiles({ [LOG_URI]: '' });

    const result = await readFixLog(LOG_URI, makeMeta(), 1024);
    expect(result.fixes).toHaveLength(0);
    expect(result.skipped).toBe(0);
    expect(result.recovered).toBe(false);
  });
});

describe('sweepExpiredSessions', () => {
  beforeEach(() => {
    const { __clearMockFiles } = require('expo-file-system') as { __clearMockFiles: () => void };
    __clearMockFiles();
    jest.clearAllMocks();
  });

  it('discards only saved sessions older than the retention window', async () => {
    const listSessions = jest.fn().mockResolvedValue([
      { sessionId: 'old-saved', savedActivityId: 'act-1', endedAtUtcMs: 0 },
      { sessionId: 'old-unfinished', savedActivityId: null, endedAtUtcMs: 0 },
      { sessionId: 'new-saved', savedActivityId: 'act-2', endedAtUtcMs: Date.now() }
    ]);
    const discardSession = jest.fn().mockResolvedValue(undefined);
    (GpsTracker.listSessions as jest.Mock).mockImplementation(listSessions);
    (GpsTracker.discardSession as jest.Mock).mockImplementation(discardSession);

    await sweepExpiredSessions();

    expect(discardSession).toHaveBeenCalledTimes(1);
    expect(discardSession).toHaveBeenCalledWith('old-saved');
  });
});
