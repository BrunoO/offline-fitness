describe('HAS_GOOGLE_MAPS_KEY', () => {
  const key = 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY';

  afterEach(() => {
    // Restore the default dummy key set by jest.setup.js so other suites are
    // not affected by this one toggling the variable.
    process.env[key] = 'test-key';
    jest.resetModules();
  });

  it('is true when a Google Maps API key is inlined at build time', () => {
    process.env[key] = 'test-key';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HAS_GOOGLE_MAPS_KEY: hasKey } = require('../googleMapsKey');
    expect(hasKey).toBe(true);
  });

  it('is false when the key is left empty (real offline mode)', () => {
    delete process.env[key];
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HAS_GOOGLE_MAPS_KEY: hasKey } = require('../googleMapsKey');
    expect(hasKey).toBe(false);
  });
});
