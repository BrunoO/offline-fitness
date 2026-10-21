import { simpleLogger } from '@/shared/services/SimpleLogger';

/**
 * Minimal RFC 4918 WebDAV transport over fetch: PROPFIND (connection test),
 * MKCOL (folders), PUT (upload/overwrite), GET (download). Deliberately
 * provider-neutral so the same code works against Nextcloud, rclone serve
 * webdav, Apache mod_dav, or a NAS. The server URL is expected to be the
 * full collection root (for Nextcloud:
 * https://host/remote.php/dav/files/<user>/).
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
  baseUrl: string;
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

/** Joins a base collection URL with path segments, tolerating a trailing slash. */
export function davUrl(baseUrl: string, ...segments: string[]): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  const path = segments.map(segment => encodeURIComponent(segment)).join('/');
  return `${trimmed}/${path}`;
}

/**
 * Runs a WebDAV request with timeout and basic auth, throwing
 * WebDavTransportError (carrying the HTTP status) on non-2xx/207.
 */
async function davRequest(
  config: WebDavConfig,
  url: string,
  method: string,
  body?: string,
  extraHeaders: Record<string, string> = {}
): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: basicAuth(config.username, config.password),
        ...(body !== undefined ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
        ...extraHeaders
      },
      body,
      signal: controller.signal
    });
    const text = await response.text();
    // 207 Multi-Status is the success code for PROPFIND.
    if (!response.ok && response.status !== 207) {
      simpleLogger.error('WebDAV request failed', {
        method,
        url,
        status: response.status,
        body: text.slice(0, 500)
      });
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
  await davRequest(config, config.baseUrl.replace(/\/+$/, '') + '/', 'PROPFIND', undefined, {
    Depth: '0'
  });
}

/**
 * Creates a collection (folder). 405 Method Not Allowed means it already
 * exists, which is the desired end state, so it is not an error.
 */
export async function ensureDavFolder(config: WebDavConfig, name: string): Promise<void> {
  try {
    await davRequest(config, davUrl(config.baseUrl, name) + '/', 'MKCOL');
    simpleLogger.log('Created WebDAV folder', { name });
  } catch (error) {
    if (error instanceof WebDavTransportError && error.status === 405) return;
    throw error;
  }
}

/**
 * Uploads a file, overwriting any existing file with the same name
 * (plain PUT without If-None-Match overwrites per RFC 4918).
 */
export async function putDavFile(
  config: WebDavConfig,
  ...pathSegmentsAndContent: [...string[], string]
): Promise<void> {
  const content = pathSegmentsAndContent[pathSegmentsAndContent.length - 1];
  const segments = pathSegmentsAndContent.slice(0, -1);
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
 * Deletes a file. A 404 (already gone) is the desired end state and is
 * not an error.
 */
export async function deleteDavFile(config: WebDavConfig, ...segments: string[]): Promise<void> {
  try {
    await davRequest(config, davUrl(config.baseUrl, ...segments), 'DELETE');
  } catch (error) {
    if (error instanceof WebDavTransportError && error.status === 404) return;
    throw error;
  }
}
