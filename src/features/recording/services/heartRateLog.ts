import { File } from 'expo-file-system';
import type { RecordingMeta } from './gpsTracker';
import type { HeartRateSample } from '../types/heartRate';

const DEFAULT_CHUNK_SIZE = 256 * 1024;

export interface ReadHeartRateLogResult {
  samples: HeartRateSample[];
  skipped: number;
}

/**
 * Absolute URI of the heart-rate JSONL file for a session, derived from the
 * fix-log URI so it lives in the same session folder and is removed together
 * with it.
 */
export function heartRateLogUri(meta: RecordingMeta): string {
  const lastSlash = meta.logUri.lastIndexOf('/');
  if (lastSlash === -1) {
    return 'heartrate.jsonl';
  }
  return `${meta.logUri.slice(0, lastSlash + 1)}heartrate.jsonl`;
}

/**
 * Reads a heart-rate log in chunks, yielding complete JSONL records.
 *
 * A truncated final line or a malformed line is skipped and counted, so a
 * damaged log still produces a usable activity rather than losing the
 * recording.
 */
export function readHeartRateLog(
  logUri: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): ReadHeartRateLogResult {
  const file = new File(logUri);
  if (!file.exists) {
    return { samples: [], skipped: 0 };
  }
  const handle = file.open();

  const samples: HeartRateSample[] = [];
  let skipped = 0;
  let offset = 0;
  let buffer = '';
  const decoder = new TextDecoder();

  try {
    const totalSize = handle.size ?? 0;
    while (offset < totalSize) {
      const toRead = Math.min(chunkSize, totalSize - offset);
      handle.offset = offset;

      const bytes = handle.readBytes(toRead);
      offset += bytes.length;

      buffer += decoder.decode(bytes, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        try {
          samples.push(JSON.parse(trimmed) as HeartRateSample);
        } catch {
          skipped += 1;
        }
      }
    }

    buffer += decoder.decode();
    const trailing = buffer.trim();
    if (trailing) {
      try {
        samples.push(JSON.parse(trailing) as HeartRateSample);
      } catch {
        skipped += 1;
      }
    }
  } finally {
    handle.close();
  }

  samples.sort((a, b) => a.t - b.t);
  return { samples, skipped };
}

/**
 * Appends one heart-rate sample to the session's log. Safe to call repeatedly
 * during a live recording.
 */
export function appendHeartRateSample(logUri: string, sample: HeartRateSample): void {
  const file = new File(logUri);
  const line = `${JSON.stringify(sample)}\n`;
  if (file.exists) {
    const handle = file.open();
    try {
      handle.offset = handle.size ?? 0;
      handle.writeBytes(new TextEncoder().encode(line));
    } finally {
      handle.close();
    }
  } else {
    file.write(new TextEncoder().encode(line));
  }
}
