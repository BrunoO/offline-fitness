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
  const jsonFile = new File(folder, `${id}.json`);
  // writeSync preserves the synchronous save contract: the stream file must be
  // complete before the legacy-shadow cleanup below runs (SDK 58 made write() async).
  jsonFile.writeSync(encoded);

  // If a legacy .bin file exists for this activity, delete it so it cannot shadow the updated stream.
  const legacyBinFile = new File(folder, `${id}.bin`);
  if (legacyBinFile.exists) {
    try {
      legacyBinFile.delete();
    } catch {
      // Ignore cleanup error
    }
  }
}
