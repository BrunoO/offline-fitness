import { Activity } from '@/shared';
import * as Storage from '@/shared/services/storage';
import { pullBackupNow } from '@/features/backup/services/backupSync';
import * as webdavAuth from '@/features/backup/services/webdavAuth';
import * as webdavTransport from '@/features/backup/services/webdavTransport';
import * as FileSystem from 'expo-file-system';
import { createHash } from 'crypto';

/** Test-side MD5, same bytes-in/hex-out contract as the mocked expo-crypto. */
function md5hex(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex');
}

jest.mock('@/shared/services/storage');
jest.mock('@/features/backup/services/webdavAuth');
jest.mock('@/features/backup/services/webdavTransport');
// Real MD5 (node-backed), not a constant: the restore now hashes local stream
// files, so the fixtures must carry hashes that genuinely match — or genuinely
// don't — the file contents. A constant mock would make every file "match".
jest.mock('expo-crypto', () => {
  const crypto = jest.requireActual('crypto') as typeof import('crypto');
  const md5hex = (data: string | Uint8Array): string =>
    crypto.createHash('md5').update(data).digest('hex');
  return {
    CryptoDigestAlgorithm: { MD5: 'MD5' },
    digestStringAsync: jest.fn(async (_algorithm: unknown, value: string) => md5hex(value)),
    digest: jest.fn(async (_algorithm: unknown, value: Uint8Array) => {
      const hex = md5hex(value);
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      }
      return bytes.buffer;
    })
  };
});
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
    mockStorage.storeMultiActivities.mockResolvedValue(undefined);

    const summary = await pullBackupNow();

    expect(summary.restoredActivities).toBe(1);
    expect(summary.restoredActivityIds).toEqual(['2']);
    expect(summary.skippedActivities).toBe(1);
    expect(summary.errors).toHaveLength(0);
    expect(mockStorage.storeMultiActivities).toHaveBeenCalledTimes(1);
    expect(mockStorage.storeMultiActivities).toHaveBeenCalledWith([
      expect.objectContaining({ id: '2' })
    ]);
  });

  it('restores streams that are missing locally and skips existing files', async () => {
    const mockFiles = mockFileSystem.__mockFiles;
    mockFiles.set('doc/streams/1.json', 'existing');
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      const folder = segments[segments.length - 2];
      if (folder === 'streams') return 'stream-content';
      // '1.json' hash genuinely matches the local file, so it stays skipped;
      // '2.json' is missing locally and downloads.
      return JSON.stringify({
        activityMd5: {},
        streamMd5: { '1.json': md5hex('existing'), '2.json': md5hex('stream-content') }
      });
    });
    mockStorage.getAllActivitiesKeys.mockResolvedValue([]);

    const summary = await pullBackupNow();

    expect(summary.restoredStreams).toBe(1);
    expect(summary.restoredStreamNames).toEqual(['2.json']);
    expect(summary.refreshedStreamNames).toEqual([]);
    expect(summary.skippedStreams).toBe(1);
    expect(mockFiles.get('doc/streams/2.json')).toBe('stream-content');
    expect(mockFiles.get('doc/streams/1.json')).toBe('existing'); // local wins
  });

  it('re-downloads a local stream whose bytes differ from the remote index', async () => {
    // The Phase-6 ping-pong: a wipe keeps the stream cache, restore used to
    // skip existing files unconditionally, and the next push re-uploaded the
    // stale copy over the server's good one — forever. A hash mismatch now
    // refreshes the file instead of preserving it.
    const mockFiles = mockFileSystem.__mockFiles;
    mockFiles.set('doc/streams/9.json', 'stale-bytes-from-an-older-generation');
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      const name = segments[segments.length - 1];
      if (name === 'sync-state.json') {
        return JSON.stringify({
          activityMd5: {},
          streamMd5: { '9.json': md5hex('fresh-bytes-from-server') }
        });
      }
      if (segments[segments.length - 2] === 'streams') return 'fresh-bytes-from-server';
      return '{}';
    });
    mockStorage.getAllActivitiesKeys.mockResolvedValue([]);

    const summary = await pullBackupNow();

    expect(summary.restoredStreams).toBe(1);
    expect(summary.restoredStreamNames).toEqual(['9.json']);
    expect(summary.refreshedStreamNames).toEqual(['9.json']);
    expect(summary.skippedStreams).toBe(0);
    expect(summary.errors).toHaveLength(0);
    expect(mockFiles.get('doc/streams/9.json')).toBe('fresh-bytes-from-server');
  });

  it('never re-downloads a tombstoned stream, even when the local copy differs', async () => {
    // Tombstone check runs before the hash check: a deliberately deleted
    // activity must not be resurrected by the refresh. The orphaned local
    // file is still cleaned up by the tombstone pass.
    const mockFiles = mockFileSystem.__mockFiles;
    mockFiles.set('doc/streams/9.json', 'stale-bytes');
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      const name = segments[segments.length - 1];
      if (name === 'sync-state.json') {
        return JSON.stringify({
          activityMd5: {},
          streamMd5: { '9.json': md5hex('fresh-bytes-from-server') },
          deletedAt: { '9': new Date().toISOString() }
        });
      }
      return '{}';
    });
    mockStorage.getAllActivitiesKeys.mockResolvedValue([]);

    const summary = await pullBackupNow();

    expect(summary.restoredStreams).toBe(0);
    expect(summary.skippedStreams).toBe(1);
    expect(summary.errors).toHaveLength(0);
    expect(mockFiles.has('doc/streams/9.json')).toBe(false); // orphan cleaned up
    const streamGets = mockTransport.getDavFile.mock.calls.filter(call => call[1] === 'streams');
    expect(streamGets).toHaveLength(0); // never even fetched
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
    expect(mockStorage.storeMultiActivities).not.toHaveBeenCalled();
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
    mockStorage.storeMultiActivities.mockResolvedValue(undefined);

    const summary = await pullBackupNow();

    expect(summary.restoredActivities).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toContain('bad.json');
  });

  it('writes restored activities in batches, not one storage call each', async () => {
    // 250 remote activities is the shape of a real seeded collection; the
    // point of the batching is that the phone never pays a native round trip
    // per record. Assert batches of <= 100 whose sizes sum to 250, spread
    // over several writes.
    const names = Array.from({ length: 250 }, (_, index) => `${index}.json`);
    mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
      const name = segments[segments.length - 1];
      if (name === 'sync-state.json') {
        return JSON.stringify({
          activityMd5: Object.fromEntries(names.map(entry => [entry, 'x'])),
          streamMd5: {}
        });
      }
      return JSON.stringify({ id: name.replace(/\.json$/, '') });
    });
    mockStorage.getAllActivitiesKeys.mockResolvedValue([]);
    mockStorage.storeMultiActivities.mockResolvedValue(undefined);

    const summary = await pullBackupNow();

    expect(summary.restoredActivities).toBe(250);
    expect(summary.errors).toHaveLength(0);
    const calls = mockStorage.storeMultiActivities.mock.calls;
    expect(calls.length).toBeGreaterThan(1);
    const sizes = calls.map(([batch]) => batch.length);
    expect(sizes.reduce((total, size) => total + size, 0)).toBe(250);
    for (const size of sizes) {
      expect(size).toBeLessThanOrEqual(100);
    }
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
      if (name === 'profile.json') {
        throw new RealTransportError('not found', 404);
      }
      return '<html>login page</html>';
    });
    mockStorage.getAllActivitiesKeys.mockResolvedValue([]);

    const summary = await pullBackupNow();

    expect(summary.restoredActivities).toBe(0);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toContain('not valid JSON');
    expect(mockStorage.storeMultiActivities).not.toHaveBeenCalled();
  });
});
