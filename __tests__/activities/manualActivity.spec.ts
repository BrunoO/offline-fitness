import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useActivities } from '../../src/features/activities/hooks/useActivities';
import {
  buildManualActivity,
  deviceTimezoneLabel
} from '../../src/features/activities/services/manualActivity';
import { week_of_year } from '../../src/shared/utils/utils';
import * as Storage from '../../src/shared/services/storage';
import { Activity } from '../../src/shared/types/types';

jest.mock('../../src/shared/services/storage');

const mockStorage = Storage as jest.Mocked<typeof Storage>;

describe('buildManualActivity', () => {
  it('builds a GPS-less record with the entered wall clock echoed verbatim', () => {
    const activity = buildManualActivity({
      type: 'Yoga',
      localDate: '2026-10-20',
      localTime: '18:30',
      durationMin: 60
    });

    expect(activity.type).toBe('Yoga');
    expect(activity.local_date).toBe('2026-10-20');
    expect(activity.local_time).toBe('18:30:00');
    expect(activity.elapsed_time).toBe(3600);
    expect(activity.moving_time).toBe(3600);
    // No track, no measured metrics.
    expect(activity.distance).toBe(0);
    expect(activity.average_speed).toBe(0);
    expect(activity.total_elevation_gain).toBe(0);
    expect(activity.start_latlng).toEqual([]);
    expect(activity.end_latlng).toEqual([]);
    // UTC instant matches the device-local wall clock.
    expect(activity.start_timestamp_utc).toBe(new Date(2026, 9, 20, 18, 30, 0).getTime());
    expect(activity.start_date_utc).toBe(
      new Date(activity.start_timestamp_utc).toISOString()
    );
    expect(activity.start_date_local).toBe('2026-10-20T18:30:00Z');
    expect(activity.start_year).toBe(2026);
    expect(activity.start_month).toBe(9);
    expect(activity.start_day).toBe(20);
    expect(activity.start_week).toBe(week_of_year(2026, 9, 20));
    expect(activity.id.startsWith('manual-')).toBe(true);
  });

  it('defaults the name to the type and trims a custom name', () => {
    expect(
      buildManualActivity({ type: 'Yoga', localDate: '2026-10-20', localTime: '07:00', durationMin: 30 })
        .name
    ).toBe('Yoga');
    expect(
      buildManualActivity({
        type: 'Yoga',
        localDate: '2026-10-20',
        localTime: '07:00',
        durationMin: 30,
        name: '  Morning flow  '
      }).name
    ).toBe('Morning flow');
  });

  it('falls back to Workout for a blank type, like the archive mapper', () => {
    const activity = buildManualActivity({
      type: '   ',
      localDate: '2026-10-20',
      localTime: '07:00',
      durationMin: 30
    });
    expect(activity.type).toBe('Workout');
    expect(activity.name).toBe('Workout');
  });

  it('canonicalises swims at write time (gain 0, moving = elapsed)', () => {
    const activity = buildManualActivity({
      type: 'Swim',
      localDate: '2026-10-20',
      localTime: '07:00',
      durationMin: 45
    });
    expect(activity.moving_time).toBe(activity.elapsed_time);
    expect(activity.total_elevation_gain).toBe(0);
  });

  it('mints unique ids', () => {
    const a = buildManualActivity({
      type: 'Yoga',
      localDate: '2026-10-20',
      localTime: '07:00',
      durationMin: 30
    });
    const b = buildManualActivity({
      type: 'Yoga',
      localDate: '2026-10-20',
      localTime: '07:00',
      durationMin: 30
    });
    expect(a.id).not.toBe(b.id);
  });

  it('records the device zone label (or an explicit override)', () => {
    const activity = buildManualActivity({
      type: 'Yoga',
      localDate: '2026-10-20',
      localTime: '07:00',
      durationMin: 30
    });
    expect(activity.timezone).toBe(deviceTimezoneLabel());
    const explicit = buildManualActivity({
      type: 'Yoga',
      localDate: '2026-10-20',
      localTime: '07:00',
      durationMin: 30,
      timezone: 'Europe/Paris'
    });
    expect(explicit.timezone).toBe('Europe/Paris');
  });

  it.each([
    [{ type: 'Yoga', localDate: '20-10-2026', localTime: '07:00', durationMin: 30 }],
    [{ type: 'Yoga', localDate: '2026-10-20', localTime: '7am', durationMin: 30 }],
    [{ type: 'Yoga', localDate: '2026-10-20', localTime: '25:00', durationMin: 30 }],
    [{ type: 'Yoga', localDate: '2026-10-20', localTime: '07:00', durationMin: 0 }]
  ])('rejects invalid input %p', input => {
    expect(() => buildManualActivity(input)).toThrow();
  });
});

describe('useActivities.addActivity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.storeActivity.mockResolvedValue(undefined);
  });

  it('stores the record and inserts it in UTC-descending order', async () => {
    const existing: Activity = {
      id: 'old',
      name: 'Old run',
      local_date: '2026-10-18',
      start_timestamp_utc: new Date(2026, 9, 18, 8, 0, 0).getTime()
    } as Activity;
    mockStorage.getAllActivitiesKeys.mockResolvedValue(['old']);
    mockStorage.loadAllActivities.mockResolvedValue([existing]);

    const { result } = renderHook(() => useActivities());
    await act(async () => {
      await result.current.reloadActivitiesFromLocalStorage();
    });
    await waitFor(() => {
      expect(result.current.globalActivities).toHaveLength(1);
    });

    const manual = buildManualActivity({
      type: 'Yoga',
      localDate: '2026-10-20',
      localTime: '18:30',
      durationMin: 60
    });
    await act(async () => {
      await result.current.addActivity(manual);
    });

    await waitFor(() => {
      expect(mockStorage.storeActivity).toHaveBeenCalledWith(manual);
      expect(result.current.globalActivities).toHaveLength(2);
      // Most recent first: the manual entry sorts before the older activity.
      expect(result.current.globalActivities[0].id).toBe(manual.id);
      expect(result.current.totalActivitiesStored).toBe(2);
    });
  });
});
