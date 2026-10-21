import * as FileSystem from 'expo-file-system';
import { APP_CONFIG } from '../src/constants';
import {
  compressStreamSet,
  getActivityStreams,
  loadRawStreamForActivity
} from '../src/features/activities/services/fetchAndStoreStreams';
import { StreamSet } from '../src/features/activities/types/stravaActivityStream.model';
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

      expect(result.length).toBe(1);
      expect(result[0].activity.id).toBe('1');
      expect(result[0].streamSet).toBeDefined();
    });
  });
  describe('loadRawStreamForActivity', () => {
    const streamsFolder = new FileSystem.Directory(
      FileSystem.Paths.document,
      APP_CONFIG.STREAMS_FOLDER
    );

    it('should return the raw stream stored for an activity', async () => {
      const mockStream: StreamSet = {
        latlng: { data: [[1, 1]], original_size: 1, resolution: 'low', series_type: 'distance' }
      } as StreamSet;

      const file = new FileSystem.File(streamsFolder, '7.json');
      file.write(JSON.stringify(mockStream), { encoding: 'utf8' });

      const result = await loadRawStreamForActivity({ id: '7' } as Activity);

      expect(result).toEqual(mockStream);
    });

    it('should return null when no stream is stored', async () => {
      const result = await loadRawStreamForActivity({ id: '404' } as Activity);
      expect(result).toBeNull();
    });
  });
});
