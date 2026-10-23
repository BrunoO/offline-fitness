import {
  buildManualTypeList,
  MANUAL_ACTIVITY_TYPES
} from '../../src/features/activities/services/manualActivity';
import {
  addCustomManualEntryType,
  loadManualEntryPrefs,
  saveLastManualEntryType
} from '../../src/features/activities/services/manualEntryPrefs';
import * as Storage from '../../src/shared/services/storage';

jest.mock('../../src/shared/services/storage');

const mockStorage = Storage as jest.Mocked<typeof Storage>;

describe('buildManualTypeList', () => {
  const activities = [
    { type: 'Ride' },
    { type: 'Ride' },
    { type: 'Ride' },
    { type: 'Yoga' },
    { type: 'Yoga' },
    { type: 'Run' }
  ];

  it('orders the user archive by frequency, then customs, then defaults', () => {
    const list = buildManualTypeList({
      activities,
      lastType: null,
      customTypes: ['Padel'],
      defaults: MANUAL_ACTIVITY_TYPES
    });
    expect(list.slice(0, 4)).toEqual(['Ride', 'Yoga', 'Run', 'Padel']);
    // Every default still reachable further down the row.
    expect(list).toEqual(expect.arrayContaining(MANUAL_ACTIVITY_TYPES));
  });

  it('pins the last-used type first without duplicating it', () => {
    const list = buildManualTypeList({
      activities,
      lastType: 'Yoga',
      customTypes: [],
      defaults: MANUAL_ACTIVITY_TYPES
    });
    expect(list[0]).toBe('Yoga');
    expect(list.filter(t => t === 'Yoga')).toHaveLength(1);
  });

  it('dedups case-insensitively, first casing wins', () => {
    const list = buildManualTypeList({
      activities: [{ type: 'Yoga' }],
      lastType: null,
      customTypes: ['yoga', 'Padel'],
      defaults: ['YOGA', 'Workout']
    });
    expect(list.filter(t => t.toLowerCase() === 'yoga')).toEqual(['Yoga']);
    expect(list).toContain('Padel');
  });

  it('falls back to defaults with an empty archive and no memory', () => {
    expect(
      buildManualTypeList({ activities: [], lastType: null, customTypes: [], defaults: ['Yoga'] })
    ).toEqual(['Yoga']);
  });
});

describe('manualEntryPrefs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads empty prefs when nothing was stored', async () => {
    mockStorage.retrieveValue.mockResolvedValue(undefined);
    await expect(loadManualEntryPrefs()).resolves.toEqual({ lastType: null, customTypes: [] });
  });

  it('round-trips the last type and custom types', async () => {
    mockStorage.retrieveValue.mockImplementation(async key => {
      if (key === Storage.MANUAL_LAST_TYPE_KEY) return 'Padel';
      if (key === Storage.MANUAL_CUSTOM_TYPES_KEY) return JSON.stringify(['Padel']);
      return undefined;
    });
    await expect(loadManualEntryPrefs()).resolves.toEqual({
      lastType: 'Padel',
      customTypes: ['Padel']
    });

    mockStorage.storeValue.mockResolvedValue(undefined);
    await saveLastManualEntryType('Yoga');
    expect(mockStorage.storeValue).toHaveBeenCalledWith(Storage.MANUAL_LAST_TYPE_KEY, 'Yoga');
  });

  it('adds a custom type with case-insensitive dedup and a cap', async () => {
    mockStorage.retrieveValue.mockResolvedValue(JSON.stringify(['Padel']));
    mockStorage.storeValue.mockResolvedValue(undefined);

    // Duplicate (any casing) returns the stored list untouched.
    await expect(addCustomManualEntryType('padel')).resolves.toEqual(['Padel']);
    expect(mockStorage.storeValue).not.toHaveBeenCalled();

    await expect(addCustomManualEntryType('Squash')).resolves.toEqual(['Padel', 'Squash']);
    expect(mockStorage.storeValue).toHaveBeenCalledWith(
      Storage.MANUAL_CUSTOM_TYPES_KEY,
      JSON.stringify(['Padel', 'Squash'])
    );
  });

  it('degrades to empty prefs when storage throws', async () => {
    mockStorage.retrieveValue.mockRejectedValue(new Error('disk gone'));
    await expect(loadManualEntryPrefs()).resolves.toEqual({ lastType: null, customTypes: [] });
  });
});
