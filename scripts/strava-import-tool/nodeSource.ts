import { ByteSource } from '@/features/strava-import/types/import.types';
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

/**
 * `ByteSource` over a plain file, for the desktop import tool.
 *
 * The phone's implementation (`expoByteSource.ts`) uses a single expo
 * `FileHandle` because native round trips are expensive; here the same
 * positional-read shape uses `fs.readSync(fd, ..., position)` — a pread, so
 * concurrent workers sharing this source cannot corrupt each other's offsets,
 * which the handle-offset version needed an open-per-read to avoid.
 */

const READ_CHUNK = 512 * 1024;

export interface NodeByteSource extends ByteSource {
  close(): void;
}

export function createNodeByteSource(filePath: string): NodeByteSource {
  const fd = openSync(filePath, 'r');
  const size = fstatSync(fd).size;
  let closed = false;

  const read = async (offset: number, length: number): Promise<Uint8Array> => {
    const clampedLength = Math.max(0, Math.min(length, size - offset));
    if (clampedLength === 0) return new Uint8Array(0);
    const buffer = Buffer.alloc(clampedLength);
    let filled = 0;
    while (filled < clampedLength) {
      const chunk = readSync(
        fd,
        buffer,
        filled,
        Math.min(READ_CHUNK, clampedLength - filled),
        offset + filled
      );
      if (chunk === 0) break;
      filled += chunk;
    }
    return new Uint8Array(buffer.buffer, buffer.byteOffset, filled);
  };

  return {
    size,
    read,
    close: () => {
      if (closed) return;
      closed = true;
      try {
        closeSync(fd);
      } catch {
        // Already closed; nothing to do.
      }
    }
  };
}
