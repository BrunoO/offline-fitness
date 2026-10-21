import { APP_CONFIG } from '@/constants';
import {
  WebDavConfig,
  WebDavTransportError,
  ensureDavFolder,
  getDavFile,
  putDavFile
} from '@/features/backup/services/webdavTransport';

/**
 * The collection-level WebDAV operations the seeder needs.
 *
 * `createLiveDavClient` wires this to the app's own `webdavTransport` —
 * portable since the binary-format commit made PUT/GET byte-aware and Phase 0
 * made its logger dependency Node-safe. Importing the transport (instead of
 * re-implementing it) keeps URL encoding, timeouts, the basic-auth header and
 * the 404-vs-error convention identical to the phone's.
 *
 * The interface exists so the orchestrator can be tested against an
 * in-memory store: orderings and skip behaviour are the contract with the
 * phone's `pullBackup`, and they deserve real assertions rather than a live
 * server.
 */
export interface DavClient {
  /** PUT/GET/PROPFIND/MKCOL are all relative to the collection, as in the app. */
  readonly config: WebDavConfig;
  /** Create `<root>/<APP_ID>/<profile>/` one level at a time, then the two folders. */
  ensureFolders(): Promise<void>;
  /** GET text; `null` when the file does not exist (404). */
  getText(segments: string[]): Promise<string | null>;
  /** PUT text (activities and the control files). */
  putText(segments: string[], body: string): Promise<void>;
  /** PUT raw bytes (binary stream payloads). */
  putBytes(segments: string[], body: Uint8Array): Promise<void>;
}

function isNotFound(error: unknown): boolean {
  return error instanceof WebDavTransportError && error.status === 404;
}

export function createLiveDavClient(config: WebDavConfig): DavClient {
  return {
    config,
    async ensureFolders() {
      // The collection chain from the account root, then the two folders
      // below it — exactly the sequence `pushBackup` runs.
      await ensureDavFolder(
        { ...config, baseUrl: config.rootUrl },
        APP_CONFIG.BACKUP_APP_ID,
        config.profile
      );
      await ensureDavFolder(config, APP_CONFIG.BACKUP_ACTIVITIES_FOLDER);
      await ensureDavFolder(config, APP_CONFIG.BACKUP_STREAMS_FOLDER);
    },
    async getText(segments) {
      try {
        return await getDavFile(config, ...segments);
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async putText(segments, body) {
      await putDavFile(config, ...segments, body);
    },
    async putBytes(segments, body) {
      await putDavFile(config, ...segments, body);
    }
  };
}
