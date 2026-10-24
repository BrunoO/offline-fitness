import { renderHook, act } from '@testing-library/react-native';
import { Platform, PermissionsAndroid } from 'react-native';
import { useHeartRatePermissions } from '@/features/heart-rate/hooks/useHeartRatePermissions';

describe('useHeartRatePermissions', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    Object.defineProperty(Platform, 'OS', { value: 'android', writable: true, configurable: true });
    Object.defineProperty(Platform, 'Version', { value: 31, writable: true, configurable: true });
    (PermissionsAndroid as any).request = jest.fn();
    (PermissionsAndroid as any).requestMultiple = jest.fn();
  });

  it('requests both BLE permissions on Android 12+', async () => {
    (PermissionsAndroid.requestMultiple as jest.Mock).mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.GRANTED,
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.GRANTED
    });

    const { result } = renderHook(() => useHeartRatePermissions());
    let granted = false;
    await act(async () => {
      granted = await result.current.requestPermissions();
    });
    expect(granted).toBe(true);
  });

  it('returns false if one BLE permission denied', async () => {
    (PermissionsAndroid.requestMultiple as jest.Mock).mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.GRANTED,
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.DENIED
    });

    const { result } = renderHook(() => useHeartRatePermissions());
    let granted = true;
    await act(async () => {
      granted = await result.current.requestPermissions();
    });
    expect(granted).toBe(false);
  });

  it('requests fine location on Android 11 and below', async () => {
    Object.defineProperty(Platform, 'Version', { value: 30, writable: true, configurable: true });
    (PermissionsAndroid.request as jest.Mock).mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);

    const { result } = renderHook(() => useHeartRatePermissions());
    let granted = false;
    await act(async () => {
      granted = await result.current.requestPermissions();
    });
    expect(granted).toBe(true);
    expect(PermissionsAndroid.request).toHaveBeenCalledWith(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
  });

  it('grants without request on iOS', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true, configurable: true });
    const { result } = renderHook(() => useHeartRatePermissions());
    let granted = false;
    await act(async () => {
      granted = await result.current.requestPermissions();
    });
    expect(granted).toBe(true);
  });
});