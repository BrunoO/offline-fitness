import { APP_CONFIG, STORAGE_KEYS } from '@/constants';
import { Activity, simpleLogger } from '@/shared';
import * as Storage from '@/shared/services/storage';
import { CryptoDigestAlgorithm, digest, digestStringAsync } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import {
  WebDavConfig,
  WebDavTransportError,
  deleteDavFile,
  ensureDavFolder,
  getDavFile,
  getDavFileBytes,
  putDavFile
} from './webdavTransport';
import { loadWebDavConfig } from './webdavAuth';

export interface SyncSummary {
  uploadedActivities: number;
  skippedActivities: number;
  uploadedStreams: number;
  skippedStreams: number;
  deletedRemote: number;
  errors: string[];
  syncedAt: string;
}

export type SyncProgress = {
  phase: 'activities' | 'streams' | 'state' | 'tombstones';
  done: number;
  total: number;
};

/**
 * Remote dedup state, persisted in the remote sync-state.json. WebDAV
 * listings do not carry content checksums (unlike Drive's md5Checksum), so
 * the md5 map of what we last pushed lives here instead. A missing or
 * unreadable state file simply means "push everything". `deletedAt` is the
 * tombstone map (activity id → deletion time) so a restore knows which
 * remote files were deliberately deleted rather than never pushed.
 */
interface RemoteSyncState {
  syncedAt?: string;
  activityMd5?: Record<string, string>;
  streamMd5?: Record<string, string>;
  deletedAt?: Record<string, string>;
}

/**
 * Tombstones older than this are pruned from both the local log and the
 * remote state on the next push.
 */
const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Marker file recording which app id, profile and layout version own a
 * collection. It is written on the first sync and verified on every later one:
 * if a folder belongs to a different profile, syncing is refused instead of
 * mixing two athletes' data into one index, and if it was written in a layout
 * this app does not understand, syncing is refused instead of half-restoring
 * files it cannot interpret.
 */
interface CollectionMarker {
  appId: string;
  profile: string;
  /** Layout version of the collection; see `APP_CONFIG.BACKUP_SCHEMA_VERSION`. */
  schemaVersion: number;
  createdAt: string;
}

/**
 * Layout version of a marker written before versioning existed, which is the
 * JSON-stream layout. `loadCollectionMarker` reports it for a marker that
 * carries no `schemaVersion`, so the version check has a value to compare
 * rather than a second "unknown" case to special-case.
 */
const UNVERSIONED_SCHEMA_VERSION = 1;

/**
 * Reads the collection marker. Returns null when the collection has none
 * yet (a fresh folder, or a legacy collection written before the marker
 * existed). A body that is not JSON is treated the same way: the marker
 * is written by this app alone, so an unreadable one only means "unknown
 * owner" and must not block a restore. A marker that *is* readable always
 * gets a version, so a version mismatch is reported as a mismatch rather
 * than silently accepted as an absent marker.
 *
 * An absent marker is deliberately not a version refusal: on push a fresh
 * folder is claimed (the marker is written with this layout), and on pull an
 * empty folder has nothing to restore anyway. Refusing there would turn the
 * drawer's "Restore" on a brand-new account into an error instead of a no-op.
 */
async function loadCollectionMarker(config: WebDavConfig): Promise<CollectionMarker | null> {
  let text: string;
  try {
    text = await getDavFile(config, APP_CONFIG.BACKUP_COLLECTION_FILE);
  } catch (error) {
    if (error instanceof WebDavTransportError && error.status === 404) return null;
    throw error;
  }
  try {
    const marker = JSON.parse(text) as Partial<CollectionMarker>;
    if (!marker || typeof marker.appId !== 'string' || typeof marker.profile !== 'string') {
      return null;
    }
    return {
      appId: marker.appId,
      profile: marker.profile,
      createdAt: typeof marker.createdAt === 'string' ? marker.createdAt : '',
      schemaVersion:
        typeof marker.schemaVersion === 'number' ? marker.schemaVersion : UNVERSIONED_SCHEMA_VERSION
    };
  } catch {
    simpleLogger.warn('WebDAV collection marker is not readable, ignoring it');
    return null;
  }
}

/**
 * Verifies the collection belongs to this app id and profile, and was written
 * in the layout this app reads. Both mismatches are hard errors: the first
 * means two athletes are pointed at the same folder and their indexes would be
 * mixed; the second means the remote index lists files whose payload encoding
 * this build cannot interpret, so restoring them would write stream files the
 * app then fails to read.
 */
function assertCollectionOwnership(marker: CollectionMarker, config: WebDavConfig): void {
  if (marker.appId !== APP_CONFIG.BACKUP_APP_ID) {
    throw new Error(
      `This backup folder belongs to a different app (${marker.appId}). ` +
        'Point the app at its own folder, or use a different profile name.'
    );
  }
  if (marker.profile !== config.profile) {
    throw new Error(
      `This backup folder belongs to profile "${marker.profile}", not "${config.profile}". ` +
        'Use a different profile name, or pick the folder of the right profile.'
    );
  }
  if (marker.schemaVersion !== APP_CONFIG.BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `This backup folder uses layout version ${marker.schemaVersion}, but this app writes version ` +
        `${APP_CONFIG.BACKUP_SCHEMA_VERSION}. Delete the folder on the server (or pick a new profile ` +
        'name) and sync again: the previous layout is not supported.'
    );
  }
}

async function loadRemoteSyncState(config: WebDavConfig): Promise<RemoteSyncState> {
  try {
    const text = await getDavFile(config, APP_CONFIG.BACKUP_SYNC_STATE_FILE);
    return JSON.parse(text) as RemoteSyncState;
  } catch (error) {
    if (error instanceof WebDavTransportError && error.status === 404) {
      return {}; // First push, or state file lost: re-upload everything.
    }
    throw error;
  }
}

async function md5(content: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.MD5, content);
}

async function md5Bytes(bytes: Uint8Array): Promise<string> {
  if (typeof digest === 'function') {
    const buffer = await digest(CryptoDigestAlgorithm.MD5, bytes as BufferSource);
    const view = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < view.length; i++) {
      hex += view[i].toString(16).padStart(2, '0');
    }
    return hex;
  }
  const CHUNK = 8192;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    parts.push(String.fromCharCode.apply(null, Array.from(slice) as unknown as number[]));
  }
  return digestStringAsync(CryptoDigestAlgorithm.MD5, parts.join(''));
}

async function pushBackup(config: WebDavConfig, onProgress?: (p: SyncProgress) => void) {
  const summary: SyncSummary = {
    uploadedActivities: 0,
    skippedActivities: 0,
    uploadedStreams: 0,
    skippedStreams: 0,
    deletedRemote: 0,
    errors: [],
    syncedAt: new Date().toISOString()
  };

  // The collection is <root>/<appId>/<profile>/. Recreate the chain in case
  // it was removed on the server, then check the collection is ours before
  // writing anything into it.
  await ensureDavFolder(
    { ...config, baseUrl: config.rootUrl },
    APP_CONFIG.BACKUP_APP_ID,
    config.profile
  );
  const marker = await loadCollectionMarker(config);
  if (marker) {
    assertCollectionOwnership(marker, config);
  } else {
    // Fresh collection: claim it by recording who owns it and which layout
    // it is written in.
    const fresh: CollectionMarker = {
      appId: APP_CONFIG.BACKUP_APP_ID,
      profile: config.profile,
      schemaVersion: APP_CONFIG.BACKUP_SCHEMA_VERSION,
      createdAt: new Date().toISOString()
    };
    await putDavFile(config, APP_CONFIG.BACKUP_COLLECTION_FILE, JSON.stringify(fresh));
  }
  await ensureDavFolder(config, APP_CONFIG.BACKUP_ACTIVITIES_FOLDER);
  await ensureDavFolder(config, APP_CONFIG.BACKUP_STREAMS_FOLDER);
  const remoteState = await loadRemoteSyncState(config);
  const pushedActivityMd5: Record<string, string> = {};
  const pushedStreamMd5: Record<string, string> = {};

  const keys = await Storage.getAllActivitiesKeys();
  const activities: Activity[] = await Storage.loadAllActivities(keys);
  const localActivityIds = new Set(activities.map(activity => String(activity.id)));

  // Propagate local deletions to the server. Local wins: a tombstone whose
  // activity exists again locally is dropped (the delete is undone); an
  // expired one is pruned. Surviving unexpired tombstones are recorded in
  // the remote state so a restore elsewhere knows the files were deleted
  // deliberately. Failed deletions stay in the local log for retry.
  const tombstones = await Storage.retrieveActivityTombstones();
  const remoteDeletedAt: Record<string, string> = {};
  const now = Date.now();
  const tombstoneEntries = Object.entries(tombstones);
  onProgress?.({ phase: 'tombstones', done: 0, total: tombstoneEntries.length });
  let tombstoneDone = 0;
  for (const [id, deletedAt] of tombstoneEntries) {
    const age = now - Date.parse(deletedAt);
    if (!Number.isFinite(age)) {
      await Storage.storeActivityTombstones({});
      break; // Corrupt log: drop it rather than delete blind.
    }
    try {
      if (age > TOMBSTONE_RETENTION_MS) {
        delete tombstones[id]; // expired: prune, nothing to delete remotely
      } else if (localActivityIds.has(id)) {
        delete tombstones[id]; // resurrected locally: local wins, undo delete
      } else {
        await deleteDavFile(config, APP_CONFIG.BACKUP_ACTIVITIES_FOLDER, `${id}.json`);
        await deleteDavFile(config, APP_CONFIG.BACKUP_STREAMS_FOLDER, `${id}.json`);
        await deleteDavFile(config, APP_CONFIG.BACKUP_STREAMS_FOLDER, `${id}.nostreamflag`);
        tombstones[id] = deletedAt;
        remoteDeletedAt[id] = deletedAt;
        summary.deletedRemote += 1;
      }
    } catch (error) {
      summary.errors.push(
        `delete ${id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    tombstoneDone += 1;
    onProgress?.({ phase: 'tombstones', done: tombstoneDone, total: tombstoneEntries.length });
  }
  await Storage.storeActivityTombstones(tombstones);

  // Keep unexpired remote tombstones this device never saw (e.g. an earlier
  // push from another source), but never against an activity that exists
  // locally — resurrection must survive a round trip.
  for (const [id, deletedAt] of Object.entries(remoteState.deletedAt ?? {})) {
    if (
      !remoteDeletedAt[id] &&
      !localActivityIds.has(id) &&
      now - Date.parse(deletedAt) <= TOMBSTONE_RETENTION_MS
    ) {
      remoteDeletedAt[id] = deletedAt;
    }
  }

  onProgress?.({ phase: 'activities', done: 0, total: activities.length });
  let activityDone = 0;
  for (const activity of activities) {
    const name = `${activity.id}.json`;
    try {
      const content = JSON.stringify(activity);
      const contentMd5 = await md5(content);
      if (remoteState.activityMd5?.[name] === contentMd5) {
        summary.skippedActivities += 1;
      } else {
        await putDavFile(config, APP_CONFIG.BACKUP_ACTIVITIES_FOLDER, name, content);
        summary.uploadedActivities += 1;
      }
      pushedActivityMd5[name] = contentMd5;
    } catch (error) {
      summary.errors.push(
        `activity ${activity.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    activityDone += 1;
    onProgress?.({ phase: 'activities', done: activityDone, total: activities.length });
  }

  const streamsFolder = new Directory(Paths.document, APP_CONFIG.STREAMS_FOLDER);
  const streamFiles = streamsFolder.exists
    ? streamsFolder.list().filter((entry): entry is File => entry instanceof File)
    : [];
  const jsonStreamFiles = streamFiles.filter(file => file.name.endsWith('.json'));
  onProgress?.({ phase: 'streams', done: 0, total: jsonStreamFiles.length });
  let streamDone = 0;
  for (const file of jsonStreamFiles) {
    try {
      const hasBytes = typeof (file as { bytes?: unknown }).bytes === 'function';
      const content = hasBytes ? await file.bytes() : await file.text();
      const contentMd5 = typeof content === 'string' ? await md5(content) : await md5Bytes(content);
      if (remoteState.streamMd5?.[file.name] === contentMd5) {
        summary.skippedStreams += 1;
      } else {
        await putDavFile(config, APP_CONFIG.BACKUP_STREAMS_FOLDER, file.name, content);
        summary.uploadedStreams += 1;
      }
      pushedStreamMd5[file.name] = contentMd5;
    } catch (error) {
      summary.errors.push(
        `stream ${file.name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    streamDone += 1;
    onProgress?.({ phase: 'streams', done: streamDone, total: jsonStreamFiles.length });
  }

  onProgress?.({ phase: 'state', done: 0, total: 1 });
  const syncState: RemoteSyncState = {
    syncedAt: summary.syncedAt,
    activityMd5: pushedActivityMd5,
    streamMd5: pushedStreamMd5,
    deletedAt: remoteDeletedAt
  };
  await putDavFile(config, APP_CONFIG.BACKUP_SYNC_STATE_FILE, JSON.stringify(syncState));
  onProgress?.({ phase: 'state', done: 1, total: 1 });

  await Storage.storeStringValue(Storage.BACKUP_LAST_SYNC_KEY, summary.syncedAt);
  simpleLogger.log('WebDAV backup push complete', { ...summary });
  return summary;
}

/**
 * Uploads all local activities and streams to the configured WebDAV
 * collection, skipping files whose md5 matches the remote sync state, and
 * applies local deletion tombstones to the remote collection. A 401/403
 * means the stored credentials no longer work (password rotated, server
 * moved), so it surfaces with a reconnect hint.
 */
export async function pushBackupNow(
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncSummary> {
  const config = await requireWebDavConfig();
  try {
    return await pushBackup(config, onProgress);
  } catch (error) {
    if (error instanceof WebDavTransportError && (error.status === 401 || error.status === 403)) {
      throw new Error(
        'WebDAV server rejected the credentials. Check the server URL, username and password.'
      );
    }
    throw error;
  }
}

export interface RestoreSummary {
  restoredActivities: number;
  skippedActivities: number;
  restoredStreams: number;
  skippedStreams: number;
  errors: string[];
}

/**
 * Downloads activities and streams present in the remote sync state but
 * missing locally. Conflict policy is "local wins": an activity or stream
 * file that exists locally is never overwritten, even when its content
 * differs from the remote copy — pull only fills gaps. Remote deletion
 * tombstones are honored (a tombstoned activity is never restored), but a
 * locally existing copy is never removed — a re-fetched activity beats an
 * old tombstone, and the next push then drops the tombstone for good.
 */
async function pullBackup(
  config: WebDavConfig,
  onProgress?: (p: SyncProgress) => void
): Promise<RestoreSummary> {
  const summary: RestoreSummary = {
    restoredActivities: 0,
    skippedActivities: 0,
    restoredStreams: 0,
    skippedStreams: 0,
    errors: []
  };

  // Never restore from a collection owned by another profile or app: its
  // index would list activities that are not ours. A collection without a
  // marker is restored from as-is (it predates the marker).
  const marker = await loadCollectionMarker(config);
  if (marker) assertCollectionOwnership(marker, config);

  const remoteState = await loadRemoteSyncState(config);
  const remoteActivities = Object.keys(remoteState.activityMd5 ?? {});
  const remoteStreams = Object.keys(remoteState.streamMd5 ?? {});

  const localKeys = await Storage.getAllActivitiesKeys();
  // Storage keys are "a_<id>"; remote names are "<id>.json" — compare ids.
  const idPrefix = STORAGE_KEYS.ACTIVITY_PREFIX;
  const localActivityIds = new Set(localKeys.map(key => key.replace(idPrefix, '')));

  // Remote tombstones: an activity listed there was deliberately deleted on
  // the device that pushed, so it is not restored even if a stale state
  // entry still lists it. Local wins, though: an activity that exists again
  // locally (re-imported from a Strava archive after the deletion) is never removed —
  // the next push drops its tombstone for good. What pull does clean up is
  // orphaned stream files of tombstoned activities.
  const tombstonedIds = new Set(Object.keys(remoteState.deletedAt ?? {}));
  const streamsFolderForTombstones = new Directory(Paths.document, APP_CONFIG.STREAMS_FOLDER);
  onProgress?.({ phase: 'tombstones', done: 0, total: tombstonedIds.size });
  let tombstoneDone = 0;
  for (const id of tombstonedIds) {
    try {
      // Only clean up when the activity is really gone locally: a copy that
      // came back after the deletion keeps its streams (local wins).
      if (!localActivityIds.has(id)) {
        const streamFile = new File(streamsFolderForTombstones, `${id}.json`);
        if (streamFile.exists) streamFile.delete();
        const flagFile = new File(streamsFolderForTombstones, `${id}.nostreamflag`);
        if (flagFile.exists) flagFile.delete();
      }
    } catch (error) {
      summary.errors.push(
        `delete stream ${id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    tombstoneDone += 1;
    onProgress?.({ phase: 'tombstones', done: tombstoneDone, total: tombstonedIds.size });
  }

  onProgress?.({ phase: 'activities', done: 0, total: remoteActivities.length });
  let activityDone = 0;
  for (const name of remoteActivities) {
    const id = name.replace(/\.json$/, '');
    try {
      if (tombstonedIds.has(id)) {
        summary.skippedActivities += 1; // deliberately deleted upstream: do not resurrect
      } else if (localActivityIds.has(id)) {
        summary.skippedActivities += 1;
      } else {
        const content = await getDavFile(config, APP_CONFIG.BACKUP_ACTIVITIES_FOLDER, name);
        let activity: Activity;
        try {
          activity = JSON.parse(content) as Activity;
        } catch {
          throw new Error('downloaded file is not valid JSON (not a valid activity)');
        }
        if (!activity || typeof activity.id === 'undefined') {
          throw new Error('downloaded file is not a valid activity');
        }
        await Storage.storeActivity(activity);
        summary.restoredActivities += 1;
      }
    } catch (error) {
      summary.errors.push(
        `activity ${name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    activityDone += 1;
    onProgress?.({ phase: 'activities', done: activityDone, total: remoteActivities.length });
  }

  const streamsFolder = new Directory(Paths.document, APP_CONFIG.STREAMS_FOLDER);
  if (!streamsFolder.exists) streamsFolder.create();
  onProgress?.({ phase: 'streams', done: 0, total: remoteStreams.length });
  let streamDone = 0;
  for (const name of remoteStreams) {
    try {
      if (tombstonedIds.has(name.replace(/\.(nostreamflag|json)$/, ''))) {
        summary.skippedStreams += 1; // belongs to a deliberately deleted activity
        continue;
      }
      const file = new File(streamsFolder, name);
      if (file.exists) {
        summary.skippedStreams += 1;
      } else {
        const bytes =
          typeof getDavFileBytes === 'function'
            ? await getDavFileBytes(config, APP_CONFIG.BACKUP_STREAMS_FOLDER, name)
            : undefined;
        const content =
          bytes !== undefined
            ? bytes
            : await getDavFile(config, APP_CONFIG.BACKUP_STREAMS_FOLDER, name);
        file.write(content);
        summary.restoredStreams += 1;
      }
    } catch (error) {
      summary.errors.push(
        `stream ${name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    streamDone += 1;
    onProgress?.({ phase: 'streams', done: streamDone, total: remoteStreams.length });
  }

  simpleLogger.log('WebDAV backup restore complete', { ...summary });
  return summary;
}

/**
 * Restores activities and streams from the WebDAV collection that are
 * missing locally (local data always wins on conflicts).
 */
export async function pullBackupNow(
  onProgress?: (progress: SyncProgress) => void
): Promise<RestoreSummary> {
  const config = await requireWebDavConfig();
  try {
    return await pullBackup(config, onProgress);
  } catch (error) {
    if (error instanceof WebDavTransportError && (error.status === 401 || error.status === 403)) {
      throw new Error(
        'WebDAV server rejected the credentials. Check the server URL, username and password.'
      );
    }
    throw error;
  }
}

async function requireWebDavConfig(): Promise<WebDavConfig> {
  const config = await loadWebDavConfig();
  if (!config) {
    throw new Error('WebDAV backup is not configured. Connect first in the drawer.');
  }
  return config;
}
