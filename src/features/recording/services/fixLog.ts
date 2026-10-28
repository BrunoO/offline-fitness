import type { FixLogEntry, RecordingMeta } from '../services/gpsTracker';
import { GpsTracker } from '../services/gpsTracker';
import { FIX_LOG_RETENTION_DAYS } from '../config';
import { DEFAULT_CHUNK_SIZE, readChunkedJsonl } from './chunkedJsonlReader';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ReadFixLogResult {
  fixes: FixLogEntry[];
  skipped: number;
  recovered: boolean;
}

/**
 * Reads a fix log in chunks, yielding complete JSONL records.
 *
 * The native side hands out the absolute URI of `fixes.jsonl` in the session
 * meta (D11) and the app reads it itself: no fix array crosses the bridge and
 * the reader's memory is O(chunk), not O(fix count).
 *
 * Chunk boundaries are this function's problem, not the replay's: a partial
 * trailing line is carried between chunks and only complete records are
 * yielded, so the replay sees a plain sequence of fixes with no notion of
 * pages. A truncated final line is tolerated and counted in `skipped`; a
 * malformed line mid-file is skipped and counted too - a damaged log must
 * still produce a usable activity instead of losing the recording.
 */
export function readFixLog(
  logUri: string,
  meta: RecordingMeta,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): ReadFixLogResult {
  const { records: fixes, skipped } = readChunkedJsonl<FixLogEntry>(logUri, chunkSize);

  let recovered = false;
  if (meta.endedAtUtcMs == null && fixes.length > 0) {
    meta.endedAtUtcMs = fixes.at(-1)!.t;
    recovered = true;
  }

  return { fixes, skipped, recovered };
}

/**
 * Deletes sessions whose fix logs are past the retention window (D10).
 *
 * Only sessions that have been saved (`savedActivityId` present) and whose
 * `endedAtUtcMs` is older than the window are deleted; an unfinished session
 * is never deleted by age - it is offered for recovery instead (§3.7).
 */
export async function sweepExpiredSessions(): Promise<void> {
  const sessions = await GpsTracker.listSessions();
  const cutoff = Date.now() - FIX_LOG_RETENTION_DAYS * MS_PER_DAY;

  const expired = sessions.filter(
    meta => meta.savedActivityId != null && meta.endedAtUtcMs != null && meta.endedAtUtcMs < cutoff
  );
  await Promise.all(expired.map(meta => GpsTracker.discardSession(meta.sessionId)));
}

/**
 * Deletes the fix-log session directory associated with a deleted activity
 * (§3.5, §3.7). The reverse lookup `activityId → sessionId` uses
 * `listSessions()` filtered on `savedActivityId`.
 */
export async function discardSessionForActivity(activityId: string): Promise<void> {
  if (!activityId.startsWith('recorded-')) {
    return;
  }
  const sessions = await GpsTracker.listSessions();
  const matching = sessions.filter(meta => meta.savedActivityId === activityId);
  await Promise.all(matching.map(meta => GpsTracker.discardSession(meta.sessionId)));
}

/**
 * The sessions a crashed or killed recording leaves behind: those with no
 * `savedActivityId` and no live service behind them.
 *
 * The offer to save or discard them is the recovery flow in §3.7; it lands in
 * Phase 3, when the replay can turn a session into an activity. Here we only
 * identify them (and repair the `endedAtUtcMs` of a killed-mid-session one
 * when its log is read).
 */
export async function listUnfinishedSessions(): Promise<
  { meta: RecordingMeta; recovered: boolean }[]
> {
  const [sessions, state] = await Promise.all([
    GpsTracker.listSessions(),
    GpsTracker.getRecordingState()
  ]);

  const unfinished: { meta: RecordingMeta; recovered: boolean }[] = [];
  for (const meta of sessions) {
    if (meta.savedActivityId) {
      continue;
    }
    if (state.sessionId === meta.sessionId) {
      continue; // the service is still running this one
    }
    unfinished.push({ meta, recovered: meta.endedAtUtcMs == null });
  }
  return unfinished;
}
