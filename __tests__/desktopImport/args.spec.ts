import {
  buildConfig,
  parseArgs,
  resolvePasswordSource
} from '../../scripts/strava-import-tool/args';

/**
 * Argument validation is the last line of defence against the mistakes that
 * corrupt a collection silently: a missing --tz (shifted calendar buckets) or
 * a mistyped profile (writing into the wrong athlete's folder) must fail at
 * parse time, before a byte is uploaded.
 */

const VALID = [
  'import',
  '--archive',
  '/tmp/export.zip',
  '--root',
  'https://srv.example/dav/',
  '--user',
  'bruno',
  '--profile',
  'bruno',
  '--tz',
  'Europe/Paris',
  '--password-stdin'
];

describe('parseArgs', () => {
  it('shows help for no arguments', () => {
    expect(parseArgs([]).command).toBe('help');
    expect(parseArgs(['help']).command).toBe('help');
  });

  it('rejects an unknown command', () => {
    expect(() => parseArgs(['seed'])).toThrow(/unknown command/i);
  });

  it('parses a valid import invocation', () => {
    const options = parseArgs(VALID);
    expect(options).toMatchObject({
      command: 'import',
      archivePath: '/tmp/export.zip',
      profile: 'bruno',
      timezone: 'Europe/Paris',
      concurrency: 8,
      passwordFromStdin: true
    });
  });

  it('requires the archive and the timezone for import', () => {
    expect(() =>
      parseArgs(['import', '--root', 'https://x/dav', '--user', 'u', '--profile', 'p'])
    ).toThrow(/--archive/);
    const withoutTz = [
      'import',
      '--archive',
      '/tmp/e.zip',
      '--root',
      'https://x/dav',
      '--user',
      'u',
      '--profile',
      'p'
    ];
    expect(() => parseArgs(withoutTz)).toThrow(/--tz/);
  });

  it('status does not need an archive or a timezone', () => {
    const options = parseArgs([
      'status',
      '--root',
      'https://x/dav',
      '--user',
      'u',
      '--profile',
      'p',
      '--password-stdin'
    ]);
    expect(options.command).toBe('status');
    expect(options.archivePath).toBeUndefined();
  });

  it('rejects an unknown IANA timezone', () => {
    const withBadTz = VALID.map(arg => (arg === 'Europe/Paris' ? 'Nowhere/Land' : arg));
    expect(() => parseArgs(withBadTz)).toThrow(/unknown iana timezone/i);
  });

  it('bounds --concurrency', () => {
    expect(() => parseArgs([...VALID, '--concurrency', '0'])).toThrow(/concurrency/);
    expect(() => parseArgs([...VALID, '--concurrency', '99'])).toThrow(/concurrency/);
    expect(() => parseArgs([...VALID, '--concurrency', 'soon'])).toThrow(/concurrency/);
    expect(parseArgs([...VALID, '--concurrency', '3']).concurrency).toBe(3);
  });

  it('refuses an unknown option', () => {
    expect(() => parseArgs([...VALID, '--delete-everything'])).toThrow(/Unknown option/);
  });

  it('requires a value for every flag', () => {
    expect(() => parseArgs([...VALID.slice(0, -1), '--tz'])).toThrow(/needs a value/);
  });

  it('passes --dry-run through', () => {
    expect(parseArgs([...VALID, '--dry-run']).dryRun).toBe(true);
  });
});

describe('buildConfig', () => {
  const options = parseArgs(VALID);

  it('composes the collection URL below the account root, like the phone', () => {
    const config = buildConfig(options, 'pw');
    expect(config.baseUrl).toBe('https://srv.example/dav/offline-fitness/bruno');
    expect(config.rootUrl).toBe('https://srv.example/dav/');
    expect(config.password).toBe('pw');
  });

  it('rejects a root that is not an http(s) URL', () => {
    expect(() => buildConfig({ ...options, rootUrl: 'srv.example/dav' }, 'pw')).toThrow(
      /account root/i
    );
  });

  it('rejects profile names that are not URL-safe folder names, including "." and ".."', () => {
    expect(() => buildConfig({ ...options, profile: 'bruno spaces' }, 'pw')).toThrow(/profile/);
    expect(() => buildConfig({ ...options, profile: '..' }, 'pw')).toThrow(/profile/);
  });
});

describe('resolvePasswordSource', () => {
  it('prefers stdin when asked', () => {
    expect(resolvePasswordSource(parseArgs(VALID), {})).toBe('stdin');
  });

  it('falls back to the environment variable', () => {
    const options = parseArgs(VALID.filter(flag => flag !== '--password-stdin'));
    expect(resolvePasswordSource(options, { STRAVA_IMPORT_PASSWORD: 'from-env' })).toBe('from-env');
  });

  it('fails with guidance when neither is present', () => {
    const options = parseArgs(VALID.filter(flag => flag !== '--password-stdin'));
    expect(() => resolvePasswordSource(options, {})).toThrow(/STRAVA_IMPORT_PASSWORD/);
  });
});
