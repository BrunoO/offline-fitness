import { Activity } from '@/shared';
import * as Storage from '@/shared/services/storage';
import { pullBackupNow, pushBackupNow } from '@/features/backup/services/backupSync';
import * as webdavAuth from '@/features/backup/services/webdavAuth';
import * as webdavTransport from '@/features/backup/services/webdavTransport';
import * as FileSystem from 'expo-file-system';

jest.mock('@/shared/services/storage');
jest.mock('@/features/backup/services/webdavAuth');
jest.mock('@/features/backup/services/webdavTransport');
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { MD5: 'md5' },
  digestStringAsync: jest.fn(async () => 'md5-of-content')
}));
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
      if (parentArg != null && typeof parentArg !== 'string') {
        this.exists = [...files.keys()].some(key =>
          key.startsWith(`${dirPathOf(parentArg)}/`.replace('//', '/'))
        );
      }
    }
    list(): unknown[] {
      const prefix = `${dirPathOf(this)}/`.replace('//', '/');
      return [...files.keys()]
        .filter(key => key.startsWith(prefix))
        .map(key => {
          const file = new MockFile(this, key.slice(prefix.length));
          return file;
        });
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
const mockFileSystem = FileSystem as unknown as { __mockFiles: Map<string, string> };

// jest.mock auto-mocks the class, so pushBackupNow's instanceof checks need
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

describe('deletion tombstones', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFileSystem.__mockFiles.clear();
    mockAuth.loadWebDavConfig.mockResolvedValue(CONFIG);
    mockTransport.getDavFile.mockResolvedValue('{}');
    mockTransport.putDavFile.mockResolvedValue(undefined);
    mockTransport.deleteDavFile.mockResolvedValue(undefined);
    mockTransport.ensureDavFolder.mockResolvedValue(undefined);
    mockStorage.storeStringValue.mockResolvedValue(undefined);
  });

  describe('push (propagating local deletions)', () => {
    it('deletes the remote activity and stream files and records the tombstone in the remote state', async () => {
      // Remote has 1.json (still local) and 2.json (deleted locally, tombstoned).
      const remoteState = {
        syncedAt: '2026-01-01T00:00:00Z',
        activityMd5: { '1.json': 'aaa', '2.json': 'bbb' },
        streamMd5: { '1.json': 'ccc', '2.json': 'ddd' }
      };
      mockTransport.getDavFile.mockResolvedValue(JSON.stringify(remoteState));
      mockStorage.getAllActivitiesKeys.mockResolvedValue(['a_1']);
      mockStorage.loadAllActivities.mockResolvedValue([makeActivity('1')]);
      mockFileSystem.__mockFiles.set('doc/streams/1.json', 'stream-1');
      mockStorage.retrieveActivityTombstones.mockResolvedValue({
        '2': new Date().toISOString()
      });
      mockStorage.storeActivityTombstones.mockResolvedValue(undefined);

      const summary = await pushBackupNow();

      expect(mockTransport.deleteDavFile).toHaveBeenCalledWith(CONFIG, 'activities', '2.json');
      expect(mockTransport.deleteDavFile).toHaveBeenCalledWith(CONFIG, 'streams', '2.json');
      expect(mockTransport.deleteDavFile).toHaveBeenCalledWith(CONFIG, 'streams', '2.nostreamflag');
      expect(summary.deletedRemote).toBe(1);
      expect(summary.deletedRemoteIds).toEqual(['2']);
      // The applied tombstone stays in the local log until the retention
      // window expires — the remote deletedAt map is rebuilt from it on
      // every push, so other devices keep learning about the deletion.
      expect(mockStorage.storeActivityTombstones).toHaveBeenCalledWith({
        '2': expect.any(String)
      });
      // Remote state carries the tombstone and no longer lists 2.json.
      const stateCall = mockTransport.putDavFile.mock.calls.find(
        call => call[1] === 'sync-state.json'
      );
      expect(stateCall).toHaveLength(3);
      const writtenState = JSON.parse(String(stateCall?.[2]));
      expect(writtenState.activityMd5).toEqual({ '1.json': expect.any(String) });
      expect(Object.keys(writtenState.streamMd5)).toEqual(['1.json']);
      expect(Object.keys(writtenState.deletedAt)).toEqual(['2']);
    });

    it('drops the tombstone when the activity exists locally again (local wins)', async () => {
      // The activity was re-fetched from Strava after the deletion: it is
      // local again, so the delete is undone and the file re-uploaded.
      mockTransport.getDavFile.mockResolvedValue(
        JSON.stringify({ activityMd5: {}, streamMd5: {} })
      );
      mockStorage.getAllActivitiesKeys.mockResolvedValue(['a_1']);
      mockStorage.loadAllActivities.mockResolvedValue([makeActivity('1')]);
      mockStorage.retrieveActivityTombstones.mockResolvedValue({
        '1': new Date().toISOString()
      });
      mockStorage.storeActivityTombstones.mockResolvedValue(undefined);

      const summary = await pushBackupNow();

      expect(mockTransport.deleteDavFile).not.toHaveBeenCalled();
      expect(summary.deletedRemote).toBe(0);
      expect(summary.uploadedActivities).toBe(1);
      expect(mockStorage.storeActivityTombstones).toHaveBeenCalledWith({});
    });

    it('keeps the tombstone and reports an error when the remote delete fails', async () => {
      mockTransport.getDavFile.mockResolvedValue(
        JSON.stringify({ activityMd5: {}, streamMd5: {} })
      );
      mockTransport.deleteDavFile.mockRejectedValue(new RealTransportError('boom', 500));
      mockStorage.getAllActivitiesKeys.mockResolvedValue([]);
      mockStorage.loadAllActivities.mockResolvedValue([]);
      const deletedAt = new Date().toISOString();
      mockStorage.retrieveActivityTombstones.mockResolvedValue({ '2': deletedAt });
      mockStorage.storeActivityTombstones.mockResolvedValue(undefined);

      const summary = await pushBackupNow();

      expect(summary.deletedRemote).toBe(0);
      expect(summary.errors).toHaveLength(1);
      expect(summary.errors[0]).toContain('delete 2');
      // The tombstone survives for a retry on the next push.
      expect(mockStorage.storeActivityTombstones).toHaveBeenCalledWith({ '2': deletedAt });
    });

    it('prunes tombstones older than the retention window without touching the server', async () => {
      mockTransport.getDavFile.mockResolvedValue(
        JSON.stringify({ activityMd5: {}, streamMd5: {} })
      );
      mockStorage.getAllActivitiesKeys.mockResolvedValue([]);
      mockStorage.loadAllActivities.mockResolvedValue([]);
      const expired = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      mockStorage.retrieveActivityTombstones.mockResolvedValue({ '9': expired });
      mockStorage.storeActivityTombstones.mockResolvedValue(undefined);

      const summary = await pushBackupNow();

      expect(mockTransport.deleteDavFile).not.toHaveBeenCalled();
      expect(summary.deletedRemote).toBe(0);
      expect(mockStorage.storeActivityTombstones).toHaveBeenCalledWith({});
    });
  });

  describe('pull (honoring remote tombstones)', () => {
    it('does not restore a tombstoned activity, and keeps a locally re-added copy with its streams', async () => {
      // Stale state lists 3.json in activityMd5, but the remote state also
      // tombstones it — restore must not download it. Because the activity
      // exists locally again (re-fetched after the deletion), pull must not
      // remove it nor its stream files (local wins).
      mockTransport.getDavFile.mockImplementation(async (_config, ...segments) => {
        if (segments[segments.length - 1] === 'sync-state.json') {
          return JSON.stringify({
            activityMd5: { '3.json': 'x' },
            streamMd5: { '3.json': 'y' },
            deletedAt: { '3': new Date().toISOString() }
          });
        }
        return JSON.stringify(makeActivity('3'));
      });
      mockFileSystem.__mockFiles.set('doc/streams/3.json', 'stream-3');
      mockStorage.getAllActivitiesKeys.mockResolvedValue(['a_3']);
      mockStorage.loadAllActivities.mockResolvedValue([makeActivity('3')]);

      const summary = await pullBackupNow();

      expect(summary.restoredActivities).toBe(0);
      expect(summary.skippedActivities).toBe(1);
      expect(summary.restoredStreams).toBe(0);
      expect(summary.skippedStreams).toBe(1);
      expect(mockStorage.storeMultiActivities).not.toHaveBeenCalled();
      expect(mockStorage.removeActivity).not.toHaveBeenCalled();
      expect(mockFileSystem.__mockFiles.get('doc/streams/3.json')).toBe('stream-3');
    });

    it('cleans up orphaned stream files of a tombstoned activity that is gone locally', async () => {
      mockTransport.getDavFile.mockResolvedValue(
        JSON.stringify({
          activityMd5: {},
          streamMd5: {},
          deletedAt: { '4': new Date().toISOString() }
        })
      );
      mockFileSystem.__mockFiles.set('doc/streams/4.json', 'orphan');
      mockFileSystem.__mockFiles.set('doc/streams/4.nostreamflag', '');
      mockStorage.getAllActivitiesKeys.mockResolvedValue([]);

      const summary = await pullBackupNow();

      expect(summary.errors).toHaveLength(0);
      expect(mockFileSystem.__mockFiles.has('doc/streams/4.json')).toBe(false);
      expect(mockFileSystem.__mockFiles.has('doc/streams/4.nostreamflag')).toBe(false);
    });
  });
});
