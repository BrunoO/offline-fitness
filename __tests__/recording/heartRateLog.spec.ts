/* eslint-disable @typescript-eslint/no-require-imports */
import { readHeartRateLog, heartRateLogUri, appendHeartRateSample } from '@/features/recording/services/heartRateLog';
import type { RecordingMeta } from '@/features/recording/services/gpsTracker';

const LOG_URI = 'file:///tmp/heartrate.jsonl';

function makeMeta(overrides: Partial<RecordingMeta> = {}): RecordingMeta {
  return {
    sessionId: 's-test-1',
    profile: 'walking',
    startedAtUtcMs: 1_000_000,
    deviceUtcOffsetSeconds: 7200,
    capture: { intervalMs: 1000, minDistanceM: 2.5, accuracyCeilingM: 15, useBarometer: true },
    pauses: [],
    fixCount: 0,
    logUri: 'file:///tmp/fixes.jsonl',
    libraryVersion: '0.1.0',
    ...overrides
  };
}

describe('heartRateLog', () => {
  beforeEach(() => {
    const { __clearMockFiles } = require('expo-file-system') as { __clearMockFiles: () => void };
    __clearMockFiles();
  });

  it('returns empty when file missing', () => {
    const result = readHeartRateLog(LOG_URI);
    expect(result.samples).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it('reads and sorts samples', () => {
    const { __setMockFiles } = require('expo-file-system') as {
      __setMockFiles: (files: Record<string, unknown>) => void;
    };
    const lines = [
      JSON.stringify({ t: 3, bpm: 72 }),
      JSON.stringify({ t: 1, bpm: 70 }),
      JSON.stringify({ t: 2, bpm: 71, rrMs: [850], contact: true })
    ].join('\n');
    __setMockFiles({ [LOG_URI]: lines });

    const result = readHeartRateLog(LOG_URI);
    expect(result.samples).toHaveLength(3);
    expect(result.samples.map(s => s.t)).toEqual([1, 2, 3]);
    expect(result.samples[1].rrMs).toEqual([850]);
    expect(result.skipped).toBe(0);
  });

  it('skips malformed lines', () => {
    const { __setMockFiles } = require('expo-file-system') as {
      __setMockFiles: (files: Record<string, unknown>) => void;
    };
    const lines = [JSON.stringify({ t: 1, bpm: 70 }), 'not json', JSON.stringify({ t: 2, bpm: 71 })].join('\n');
    __setMockFiles({ [LOG_URI]: lines });
    const result = readHeartRateLog(LOG_URI);
    expect(result.samples).toHaveLength(2);
    expect(result.skipped).toBe(1);
  });

  it('derives heartRateLogUri from meta.logUri', () => {
    const meta = makeMeta();
    expect(heartRateLogUri(meta)).toBe('file:///tmp/heartrate.jsonl');
  });

  it('appendHeartRateSample creates file when missing', () => {
    const { __setMockFiles } = require('expo-file-system') as any;
    __setMockFiles({});
    appendHeartRateSample(LOG_URI, { t: 1, bpm: 70 });
    const result = readHeartRateLog(LOG_URI);
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0].bpm).toBe(70);
  });

  it('appendHeartRateSample appends to existing file', () => {
    const { __setMockFiles } = require('expo-file-system') as any;
    __setMockFiles({ [LOG_URI]: JSON.stringify({ t: 1, bpm: 70 }) + '\n' });
    appendHeartRateSample(LOG_URI, { t: 2, bpm: 72 });
    const result = readHeartRateLog(LOG_URI);
    expect(result.samples).toHaveLength(2);
  });
});