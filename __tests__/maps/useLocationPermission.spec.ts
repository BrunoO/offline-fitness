import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';

import { useLocationPermission } from '../../src/features/maps/hooks/useLocationPermission';

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn()
}));

const mockGetForegroundPermissionsAsync = Location.getForegroundPermissionsAsync as jest.Mock;
const mockRequestForegroundPermissionsAsync = Location.requestForegroundPermissionsAsync as jest.Mock;

describe('useLocationPermission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true without prompting when already granted', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });

    const { result } = renderHook(() => useLocationPermission());

    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests the permission and returns true when the user accepts', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });

    const { result } = renderHook(() => useLocationPermission());

    await waitFor(() => expect(result.current).toBe(true));
    expect(mockRequestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('stays false when the user refuses the request', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const { result } = renderHook(() => useLocationPermission());

    await act(() => Promise.resolve());
    expect(result.current).toBe(false);
    expect(mockRequestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('stays false when the permission check throws', async () => {
    mockGetForegroundPermissionsAsync.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useLocationPermission());

    await act(() => Promise.resolve());
    expect(result.current).toBe(false);
    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});
