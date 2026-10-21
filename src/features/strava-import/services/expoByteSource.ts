import { ByteSource } from '../types/import.types';
import { File, FileMode } from 'expo-file-system';

/**
 * The `expo-file-system` half of the ZIP reader.
 *
 * `zipReader.ts` is deliberately free of expo and react-native imports — the
 * archive-parsing pipeline it backs is being carved into a portable core so a
 * desktop tool can run the same conversion code outside the app (see
 * `docs/desktop-import-plan.md`, Phase 0). This file holds the one piece that
 * genuinely needs the platform: the single-open-handle byte source over an
 * expo `File`. Any other runtime supplies its own `ByteSource` over the
 * interface (`createMemoryByteSource` in `zipReader.ts` is the test-side
 * example; a Node tool would back it with `fs`).
 */

/**
 * Byte source backed by an expo-file-system file, seeking with a single handle.
 * Seeking per read keeps native calls at two per entry (header + payload).
 */
export function createFileByteSource(file: File): ByteSource {
  const handle = file.open(FileMode.ReadOnly);
  const size = file.size;

  const read = async (offset: number, length: number): Promise<Uint8Array> => {
    const clampedLength = Math.max(0, Math.min(length, size - offset));
    if (clampedLength === 0) return new Uint8Array(0);
    handle.offset = offset;
    const buffer = new Uint8Array(clampedLength);
    let filled = 0;
    while (filled < clampedLength) {
      const chunk = handle.readBytes(clampedLength - filled);
      if (chunk.length === 0) break;
      buffer.set(chunk, filled);
      filled += chunk.length;
    }
    return filled === clampedLength ? buffer : buffer.subarray(0, filled);
  };

  return {
    size,
    read,
    close: () => {
      try {
        handle.close();
      } catch {
        // Already closed; nothing to do.
      }
    }
  };
}
