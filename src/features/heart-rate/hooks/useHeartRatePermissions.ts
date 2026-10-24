import { useCallback, useState, useEffect } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

const ANDROID_12_API_LEVEL = 31;

export function useHeartRatePermissions() {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (Platform.OS !== 'android') {
        if (mounted) setGranted(true);
        return;
      }
      try {
        if (Number(Platform.Version) >= ANDROID_12_API_LEVEL) {
          const scan = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
          );
          const connect = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
          );
          if (mounted) setGranted(scan && connect);
        } else {
          const fine = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          if (mounted) setGranted(fine);
        }
      } catch {
        if (mounted) setGranted(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      setGranted(true);
      return true;
    }
    if (Number(Platform.Version) >= ANDROID_12_API_LEVEL) {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
      ]);
      const ok =
        result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
          PermissionsAndroid.RESULTS.GRANTED;
      setGranted(ok);
      return ok;
    }
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    const ok = result === PermissionsAndroid.RESULTS.GRANTED;
    setGranted(ok);
    return ok;
  }, []);

  return { granted, requestPermissions };
}
