import { createHash } from 'node:crypto';

/**
 * Remote `sync-state.json`, mirroring the private `RemoteSyncState` in
 * `src/features/backup/services/backupSync.ts`. It is duplicated deliberately:
 * that module cannot be imported here (it reaches AsyncStorage, expo-file-system
 * and expo-crypto), and the desktop tool must write the file the phone reads.
 * The `schemaVersion` gate in `collection.json` is what turns any drift between
 * the two shapes into a refused sync instead of a corrupt restore.
 */
export interface RemoteSyncState {
  syncedAt?: string;
  activityMd5?: Record<string, string>;
  streamMd5?: Record<string, string>;
  deletedAt?: Record<string, string>;
}

/**
 * md5 hex of string (as UTF-8 bytes) or raw bytes. Node's `createHash('md5')`
 * produces exactly what the phone produces with `expo-crypto`
 * `digestStringAsync`/`digest`, which is the only way the phone's next push
 * sees the tool's files as "already uploaded" and skips them.
 */
export function md5Hex(content: string | Uint8Array): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * The file name an activity's record and stream share — `<id>.json` in both
 * the `activities/` and `streams/` folders. The app writes the same name in
 * each folder (`backupSync.ts`), so the tool must too; they are distinguished
 * only by their folder, never by the name.
 */
export function recordName(activityId: string): string {
  return `${activityId}.json`;
}
