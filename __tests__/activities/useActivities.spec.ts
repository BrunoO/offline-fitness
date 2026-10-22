import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useActivities } from '../../src/features/activities/hooks/useActivities';
import * as Storage from '../../src/shared/services/storage';
import { Activity } from '../../src/shared/types/types';

jest.mock('../../src/shared/services/storage');

const mockStorage = Storage as jest.Mocked<typeof Storage>;

describe('useActivities', () => {
  const mockActivities: Activity[] = [
    {
      id: '1',
      name: 'A1',
      start_date_local: '2023-01-01T00:00:00Z',
      start_date_utc: '2023-01-01T00:00:00Z',
      local_date: '2023-01-01',
      local_time: '00:00:00',
      start_timestamp_utc: Date.parse('2023-01-01T00:00:00Z')
    } as Activity,
    {
      id: '2',
      name: 'A2',
      start_date_local: '2023-01-02T00:00:00Z',
      start_date_utc: '2023-01-02T00:00:00Z',
      local_date: '2023-01-02',
      local_time: '00:00:00',
      start_timestamp_utc: Date.parse('2023-01-02T00:00:00Z')
    } as Activity
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.addActivityTombstone.mockResolvedValue(undefined);
  });

  it('should load activities from local storage', async () => {
    mockStorage.getAllActivitiesKeys.mockResolvedValue(['1', '2']);
    mockStorage.loadAllActivities.mockResolvedValue(mockActivities);

    const { result } = renderHook(() => useActivities());

    await act(async () => {
      await result.current.reloadActivitiesFromLocalStorage();
    });

    await waitFor(() => {
      expect(result.current.globalActivities).toHaveLength(mockActivities.length);
      expect(result.current.globalActivities).toEqual(expect.arrayContaining(mockActivities));
      expect(result.current.totalActivitiesStored).toBe(2);
      expect(result.current.fetchingData).toBe(false);
    });
  });

  it('should sort loaded activities by UTC instant, most recent first', async () => {
    mockStorage.getAllActivitiesKeys.mockResolvedValue(['1', '2']);
    mockStorage.loadAllActivities.mockResolvedValue(mockActivities);

    const { result } = renderHook(() => useActivities());

    await act(async () => {
      await result.current.reloadActivitiesFromLocalStorage();
    });

    await waitFor(() => {
      expect(result.current.globalActivities[0].id).toBe('2');
      expect(result.current.globalActivities[1].id).toBe('1');
    });
  });

  it('should delete an activity', async () => {
    mockStorage.getAllActivitiesKeys.mockResolvedValue(['1', '2']);
    mockStorage.loadAllActivities.mockResolvedValue(mockActivities);
    mockStorage.removeActivity.mockResolvedValue(undefined);

    const { result } = renderHook(() => useActivities());

    // Initial load
    await act(async () => {
      await result.current.reloadActivitiesFromLocalStorage();
    });

    await waitFor(() => {
      expect(result.current.globalActivities).toHaveLength(2);
    });

    // Delete activity
    act(() => {
      result.current.deleteActivity(mockActivities[0]);
    });

    await waitFor(() => {
      expect(mockStorage.removeActivity).toHaveBeenCalledWith(mockActivities[0]);
      expect(result.current.globalActivities).toHaveLength(1);
      expect(result.current.globalActivities[0].id).toBe('2');
    });
    // The deletion is recorded so the next backup push removes the remote copy.
    await waitFor(() => {
      expect(mockStorage.addActivityTombstone).toHaveBeenCalledWith('1');
    });
  });

  it('should initialize lastBackupSync from storage and update on recordBackupSync', async () => {
    mockStorage.retrieveStringValue.mockResolvedValue('2026-10-22T08:00:00.000Z');
    const { result } = renderHook(() => useActivities());
    await waitFor(() => {
      expect(result.current.lastBackupSync).toBe('2026-10-22T08:00:00.000Z');
    });

    act(() => {
      result.current.recordBackupSync('2026-10-22T09:00:00.000Z');
    });
    expect(result.current.lastBackupSync).toBe('2026-10-22T09:00:00.000Z');
  });
});
