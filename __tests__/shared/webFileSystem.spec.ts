/**
 * Web boot regression: `expo-file-system` has no web implementation — its
 * stubs warn "not supported on web" and throw on construction
 * (`this.validatePath is not a function`). Module-level
 * `new Directory(Paths.document, …)` therefore crashed the whole app at
 * *import* time on web, via the shared/activities barrels.
 *
 * This spec simulates the web stubs (throwing constructors) and pins that
 * (a) the service modules still import cleanly and (b) every stream/export
 * entry degrades instead of throwing.
 */
jest.mock('expo-file-system', () => {
  const boom = (): never => {
    throw new TypeError('this.validatePath is not a function');
  };
  return {
    Directory: class WebStubDirectory {
      constructor() {
        boom();
      }
    },
    File: class WebStubFile {
      constructor() {
        boom();
      }
    },
    Paths: { document: undefined }
  };
});

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn()
}));

jest.mock('../../src/shared/services/storage');

import { Platform } from 'react-native';
import {
  countStreamsStatus,
  deleteStreamFiles,
  getNoStreamIds,
  loadRawStreamForActivity,
  loadStreamForActivity
} from '../../src/features/activities/services/fetchAndStoreStreams';
import { buildManualActivity } from '../../src/features/activities/services/manualActivity';
import * as Storage from '../../src/shared/services/storage';
import { exportData } from '../../src/shared/services/exportData';
import { Activity } from '../../src/shared/types/types';

const mockStorage = Storage as jest.Mocked<typeof Storage>;

const yoga: Activity = buildManualActivity({
  type: 'Yoga',
  localDate: '2026-10-20',
  localTime: '18:30',
  durationMin: 60
});

describe('file-system-less platform (web stubs)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.getAllActivitiesKeys.mockResolvedValue([]);
    mockStorage.loadAllActivities.mockResolvedValue([]);
  });

  it('imports the service modules without touching the file system', () => {
    // The imports above already prove it: a module-level `new Directory`
    // would have thrown during collection, failing the whole suite.
    expect(loadStreamForActivity).toBeDefined();
    expect(exportData).toBeDefined();
  });

  it('stream readers degrade to empty results', async () => {
    await expect(loadStreamForActivity(yoga)).resolves.toBeNull();
    await expect(loadRawStreamForActivity(yoga)).resolves.toBeNull();
    // The no-stream derivation still works: with no cache to list, a record
    // without a GPS fix is classified as stream-less, exactly as designed.
    await expect(getNoStreamIds([yoga])).resolves.toEqual(new Set([yoga.id]));
    await expect(countStreamsStatus([yoga])).resolves.toEqual({
      downloadedStreams: 0,
      missingStreams: 1
    });
  });

  it('stream deletion is a no-op without a cache', () => {
    expect(() => deleteStreamFiles(yoga.id)).not.toThrow();
  });

  it('export resolves without throwing when there is no file system', async () => {
    // Everything is caught and logged inside exportData; the drawer also
    // pre-empts this with an explicit "not available on web" alert.
    await expect(exportData(() => {})).resolves.toBeUndefined();
  });

  it('export refuses explicitly on web', async () => {
    const originalOs = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    try {
      await expect(exportData(() => {})).rejects.toThrow('not available in the web version');
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalOs });
    }
  });
});
