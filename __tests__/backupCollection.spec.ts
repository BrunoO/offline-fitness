import { APP_CONFIG } from '@/constants';
import * as Storage from '@/shared/services/storage';
import { pullBackupNow, pushBackupNow } from '@/features/backup/services/backupSync';
import * as webdavAuth from '@/features/backup/services/webdavAuth';
import * as webdavTransport from '@/features/backup/services/webdavTransport';

jest.mock('@/shared/services/storage');
jest.mock('@/features/backup/services/webdavAuth');
jest.mock('@/features/backup/services/webdavTransport');
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { MD5: 'md5' },
  digestStringAsync: jest.fn(async () => 'md5-of-content')
}));
jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  const dirPathOf = (parent: unknown): string => {
    if (parent == null) return '';
    if (typeof parent === 'string') return parent;
    const base = dirPathOf((parent as { parent?: unknown }).parent);
    const name = (parent as { name?: string }).name ?? '';
    return base ? `${base}/${name}` : name;
  };
  const keyOf = (parent: unknown, name: string) => {
    const dir = dirPathOf(parent);
    return dir ? `${dir}/${name}`.replace('//', '/') : name;
  };
  class MockFile {
    exists: boolean;
    parent: unknown;
    name: string;
    constructor(parentArg: unknown, nameArg: string) {
      this.parent = parentArg;
      this.name = nameArg;
      this.exists = files.has(keyOf(parentArg, nameArg));
    }
    write(content: string) {
      files.set(keyOf(this.parent, this.name), content);
    }
    delete() {
      files.delete(keyOf(this.parent, this.name));
      this.exists = false;
    }
    async text() {
      return files.get(keyOf(this.parent, this.name)) ?? '';
    }
  }
  class MockDirectory {
    exists = true;
    parent: unknown;
    name: string;
    constructor(parentArg?: unknown, nameArg = '') {
      this.parent = parentArg;
      this.name = nameArg;
    }
    list(): unknown[] {
      return [];
    }
    create() {
      this.exists = true;
    }
  }
  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: 'doc' },
    __mockFiles: files
  };
});

const mockStorage = Storage as jest.Mocked<typeof Storage>;
const mockTransport = webdavTransport as jest.Mocked<typeof webdavTransport>;
const mockAuth = webdavAuth as jest.Mocked<typeof webdavAuth>;

const RealTransportError = jest.requireActual('@/features/backup/services/webdavTransport')
  .WebDavTransportError as typeof webdavTransport.WebDavTransportError;

(
  mockTransport as unknown as { WebDavTransportError: typeof RealTransportError }
).WebDavTransportError = RealTransportError;

const CONFIG = {
  baseUrl: 'https://x/dav/offline-fitness/bruno',
  rootUrl: 'https://x/dav',
  profile: 'bruno',
  username: 'u',
  password: 'p'
};

const MARKER_FILE = 'collection.json';

describe('collection marker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.loadWebDavConfig.mockResolvedValue(CONFIG);
    mockTransport.getDavFile.mockResolvedValue('{}');
    mockTransport.putDavFile.mockResolvedValue(undefined);
    mockTransport.deleteDavFile.mockResolvedValue(undefined);
    mockTransport.ensureDavFolder.mockResolvedValue(undefined);
    mockStorage.getAllActivitiesKeys.mockResolvedValue([]);
    mockStorage.loadAllActivities.mockResolvedValue([]);
    mockStorage.storeStringValue.mockResolvedValue(undefined);
    mockStorage.retrieveActivityTombstones.mockResolvedValue({});
    mockStorage.storeActivityTombstones.mockResolvedValue(undefined);
  });

  it('claims a fresh collection on the first push', async () => {
    mockTransport.getDavFile.mockRejectedValue(new RealTransportError('not found', 404));

    await pushBackupNow();

    const markerCall = mockTransport.putDavFile.mock.calls.find(call => call[1] === MARKER_FILE);
    expect(markerCall).toBeDefined();
    const marker = JSON.parse(String(markerCall?.[2]));
    expect(marker.appId).toBe('offline-fitness');
    expect(marker.profile).toBe('bruno');
    expect(marker.schemaVersion).toBe(APP_CONFIG.BACKUP_SCHEMA_VERSION);
  });

  it('refuses to push into a collection owned by another profile', async () => {
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      if (segments[segments.length - 1] === MARKER_FILE) {
        return JSON.stringify({
          appId: 'offline-fitness',
          profile: 'someone-else',
          schemaVersion: APP_CONFIG.BACKUP_SCHEMA_VERSION
        });
      }
      return '{}';
    });

    await expect(pushBackupNow()).rejects.toThrow('someone-else');
  });

  it('refuses to push into a collection owned by another app', async () => {
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      if (segments[segments.length - 1] === MARKER_FILE) {
        return JSON.stringify({ appId: 'some-other-app', profile: 'bruno' });
      }
      return '{}';
    });

    await expect(pushBackupNow()).rejects.toThrow('some-other-app');
  });

  it('refuses to push into a collection written in an older layout', async () => {
    // The v1 layout stores streams as JSON; pushing v2 payloads into the same
    // folder would leave the remote index listing both encodings.
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      if (segments[segments.length - 1] === MARKER_FILE) {
        return JSON.stringify({
          appId: 'offline-fitness',
          profile: 'bruno',
          schemaVersion: APP_CONFIG.BACKUP_SCHEMA_VERSION - 1
        });
      }
      return '{}';
    });

    await expect(pushBackupNow()).rejects.toThrow(/layout version/);
    // Refused before anything was written.
    expect(mockTransport.putDavFile).not.toHaveBeenCalled();
  });

  it('refuses to push into a collection written in a newer layout', async () => {
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      if (segments[segments.length - 1] === MARKER_FILE) {
        return JSON.stringify({
          appId: 'offline-fitness',
          profile: 'bruno',
          schemaVersion: APP_CONFIG.BACKUP_SCHEMA_VERSION + 1
        });
      }
      return '{}';
    });

    await expect(pushBackupNow()).rejects.toThrow(/layout version/);
  });

  it('reads a marker without a version as the legacy layout', async () => {
    // Markers written before versioning existed carry app id and profile only.
    // They must be reported as the version they are (1), not skipped as an
    // absent marker, or the version gate would be bypassable.
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      if (segments[segments.length - 1] === MARKER_FILE) {
        return JSON.stringify({ appId: 'offline-fitness', profile: 'bruno', createdAt: 'x' });
      }
      return '{}';
    });

    await expect(pushBackupNow()).rejects.toThrow(/layout version 1/);
  });

  it('keeps pushing when the marker matches', async () => {
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      if (segments[segments.length - 1] === MARKER_FILE) {
        return JSON.stringify({
          appId: 'offline-fitness',
          profile: 'bruno',
          schemaVersion: APP_CONFIG.BACKUP_SCHEMA_VERSION
        });
      }
      return '{}';
    });

    const summary = await pushBackupNow();

    expect(summary.errors).toHaveLength(0);
    // The marker is not rewritten when it is already ours.
    const markerCall = mockTransport.putDavFile.mock.calls.find(call => call[1] === MARKER_FILE);
    expect(markerCall).toBeUndefined();
  });

  it('refuses to restore from a collection owned by another profile', async () => {
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      if (segments[segments.length - 1] === MARKER_FILE) {
        return JSON.stringify({
          appId: 'offline-fitness',
          profile: 'someone-else',
          schemaVersion: APP_CONFIG.BACKUP_SCHEMA_VERSION
        });
      }
      return '{}';
    });

    await expect(pullBackupNow()).rejects.toThrow('someone-else');
    expect(mockStorage.storeActivity).not.toHaveBeenCalled();
  });

  it('refuses to restore from a collection written in an older layout', async () => {
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      if (segments[segments.length - 1] === MARKER_FILE) {
        return JSON.stringify({
          appId: 'offline-fitness',
          profile: 'bruno',
          schemaVersion: APP_CONFIG.BACKUP_SCHEMA_VERSION - 1
        });
      }
      if (segments[segments.length - 1] === 'sync-state.json') {
        return JSON.stringify({ activityMd5: { '1.json': 'x' }, streamMd5: {} });
      }
      return JSON.stringify({ id: '1' });
    });

    await expect(pullBackupNow()).rejects.toThrow(/layout version/);
    expect(mockStorage.storeActivity).not.toHaveBeenCalled();
  });

  it('restores from a collection without a marker (written before the marker existed)', async () => {
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      if (segments[segments.length - 1] === MARKER_FILE) {
        throw new RealTransportError('not found', 404);
      }
      if (segments[segments.length - 1] === 'sync-state.json') {
        return JSON.stringify({ activityMd5: { '1.json': 'x' }, streamMd5: {} });
      }
      return JSON.stringify({ id: '1' });
    });
    mockStorage.storeActivity.mockResolvedValue(undefined);

    const summary = await pullBackupNow();

    expect(summary.restoredActivities).toBe(1);
    expect(summary.errors).toHaveLength(0);
  });

  it('ignores an unreadable marker instead of failing the restore', async () => {
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      if (segments[segments.length - 1] === MARKER_FILE) {
        return '<html>login page</html>';
      }
      if (segments[segments.length - 1] === 'sync-state.json') {
        return JSON.stringify({ activityMd5: { '1.json': 'x' }, streamMd5: {} });
      }
      return JSON.stringify({ id: '1' });
    });
    mockStorage.storeActivity.mockResolvedValue(undefined);

    const summary = await pullBackupNow();

    expect(summary.restoredActivities).toBe(1);
    expect(summary.errors).toHaveLength(0);
  });
});
