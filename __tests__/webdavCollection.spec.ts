import { collectionUrlFor, validateProfile } from '@/features/backup/services/webdavAuth';
import { ensureDavFolder, testDavConnection } from '@/features/backup/services/webdavTransport';

const ROOT = 'https://cloud.example.com/remote.php/dav/files/testuser';

function davResponse(status: number, body = '') {
  return {
    ok: (status >= 200 && status < 300) || status === 207,
    status,
    statusText: status === 207 ? 'Multi-Status' : 'Response',
    text: async () => body
  };
}

const CREDENTIALS = { username: 'testuser', password: 'app-password' };

describe('webdavAuth — profile label', () => {
  describe('validateProfile', () => {
    it('requires a non-empty label', () => {
      expect(validateProfile('')).toContain('required');
      expect(validateProfile('   ')).toContain('required');
    });

    it('accepts letters, digits, dots, dashes and underscores', () => {
      expect(validateProfile('bruno')).toBeNull();
      expect(validateProfile('Bruno-2')).toBeNull();
      expect(validateProfile('my_profile.1')).toBeNull();
    });

    it('rejects slashes and other path-breaking characters', () => {
      expect(validateProfile('a/b')).toContain('letters, digits');
      expect(validateProfile('a\\b')).toContain('letters, digits');
      expect(validateProfile('a b')).toContain('letters, digits');
    });

    it('rejects "." and "..", which would escape the folder', () => {
      expect(validateProfile('.')).toContain('"." or ".."');
      expect(validateProfile('..')).toContain('"." or ".."');
    });

    it('rejects a label longer than the limit', () => {
      expect(validateProfile('a'.repeat(65))).toContain('64 characters');
      expect(validateProfile('a'.repeat(64))).toBeNull();
    });
  });

  describe('collectionUrlFor', () => {
    it('nests the app id and the profile below the account root', () => {
      expect(collectionUrlFor(ROOT, 'bruno')).toBe(`${ROOT}/offline-fitness/bruno`);
    });

    it('tolerates a trailing slash on the root', () => {
      expect(collectionUrlFor(`${ROOT}/`, 'bruno')).toBe(`${ROOT}/offline-fitness/bruno`);
    });

    it('gives two profiles separate collections', () => {
      expect(collectionUrlFor(ROOT, 'bruno')).not.toBe(collectionUrlFor(ROOT, 'ana'));
    });
  });
});

describe('webdavTransport — collection setup', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates each level of the collection in order, so a nested MKCOL never misses its parent', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(davResponse(201));

    await ensureDavFolder(
      { ...CREDENTIALS, baseUrl: ROOT, rootUrl: ROOT, profile: 'bruno' },
      'offline-fitness',
      'bruno'
    );

    const urls = (global.fetch as jest.Mock).mock.calls.map(call => String(call[0]));
    expect(urls).toEqual([`${ROOT}/offline-fitness/`, `${ROOT}/offline-fitness/bruno/`]);
  });

  it('treats an existing collection (405) as success', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(davResponse(405));

    await expect(
      ensureDavFolder(
        { ...CREDENTIALS, baseUrl: ROOT, rootUrl: ROOT, profile: 'bruno' },
        'offline-fitness'
      )
    ).resolves.toBeUndefined();
  });

  it('rethrows other MKCOL failures', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(davResponse(403));

    await expect(
      ensureDavFolder(
        { ...CREDENTIALS, baseUrl: ROOT, rootUrl: ROOT, profile: 'bruno' },
        'offline-fitness'
      )
    ).rejects.toThrow();
  });

  it('probes the collection root with a Depth-0 PROPFIND', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(davResponse(207));

    await testDavConnection({
      ...CREDENTIALS,
      baseUrl: `${ROOT}/offline-fitness/bruno`,
      rootUrl: ROOT,
      profile: 'bruno'
    });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe(`${ROOT}/offline-fitness/bruno/`);
    expect(init.method).toBe('PROPFIND');
    expect(init.headers.Depth).toBe('0');
  });
});
