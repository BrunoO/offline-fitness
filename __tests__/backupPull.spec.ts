import { Activity } from '@/shared';
import * as Storage from '@/shared/services/storage';
import { pullBackupNow } from '@/features/backup/services/backupSync';
import * as webdavAuth from '@/features/backup/services/webdavAuth';
import * as webdavTransport from '@/features/backup/services/webdavTransport';
import * as FileSystem from 'expo-file-system';

jest.mock('@/shared/services/storage');
jest.mock('@/features/backup/services/webdavAuth');
jest.mock('@/features/backup/services/webdavTransport');
jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  // Paths.document is a plain string ('doc'); Directory parents are objects
  // with .parent/.name — walk the chain to build the full path.
  const dirPathOf = (parent: unknown): string => {
    if (parent == null) return '';
    if (typeof parent === 'string') return parent;
    const base = dirPathOf((parent as { parent?: unknown }).parent);
    const name = (parent as { name?: string }).name ?? '';
    return base ? `${base}/${name}` : name;
  };
  // APP_CONFIG.STREAMS_FOLDER is 'streams/' (trailing slash), so normalize
  // the doubled separator when joining directory path and file name.
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
    create() {
      this.exists = true;
    }
  }
  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: 'doc' },
    CryptoDigestAlgorithm: { MD5: 'md5' },
    __mockFiles: files
  };
});

const mockStorage = Storage as jest.Mocked<typeof Storage>;
const mockTransport = webdavTransport as jest.Mocked<typeof webdavTransport>;
const mockAuth = webdavAuth as jest.Mocked<typeof webdavAuth>;
const mockFileSystem = FileSystem as unknown as { __mockFiles: Map<string, string> };

// jest.mock auto-mocks the class, so pullBackupNow's instanceof checks need
// the real constructor; re-expose it under the mocked module's shape.
const RealTransportError = jest.requireActual('@/features/backup/services/webdavTransport')
  .WebDavTransportError as typeof webdavTransport.WebDavTransportError;

(
  mockTransport as unknown as { WebDavTransportError: typeof RealTransportError }
).WebDavTransportError = RealTransportError;

const CONFIG = {
  baseUrl: 'https://x/dav/offline-fitness/tester',
  rootUrl: 'https://x/dav',
  profile: 'tester',
  username: 'u',
  password: 'p'
};

function makeActivity(id: string): Activity {
  return { id, name: `A${id}` } as unknown as Activity;
}

describe('pullBackupNow (restore)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFileSystem.__mockFiles.clear();
    mockAuth.loadWebDavConfig.mockResolvedValue(CONFIG);
    mockTransport.getDavFile.mockResolvedValue('{}');
  });

  it('throws when not configured', async () => {
    mockAuth.loadWebDavConfig.mockResolvedValue(null);

    await expect(pullBackupNow()).rejects.toThrow('not configured');
  });

  it('restores activities missing locally and skips ones already present', async () => {
    // Remote state advertises 1.json and 2.json; locally only 1.json exists.
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      if (segments[segments.length - 1] === 'sync-state.json') {
        return JSON.stringify({ activityMd5: { '1.json': 'aaa', '2.json': 'bbb' }, streamMd5: {} });
      }
      return JSON.stringify(makeActivity('2'));
    });
    mockStorage.getAllActivitiesKeys.mockResolvedValue(['1']);
    mockStorage.loadAllActivities.mockResolvedValue([makeActivity('1')]);
    mockStorage.storeActivity.mockResolvedValue(undefined);

    const summary = await pullBackupNow();

    expect(summary.restoredActivities).toBe(1);
    expect(summary.skippedActivities).toBe(1);
    expect(summary.errors).toHaveLength(0);
    expect(mockStorage.storeActivity).toHaveBeenCalledTimes(1);
    expect(mockStorage.storeActivity).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }));
  });

  it('restores streams that are missing locally and skips existing files', async () => {
    const mockFiles = mockFileSystem.__mockFiles;
    mockFiles.set('doc/streams/1.json', 'existing');
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      const folder = segments[segments.length - 2];
      if (folder === 'streams') return 'stream-content';
      return JSON.stringify({ activityMd5: {}, streamMd5: { '1.json': 'a', '2.json': 'b' } });
    });
    mockStorage.getAllActivitiesKeys.mockResolvedValue([]);

    const summary = await pullBackupNow();

    expect(summary.restoredStreams).toBe(1);
    expect(summary.skippedStreams).toBe(1);
    expect(mockFiles.get('doc/streams/2.json')).toBe('stream-content');
    expect(mockFiles.get('doc/streams/1.json')).toBe('existing'); // local wins
  });

  it('never overwrites a locally modified activity (local wins)', async () => {
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      if (segments[segments.length - 1] === 'sync-state.json') {
        return JSON.stringify({ activityMd5: { '1.json': 'remote-differs' } });
      }
      return JSON.stringify({ id: '1', name: 'REMOTE-NEWER' });
    });
    mockStorage.getAllActivitiesKeys.mockResolvedValue(['1']);
    mockStorage.loadAllActivities.mockResolvedValue([makeActivity('1')]);

    const summary = await pullBackupNow();

    expect(summary.skippedActivities).toBe(1);
    expect(summary.restoredActivities).toBe(0);
    expect(mockStorage.storeActivity).not.toHaveBeenCalled();
  });

  it('collects per-file errors without aborting the whole restore', async () => {
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      const name = segments[segments.length - 1];
      if (name === 'sync-state.json') {
        return JSON.stringify({ activityMd5: { 'bad.json': 'x', 'good.json': 'y' } });
      }
      if (name === 'bad.json') throw new Error('server hiccup');
      return JSON.stringify(makeActivity('good'));
    });
    mockStorage.getAllActivitiesKeys.mockResolvedValue([]);
    mockStorage.storeActivity.mockResolvedValue(undefined);

    const summary = await pullBackupNow();

    expect(summary.restoredActivities).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toContain('bad.json');
  });

  it('treats a missing remote sync state as nothing to restore', async () => {
    mockTransport.getDavFile.mockRejectedValue(new RealTransportError('not found', 404));
    mockStorage.getAllActivitiesKeys.mockResolvedValue([]);

    const summary = await pullBackupNow();

    expect(summary.restoredActivities).toBe(0);
    expect(summary.restoredStreams).toBe(0);
    expect(summary.errors).toHaveLength(0);
  });

  it('surfaces auth failures with a reconnect hint', async () => {
    mockTransport.getDavFile.mockRejectedValue(new RealTransportError('unauthorized', 401));
    mockStorage.getAllActivitiesKeys.mockResolvedValue([]);

    await expect(pullBackupNow()).rejects.toThrow('rejected the credentials');
  });

  it('rejects a downloaded file that is not a valid activity', async () => {
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      const name = segments[segments.length - 1];
      if (name === 'sync-state.json') {
        return JSON.stringify({ activityMd5: { '9.json': 'x' } });
      }
      return '<html>login page</html>';
    });
    mockStorage.getAllActivitiesKeys.mockResolvedValue([]);

    const summary = await pullBackupNow();

    expect(summary.restoredActivities).toBe(0);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toContain('not valid JSON');
    expect(mockStorage.storeActivity).not.toHaveBeenCalled();
  });
});
