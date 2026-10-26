import * as FileSystem from 'expo-file-system';
import { APP_CONFIG } from '../src/constants';
import {
  calculateAdaptiveTolerance,
  compressStreamSet,
  countStreamsStatus,
  getActivityStreams,
  getNoStreamIds,
  loadRawStreamForActivity
} from '../src/features/activities/services/fetchAndStoreStreams';
import { StreamSet } from '../src/features/activities/types/stravaActivityStream.model';
import { makeTestActivity } from './helpers/testActivities';
import { encodeStreamSet } from '../src/shared';
import { Activity } from '../src/shared/types/types';

describe('fetchAndStoreStreams', () => {
  beforeEach(() => {
    // Reset mocks before each test
    (FileSystem as unknown as { __clearMockFiles: () => void }).__clearMockFiles();
  });

  describe('compressStreamSet', () => {
    it('should compress a stream set', () => {
      const streamSet: StreamSet = {
        latlng: {
          data: [
            [1, 2],
            [3, 4]
          ],
          original_size: 2,
          resolution: 'high',
          series_type: 'distance'
        },
        altitude: { data: [10, 20], original_size: 2, resolution: 'high', series_type: 'distance' },
        time: { data: [100, 200], original_size: 2, resolution: 'high', series_type: 'distance' },
        distance: { data: [0, 100], original_size: 2, resolution: 'high', series_type: 'distance' }
      };

      const compressed = compressStreamSet(streamSet);

      expect(compressed.coordinates).toEqual([
        { latitude: 1, longitude: 2 },
        { latitude: 3, longitude: 4 }
      ]);
      expect(compressed.altitude).toEqual([10, 20]);
      expect(compressed.time).toEqual([100, 200]);
    });

    it('maintains 1-to-1 alignment between coordinates, altitude, time, and heartrate when points are simplified', () => {
      const streamSet: StreamSet = {
        latlng: {
          data: [
            [45.0, 5.0],
            [45.0005, 5.0005],
            [45.001, 5.001]
          ],
          original_size: 3,
          resolution: 'high',
          series_type: 'distance'
        },
        altitude: { data: [100, 110, 120], original_size: 3, resolution: 'high', series_type: 'distance' },
        time: { data: [0, 10, 20], original_size: 3, resolution: 'high', series_type: 'distance' },
        heartrate: { data: [130, 135, 140], original_size: 3, resolution: 'high', series_type: 'distance' }
      };

      const compressed = compressStreamSet(streamSet);
      expect(compressed.coordinates).toHaveLength(2);
      expect(compressed.time).toHaveLength(2);
      expect(compressed.altitude).toHaveLength(2);
      expect(compressed.heartrate).toHaveLength(2);

      expect(compressed.time).toEqual([0, 20]);
      expect(compressed.altitude).toEqual([100, 120]);
      expect(compressed.heartrate).toEqual([130, 140]);
    });

    it('preserves fine turns for swim tracks with adaptive tolerance', () => {
      // 50m pool swim track with 4 laps of 25m:
      // ~0.00022 degrees lat is ~25m.
      // Small lateral deviation of ~4 meters (~0.000036 deg).
      // Under legacy 0.0001 (~11m) tolerance, the lateral turn would be completely deleted.
      // Under adaptive swim tolerance (~0.8-1.5m), the turn is preserved.
      const swimStreamSet: StreamSet = {
        latlng: {
          data: [
            [45.0, 5.0],
            [45.0001, 5.00004], // 4m deviation at midpoint of first lap
            [45.00022, 5.0], // turn at end of 25m pool
            [45.00011, 5.00004], // return lap
            [45.0, 5.0] // back to start
          ],
          original_size: 5,
          resolution: 'high',
          series_type: 'distance'
        },
        time: { data: [0, 10, 25, 40, 55], original_size: 5, resolution: 'high', series_type: 'distance' }
      };

      const compressed = compressStreamSet(swimStreamSet, { activityType: 'Swim' });
      // All 5 points should be preserved because lateral deviation (4m) exceeds the swim tolerance (~0.8m)
      expect(compressed.coordinates.length).toBe(5);
    });

    it('respects explicit tolerance option override', () => {
      const streamSet: StreamSet = {
        latlng: {
          data: [
            [45.0, 5.0],
            [45.0001, 5.00005],
            [45.0002, 5.0]
          ],
          original_size: 3,
          resolution: 'high',
          series_type: 'distance'
        }
      };

      // With huge tolerance, middle point is removed
      const wideCompressed = compressStreamSet(streamSet, { tolerance: 0.1 });
      expect(wideCompressed.coordinates).toHaveLength(2);

      // With tiny tolerance, middle point is retained
      const tightCompressed = compressStreamSet(streamSet, { tolerance: 0.0000001 });
      expect(tightCompressed.coordinates).toHaveLength(3);
    });
  });

  describe('calculateAdaptiveTolerance', () => {
    it('returns default tolerance for tracks with 2 or fewer points', () => {
      expect(calculateAdaptiveTolerance([])).toBe(0.0001);
      expect(calculateAdaptiveTolerance([[45.0, 5.0]])).toBe(0.0001);
      expect(calculateAdaptiveTolerance([[45.0, 5.0], [45.001, 5.001]])).toBe(0.0001);
    });

    it('computes tight tolerance for short swim tracks', () => {
      // 100m track: span ~0.0009 degrees
      const swimPoints: [number, number][] = [
        [45.0, 5.0],
        [45.0004, 5.0004],
        [45.0008, 5.0008]
      ];

      const tolerance = calculateAdaptiveTolerance(swimPoints, 'Swim');
      // ~0.8m / 111139 ≈ 7.2e-6 degrees
      expect(tolerance).toBeLessThan(0.00002);
      expect(tolerance).toBeGreaterThan(0.000005);
    });

    it('computes capped tolerance for long ride tracks', () => {
      // 50km ride: span ~0.45 degrees
      const ridePoints: [number, number][] = [
        [45.0, 5.0],
        [45.2, 5.2],
        [45.4, 5.4]
      ];

      const tolerance = calculateAdaptiveTolerance(ridePoints, 'Ride');
      // 10.0m / 111139 ≈ 9.0e-5 degrees
      expect(tolerance).toBeCloseTo(10.0 / 111_139, 6);
    });
  });
  describe('getActivityStreams', () => {
    const mockActivities: Activity[] = [
      { id: '1', name: 'A1' } as Activity,
      { id: '2', name: 'A2' } as Activity
    ];
    const streamsFolder = new FileSystem.Directory(
      FileSystem.Paths.document,
      APP_CONFIG.STREAMS_FOLDER
    );

    it('should load streams for activities that have them', async () => {
      const mockStream: StreamSet = {
        latlng: { data: [[1, 1]], original_size: 1, resolution: 'low', series_type: 'distance' }
      } as StreamSet;

      const file1 = new FileSystem.File(streamsFolder, '1.json');
      file1.write(JSON.stringify(mockStream), { encoding: 'utf8' });

      const result = await getActivityStreams(mockActivities);

      expect(result).toHaveLength(1);
      expect(result[0].activity.id).toBe('1');
      expect(result[0].streamSet).toBeDefined();
    });
  });
  describe('loadRawStreamForActivity', () => {
    const streamsFolder = new FileSystem.Directory(
      FileSystem.Paths.document,
      APP_CONFIG.STREAMS_FOLDER
    );

    it('should return the raw stream stored for an activity (legacy JSON)', async () => {
      const mockStream: StreamSet = {
        latlng: { data: [[1, 1]], original_size: 1, resolution: 'low', series_type: 'distance' }
      } as StreamSet;

      const file = new FileSystem.File(streamsFolder, '7.json');
      file.write(JSON.stringify(mockStream), { encoding: 'utf8' });

      const result = await loadRawStreamForActivity({ id: '7' } as Activity);

      expect(result).toEqual(mockStream);
    });

    it('should return the raw stream stored in binary format', async () => {
      const mockStream: StreamSet = {
        latlng: {
          data: [
            [44.905428, 5.789806],
            [44.905402, 5.789781]
          ],
          original_size: 2,
          resolution: 'high',
          series_type: 'distance'
        },
        altitude: {
          data: [864, 867.3],
          original_size: 2,
          resolution: 'high',
          series_type: 'distance'
        },
        time: { data: [0, 4], original_size: 2, resolution: 'high', series_type: 'distance' }
      };

      const file = new FileSystem.File(streamsFolder, '8.json');
      file.write(encodeStreamSet(mockStream));

      const result = await loadRawStreamForActivity({ id: '8' } as Activity);

      expect(result).toEqual(mockStream);
    });

    it('should return null when no stream is stored', async () => {
      const result = await loadRawStreamForActivity({ id: '404' } as Activity);
      expect(result).toBeNull();
    });
  });

  describe('getNoStreamIds / countStreamsStatus (derived, post-Phase-5)', () => {
    const streamsFolder = new FileSystem.Directory(
      FileSystem.Paths.document,
      APP_CONFIG.STREAMS_FOLDER
    );

    // Shaped like tool-seeded data: a GPS fix means a track was converted;
    // no fix plus no cached file means there will never be a stream. Built on
    // the shared complete-Activity helper, with only start_latlng overridden.
    const record = (id: string, start_latlng: number[]): Activity => ({
      ...makeTestActivity({ id }),
      start_latlng
    });
    const activities: Activity[] = [
      record('1', [44.9, 5.79]),
      record('2', [44.9, 5.79]),
      record('3', []),
      record('4', [])
    ];

    beforeEach(() => {
      // '4' has a cached stream despite the empty position fields (a legacy
      // record whose fields never got backfilled) — the file check covers it.
      new FileSystem.File(streamsFolder, '1.json').write('x');
      new FileSystem.File(streamsFolder, '4.json').write('x');
    });

    it('flags exactly the records with neither a GPS fix nor a cached stream', async () => {
      const ids = await getNoStreamIds(activities);
      expect([...ids]).toEqual(['3']);
    });

    it('counts cached .json files only, and the derived missing set', async () => {
      new FileSystem.File(streamsFolder, '3.nostreamflag').write(''); // legacy leftover
      const status = await countStreamsStatus(activities);
      expect(status).toEqual({ downloadedStreams: 2, missingStreams: 1 });
    });

    it('derives no missing records from an empty set, even with cached files', async () => {
      // The two beforeEach files exist, but with no records nothing is
      // derived as missing — and nothing is downloaded from an empty list.
      const status = await countStreamsStatus([]);
      expect(status).toEqual({ downloadedStreams: 2, missingStreams: 0 });
      expect(await getNoStreamIds([])).toEqual(new Set());
    });
  });
});
