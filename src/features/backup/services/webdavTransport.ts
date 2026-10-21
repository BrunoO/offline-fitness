import { simpleLogger } from '@/shared/services/SimpleLogger';

/**
 * Minimal RFC 4918 WebDAV transport over fetch: PROPFIND (connection test),
 * MKCOL (folders), PUT (upload/overwrite), GET (download), DELETE (removal).
 * Deliberately provider-neutral so the same code works against Nextcloud,
 * rclone serve webdav, Apache mod_dav, or a NAS. The server URL is expected
 * to be the account root (for Nextcloud:
 * https://host/remote.php/dav/files/<user>/); the app composes the
 * collection below it (see webdavAuth.ts).
 */

export class WebDavTransportError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'WebDavTransportError';
    this.status = status;
  }
}

export interface WebDavConfig {
  /** Collection URL every file operation is relative to. */
  baseUrl: string;
  /** Account root as entered by the user; the collection lives below it. */
  rootUrl: string;
  /** Athlete label identifying the collection. */
  profile: string;
  username: string;
  password: string;
}

const REQUEST_TIMEOUT_MS = 30000;

/**
 * Basic-auth header. Credentials are per spec ISO-8859-1; usernames and
 * app passwords are effectively always ASCII, which btoa accepts directly.
 */
function basicAuth(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

/**
 * Drops trailing slashes with a linear scan: the regex `/\/+$/` backtracks
 * quadratically over slash runs (Sonar S8786), and URLs ending in garbage
 * are exactly what user-entered server roots look like.
 */
export function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url.codePointAt(end - 1) === 0x2f) end--;
  return url.slice(0, end);
}

/** Joins a base collection URL with path segments, tolerating a trailing slash. */
export function davUrl(baseUrl: string, ...segments: string[]): string {
  const trimmed = trimTrailingSlashes(baseUrl);
  const path = segments.map(segment => encodeURIComponent(segment)).join('/');
  return `${trimmed}/${path}`;
}

/**
 * Runs a WebDAV request with timeout and basic auth, throwing
 * WebDavTransportError (carrying the HTTP status) on non-2xx/207.
 *
 * Statuses the caller treats as control flow (`expectedStatuses`) are still
 * thrown — the caller branches on them — but not logged as errors: an
 * "already exists" MKCOL or an "already gone" DELETE on every sync is not a
 * failure, and logging it red buries the genuine ones in the LogScreen.
 */
/** Content-Type for a request body: JSON for strings, raw bytes for binaries, none when empty. */
function contentTypeForBody(body: string | Uint8Array | undefined): string | undefined {
  if (body === undefined) return undefined;
  return typeof body === 'string' ? 'application/json; charset=utf-8' : 'application/octet-stream';
}

async function davRequest(
  config: WebDavConfig,
  url: string,
  method: string,
  body?: string | Uint8Array,
  extraHeaders: Record<string, string> = {},
  expectedStatuses: readonly number[] = []
): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const contentType = contentTypeForBody(body);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: basicAuth(config.username, config.password),
        ...(contentType !== undefined ? { 'Content-Type': contentType } : {}),
        ...extraHeaders
      },
      body: body as BodyInit | undefined,
      signal: controller.signal
    });
    const text = await response.text();
    // 207 Multi-Status is the success code for PROPFIND.
    if (!response.ok && response.status !== 207) {
      if (!expectedStatuses.includes(response.status)) {
        simpleLogger.error('WebDAV request failed', {
          method,
          url,
          status: response.status,
          body: text.slice(0, 500)
        });
      }
      throw new WebDavTransportError(
        `WebDAV request failed: ${response.status} ${response.statusText}`,
        response.status
      );
    }
    return { status: response.status, text };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Verifies the server URL and credentials with a Depth-0 PROPFIND on the
 * collection root. Any 2xx/207 means the endpoint speaks WebDAV and the
 * credentials work; 401/403 mean bad credentials or missing permission.
 */
export async function testDavConnection(config: WebDavConfig): Promise<void> {
  await davRequest(config, trimTrailingSlashes(config.baseUrl) + '/', 'PROPFIND', undefined, {
    Depth: '0'
  });
}

/**
 * Creates a collection (folder) and, for several segments, every parent
 * level first — servers reject a nested MKCOL whose parent is missing.
 * 405 (or 301) means the collection already exists, which is the desired
 * end state, so it is not an error.
 */
export async function ensureDavFolder(config: WebDavConfig, ...segments: string[]): Promise<void> {
  let current = trimTrailingSlashes(config.baseUrl);
  for (const segment of segments) {
    current = davUrl(current, segment);
    try {
      await davRequest(config, current + '/', 'MKCOL', undefined, {}, [405, 301]);
      simpleLogger.log('Created WebDAV folder', { path: current });
    } catch (error) {
      if (error instanceof WebDavTransportError && (error.status === 405 || error.status === 301)) {
        continue; // already there
      }
      throw error;
    }
  }
}

/**
 * Uploads a file, overwriting any existing file with the same name
 * (plain PUT without If-None-Match overwrites per RFC 4918).
 */
export async function putDavFile(
  config: WebDavConfig,
  ...pathSegmentsAndContent: [...string[], string | Uint8Array]
): Promise<void> {
  const content = pathSegmentsAndContent.at(-1)!;
  const segments = pathSegmentsAndContent.slice(0, -1) as string[];
  await davRequest(config, davUrl(config.baseUrl, ...segments), 'PUT', content);
}

/**
 * Downloads a file's text content. Throws WebDavTransportError with
 * status 404 when the file does not exist.
 */
export async function getDavFile(config: WebDavConfig, ...segments: string[]): Promise<string> {
  const { text } = await davRequest(config, davUrl(config.baseUrl, ...segments), 'GET');
  return text;
}

/**
 * Downloads a file's binary content as a `Uint8Array`. Throws
 * WebDavTransportError with status 404 when the file does not exist.
 */
export async function getDavFileBytes(
  config: WebDavConfig,
  ...segments: string[]
): Promise<Uint8Array> {
  const url = davUrl(config.baseUrl, ...segments);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: basicAuth(config.username, config.password)
      },
      signal: controller.signal
    });
    if (!response.ok && response.status !== 207) {
      const text = await response.text();
      simpleLogger.error('WebDAV request failed', {
        method: 'GET',
        url,
        status: response.status,
        body: text.slice(0, 500)
      });
      throw new WebDavTransportError(
        `WebDAV request failed: ${response.status} ${response.statusText}`,
        response.status
      );
    }
    if (typeof response.arrayBuffer === 'function') {
      return new Uint8Array(await response.arrayBuffer());
    }
    const text = await response.text();
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      bytes[i] = text.charCodeAt(i) & 0xff; // NOSONAR - deliberate UTF-16 code-unit truncation; codePointAt would change astral characters
    }
    return bytes;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Deletes a file. A 404 (already gone) is the desired end state and is
 * not an error.
 */
export async function deleteDavFile(config: WebDavConfig, ...segments: string[]): Promise<void> {
  try {
    await davRequest(config, davUrl(config.baseUrl, ...segments), 'DELETE', undefined, {}, [404]);
  } catch (error) {
    if (error instanceof WebDavTransportError && error.status === 404) return;
    throw error;
  }
}
