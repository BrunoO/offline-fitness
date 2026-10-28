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
import { loadUserProfile, saveUserProfile, type UserProfile } from '@/features/profile';

export interface SyncSummary {
  uploadedActivities: number;
  skippedActivities: number;
  uploadedStreams: number;
  skippedStreams: number;
  deletedRemote: number;
  errors: string[];
  syncedAt: string;
  /** Ids uploaded this run — the fine grain the counts hide (Phase-6 ping-pong). */
  uploadedActivityIds: string[];
  /** File names (`<id>.json`) uploaded this run. */
  uploadedStreamNames: string[];
  /** Tombstoned ids deleted from the server this run. */
  deletedRemoteIds: string[];
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
  profileMd5?: string;
}

/**
 * Tombstones older than this are pruned from both the local log and the
 * remote state on the next push.
 */
const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * In-flight WebDAV requests during a sync. A full collection is thousands of
 * small files; on a LAN each request is a few milliseconds of work behind a
 * few milliseconds of latency, and sequential handling meant paying the
 * latency 4,000+ times in a row. Six overlaps the waits without queueing so
 * deep that the progress line stops saying anything new, and without making
 * the phone's network stack the complaint box of the home server.
 */
const SYNC_CONCURRENCY = 6;

/** Activity restores are written to storage in batches of this size. */
const ACTIVITY_BATCH_SIZE = 100;

/**
 * Runs `fn` over `items` with at most `limit` calls in flight at once.
 *
 * `fn` must handle its own per-item failures (every call site below catches
 * and records into `summary.errors`, like the sequential loops it replaced):
 * a rejection would orphan the remaining slots' work and the whole sync.
 * Counters and progress keep the same semantics as the loops — `done` is now
 * completion order rather than file order, which is exactly what a busy
 * progress bar was already showing under network jitter.
 */
async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let index = 0;
  const runner = async (): Promise<void> => {
    for (;;) {
      const current = index++;
      if (current >= items.length) return;
      await fn(items[current]); // NOSONAR - worker queue draining loop regulates concurrency
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
}

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
    for (const byte of view) {
      hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
  }
  const CHUNK = 8192;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    parts.push(String.fromCodePoint.apply(null, Array.from(slice) as unknown as number[]));
  }
  return digestStringAsync(CryptoDigestAlgorithm.MD5, parts.join(''));
}

/** One-line description of a failure for the summary error log. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Recreate the collection chain (`<root>/<appId>/<profile>/`) in case it was
 * removed on the server, then check the collection is ours — or claim a fresh
 * one by recording its owner — before writing anything into it.
 */
async function ensureOwnedCollection(config: WebDavConfig): Promise<void> {
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
}

/**
 * Propagate local deletions to the server. Local wins: a tombstone whose
 * activity exists again locally is dropped (the delete is undone); an expired
 * one is pruned. Surviving unexpired tombstones are returned as the remote
 * deletion log so a restore elsewhere knows the files were deleted
 * deliberately. Failed deletions stay in the local log for retry.
 */
async function propagateLocalTombstones(
  config: WebDavConfig,
  summary: SyncSummary,
  onProgress: ((p: SyncProgress) => void) | undefined,
  localActivityIds: Set<string>
): Promise<Record<string, string>> {
  const tombstones = await Storage.retrieveActivityTombstones();
  const remoteDeletedAt: Record<string, string> = {};
  const now = Date.now();
  const tombstoneEntries = Object.entries(tombstones);
  onProgress?.({ phase: 'tombstones', done: 0, total: tombstoneEntries.length });
  let tombstoneDone = 0;
  for (const [id, deletedAt] of tombstoneEntries) {
    const age = now - Date.parse(deletedAt);
    if (!Number.isFinite(age)) {
      await Storage.storeActivityTombstones({}); // NOSONAR - resets corrupt log before immediate return
      return remoteDeletedAt; // Corrupt log: drop it rather than delete blind.
    }
    try {
      if (age > TOMBSTONE_RETENTION_MS) {
        delete tombstones[id]; // expired: prune, nothing to delete remotely
      } else if (localActivityIds.has(id)) {
        delete tombstones[id]; // resurrected locally: local wins, undo delete
      } else {
        await deleteDavFile(config, APP_CONFIG.BACKUP_ACTIVITIES_FOLDER, `${id}.json`); // NOSONAR - rate-limits remote deletes
        await deleteDavFile(config, APP_CONFIG.BACKUP_STREAMS_FOLDER, `${id}.json`); // NOSONAR - rate-limits remote deletes
        await deleteDavFile(config, APP_CONFIG.BACKUP_STREAMS_FOLDER, `${id}.nostreamflag`); // NOSONAR - rate-limits remote deletes
        tombstones[id] = deletedAt;
        remoteDeletedAt[id] = deletedAt;
        summary.deletedRemote += 1;
        summary.deletedRemoteIds.push(id);
      }
    } catch (error) {
      summary.errors.push(`delete ${id}: ${describeError(error)}`);
    }
    tombstoneDone += 1;
    onProgress?.({ phase: 'tombstones', done: tombstoneDone, total: tombstoneEntries.length });
  }
  await Storage.storeActivityTombstones(tombstones);
  return remoteDeletedAt;
}

/**
 * Keep unexpired remote tombstones this device never saw (e.g. an earlier
 * push from another source), but never against an activity that exists
 * locally — resurrection must survive a round trip. Mutates `remoteDeletedAt`.
 */
function mergeRemoteTombstones(
  remoteState: RemoteSyncState,
  remoteDeletedAt: Record<string, string>,
  localActivityIds: Set<string>,
  now: number
): void {
  for (const [id, deletedAt] of Object.entries(remoteState.deletedAt ?? {})) {
    if (
      !remoteDeletedAt[id] &&
      !localActivityIds.has(id) &&
      now - Date.parse(deletedAt) <= TOMBSTONE_RETENTION_MS
    ) {
      remoteDeletedAt[id] = deletedAt;
    }
  }
}

async function pushBackup(config: WebDavConfig, onProgress?: (p: SyncProgress) => void) {
  const summary: SyncSummary = {
    uploadedActivities: 0,
    skippedActivities: 0,
    uploadedStreams: 0,
    skippedStreams: 0,
    deletedRemote: 0,
    errors: [],
    syncedAt: new Date().toISOString(),
    uploadedActivityIds: [],
    uploadedStreamNames: [],
    deletedRemoteIds: []
  };

  await ensureOwnedCollection(config);
  await ensureDavFolder(config, APP_CONFIG.BACKUP_ACTIVITIES_FOLDER);
  await ensureDavFolder(config, APP_CONFIG.BACKUP_STREAMS_FOLDER);
  const remoteState = await loadRemoteSyncState(config);
  const pushedActivityMd5: Record<string, string> = {};
  const pushedStreamMd5: Record<string, string> = {};

  const keys = await Storage.getAllActivitiesKeys();
  const activities: Activity[] = await Storage.loadAllActivities(keys);
  const localActivityIds = new Set(activities.map(activity => String(activity.id)));

  const remoteDeletedAt = await propagateLocalTombstones(
    config,
    summary,
    onProgress,
    localActivityIds
  );
  mergeRemoteTombstones(remoteState, remoteDeletedAt, localActivityIds, Date.now());

  onProgress?.({ phase: 'activities', done: 0, total: activities.length });
  let activityDone = 0;
  await runWithConcurrency(activities, SYNC_CONCURRENCY, async activity => {
    const name = `${activity.id}.json`;
    try {
      const content = JSON.stringify(activity);
      const contentMd5 = await md5(content);
      if (remoteState.activityMd5?.[name] === contentMd5) {
        summary.skippedActivities += 1;
      } else {
        await putDavFile(config, APP_CONFIG.BACKUP_ACTIVITIES_FOLDER, name, content);
        summary.uploadedActivities += 1;
        summary.uploadedActivityIds.push(activity.id);
      }
      pushedActivityMd5[name] = contentMd5;
    } catch (error) {
      summary.errors.push(`activity ${activity.id}: ${describeError(error)}`);
    }
    activityDone += 1;
    onProgress?.({ phase: 'activities', done: activityDone, total: activities.length });
  });

  const streamsFolder = new Directory(Paths.document, APP_CONFIG.STREAMS_FOLDER);
  const streamFiles = streamsFolder.exists
    ? streamsFolder.list().filter((entry): entry is File => entry instanceof File)
    : [];
  const jsonStreamFiles = streamFiles.filter(file => file.name.endsWith('.json'));
  onProgress?.({ phase: 'streams', done: 0, total: jsonStreamFiles.length });
  let streamDone = 0;
  await runWithConcurrency(jsonStreamFiles, SYNC_CONCURRENCY, async file => {
    try {
      const hasBytes = typeof (file as { bytes?: unknown }).bytes === 'function';
      const content = hasBytes ? await file.bytes() : await file.text();
      const contentMd5 = typeof content === 'string' ? await md5(content) : await md5Bytes(content);
      if (remoteState.streamMd5?.[file.name] === contentMd5) {
        summary.skippedStreams += 1;
      } else {
        await putDavFile(config, APP_CONFIG.BACKUP_STREAMS_FOLDER, file.name, content);
        summary.uploadedStreams += 1;
        summary.uploadedStreamNames.push(file.name);
      }
      pushedStreamMd5[file.name] = contentMd5;
    } catch (error) {
      summary.errors.push(`stream ${file.name}: ${describeError(error)}`);
    }
    streamDone += 1;
    onProgress?.({ phase: 'streams', done: streamDone, total: jsonStreamFiles.length });
  });

  onProgress?.({ phase: 'state', done: 0, total: 1 });

  // Push the user profile (age + weight history) as a single JSON file so it
  // survives a device change. Local always wins on conflicts, so we only
  // overwrite the remote copy when its content actually differs.
  let pushedProfileMd5: string | undefined;
  try {
    const profile = await loadUserProfile();
    const profileContent = JSON.stringify(profile);
    const profileMd5Value = await md5(profileContent);
    if (remoteState.profileMd5 !== profileMd5Value) {
      await putDavFile(config, APP_CONFIG.BACKUP_PROFILE_FILE, profileContent);
    }
    pushedProfileMd5 = profileMd5Value;
  } catch (error) {
    summary.errors.push(`profile: ${describeError(error)}`);
  }

  const syncState: RemoteSyncState = {
    syncedAt: summary.syncedAt,
    activityMd5: pushedActivityMd5,
    streamMd5: pushedStreamMd5,
    deletedAt: remoteDeletedAt,
    profileMd5: pushedProfileMd5 ?? remoteState.profileMd5
  };
  await putDavFile(config, APP_CONFIG.BACKUP_SYNC_STATE_FILE, JSON.stringify(syncState));
  onProgress?.({ phase: 'state', done: 1, total: 1 });

  await Storage.storeStringValue(Storage.BACKUP_LAST_SYNC_KEY, summary.syncedAt);
  // The returned summary carries the full id lists; the log keeps a head of
  // each so the LogScreen stays readable on a full-collection sync.
  simpleLogger.log('WebDAV backup push complete', {
    ...summary,
    uploadedActivityIds: summary.uploadedActivityIds.slice(0, 25),
    uploadedStreamNames: summary.uploadedStreamNames.slice(0, 25),
    deletedRemoteIds: summary.deletedRemoteIds.slice(0, 25)
  });
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
  /** Ids downloaded this run. */
  restoredActivityIds: string[];
  /** File names (`<id>.json`) downloaded this run. */
  restoredStreamNames: string[];
  /**
   * Downloads that overwrote an existing local file (hash mismatch) rather
   * than filling a gap — the self-healing path. A recurring name here across
   * syncs means the local copy keeps diverging.
   */
  refreshedStreamNames: string[];
}

/**
 * Downloads activities and streams present in the remote sync state but
 * missing locally. Conflict policy is "local wins" for activities: a record
 * that exists locally is never overwritten, even when its content differs
 * from the remote copy — pull only fills gaps. Streams are the exception:
 * nothing on the phone ever edits a stream file (backfills only touch
 * activity records), so a local stream whose bytes differ from the index is
 * stale or corrupt rather than a local edit worth preserving, and it is
 * re-downloaded. Remote deletion tombstones are honored (a tombstoned
 * activity is never restored), but a locally existing copy is never removed —
 * a re-fetched activity beats an old tombstone, and the next push then drops
 * the tombstone for good.
 */
/**
 * Delete stream files of activities that were deliberately removed upstream
 * (tombstoned) and are not present locally. Local wins: an activity that came
 * back after the deletion keeps its streams.
 */
function cleanOrphanedStreamFiles(
  summary: RestoreSummary,
  onProgress: ((p: SyncProgress) => void) | undefined,
  tombstonedIds: Set<string>,
  localActivityIds: Set<string>
): void {
  const streamsFolder = new Directory(Paths.document, APP_CONFIG.STREAMS_FOLDER);
  onProgress?.({ phase: 'tombstones', done: 0, total: tombstonedIds.size });
  let tombstoneDone = 0;
  for (const id of tombstonedIds) {
    try {
      // Only clean up when the activity is really gone locally: a copy that
      // came back after the deletion keeps its streams (local wins).
      if (!localActivityIds.has(id)) {
        const streamFile = new File(streamsFolder, `${id}.json`);
        if (streamFile.exists) streamFile.delete();
        const flagFile = new File(streamsFolder, `${id}.nostreamflag`);
        if (flagFile.exists) flagFile.delete();
      }
    } catch (error) {
      summary.errors.push(`delete stream ${id}: ${describeError(error)}`);
    }
    tombstoneDone += 1;
    onProgress?.({ phase: 'tombstones', done: tombstoneDone, total: tombstonedIds.size });
  }
}

/**
 * Is the existing local stream file the file the index describes? A wipe
 * keeps the stream cache while deleting the records, and until now a kept
 * file was never re-checked — so a stale copy survived every restore and the
 * next push re-uploaded it over the server's good copy, forever. Streams
 * carry no legitimate local-only state (see the policy above), so a hash
 * mismatch means refresh, not preserve. An unadvertised file has nothing to
 * compare against and counts as matching. A failed local read throws into
 * the caller's error path and keeps the file.
 */
async function localStreamMatchesIndex(
  file: File,
  advertised: string | undefined
): Promise<boolean> {
  if (advertised === undefined) return true;
  const hasBytes = typeof (file as { bytes?: unknown }).bytes === 'function';
  const localContent = hasBytes ? await file.bytes() : await file.text();
  const localMd5 =
    typeof localContent === 'string' ? await md5(localContent) : await md5Bytes(localContent);
  return advertised === localMd5;
}

/** Fetch a stream's content, preferring the binary transport when available. */
async function fetchStreamContent(
  config: WebDavConfig,
  name: string
): Promise<Uint8Array | string> {
  const bytes =
    typeof getDavFileBytes === 'function'
      ? await getDavFileBytes(config, APP_CONFIG.BACKUP_STREAMS_FOLDER, name)
      : undefined;
  return bytes ?? (await getDavFile(config, APP_CONFIG.BACKUP_STREAMS_FOLDER, name));
}

/**
 * Restores the user profile (age + weight history) from the remote collection
 * when present. Local entries win on per-date conflicts; a missing remote file
 * is not an error.
 */
async function restoreUserProfile(config: WebDavConfig, summary: RestoreSummary): Promise<void> {
  try {
    const content = await getDavFile(config, APP_CONFIG.BACKUP_PROFILE_FILE);
    if (!content) {
      return;
    }
    const remoteProfile = JSON.parse(content) as UserProfile;
    if (!remoteProfile || typeof remoteProfile !== 'object') {
      return;
    }
    const localProfile = await loadUserProfile();
    const age = localProfile?.age ?? remoteProfile?.age;
    const byDate = new Map<string, { date: string; weightKg: number }>();
    for (const entry of remoteProfile.weightEntries ?? []) {
      byDate.set(entry.date, entry);
    }
    for (const entry of localProfile.weightEntries ?? []) {
      byDate.set(entry.date, entry); // local wins
    }
    const mergedEntries = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    await saveUserProfile({ age, weightEntries: mergedEntries });
  } catch (error) {
    if (!(error instanceof WebDavTransportError) || error.status !== 404) {
      summary.errors.push(`profile: ${describeError(error)}`);
    }
  }
}

async function pullBackup(
  config: WebDavConfig,
  onProgress?: (p: SyncProgress) => void
): Promise<RestoreSummary> {
  const summary: RestoreSummary = {
    restoredActivities: 0,
    skippedActivities: 0,
    restoredStreams: 0,
    skippedStreams: 0,
    errors: [],
    restoredActivityIds: [],
    restoredStreamNames: [],
    refreshedStreamNames: []
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
  cleanOrphanedStreamFiles(summary, onProgress, tombstonedIds, localActivityIds);

  onProgress?.({ phase: 'activities', done: 0, total: remoteActivities.length });
  let activityDone = 0;
  // Downloads run concurrently and writes go through `storeMultiActivities`
  // in batches: 2,122 individual `Storage.storeActivity` calls is the same
  // per-item native round-trip cost that pass 1 of the archive importer was
  // rewritten to avoid, and this loop was left behind by that change.
  const pendingWrites: Activity[] = [];
  const flushWrites = async (flushRemainder: boolean): Promise<void> => {
    while (pendingWrites.length >= ACTIVITY_BATCH_SIZE) {
      await Storage.storeMultiActivities(pendingWrites.splice(0, ACTIVITY_BATCH_SIZE)); // NOSONAR - sequential batch flush
    }
    if (flushRemainder && pendingWrites.length > 0) {
      await Storage.storeMultiActivities(pendingWrites.splice(0));
    }
  };
  await runWithConcurrency(remoteActivities, SYNC_CONCURRENCY, async name => {
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
        if (activity?.id === undefined) {
          throw new Error('downloaded file is not a valid activity');
        }
        pendingWrites.push(activity);
        summary.restoredActivities += 1;
        summary.restoredActivityIds.push(activity.id);
        // splice() is synchronous, so concurrent flushes take disjoint
        // batches; a batch can end up smaller than the size, which is fine.
        await flushWrites(false);
      }
    } catch (error) {
      summary.errors.push(`activity ${name}: ${describeError(error)}`);
    }
    activityDone += 1;
    onProgress?.({ phase: 'activities', done: activityDone, total: remoteActivities.length });
  });
  await flushWrites(true);

  const streamsFolder = new Directory(Paths.document, APP_CONFIG.STREAMS_FOLDER);
  if (!streamsFolder.exists) streamsFolder.create();
  onProgress?.({ phase: 'streams', done: 0, total: remoteStreams.length });
  let streamDone = 0;
  await runWithConcurrency(remoteStreams, SYNC_CONCURRENCY, async name => {
    try {
      if (tombstonedIds.has(name.replace(/\.(nostreamflag|json)$/, ''))) {
        summary.skippedStreams += 1; // belongs to a deliberately deleted activity
        return;
      }
      const file = new File(streamsFolder, name);
      const existed = file.exists;
      if (existed && (await localStreamMatchesIndex(file, remoteState.streamMd5?.[name]))) {
        summary.skippedStreams += 1;
      } else {
        file.write(await fetchStreamContent(config, name));
        summary.restoredStreams += 1;
        summary.restoredStreamNames.push(name);
        if (existed) summary.refreshedStreamNames.push(name);
      }
    } catch (error) {
      summary.errors.push(`stream ${name}: ${describeError(error)}`);
    }
    streamDone += 1;
    onProgress?.({ phase: 'streams', done: streamDone, total: remoteStreams.length });
  });

  await restoreUserProfile(config, summary);

  simpleLogger.log('WebDAV backup restore complete', {
    ...summary,
    restoredActivityIds: summary.restoredActivityIds.slice(0, 25),
    restoredStreamNames: summary.restoredStreamNames.slice(0, 25),
    refreshedStreamNames: summary.refreshedStreamNames.slice(0, 25)
  });
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
