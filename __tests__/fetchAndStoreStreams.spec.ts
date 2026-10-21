import * as FileSystem from 'expo-file-system';
import { APP_CONFIG } from '../src/constants';
import {
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
