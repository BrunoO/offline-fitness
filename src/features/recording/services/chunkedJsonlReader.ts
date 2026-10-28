import { File } from 'expo-file-system';

export const DEFAULT_CHUNK_SIZE = 256 * 1024;

export interface ReadChunkedJsonlResult<T> {
  records: T[];
  skipped: number;
}

/**
 * Reads a JSONL file in chunks using expo-file-system File handle,
 * carrying partial trailing lines between chunks and skipping malformed records.
 */
export function readChunkedJsonl<T>(
  logUri: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): ReadChunkedJsonlResult<T> {
  const file = new File(logUri);
  if (!file.exists) {
    return { records: [], skipped: 0 };
  }
  const handle = file.open();

  const records: T[] = [];
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
          records.push(JSON.parse(trimmed) as T);
        } catch {
          skipped += 1;
        }
      }
    }

    buffer += decoder.decode();
    const trailing = buffer.trim();
    if (trailing) {
      try {
        records.push(JSON.parse(trailing) as T);
      } catch {
        skipped += 1;
      }
    }
  } finally {
    handle.close();
  }

  return { records, skipped };
}
