import { Directory, File, Paths } from 'expo-file-system';
import { encodeStreamSet } from '@/shared/services/streamCodec';
import { APP_CONFIG } from '@/constants';
import type { EncodableStreamSet } from '@/shared/services/streamCodec';

/**
 * Writes a stream set into `APP_CONFIG.STREAMS_FOLDER` using the compact
 * binary encoding, the same one restore writes raw server bytes with.
 *
 * ~15 lines, mobile only: no web fallback, no lazy-folder workaround. The
 * target is mobile, so the "storage unavailable" branch the older code
 * carried has no reason to be copied.
 */
export function writeStreamFile(id: string, stream: EncodableStreamSet): void {
  const encoded = encodeStreamSet(stream);
  const folder = new Directory(Paths.document, APP_CONFIG.STREAMS_FOLDER);
  folder.create({ idempotent: true });
  const file = new File(folder, `${id}.bin`);
  file.write(encoded);
}
