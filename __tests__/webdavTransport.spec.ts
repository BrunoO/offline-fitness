import {
  WebDavTransportError,
  davUrl,
  deleteDavFile,
  ensureDavFolder,
  getDavFile,
  putDavFile,
  testDavConnection
} from '@/features/backup/services/webdavTransport';

const CONFIG = {
  baseUrl: 'https://cloud.example.com/remote.php/dav/files/testuser',
  username: 'testuser',
  password: 'app-password'
} as const;

function davResponse(status: number, body = '') {
  return {
    // 207 Multi-Status is the PROPFIND success code.
    ok: (status >= 200 && status < 300) || status === 207,
    status,
    statusText: status === 207 ? 'Multi-Status' : 'Response',
    text: async () => body
  };
}

describe('webdavTransport', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('davUrl', () => {
    it('joins segments and tolerates a trailing slash on the base', () => {
      expect(davUrl('https://h/dav/', 'activities', '9.json')).toBe(
        'https://h/dav/activities/9.json'
      );
      expect(davUrl('https://h/dav', 'sync-state.json')).toBe('https://h/dav/sync-state.json');
    });

    it('encodes each segment', () => {
      expect(davUrl('https://h/dav', 'a b.json')).toBe('https://h/dav/a%20b.json');
    });
  });

  it('tests the connection with a Depth-0 PROPFIND and basic auth', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(davResponse(207));

    await testDavConnection(CONFIG);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe('https://cloud.example.com/remote.php/dav/files/testuser/');
    expect(init.method).toBe('PROPFIND');
    expect(init.headers.Depth).toBe('0');
    expect(init.headers.Authorization).toBe(
      `Basic ${btoa(`${CONFIG.username}:${CONFIG.password}`)}`
    );
  });

  it('creates a folder with MKCOL', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(davResponse(201));

    await ensureDavFolder(CONFIG, 'activities');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe(
      'https://cloud.example.com/remote.php/dav/files/testuser/activities/'
    );
    expect(init.method).toBe('MKCOL');
  });

  it('treats MKCOL 405 (folder already exists) as success', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(davResponse(405));

    await expect(ensureDavFolder(CONFIG, 'streams')).resolves.toBeUndefined();
  });

  it('rethrows other MKCOL failures', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(davResponse(403));

    await expect(ensureDavFolder(CONFIG, 'streams')).rejects.toMatchObject({
      name: 'WebDavTransportError',
      status: 403
    } satisfies Partial<WebDavTransportError>);
  });

  it('uploads with PUT to the joined URL', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(davResponse(201));

    await putDavFile(CONFIG, 'activities', '9.json', '{"id":9}');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe(
      'https://cloud.example.com/remote.php/dav/files/testuser/activities/9.json'
    );
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('{"id":9}');
  });

  it('downloads raw text with GET', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(davResponse(200, '{"syncedAt":"x"}'));

    const content = await getDavFile(CONFIG, 'sync-state.json');

    expect(content).toBe('{"syncedAt":"x"}');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe(
      'https://cloud.example.com/remote.php/dav/files/testuser/sync-state.json'
    );
    expect(init.method).toBe('GET');
  });

  it('deletes with DELETE to the joined URL', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(davResponse(204));

    await deleteDavFile(CONFIG, 'activities', '1.json');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe(
      'https://cloud.example.com/remote.php/dav/files/testuser/activities/1.json'
    );
    expect(init.method).toBe('DELETE');
  });

  it('treats DELETE 404 (already gone) as success', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(davResponse(404));

    await expect(deleteDavFile(CONFIG, 'activities', '1.json')).resolves.toBeUndefined();
  });

  it('rethrows other DELETE failures', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(davResponse(500));

    await expect(deleteDavFile(CONFIG, 'activities', '1.json')).rejects.toThrow(
      WebDavTransportError
    );
  });

  it('throws WebDavTransportError with status on auth failures', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(davResponse(401));

    await expect(testDavConnection(CONFIG)).rejects.toMatchObject({
      name: 'WebDavTransportError',
      status: 401
    } satisfies Partial<WebDavTransportError>);
  });

  it('accepts 207 Multi-Status as the PROPFIND success code', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(davResponse(207));

    await expect(testDavConnection(CONFIG)).resolves.toBeUndefined();
  });
});
