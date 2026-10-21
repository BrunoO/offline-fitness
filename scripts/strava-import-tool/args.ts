import { APP_CONFIG } from '@/constants';
import { WebDavConfig } from '@/features/backup/services/webdavTransport';

/**
 * Command-line parsing and validation, deliberately free of I/O: the rules
 * that protect a user from a silently-broken import (missing timezone, wrong
 * profile characters, a malformed server URL) are worth unit tests, and those
 * tests should not have to stub a file system or a server.
 */

export type Command = 'import' | 'status' | 'help';

export interface ToolOptions {
  command: Command;
  archivePath?: string;
  rootUrl?: string;
  username?: string;
  profile?: string;
  timezone?: string;
  concurrency: number;
  dryRun: boolean;
  passwordFromStdin: boolean;
}

export const USAGE = `strava-import — seed a WebDAV backup collection from a Strava export

Usage:
  strava-import import --archive <export.zip> --root <url> --user <name> \\
       --profile <label> --tz <IANA zone> [--concurrency 8] [--dry-run] [--password-stdin]
  strava-import status --root <url> --user <name> --profile <label> [--password-stdin]
  strava-import help

  --archive   The ZIP from Strava's "Download your account" page.
  --root      WebDAV *account root* — exactly what the phone's Backup screen asks for
              (Nextcloud: https://host/remote.php/dav/files/<user>/). The collection
              folder is composed below it, the same way the phone composes it.
  --user      WebDAV username.
  --profile   The athlete label chosen on the phone. A mismatch is refused by both
              the tool and the phone (collection ownership), so pick it from the
              phone's Backup screen rather than typing it again here.
  --tz        IANA zone used for activities with no GPS fix (manual entries, swims, .fit) —
              use the phone's zone (e.g. Europe/Paris). Activities WITH a track get their
              zone from the GPS start automatically, so holiday rides land in the day and
              hour they actually happened; the report lists every zone used.
  --password-stdin  Read the password from stdin. Or set STRAVA_IMPORT_PASSWORD.
              Never a flag: argv leaks to every local process through ps.
  --concurrency  Parallel uploads, 1..32 (default 8).
  --dry-run  Parse, convert and report; no network access, nothing written.

The run is resumable: re-running after an interruption skips everything the
server already has, and the phone picks the collection up with its Restore
action. It is also re-entrant against the phone's own pushes: files whose md5
matches the remote state are not re-uploaded.`;

/** Mirrors `validateProfile` in the app's `webdavAuth.ts` — keep in step. */
const PROFILE_PATTERN = /^[A-Za-z0-9._-]+$/;
const PROFILE_MAX_LENGTH = 64;

function requireValue(flag: string, value: string | undefined): string {
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} needs a value.`);
  }
  return value;
}

export function parseArgs(argv: string[]): ToolOptions {
  const options: ToolOptions = {
    command: 'help',
    concurrency: 8,
    dryRun: false,
    passwordFromStdin: false
  };

  if (argv.length === 0) return options;

  const command = argv[0];
  if (command === 'help' || command === '--help' || command === '-h') {
    return { ...options, command: 'help' };
  }
  if (command !== 'import' && command !== 'status') {
    throw new Error(`Unknown command "${command}" — expected import, status or help.`);
  }
  options.command = command;

  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--archive':
        options.archivePath = requireValue(flag, argv[++i]);
        break;
      case '--root':
        options.rootUrl = requireValue(flag, argv[++i]);
        break;
      case '--user':
        options.username = requireValue(flag, argv[++i]);
        break;
      case '--profile':
        options.profile = requireValue(flag, argv[++i]);
        break;
      case '--tz':
        options.timezone = requireValue(flag, argv[++i]);
        break;
      case '--concurrency': {
        const raw = requireValue(flag, argv[++i]);
        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 32) {
          throw new Error(`--concurrency must be a whole number from 1 to 32 (got "${raw}".)`);
        }
        options.concurrency = parsed;
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--password-stdin':
        options.passwordFromStdin = true;
        break;
      default:
        throw new Error(`Unknown option "${flag}" — see the usage below.\n\n${USAGE}`);
    }
  }

  validate(options);
  return options;
}

function validate(options: ToolOptions): void {
  const missing: string[] = [];
  if (options.command === 'import' && !options.archivePath) missing.push('--archive');
  if (!options.rootUrl) missing.push('--root');
  if (!options.username) missing.push('--user');
  if (!options.profile) missing.push('--profile');
  if (options.command === 'import' && !options.timezone) missing.push('--tz');
  if (missing.length > 0) {
    throw new Error(
      `Missing required ${missing.length === 1 ? 'option' : 'options'}: ${missing.join(', ')}.`
    );
  }

  if (!options.timezone) return; // status command does not need a timezone
  try {
    Intl.DateTimeFormat(undefined, { timeZone: options.timezone });
  } catch {
    throw new Error(
      `Unknown IANA timezone "${options.timezone}". Use a zone like "Europe/Paris" or "UTC" — ` +
        'the one the phone that reads these records lives in.'
    );
  }
}

/**
 * Compose the collection URL. Mirrors `collectionUrlFor` in the app's
 * `webdavAuth.ts` (kept local because that module is not Node-loadable —
 * AsyncStorage, expo-secure-store and React). Keep the two in step; the
 * schemaVersion gate makes a drift loud on the next sync rather than silent.
 */
export function buildConfig(options: ToolOptions, password: string): WebDavConfig {
  const rootUrl = options.rootUrl as string;
  const profile = options.profile as string;

  try {
    const parsed = new URL(rootUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error();
    }
  } catch {
    throw new Error(
      '--root must be a WebDAV account root URL (e.g. https://host/remote.php/dav/files/<user>), ' +
        `got "${rootUrl}".`
    );
  }
  if (
    !PROFILE_PATTERN.test(profile) ||
    profile.length > PROFILE_MAX_LENGTH ||
    profile === '.' ||
    profile === '..'
  ) {
    throw new Error(
      'The profile name may only contain letters, digits, dots, dashes and underscores ' +
        `(up to ${PROFILE_MAX_LENGTH} characters), and cannot be "." or "..".`
    );
  }

  const root = rootUrl.replace(/\/+$/, '');
  return {
    baseUrl: `${root}/${APP_CONFIG.BACKUP_APP_ID}/${profile}`,
    rootUrl,
    profile,
    username: options.username as string,
    password
  };
}

/**
 * Where the password comes from. Returns `'stdin'` when the user asked for it;
 * the CLI does the actual read so this stays pure (and testable).
 */
export function resolvePasswordSource(
  options: ToolOptions,
  env: Record<string, string | undefined> = process.env
): 'stdin' | string {
  if (options.passwordFromStdin) return 'stdin';
  const fromEnv = env.STRAVA_IMPORT_PASSWORD;
  if (fromEnv === undefined || fromEnv === '') {
    throw new Error(
      'No WebDAV password. Add --password-stdin (and pipe it in) or set the ' +
        'STRAVA_IMPORT_PASSWORD environment variable. Passing it as a flag is not ' +
        'offered on purpose: argv leaks through ps.'
    );
  }
  return fromEnv;
}
